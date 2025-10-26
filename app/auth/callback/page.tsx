"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function AuthCallbackPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    (async () => {
      // Handles PKCE/code flow. If there’s no code, this is a no-op.
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      );
      if (error) {
        console.error("OAuth exchange error:", error);
        // optional: show a toast, then go home or login
        router.replace("/");
        return;
      }
      // Now you’re signed in — go to chat (or wherever)
      router.replace("/chat");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen grid place-items-center text-sm text-gray-600">
      <p>Signing you in…</p>
    </main>
  );
}
