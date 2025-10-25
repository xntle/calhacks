// Minimal Fred Landing Page (React single file)
// Place fred.png in /public. Render <FredLanding />
"use client";
// Minimal Fred Landing Page (React single file)
// Place fred.png in /public. Render <FredLanding />
"use client";
import React, { useState, useEffect } from "react";

export default function FredLanding() {
  const [active, setActive] = useState(8);
  useEffect(() => {
    const t = setInterval(() => {
      setActive((n) => Math.max(1, n + (Math.random() > 0.5 ? 1 : -1)));
    }, 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="min-h-screen bg-white text-gray-900 grid place-items-center px-6">
      <div className="w-full max-w-3xl text-center">
        <Header active={active} />
        <Hero
          onJoin={() => alert("Join clicked — wire this to your auth/chat")}
        />
        <Footer />
      </div>
    </main>
  );
}

function Header({ active }) {
  return (
    <header className="flex items-center justify-between max-w-3xl mx-auto w-full py-6">
      <Presence count={active} />
    </header>
  );
}

function Hero({ onJoin }) {
  return (
    <section className="mt-6">
      <h2 className="text-4xl font-extrabold tracking-tight">
        join fred67's gooner squad
      </h2>
      <p className="mt-3 text-gray-600">
        White canvas. Simple hover. Subtle tech vibe. Nothing extra.
      </p>

      <div className="mt-8 mx-auto w-full max-w-md border border-gray-100 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col items-center">
          <Avatar src="/fred.png" size={128} techHover />
          <p className="mt-4 text-sm text-gray-500">Hover the avatar.</p>
          <button
            onClick={onJoin}
            className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white hover:scale-[1.02] transition-transform"
          >
            join fred's group chat
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-12 text-xs text-gray-400">
      disclaimer: fred is an ai
    </footer>
  );
}

function Presence({ count }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-sm">
      <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
      <span className="font-medium">{count} online</span>
    </div>
  );
}

function Avatar({ src, size = 64, techHover = false }) {
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
      {/* subtle tech ring on hover */}
      {techHover && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.06), 0 8px 30px rgba(124,58,237,0.18)",
          }}
        />
      )}
      {/* faint scanline on hover */}
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
