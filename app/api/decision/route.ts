// app/api/decision/route.ts
import { NextResponse } from "next/server";
import { LettaClient } from "@letta-ai/letta-client";
import { createClient } from "@supabase/supabase-js";

const AGENT_ID = process.env.LETTA_AGENT_ID || "";
const LETTA_API_KEY = process.env.LETTA_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RAW_BASE =
  process.env.NEXT_PUBLIC_BASE_URL || "https://calhacks-egq1.vercel.app";
const BASE_URL = RAW_BASE.replace(/\/$/, ""); // no trailing slash

function log(...args: any[]) {
  // Keep logs small & avoid leaking secrets; stringify objects briefly
  const out = args.map((a) =>
    typeof a === "string" ? a : JSON.stringify(a, null, 2)
  );
  // eslint-disable-next-line no-console
  console.log("[decision]", ...out);
}

function err(...args: any[]) {
  // eslint-disable-next-line no-console
  console.error("[decision]", ...args);
}

type MsgUnion = { messageType: string; content?: string };
const pickAssistant = (mm: MsgUnion[]) =>
  mm
    .find(
      (m) =>
        m.messageType === "assistant_message" && typeof m.content === "string"
    )
    ?.content?.trim() || "";

const safeJSON = (s?: string) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

// ---- helper: update (or create+attach once) the `group_dynamic` block
async function upsertGroupDynamicBlock(
  client: LettaClient,
  agentId: string,
  note: string
) {
  const label = "group_dynamic";
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  try {
    const existing = await client.agents.blocks.retrieve(agentId, label);
    const prev = typeof existing?.value === "string" ? existing.value : "";
    const appended = `${prev}${prev ? "\n" : ""}[${now}] ${note}`;
    const trimmed =
      appended.length > 5000
        ? appended.slice(appended.length - 5000)
        : appended;

    await client.agents.blocks.modify(agentId, label, {
      value: trimmed,
      description:
        existing?.description ??
        "Observation about group chat dynamics for future behavior.",
      readOnly: false,
      limit: existing?.limit ?? 5000,
    });
    return { action: "modified" as const };
  } catch (err: any) {
    if (err?.statusCode === 404) {
      const block = await client.blocks.create({
        label,
        description:
          "Observation about group chat dynamics for future behavior.",
        value: `[${now}] ${note}`,
        limit: 5000,
        readOnly: true,
      });

      // ✅ Narrow the type before using block.id
      if (!block || typeof block.id !== "string" || block.id.length === 0) {
        throw new Error("Failed to create group_dynamic block: missing id");
      }

      try {
        await client.agents.blocks.attach(agentId, block.id);
      } catch (attachErr: any) {
        // If a concurrent request attached the same label, ignore duplicate attach
        if (attachErr?.statusCode !== 409) throw attachErr;
      }

      return { action: "created_attached" as const };
    }
    throw err;
  }
}

