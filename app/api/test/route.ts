// app/api/janitor-test/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

const JANITOR_API_URL = "https://janitorai.com/hackathon/completions";
// Fallback to the hackathon key if you haven’t set one
const JANITOR_API_KEY = process.env.JANITOR_API_KEY || "calhacks2047";

/**
 * Simple pass-through test route to Janitor’s chat completions.
 * Send JSON like:
 * {
 *   "messages": [{"role":"user","content":"say hi"}],
 *   "model": "gpt-4o-mini",        // optional
 *   "temperature": 0.6,            // optional
 *   "stream": false                // force non-stream by default
 * }
 */
export async function POST(req: Request) {
  try {
    const input = await req.json().catch(() => ({}));
    const body = {
      model: input.model ?? "gpt-4o-mini",
      temperature:
        typeof input.temperature === "number" ? input.temperature : 0.6,
      stream: !!input.stream ? true : false, // default false; set true if you want SSE
      messages:
        Array.isArray(input.messages) && input.messages.length
          ? input.messages
          : [{ role: "user", content: "test" }],
    };

    // NOTE: Janitor expects Authorization header without "Bearer"
    const r = await fetch(JANITOR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: JANITOR_API_KEY,
        Accept: body.stream
          ? "text/event-stream, application/json"
          : "application/json",
      },
      body: JSON.stringify(body),
    });

    // Return raw text for SSE, JSON for normal
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, status: r.status, error: text },
        { status: r.status }
      );
    }

    if (ct.includes("application/json")) {
      try {
        const json = JSON.parse(text);
        return NextResponse.json({ ok: true, ...json });
      } catch {
        return NextResponse.json({ ok: true, raw: text });
      }
    }

    // SSE or other content-types: pass back raw
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": ct || "text/plain" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}

// Optional quick sanity check
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST JSON with {messages:[{role:'user',content:'hi'}]}",
  });
}
