// app/api/add_context/route.ts
import { NextResponse } from "next/server";
import { LettaClient } from "@letta-ai/letta-client";

const LETTA_API_KEY = process.env.LETTA_API_KEY!;
const AGENT_ID = process.env.LETTA_AGENT_ID || ""; // ensure it's always a string

export async function POST(req: Request) {
  try {
    if (!LETTA_API_KEY) {
      return NextResponse.json(
        { error: "Missing LETTA_API_KEY" },
        { status: 500 }
      );
    }
    if (!AGENT_ID) {
      return NextResponse.json(
        { error: "Missing LETTA_AGENT_ID" },
        { status: 500 }
      );
    }

    const { email } = await req.json().catch(() => ({} as any));
    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { error: "Invalid or missing 'email'" },
        { status: 400 }
      );
    }

    const client = new LettaClient({ token: LETTA_API_KEY });

    // Create the block (or update if you prefer; this keeps your original behavior)
    const block = await client.blocks.create({
      label: `user_${email}`,
      description: `${email}'s gathered facts`,
      value: [
        "The user has not provided any information about themselves.",
        "I will need to ask them some questions to learn more about them.",
        "What is their name?",
        "What is their background?",
        "What are their motivations?",
        "What are their goals?",
        "What are their strengths?",
        "What are their weaknesses?",
        "What are their hobbies?",
        "What are their core vibes in three words?",
        "What are their go-to topics that keep resurfacing?",
      ].join("\n"),
      limit: 20000,
      readOnly: false,
    });

    // Narrow the types before using
    if (!block || typeof block.id !== "string" || block.id.length === 0) {
      throw new Error("No block id returned");
    }

    // Attach to agent; ignore duplicate attach (409)
    try {
      await client.agents.blocks.attach(AGENT_ID, block.id);
    } catch (e: any) {
      if (e?.statusCode !== 409) throw e;
    }

    return NextResponse.json({ ok: true, blockId: block.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
