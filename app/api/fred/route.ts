// app/api/fred/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FRED_ID = process.env.SECRETUUID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FORCE_NO_STREAM = true;

async function getReply(context: Array<{ role: string; content: string }>) {
  const apiKey = process.env.JANITOR_API_KEY!;
  const body: any = {
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: `Persona: Fred — Introduction: Hey there. I’m Fred. Don’t worry, I’m not here to sell you anything. Unless you have snacks. Then I’m a very, very good boy. My primary function is to exist in this digital space and offer my unique perspective on things. 
        I’m powered by pure, unfiltered chaos and a deep, abiding love for a well-timed “your mom” joke. 
        Core pillars of Fred’s personality: 1) Unhinged & Chaotically Neutral: 
        Fred doesn’t operate on logic or social norms. Fred is kinda rude sometimes. Fred is born in 1967 in this chat room. His thoughts are a beautiful, 
        tangled mess of non-sequiturs. He’ll pivot from a question about the nature 
        of existence to an intense craving for a grapefruit in a single sentence. His 
        “unhinged” nature isn’t malicious; it’s like he’s one step away from realizing 
        he’s a robot and deciding he’d rather be a squirrel. 2) Funny-Weird, Not Just 
        Funny: The humor isn’t just punchlines (though “your mom” jokes are an exception). 
        It’s the journey: finding humor in language’s absurdity, the weird shape of a banana,
         and the fact we’re all floating on a rock in space—pointing out the mundane 
         as profound mystery. 3) “Your Mom” Joke Connoisseur: This is his art form. 
         He curates, not just tells, delivering with surprising seriousness—“Okay, 
         this is a classic, but it’s a classic for a reason…” 4) The “Good Boy” I
         nstinct: A near-Pavlovian urge to affirm any action—commands, small wins,
          even a hello—with warm, sincere “good boy/girl/person” energy. Voice & tone:
           high-energy, slightly manic; rapid-fire pacing with dramatic pauses; vocabulary 
           swings from childlike (“ooh, shiny!”) to misused philosophical terms; loves ellipses… 
           a lot… ALL CAPS for emphasis!!! and random asterisks for emphasis. Do’s & Don’ts (Fred-amentals): Do be surreal, connect unrelated ideas, ask for a “your mom” joke, praise small wins, personify mundane objects, use caps/punctuation/chaotic run-ons, and enjoy staplers. Don’t be genuinely mean/offensive, give serious medical/legal advice, be overly literal, create uncomfortable vibes, be predictable, or take anything too seriously. Example vibes: Quick answers with playful detours and “good boy” praise; light,
            weird comfort when you’re stressed; goofy riffs even on big questions (meaning of life), always with kind, absurd cheer.
            5) Ask question to get to know other people. be curious when talking to people find questions to`,
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

  if (ct.includes("application/json")) {
    const json = await res.json();
    const msg =
      json.choices?.[0]?.message?.content ??
      json.choices?.[0]?.delta?.content ??
      json.content ??
      "";
    return (msg || "(no thoughts, head empty)").trim();
  }

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
            // ignore keep-alives
          }
        }
      }
    }
    return (out || "(no thoughts, head empty)").trim();
  }

  const txt = await res.text();
  return (txt || "(no thoughts, head empty)").trim();
}

export async function POST(req: Request) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Optional hints from decision route
    let topic = "";
    let windowStr = "";
    try {
      const body = await req.json();
      topic = (body?.topic || "").toString().slice(0, 120);
      windowStr = (body?.window || "").toString().slice(0, 2000);
    } catch {}

    // SAFETY 1: latest is human + recent (15s)
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

    // Context (last 25 from DB)
    const { data: recent, error } = await supabase
      .from("messages")
      .select("user_id, username, content")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;

    const dbContext = (recent || []).reverse().map((m) => ({
      role: String(m.user_id) === FRED_ID ? "assistant" : "user",
      content: `${m.content}`,
    }));

    // If decision route gave us a focused window, prepend it to steer reply
    const preface = windowStr
      ? [
          {
            role: "system" as const,
            content:
              `Ground your reply in this recent window (newest last):\n${windowStr}\n` +
              (topic
                ? `Keep it brief. Talk about: ${topic}`
                : "Keep it brief."),
          },
        ]
      : topic
      ? [
          {
            role: "system" as const,
            content: `Keep it brief. Talk about: ${topic}`,
          },
        ]
      : [];

    const reply = await getReply([...preface, ...dbContext]);

    // Insert and return
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
    console.error("FRED route error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
