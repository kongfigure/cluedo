"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { createGame, joinGame } from "@/lib/gameActions";

export default function HomePage() {
  const router = useRouter();
  const { uid, loading: authLoading } = useAuth();

  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"idle" | "creating" | "joining">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!uid || !name.trim()) {
      setError("Enter your name first.");
      return;
    }
    setError(null);
    setMode("creating");
    try {
      const gameCode = await createGame(uid, name.trim());
      router.push(`/game/${gameCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMode("idle");
    }
  }

  async function handleJoin() {
    if (!uid || !name.trim()) {
      setError("Enter your name first.");
      return;
    }
    if (!joinCode.trim()) {
      setError("Enter a case number to continue.");
      return;
    }
    setError(null);
    setMode("joining");
    try {
      await joinGame(joinCode.trim(), uid, name.trim());
      router.push(`/game/${joinCode.trim().toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMode("idle");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6">
      <div className="pointer-events-none absolute left-8 top-8 h-16 w-16 border-l-2 border-t-2 border-brass/30" />
      <div className="pointer-events-none absolute bottom-8 right-8 h-16 w-16 border-b-2 border-r-2 border-brass/30" />

      <div className="flex flex-col items-center gap-5">
        <div
          className="w-full max-w-sm -rotate-1 rounded-sm bg-parchment px-8 py-10 text-text-on-parchment shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          style={{
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.06)",
          }}
        >
          <p className="font-display text-xs tracking-wide text-burgundy">
            Case File
          </p>
          <h1 className="mt-1 font-display text-3xl leading-tight">Cluedo</h1>

          <div className="mt-6 border-t border-parchment-dark pt-6">
            <label className="block font-body text-sm text-text-on-parchment/80">
              Your name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Detective..."
              className="mt-1 w-full rounded-sm border border-parchment-dark bg-white/40 px-3 py-2 font-body text-base outline-none focus:border-brass"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={authLoading || mode !== "idle"}
            className="mt-5 w-full rounded-sm bg-brass py-2.5 font-display text-sm text-parchment transition hover:bg-brass-light disabled:opacity-60"
          >
            {mode === "creating" ? "Opening case..." : "Open new case"}
          </button>

          <div className="my-5 flex items-center gap-3 text-text-on-parchment/50">
            <div className="h-px flex-1 bg-parchment-dark" />
            <span className="font-body text-sm">or continue a case</span>
            <div className="h-px flex-1 bg-parchment-dark" />
          </div>

          <label className="block font-body text-sm text-text-on-parchment/80">
            Case number
          </label>
          <div className="mt-1 flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXX"
              maxLength={4}
              className="w-full rounded-sm border border-parchment-dark bg-white/40 px-3 py-2 font-display text-base uppercase tracking-widest outline-none focus:border-brass"
            />
            <button
              onClick={handleJoin}
              disabled={authLoading || mode !== "idle"}
              className="shrink-0 rounded-sm border border-burgundy px-4 py-2 font-display text-sm text-burgundy transition hover:bg-burgundy hover:text-parchment disabled:opacity-60"
            >
              {mode === "joining" ? "..." : "Go"}
            </button>
          </div>

          {error && (
            <p className="mt-4 font-body text-sm text-burgundy">{error}</p>
          )}
        </div>

        <Link
          href="/how-to-play"
          className="font-body text-sm text-brass/80 underline-offset-4 transition hover:text-brass hover:underline"
        >
          How to play
        </Link>
      </div>
    </main>
  );
}
