// Minimal Fred Landing Page (wired for Supabase + Next.js App Router)
// Place fred.png in /public. Render <FredLanding /> in app/page.tsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

export default function FredLanding() {
  const router = useRouter();
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);
  const [presence, setPresence] = useState(8);
  const [joining, setJoining] = useState(false);
  const anonKey = useRef<string>(Math.random().toString(36).slice(2));

  useEffect(() => {
    let jitterTimer: any;
    const channel = supabase.channel("presence:lobby", {
      config: { presence: { key: anonKey.current } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const online = Object.values(state).reduce(
          (acc: number, arr: any) =>
            acc + (Array.isArray(arr) ? arr.length : 0),
          0
        );
        setPresence(Math.max(1, online));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });

    jitterTimer = setInterval(() => {
      setPresence((n) => Math.max(1, n + (Math.random() > 0.5 ? 1 : -1)));
    }, 2500);

    return () => {
      clearInterval(jitterTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function onJoin() {
    try {
      setJoining(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // In your component: replace the logged-in branch inside onJoin()
      if (!user) {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/chat` },
        });
        return;
      }
      console.log("logged");
      console.log("calling letta-fred");
      // user is logged in → create the Letta block, then navigate
      await fetch("/api/add_context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      }).catch(() => {}); // non-blocking; still go to chat
      router.push("/chat");
    } catch (e) {
      console.error(e);
      alert("Sign-in failed. Try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 grid place-items-center px-6">
      <div className="w-full max-w-3xl text-center">
        <Header count={presence} />
        <Hero onJoin={onJoin} joining={joining} />
        <Footer />
      </div>
    </main>
  );
}

function Header({ count }: { count: number }) {
  return (
    <header className="flex items-center justify-between max-w-3xl mx-auto w-full py-6">
      <Presence count={count} />
    </header>
  );
}

function Hero({ onJoin, joining }: { onJoin: () => void; joining: boolean }) {
  return (
    <section className="mt-6">
      <h2 className="text-4xl font-extrabold tracking-tight">
        you're invited to join fred67's group chat
      </h2>

      <div className="mt-8 mx-auto w-full max-w-md border border-gray-100 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col items-center">
          <Avatar src="/fred.png" size={128} techHover />
          <p className="mt-4 text-sm text-gray-500">fred67</p>
          <button
            onClick={onJoin}
            disabled={joining}
            className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
          >
            {joining ? "loading…" : "continue with google"}
            <GoogleIcon />
          </button>
          <p className="mt-3 text-xs text-gray-400">
            by continuing you agree to our extremely chill tos.
          </p>
        </div>
        <CapHint />
      </div>
    </section>
  );
}

function CapHint() {
  const maxUsers = process.env.NEXT_PUBLIC_MAX_USERS
    ? Number(process.env.NEXT_PUBLIC_MAX_USERS)
    : undefined;
  if (!maxUsers) return null;
  return (
    <p className="mt-4 text-xs text-gray-400">
      heads up: limited seats (max {maxUsers}). if full, try again later.
    </p>
  );
}

function Footer() {
  return (
    <footer className="mt-12 text-xs text-gray-400">
      <Link href="https://www.thaianle.com" className="underline text-blue">
        made by thaianle.com
      </Link>
    </footer>
  );
}

function Presence({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-sm">
      <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
      <span className="font-medium">{count} online</span>
    </div>
  );
}

function Avatar({
  src,
  size = 64,
  techHover = false,
}: {
  src: string;
  size?: number;
  techHover?: boolean;
}) {
  const base =
    "rounded-full border border-gray-100 bg-white shadow-sm object-contain";
  const hover = techHover
    ? "transition-transform duration-300 hover:scale-105 hover:rotate-1"
    : "";
  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        width={size}
        height={size}
        alt="Fred"
        className={`${base} ${hover} w-full h-full`}
      />
      {techHover && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.06), 0 8px 30px rgba(124,58,237,0.18)",
          }}
        />
      )}
      {techHover && (
        <svg
          className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-70 transition-opacity duration-300 mix-blend-overlay"
          viewBox="0 0 120 120"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              x2="120"
              y1={i * 9}
              y2={i * 9}
              stroke="white"
              strokeOpacity="0.06"
              strokeWidth="1"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

// Tiny Google logo
function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4763 7.36363H9V10.8454H13.84C13.6327 11.9636 13.0045 12.8954 12.0727 13.5227V15.8454H14.96C16.6581 14.2727 17.64 11.9636 17.64 9.20454Z"
        fill="#4285F4"
      />
      <path
        d="M9 18C11.43 18 13.4673 17.1954 14.96 15.8455L12.0727 13.5227C11.2673 14.0627 10.2273 14.3864 9 14.3864C6.65271 14.3864 4.6618 12.7955 3.95444 10.7045H0.972656V13.1091C2.45629 15.9955 5.4818 18 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.95451 10.7046C3.7728 10.1646 3.66825 9.59005 3.66825 9.00001C3.66825 8.40996 3.7728 7.83542 3.95451 7.29542V4.89087H0.972727C0.3525 6.1136 0 7.51816 0 9.00001C0 10.4819 0.3525 11.8864 0.972727 13.1091L3.95451 10.7046Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.61363C10.34 3.61363 11.5273 4.07272 12.44 4.9409L15.0273 2.35454C13.4636 0.90454 11.4263 0 9 0C5.4818 0 2.45629 2.00454 0.972656 4.8909L3.95444 7.29545C4.6618 5.20454 6.65271 3.61363 9 3.61363Z"
        fill="#EA4335"
      />
    </svg>
  );
}