export async function POST(req: Request) {
  const rid = crypto.randomUUID(); // Edge-safe

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Latest human message (skip bots)
    const { data: lastHuman } = await sb
      .from("messages")
      .select("id, user_id, username, content, created_at, actor")
      .neq("actor", "bot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastHuman) return NextResponse.json({ ok: true, reason: "no-human" });

    // 2) Build recent window (include speakers) for decision + for /api/fred
    const { data: windowMsgs } = await sb
      .from("messages")
      .select("actor, username, content, created_at")
      .order("created_at", { ascending: false })
      .limit(12);

    const lines = (windowMsgs ?? [])
      .reverse()
      .map(
        (m) =>
          `${m.actor === "bot" ? "FRED" : m.username || "Anon"}: ${m.content}`
      );

    const context = lines.join("\n").trim();
    if (!context) return NextResponse.json({ ok: true, reason: "no-context" });

    // 3) Decision prompts
    const systemPrompt = `
Return STRICT JSON ONLY with this schema:
{
  "speak": boolean,
  "why": string,              // <= 120 chars
  "topic": string|null,       // if speaking: 3–8 words (e.g., "playful thanks", "clarify meeting time")
  "memory_note": string|null  // optional observation about group dynamics
}

You are FRED (aka fred / fred67), a selective group-chat participant.
You prefer short, multi-line texts; playful, weird, never mean.
Reply when: @mentioned/called out, direct question in your lane, confusion you can resolve, de-escalation needed, or a moment worth celebrating.
Stay quiet when: side-banter, solved threads, low value add, off-vibe, or two others are clearly talking directly.
Output JSON ONLY. No prose, no backticks.
`.trim();

    const userPrompt = `
Recent messages (newest last):
${context}

Decide if you should speak now based on the window above.
`.trim();

    // 4) Ask Letta agent for the decision
    const letta = new LettaClient({ token: LETTA_API_KEY });
    const resp = await letta.agents.messages.create(AGENT_ID, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    // 5) Parse JSON
    const raw = pickAssistant(resp.messages as any[]);
    const parsed = safeJSON(raw) || {};
    const speak = !parsed.speak;
    const topic =
      typeof parsed.topic === "string" ? parsed.topic.slice(0, 120) : "";
    const memoryNote =
      typeof parsed.memory_note === "string"
        ? parsed.memory_note.slice(0, 800)
        : "";

    // 6) Update the existing `group_dynamic` block (no duplicate attach)
    if (memoryNote) {
      await upsertGroupDynamicBlock(letta, AGENT_ID, memoryNote);
    }

    log(rid, "letta decision parsed", speak);

    // 7) Speak? Call /api/fred with richer context so it can craft the reply
    const origin = (() => {
      try {
        const u = new URL(req.url); // now req exists
        return u.origin;
      } catch {
        return process.env.NEXT_PUBLIC_BASE_URL || "";
      }
    })();

    async function callFred(url: string, payload: any) {
      log(rid, "→ fetch", url, JSON.stringify(payload));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get("content-type") || "";
      const text = await res.text(); // read once
      log(rid, "← fetch", res.status, ct, text.slice(0, 500));
      // try to parse JSON if indicated; otherwise return raw text
      let parsedBody: any = null;
      if (ct.includes("application/json")) {
        try {
          parsedBody = JSON.parse(text);
        } catch {}
      }
      return { status: res.status, body: parsedBody ?? text };
    }

    if (speak) {
      const payload = {
        topic: topic || undefined,
        window: lines.slice(-8),
        last: {
          username: lastHuman.username || "Anon",
          content: lastHuman.content,
        },
      };

      // prefer explicit base if provided; else use request origin
      const fredUrlPrimary = (BASE_URL || origin) + "/api/fred";

      // try primary route, then known alternates (helps when you renamed routes)
      const candidates = [fredUrlPrimary];

      let result: any = null;
      let lastErr: any = null;
      for (const url of candidates) {
        try {
          result = await callFred(url, payload);
          // accept 2xx; otherwise keep trying fallbacks
          if (result.status >= 200 && result.status < 300) break;
          lastErr = new Error(`Non-2xx from ${url}: ${result.status}`);
        } catch (e) {
          lastErr = e;
          log(rid, "fetch error", String(e));
        }
      }

      if (!result) {
        err(
          rid,
          "all /api/fred candidates failed",
          lastErr?.message || lastErr
        );
        return NextResponse.json(
          { ok: false, error: "fred_unreachable", rid },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        decision: parsed,
        fred: result.body ?? null,
        debug: process.env.NEXT_PUBLIC_DEBUG === "1" ? { rid } : undefined,
      });
    }

    return NextResponse.json({ ok: true, decision: parsed, action: "silent" });
  } catch (e: any) {
    console.error("decision route error:", e);
    return NextResponse.json(
      { error: e?.message ?? "unknown" },
      { status: 500 }
    );
  }
}
