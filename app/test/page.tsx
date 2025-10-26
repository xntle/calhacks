// =============================
// FILE: app/test-fred/page.tsx
// =============================
"use client";

import React, { useState } from "react";

type Endpoint = "janitor" | "fred";
// Collapses a Janitor-style SSE text dump into one string
export function joinSSEContent(raw: string): string {
  let out = "";
  for (const line of raw.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const json = trimmed.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      const obj = JSON.parse(json);
      const piece =
        obj?.choices?.[0]?.delta?.content ??
        obj?.choices?.[0]?.message?.content ??
        obj?.content ??
        "";
      if (typeof piece === "string") out += piece;
    } catch {
      // ignore keep-alives/bad chunks
    }
  }
  return out;
}

export default function TestFredPage() {
  const [endpoint, setEndpoint] = useState<Endpoint>("janitor");
  const [prompt, setPrompt] = useState("Say hi in one short sentence.");
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.6);

  const [topic, setTopic] = useState("Playfully acknowledge the compliment");
  const [windowStr, setWindowStr] = useState(`Quan: hey fred you're cute
Quan: wssap handsome
Quan: i love u fred`);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [resp, setResp] = useState("No response yet.");
  const [respParagraph, setRespParagraph] = useState("—");

  // helper: collapse to one paragraph
  const toParagraph = (s: string) =>
    s
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();

  async function callEndpoint() {
    setLoading(true);
    setResp("…");
    setRespParagraph("…");
    setStatus(null);

    try {
      let url = "";
      let body: any = {};

      if (endpoint === "janitor") {
        url = "/api/test";
        body = {
          model,
          temperature,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        };
      } else {
        // endpoint === "fred"
        url = "/api/fred?force=1"; // bypass freshness gate for testing
        body = {};
        if (topic.trim()) body.topic = topic.trim();
        if (windowStr.trim()) body.window = toParagraph(windowStr); // send as one paragraph
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setStatus(res.status);
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();

      let shown = text;
      if (ct.includes("application/json")) {
        try {
          shown = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          // leave as raw text
        }
      }
      var shownn = joinSSEContent(shown);
      setResp(shown);
      setRespParagraph(toParagraph(shown));
    } catch (e: any) {
      setStatus(0);
      const msg = `Request error: ${e?.message || String(e)}`;
      setResp(msg);
      setRespParagraph(toParagraph(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Test Janitor & FRED</h1>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Endpoint</label>
          <select
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value as Endpoint)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="janitor">/api/janitor-test (chat completion)</option>
            <option value="fred">/api/fred (bot reply)</option>
          </select>
        </div>

        {endpoint === "janitor" ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 h-28"
                placeholder="Type something to send to Janitor…"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Temperature</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic (optional)</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="e.g., Clarify meeting time"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Window (optional, newline-separated, newest last)
              </label>
              <textarea
                value={windowStr}
                onChange={(e) => setWindowStr(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 h-32"
                placeholder={`Alice: hey fred\nBob: what's up\nAlice: you there?`}
              />
              <div className="text-xs text-gray-500">
                Will send as: <em>{toParagraph(windowStr) || "—"}</em>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={callEndpoint}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
          >
            {loading ? "Calling…" : "Send"}
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            Status: {status === null ? "—" : status}
          </div>
          <pre className="whitespace-pre-wrap text-sm border rounded-lg p-3 bg-gray-50">
            {resp}
          </pre>
          <div className="text-sm font-medium">Paragraph view</div>
          <p className="text-sm border rounded-lg p-3 bg-gray-50">
            {respParagraph}
          </p>
        </div>
      </div>
    </main>
  );
}
