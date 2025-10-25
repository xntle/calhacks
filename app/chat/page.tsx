// =============================
// FILE: app/chat/Chat.tsx
// =============================
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// --- Types ---
type Member = { id: string; name: string; avatar: string };
type Message = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  username?: string | null;
  avatar?: string | null;
  actor?: "human" | "bot" | null;
  bot_key?: string | null;
};

export default function Chat() {
  const router = useRouter();
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingFred, setAwaitingFred] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1) Require auth
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/login?next=/chat");
        return;
      }
      setUser(data.user);
      setLoading(false);
    })();
  }, [router, supabase]);

  // 2) Presence (optional UI)
  useEffect(() => {
    if (!user) return;
    const profile = getDisplay(user);
    const channel = supabase.channel("presence:site", {
      config: { presence: { key: user.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const list: Member[] = [];
        for (const [id, metas] of Object.entries(state)) {
          const last: any =
            Array.isArray(metas) && metas.length
              ? metas[metas.length - 1]
              : null;
          if (last) list.push({ id, name: last.name, avatar: last.avatar });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: profile.name, avatar: profile.avatar });
        }
      });
    return () => void supabase.removeChannel(channel);
  }, [supabase, user]);

  // 3) Messages + realtime
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const sub = supabase
      .channel("room:global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (isMounted) setMessages((prev) => [...prev, msg]);
          if (msg.actor === "bot" && msg.bot_key === "fred")
            setAwaitingFred(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (isMounted)
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        }
      )
      .subscribe();

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, user_id, content, created_at, username, avatar, actor, bot_key"
        )
        .order("created_at", { ascending: true })
        .limit(500);
      if (!error && data) setMessages(data as Message[]);
    })();

    return () => {
      isMounted = false;
      supabase.removeChannel(sub);
    };
  }, [supabase, user]);

  // 4) Send message (always pings FRED after human message)
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !user || sending) return;
    setSending(true);

    const profile = getDisplay(user);

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      content: text,
      username: profile.name,
      avatar: profile.avatar,
      actor: "human",
    });

    if (error) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        user_id: null,
        content: `Failed to send: ${error.message}`,
        created_at: new Date().toISOString(),
        username: "System",
        avatar: "/fred.png",
        actor: "bot",
        bot_key: "system",
      };
      setMessages((prev) => [...prev, errMsg]);
      setSending(false);
      return;
    }

    // Always summon FRED (server route has guards)
    setAwaitingFred(true);
    try {
      fetch("/api/fred", { method: "POST" });
    } catch (_) {
      setAwaitingFred(false);
    }

    setInput(""); // Clear input after successful send
    autoResizeTextarea(); // Reset textarea height
    setSending(false);
  }, [input, supabase, user, sending]);

  // Auto-scroll messages panel
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Textarea autosize
  const autoResizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(180, ta.scrollHeight) + "px";
  };

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <Skeleton />;
  const selfId = user?.id;

  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/fred.png"
              alt="Fred"
              width={28}
              height={28}
              className="rounded-full border border-gray-100"
            />
            <h1 className="font-semibold">fred67 / chat</h1>
            <PresencePill count={members.length} />
          </div>
          <div className="flex items-center gap-3">
            <UserChip user={user} />
            <button
              onClick={signOut}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Online now strip */}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <OnlineNow members={members} selfId={selfId} />
        </div>
      </header>

      {/* Chat body fills remaining viewport; only the message list scrolls */}
      <section className="max-w-3xl mx-auto w-full px-4 flex-1 flex flex-col">
        <div className="mt-6 border border-gray-100 rounded-2xl flex-1 flex flex-col overflow-hidden">
          {/* Scrollable messages panel */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-white scroll-smooth"
          >
            {renderGrouped(messages).map((chunk) => (
              <div key={chunk.key} className="space-y-2">
                <DayDivider label={chunk.label} />
                {chunk.items.map((m) => (
                  <MessageBubble key={m.id} me={m.user_id === selfId} msg={m} />
                ))}
              </div>
            ))}
            {messages.length === 0 && (
              <div className="h-64 grid place-items-center text-gray-400">
                <p>Say hi to kick things off ✨</p>
              </div>
            )}
          </div>

          {/* Sticky input bar (always visible) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="sticky bottom-0 border-t border-gray-100 p-3 sm:p-4 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResizeTextarea();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 px-3 py-2 text-[15px] max-h-48 leading-[1.35]"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                title={sending ? "Sending…" : "Send"}
              >
                <span className="inline-flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M3.4 20.4 22 12 3.4 3.6l.1 6.9L15 12 3.5 13.5l-.1 6.9Z" />
                  </svg>
                  Send
                </span>
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}

function Skeleton() {
  return (
    <main className="min-h-screen grid place-items-center text-gray-500">
      <p>Loading…</p>
    </main>
  );
}

function PresencePill({ count }: { count: number }) {
  return (
    <div className="ml-2 inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1 text-xs">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="font-medium">{count} online</span>
    </div>
  );
}

function OnlineNow({
  members,
  selfId,
}: {
  members: Member[];
  selfId?: string;
}) {
  if (!members.length) return null;
  return (
    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
      {members.map((m) => (
        <div
          key={m.id}
          className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-gray-100 bg-gray-50 shrink-0"
          title={m.name}
        >
          <span className="relative">
            <img
              src={m.avatar || "/fred.png"}
              alt={m.name}
              width={22}
              height={22}
              className="rounded-full border border-white"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 ring-2 ring-white" />
          </span>
          <span className="text-xs text-gray-700">
            {m.name}
            {m.id === selfId ? " (you)" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function UserChip({ user }: { user: any }) {
  const d = getDisplay(user);
  return (
    <div className="flex items-center gap-2">
      <img
        src={d.avatar}
        alt={d.name}
        width={24}
        height={24}
        className="rounded-full"
      />
      <span className="text-sm text-gray-700">{d.name}</span>
    </div>
  );
}

function MessageBubble({ me, msg }: { me: boolean; msg: Message }) {
  const time = new Date(msg.created_at);
  const isBot = msg.actor === "bot";
  return (
    <div
      className={`flex items-end gap-2 ${me ? "justify-end" : "justify-start"}`}
    >
      {!me && (
        <img
          src={msg.avatar || "/fred.png"}
          width={28}
          height={28}
          alt={msg.username || "user"}
          className="rounded-full border border-gray-100"
        />
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 border ${
          me
            ? "bg-gray-900 text-white border-gray-900"
            : isBot
            ? "bg-gray-50 border-gray-200"
            : "bg-white border-gray-200"
        }`}
      >
        {!me && (
          <div className="text-[11px] text-gray-500 mb-0.5">
            {msg.username || (isBot ? "FRED" : "Anon")}
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
          {msg.content}
        </div>
        <div
          className={`mt-1 text-[11px] ${
            me ? "text-gray-300" : "text-gray-400"
          }`}
        >
          {fmtTime(time)}
        </div>
      </div>
      {me && (
        <img
          src={msg.avatar || "/fred.png"}
          width={28}
          height={28}
          alt={msg.username || "me"}
          className="rounded-full border border-gray-100"
        />
      )}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="relative my-2">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-gray-100"></div>
      </div>
      <div className="relative flex justify-center">
        <span className="bg-white px-3 text-[11px] uppercase tracking-wide text-gray-400">
          {label}
        </span>
      </div>
    </div>
  );
}

function renderGrouped(list: Message[]) {
  const buckets: Record<string, Message[]> = {};
  for (const m of list) {
    const key = new Date(m.created_at).toDateString();
    (buckets[key] ||= []).push(m);
  }
  return Object.entries(buckets).map(([, items]) => ({
    key: new Date(items[0].created_at).toDateString() + "-" + items.length,
    label: labelForDate(new Date(items[0].created_at)),
    items,
  }));
}

function labelForDate(d: Date) {
  const today = new Date();
  const a = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const delta = (b - a) / 86400000;
  if (delta === 0) return "Today";
  if (delta === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: today.getFullYear() === d.getFullYear() ? undefined : "numeric",
  });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDisplay(user: any) {
  const md = user?.user_metadata || {};
  const name =
    md.user_name || md.name || md.full_name || md.preferred_username || "you";
  const avatar = md.avatar_url || md.picture || "/fred.png";
  return { name, avatar };
}
