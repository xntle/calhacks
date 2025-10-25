// =============================
// FILE: /app/api/fred/route.ts
// UUID bot id, handles SSE or JSON providers, safety guards,
// returns reply + inserted id for client-side fallback.
// =============================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
const FRED_ID = "00000000-0000-0000-0000-000000000001"; // <- keep as UUID

// Toggle this if your provider supports non-streaming
const FORCE_NO_STREAM = true; // set false to allow SSE parsing

async function getReply(context: Array<{ role: string; content: string }>) {
  const apiKey = process.env.OPENAI_API_KEY!;

  const body: any = {
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content:
          "You are FRED — a hyper‑online but kind group‑chat gremlin. Be funny‑weird, never mean. Keep replies under 3 sentences unless asked for depth. Avoid stereotypes.",
      },
      ...context,
    ],
  };
  if (FORCE_NO_STREAM) body.stream = false;

  const res = await fetch("https://janitorai.com/hackathon/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: FORCE_NO_STREAM
        ? "application/json"
        : "text/event-stream, application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`LLM error: ${res.status} ${await res.text()}`);

  const ct = res.headers.get("content-type") || "";

  // Non-streaming JSON
  if (ct.includes("application/json")) {
    const json = await res.json();
    const msg =
      json.choices?.[0]?.message?.content ??
      json.choices?.[0]?.delta?.content ??
      json.content ??
      "";
    return (msg || "(no thoughts, head empty)").trim();
  }

  // SSE streaming
  if (ct.includes("text/event-stream")) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const evt of parts) {
        for (const line of evt.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") break;
          try {
            const j = JSON.parse(payload);
            const delta =
              j.choices?.[0]?.delta?.content ??
              j.choices?.[0]?.message?.content ??
              j.content ??
              "";
            if (delta) out += delta;
          } catch {
            // ignore keep‑alives
          }
        }
      }
    }
    return (out || "(no thoughts, head empty)").trim();
  }

  // Fallback: raw text
  const txt = await res.text();
  return (txt || "(no thoughts, head empty)").trim();
}

export async function POST(_req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server only
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // SAFETY 1: only reply if newest is human + recent (15s)
    const { data: lastRows, error: lastErr } = await supabase
      .from("messages")
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (lastErr) throw lastErr;
    const last = lastRows?.[0];
    if (!last) return NextResponse.json({ ok: true, reason: "no_last" });
    if (String(last.user_id) === FRED_ID)
      return NextResponse.json({ ok: true, reason: "last_is_fred" });
    if (Date.now() - new Date(last.created_at).getTime() > 15_000)
      return NextResponse.json({ ok: true, reason: "too_old" });

    // Context (last 25)
    const { data: recent, error } = await supabase
      .from("messages")
      .select("user_id, username, content")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;

    const context = (recent || []).reverse().map((m) => ({
      role: String(m.user_id) === FRED_ID ? "assistant" : "user",
      content: `${m.username || "User"}: ${m.content}`,
    }));

    const reply = await getReply(context);

    // Insert and RETURN id+content for client fallback if realtime misses
    const { data: inserted, error: insertErr } = await supabase
      .from("messages")
      .insert({
        user_id: FRED_ID,
        username: "FRED",
        avatar: "/fred.png",
        content: reply,
      })
      .select("id, content")
      .single();
    if (insertErr) throw insertErr;

    return NextResponse.json({ ok: true, reply, id: inserted.id });
  } catch (e: any) {
    // Visible server log (shows up in Next logs)
    console.error("FRED route error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// Notes:
// • If your DB has user_id UUID NOT NULL, keep using FRED_ID (UUID). If you prefer bots without user ids,
//   make user_id nullable and add actor/bot_key columns (see previous drop‑in).
// • Client can optimistically render FRED using the {reply,id} if Realtime is slow.
