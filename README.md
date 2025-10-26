## Inspiration

Group chats are noisy. Most bots make it worse—talking too much, at the wrong times, with zero sense of vibe. I wanted an AI that behaves like a considerate teammate: quick when helpful, silent when not, and actually learns the people in the room.

## What it does

- **Selective speaking:** Decides when to chime in (mentions, direct questions, confusion, milestones, de-escalation) and when to stay quiet (side-banter, solved threads).
- **Micro-replies:** Keeps outputs ≤3 sentences unless asked for depth; playful, weird, never mean.
- **Memory:** Stores lightweight facts about each participant and rolling notes about group norms (etiquette, inside jokes, boundaries).
- **Context steering:** Grounds replies in the last window of chat to stay on-thread.
- **Safety rails:** No hallucinated specifics, avoids stereotypes, and respects cooldowns to prevent spam.

## How I built it

- **Frontend:** Next.js (App Router), sticky composer, scroll-locked message list, presence pills.
- **Backend:**

  - **Supabase** for auth (Google OAuth), Realtime messages, and storage of chat/memory.
  - **Decision route** (`/api/decision`): prompts an LLM for a STRICT-JSON policy verdict `{speak, why, topic}`.
  - **Reply route** (`/api/fred`): if and only if `speak=true`, crafts the actual message using windowed context.

- **LLMs:**

  - **JanitorAI completions** for chat generation (OpenAI-compatible endpoint).
  - **Letta** for agent memory blocks (per-user “facts” and a `group_dynamic` block) and the decision JSON.

- **Guardrails:** freshness gate (≤15s) so Fred only replies to recent human messages; last-speaker check to avoid back-to-back Freds; once-per-thread nudge cooldown.

## Challenges we ran into

- **Edge vs server nuances:** accessing `req.url`/origins and environment vars on Vercel vs local.
- **SSE/stream handling:** stitching `data: { "choices":[{"delta":...}] }` into one coherent string.
- **Persona drift:** keeping Fred playful but not mean; tightening the system prompt and adding “Do/Don’t” tables.
- **Double-posting:** race conditions between realtime inserts and decision calls—fixed with freshness and “last is Fred” checks.
- **Env setup:** mismatched keys (service role vs anon) and missing base URLs causing 401s/“too_old” no-ops.

## Accomplishments that we're proud of

- A bot that **actually knows when to shut up**.
- Clean STRICT-JSON decision contract powering consistent behavior.
- Live **group memory** that accumulates norms without leaking private info.
- A lightweight, pleasant UI with sticky input, smooth scroll, and presence.

## What we learned

- “**When** to speak” is as important as “**what** to say.” Policy+JSON beats pure prompting.
- Tiny fundamentals—cooldowns, last-speaker checks, and recency filters—dramatically improve perceived intelligence.
- Memories need **scope** (per-user vs group) and **limits** (trimmed, summarized) to stay useful.

## What's next for fred67

- **Multi-room & threads:** per-channel norms, thread-aware decisions.
- **Memory UI:** view/edit personal notes and group dynamic logs.
- **Better retrieval:** embeddings + summaries for long-term context.
- **Bridges:** Slack/Discord/Telegram connectors.
- **Moderation & safety:** toxicity filters, escalation patterns, and red-team prompts.
- **Analytics:** talk/silence ratios, helpfulness reactions, configurable guardrails.
- **Mobile PWA & notifications:** light, fast, installable client.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
