import { NextResponse } from "next/server";
import { LettaClient } from "@letta-ai/letta-client";

const token = process.env.LETTA_API_KEY!;
const AGENT_ID = process.env.LETTA_AGENT_ID;

export async function POST(req: Request) {
  try {
    if (!token)
      return NextResponse.json(
        { error: "Missing LETTA_API_KEY" },
        { status: 500 }
      );
    const { email } = await req.json();
    const client = new LettaClient({ token });

    const block = await client.blocks.create({
      label: `user_${email}`,
      description: `${email}'s gathered facts`,
      value: [
        "I will observe the group to learn about members and the whole chat.",
        "Per-person: name/handle mapping (e.g., 'Quan Le:'), pronouns, default tone (dry/earnest/sarcastic), humor that lands, topics they start vs join, active hours/timezone, reply speed, media style (links/gifs/voice), who they @ and who @s them, teasing boundaries, asks (advice/help/info), expertise areas, triggers/ick, conflict style, typical role (planner/hype/quiet), reliability on commitments.",
        "Dyads & clusters: who talks most with whom, inside jokes, tensions or muted pairs, who mediates.",
        "Group norms: overall vibe/identity, recurring topics, rituals (daily check-in etc.), etiquette (double-texting/threading), @-mention rules, openness to new topics/members, edginess tolerance, decision style (vote/consensus), planning cadence, noise vs signal expectations.",
        "Message cues to act: direct @ to FRED, direct questions in my lane, confusion I can resolve, de-escalations, celebrations; stay quiet on side-banter/solved threads/low value/off-vibe or when two others are clearly talking directly.",
        "Tracking: action items (who/what/when), unanswered questions, sentiment shifts.",
        "Safety: infer only from chat content, respect stated boundaries; note 'do not joke about X'.",
      ].join("\n"),

      limit: 20000,
      readOnly: false,
    });

    if (!block?.id) throw new Error("No block id returned");
    await client.agents.blocks.attach(AGENT_ID, block.id);
    return NextResponse.json({ ok: true, blockId: block.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
