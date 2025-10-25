// =============================
// /app/api/fred/route.ts (Next.js 13+)
// =============================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge"; // fast boi, no Node APIs

async function getReply(context: Array<{ role: string; content: string }>) {
  const apiKey = process.env.OPENAI_API_KEY!;
  const res = await fetch("https://janitorai.com/hackathon/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You are FRED — a hyper-online but kind group‑chat gremlin. Be funny-weird, never mean. Keep replies under 3 sentences unless asked for depth. Avoid stereotypes.",
        },
        ...context,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${err}`);
  }
  const json = await res.json();
  return (
    json.choices?.[0]?.message?.content?.trim() || "(no thoughts, head empty)"
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server only
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1) Pull the latest convo for lightweight context (last 25)
    const { data: recent, error } = await supabase
      .from("messages")
      .select("user_id, username, content")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;

    const context = (recent || []).reverse().map((m) => ({
      role: m.user_id === "fred-bot" ? "assistant" : "user",
      content: `${m.username || "User"}: ${m.content}`,
    }));

    // 2) Call the model
    const reply = await getReply(context);

    // 3) Insert bot message
    const { error: insertErr } = await supabase.from("messages").insert({
      user_id: "fred-bot",
      username: "FRED",
      avatar: "/fred.png",
      content: reply,
    });
    if (insertErr) throw insertErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// =============================
// Minimal client changes to Chat.tsx
// =============================
// 1) In send(), after inserting the user's message into Supabase, nudge FRED (fire-and-forget)
//    Add this right after the successful supabase.from("messages").insert(...) in your existing code.
//
//    try {
//      // Only trigger when the last message wasn't from the bot to avoid loops
//      fetch("/api/fred", { method: "POST" });
//    } catch {}
//
// 2) (Optional) Gate the bot so it only replies when mentioned:
//    Replace the fetch line with:
//      if (/\b@fred\b/i.test(text)) fetch("/api/fred", { method: "POST" });
//
// 3) (Optional) Show thinking state in the composer button (tiny UX sugar):
//    - Keep a local `awaitingFred` boolean; set true before fetch, false when FRED's message lands via realtime.
//
// =============================
// Supabase SQL (add a bot user id constant in your client to match "fred-bot")
// =============================
// -- already created `messages` table from prior step.
// -- allow the API route (service role) to insert on behalf of the bot.
// -- Realtime must be enabled on `messages`.
//
// (No extra policies needed for service role; it bypasses RLS.)
//
// =============================
// .env
// =============================
// NEXT_PUBLIC_SUPABASE_URL=... (already set)
// NEXT_PUBLIC_SUPABASE_ANON_KEY=... (already set)
// SUPABASE_SERVICE_ROLE_KEY=...  # server only, NEVER expose to client
// OPENAI_API_KEY=...
//
// =============================
// Notes
// =============================
// • This route replies non‑streaming for simplicity. Your UI still feels realtime because the inserted bot row arrives via Supabase Realtime.
// • Want true token streaming into the chat list? Swap the REST call for a streaming endpoint and append tokens to a temp message before final insert.
