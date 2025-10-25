import { NextRequest } from "next/server";
import { OpenAI } from "openai";
import { ratelimit } from "@/lib/rateLimit";
import { createServerClient } from "@/lib/supabaseServer";
import { fredSystem } from "@/lib/fredPrompt";

export async function POST(req: NextRequest) {
  const { messages, roomId } = await req.json();
  await ratelimit("chat:" + roomId);

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // persist user message
  // ...insert into messages (role='user')

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    messages: [{ role: "system", content: fredSystem }, ...messages],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content ?? "";
        controller.enqueue(encoder.encode(token));
      }
      controller.close();
    },
  });

  // persist assistant message as it streams (optional buffer)
  return new Response(readable, { headers: { "Content-Type": "text/plain" } });
}
