// Simple Fred Chat Page - single-file React component
// Usage: place fred.png in /public, ensure Tailwind CSS is set up, render <FredChat />
"use client";
import React, { useEffect, useRef, useState } from "react";

export default function FredChat() {
  const [online, setOnline] = useState(9);
  const [messages, setMessages] = useState([
    {
      id: id(),
      who: "FRED",
      text: "ayo good boy, welcome to the group 🍟",
      t: now(),
    },
    { id: id(), who: "ivy", text: "hii fred", t: now() },
  ]);
  const [input, setInput] = useState("");
  const [typingFred, setTypingFred] = useState(false);
  const listRef = useRef(null);

  // gentle presence wobble
  useEffect(() => {
    const timer = setInterval(() => {
      setOnline((n) =>
        Math.max(
          1,
          n + (Math.random() > 0.6 ? 1 : Math.random() < 0.35 ? -1 : 0)
        )
      );
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // autoscroll
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, typingFred]);

  function send() {
    const text = input.trim();
    if (!text) return;
    const userMsg = { id: id(), who: "you", text, t: now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    // bot typing + reply
    setTypingFred(true);
    const delay = 600 + Math.random() * 800;
    setTimeout(() => {
      setTypingFred(false);
      const reply = fredReply(text);
      setMessages((m) => [
        ...m,
        { id: id(), who: "FRED", text: reply, t: now(), fred: true },
      ]);
    }, delay);
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar src="/fred.png" size={52} techHover />
          <div>
            <div className="font-extrabold text-lg">Fred Chat</div>
            <div className="text-xs text-gray-500">
              white • simple • a lil techy
            </div>
          </div>
        </div>
        <Presence count={online} />
      </header>

      <main className="max-w-6xl mx-auto grid md:grid-cols-[1fr_280px] gap-6 px-6 pb-8">
        {/* chat panel */}
        <section className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm bg-white">
          <div
            ref={listRef}
            className="h-[60vh] md:h-[68vh] p-4 overflow-auto bg-gray-50/50"
          >
            {messages.map((m) => (
              <Msg key={m.id} who={m.who} text={m.text} t={m.t} fred={m.fred} />
            ))}
            {typingFred && <Typing who="FRED" />}
          </div>
          <div className="p-3 flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="Write a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button
              onClick={send}
              className="px-4 py-2 rounded-xl bg-black text-white hover:scale-[1.02] transition-transform"
            >
              Send
            </button>
          </div>
        </section>

        {/* people / info */}
        <aside className="space-y-4">
          <Card>
            <div className="text-xs font-medium text-gray-600">
              Active people
            </div>
            <div className="mt-3 space-y-2">
              {makeRoster(online)
                .slice(0, 8)
                .map((u) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${u.color}`}
                    >
                      {u.name}
                    </div>
                    <div className="text-sm flex-1">{u.handle}</div>
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                ))}
            </div>
          </Card>

          <Card>
            <div className="text-xs text-gray-500">
              Tip: Replace the fake reply logic with your backend
              (WebSocket/Firebase/Supabase). Sanitize inputs, add server
              moderation, and persist messages.
            </div>
          </Card>
        </aside>
      </main>
    </div>
  );
}

// --- components ---
function Avatar({ src, size = 48, techHover = false }) {
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
        alt="avatar"
        className={`${base} ${hover} w-full h-full`}
      />
      {techHover && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.06), 0 10px 36px rgba(99,102,241,0.18)",
          }}
        />
      )}
    </div>
  );
}

function Presence({ count }) {
  return (
    <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-sm">
      <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
      <span className="font-medium">{count} online</span>
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="border border-gray-100 bg-white rounded-2xl shadow-sm p-4">
      {children}
    </div>
  );
}

function Msg({ who, text, t, fred }) {
  const isYou = who === "you";
  return (
    <div className={`flex ${isYou ? "justify-end" : ""} mb-3`}>
      {!isYou && (
        <img
          src={who === "FRED" ? "/fred.png" : "/fred.png"}
          alt="a"
          className="w-7 h-7 rounded-full border border-white mr-2"
        />
      )}
      <div
        className={`${
          isYou ? "bg-black text-white" : "bg-white text-gray-900"
        } px-3 py-2 rounded-2xl max-w-[75%] shadow-sm border ${
          isYou ? "border-black/10" : "border-gray-100"
        }`}
      >
        <div className="text-xs opacity-60 mb-1">
          {who} • {t}
        </div>
        <div className="text-sm leading-relaxed">{text}</div>
      </div>
    </div>
  );
}

function Typing({ who }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <img
        src={who === "FRED" ? "/fred.png" : "/fred.png"}
        alt="a"
        className="w-6 h-6 rounded-full border border-white"
      />
      <div className="bg-white border border-gray-100 rounded-2xl px-3 py-2 shadow-sm text-sm">
        <span className="inline-flex gap-1">
          <Dot />
          <Dot delay={120} />
          <Dot delay={240} />
        </span>
      </div>
    </div>
  );
}

function Dot({ delay = 0 }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block animate-bounce"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

// --- helpers ---
function id() {
  return Math.random().toString(36).slice(2, 9);
}
function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fredReply(userText) {
  // super simple, non-harmful gen‑z-ish replies
  const bank = [
    "bet. that kinda slaps ngl",
    "ok twin, noted. good boy move",
    "no cap, it's giving main character",
    "ur mom would agree tbh (playful)",
    "big mood. drink water tho",
    "lowkey ick but highkey valid",
    "rizz levels detected: medium‑rare",
    "aura check: cozy gremlin",
  ];
  const pick = bank[Math.floor(Math.random() * bank.length)];
  // tiny echo for context
  const clip = userText.slice(0, 60);
  return `${pick} — “${clip}”`;
}

function makeRoster(n) {
  const colors = [
    "bg-blue-200",
    "bg-pink-200",
    "bg-yellow-200",
    "bg-green-200",
    "bg-purple-200",
    "bg-red-200",
    "bg-amber-200",
    "bg-cyan-200",
  ];
  return Array.from({ length: Math.min(12, Math.max(1, n)) }).map((_, i) => ({
    id: id(),
    name: ("u" + (i + 1)).toUpperCase(),
    handle: `user_${i + 1}`,
    color: colors[i % colors.length],
  }));
}
