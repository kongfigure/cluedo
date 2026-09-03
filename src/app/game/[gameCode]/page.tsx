"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { dealCards } from "@/lib/gameActions";
import { Game } from "@/types/game";

export default function LobbyPage() {
  const params = useParams<{ gameCode: string }>();
  const gameCode = params.gameCode?.toUpperCase();
  const router = useRouter();
  const { uid } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!gameCode) return;
    const gameRef = doc(db, "games", gameCode);
    const unsubscribe = onSnapshot(
      gameRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setNotFound(true);
          return;
        }
        const data = snapshot.data() as Game;
        setGame(data);
        if (data.phase === "playing") {
          router.replace(`/game/${gameCode}/characters`);
        }
      },
      (err) => console.error("Lobby listener error:", err)
    );
    return () => unsubscribe();
  }, [gameCode, router]);

  const isHost = game?.players[0]?.id === uid;
  const canStart = (game?.players.length ?? 0) >= 3;

  async function handleStart() {
    if (!game || starting) return;
    setStarting(true);
    try {
      if (game.dealt) {
        await updateDoc(doc(db, "games", game.gameCode), {
          phase: "playing",
        });
      } else {
        await dealCards(game.gameCode, game);
      }
    } finally {
      setStarting(false);
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-burgundy">No case found</p>
          <p className="mt-2 font-body text-text-on-ink/70">
            There&apos;s no open case with the number{" "}
            <span className="font-display">{gameCode}</span>. Double-check
            with whoever sent it to you.
          </p>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-display text-text-on-ink/60">Opening case file...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-ink px-6 py-16">
      <div className="w-full max-w-md">
        <p className="font-display text-xs tracking-wide text-brass">
          Case No. {game.gameCode}
        </p>
        <h1 className="mt-1 font-display text-2xl text-text-on-ink">
          Suspects assembled
        </h1>

        <ul className="mt-6 space-y-2">
          {game.players.map((player, i) => (
            <li
              key={player.id}
              className="flex items-center justify-between rounded-sm border border-parchment-dark/30 bg-parchment px-4 py-3 text-text-on-parchment"
            >
              <span className="font-body">{player.name}</span>
              {i === 0 && (
                <span className="font-display text-xs text-burgundy">
                  Host
                </span>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="mt-6 w-full rounded-sm bg-brass py-2.5 font-display text-sm text-parchment transition hover:bg-brass-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            {starting
              ? "Dealing cards..."
              : canStart
              ? "Begin investigation"
              : `Waiting for players (need ${3 - game.players.length} more)`}
          </button>
        ) : (
          <p className="mt-6 text-center font-body text-sm text-text-on-ink/60">
            Waiting for the host to begin the investigation...
          </p>
        )}
      </div>
    </main>
  );
}
