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
  user_id: string;
  content: string;
  created_at: string;
  username?: string | null;
  avatar?: string | null;
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

  // New: messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Scroll container ref for auto-scroll
  const listRef = useRef<HTMLDivElement>(null);

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

  // 2) Realtime Presence (auto-cleans up when tab closes or loses connection)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  // 3) Load initial messages + subscribe to inserts
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
        .select("id, user_id, content, created_at, username, avatar")
        .order("created_at", { ascending: true })
        .limit(500);
      if (!error && data) setMessages(data as Message[]);
    })();

    return () => {
      isMounted = false;
      supabase.removeChannel(sub);
    };
  }, [supabase, user]);

  // 4) Send message
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !user || sending) return;
    setSending(true);

    const profile = getDisplay(user);

    // optimistic row (temporary id)
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      user_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      username: profile.name,
      avatar: profile.avatar,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      content: text,
      username: profile.name,
      avatar: profile.avatar,
    });

    if (error) {
      // rollback optimistic
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // show a quick inline error bubble
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        user_id: "system",
        content: `Failed to send: ${error.message}`,
        created_at: new Date().toISOString(),
        username: "System",
        avatar: "/fred.png",
      };
      setMessages((prev) => [...prev, errMsg]);
    }

    setSending(false);
  }, [input, supabase, user, sending]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages.length]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <Skeleton />;

  const selfId = user?.id;

  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b border-gray-100">
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
      </header>

      <section className="max-w-3xl mx-auto w-full px-4 flex-1 flex flex-col">
        {/* Active members
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-500">Active now</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 border border-gray-100 rounded-full px-3 py-1.5"
              >
                <img
                  src={m.avatar}
                  alt={m.name}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
                <span className="text-sm">{m.name}</span>
              </div>
            ))}
            {members.length === 0 && (
              <p className="text-sm text-gray-400">(just you for now)</p>
            )}
          </div>
        </div> */}

        {/* Chat area */}
        <div className="mt-6 border border-gray-100 rounded-2xl flex-1 flex flex-col overflow-hidden">
          {/* messages list */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-white"
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

          {/* composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-gray-100 p-3 sm:p-4 bg-white"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 px-3 py-2 text-[15px]"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                title={sending ? "Sending…" : "Send"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M3.4 20.4 22 12 3.4 3.6l.1 6.9L15 12 3.5 13.5l-.1 6.9Z" />
                </svg>
                Send
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
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
            : "bg-white border-gray-200"
        }`}
      >
        {!me && (
          <div className="text-[11px] text-gray-500 mb-0.5">
            {msg.username || "Anon"}
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
  return Object.entries(buckets).map(([key, items]) => ({
    key,
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
