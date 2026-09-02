"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { selectCharacter } from "@/lib/gameActions";
import { SUSPECTS } from "@/lib/constants";
import { Game } from "@/types/game";

export default function CharacterSelectPage() {
  const params = useParams<{ gameCode: string }>();
  const gameCode = params.gameCode?.toUpperCase();
  const router = useRouter();
  const { uid } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

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
        setGame(snapshot.data() as Game);
      },
      (err) => console.error("Character select listener error:", err)
    );
    return () => unsubscribe();
  }, [gameCode]);

  useEffect(() => {
    if (!game || !gameCode) return;
    const allPicked =
      game.players.length > 0 &&
      game.players.every((p) => p.character !== "");
    if (allPicked) {
      router.replace(`/game/${gameCode}/board`);
    }
  }, [game, gameCode, router]);

  const me = game?.players.find((p) => p.id === uid) ?? null;
  const hasPicked = !!me?.character;

  async function handleSelect(suspectId: string) {
    if (!game || !uid || hasPicked) return;
    setError(null);
    setSelecting(suspectId);
    try {
      await selectCharacter(game.gameCode, uid, suspectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSelecting(null);
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-burgundy">No case found</p>
          <p className="mt-2 font-body text-text-on-ink/70">
            There&apos;s no open case with the number{" "}
            <span className="font-display">{gameCode}</span>.
          </p>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-display text-text-on-ink/60">
          Assembling suspects...
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-ink px-6 py-16">
      <div className="w-full max-w-2xl">
        <p className="font-display text-xs tracking-wide text-brass">
          Case No. {game.gameCode}
        </p>
        <h1 className="mt-1 font-display text-2xl text-text-on-ink">
          Choose your suspect
        </h1>

        {hasPicked ? (
          <p className="mt-2 font-body text-sm text-text-on-ink/70">
            You are playing as{" "}
            <span className="font-display text-brass">
              {SUSPECTS.find((s) => s.id === me?.character)?.name}
            </span>
            . Waiting for the others to choose...
          </p>
        ) : (
          <p className="mt-2 font-body text-sm text-text-on-ink/70">
            Pick a suspect. Once claimed, no one else can play as them.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SUSPECTS.map((suspect) => {
            const claimant = game.players.find(
              (p) => p.character === suspect.id
            );
            const isMine = claimant?.id === uid;
            const isClaimedByOther = !!claimant && !isMine;
            const isPending = selecting === suspect.id;

            return (
              <button
                key={suspect.id}
                onClick={() => handleSelect(suspect.id)}
                disabled={hasPicked || isClaimedByOther || isPending}
                className={`rounded-sm border px-3 py-4 text-left font-body transition disabled:cursor-not-allowed ${
                  isMine
                    ? "border-brass bg-parchment text-text-on-parchment"
                    : isClaimedByOther
                    ? "border-parchment-dark/20 bg-parchment/30 text-text-on-parchment/40"
                    : "border-parchment-dark/40 bg-parchment text-text-on-parchment hover:border-brass"
                }`}
              >
                <span className="block font-display text-sm">
                  {suspect.name}
                </span>
                {isClaimedByOther && (
                  <span className="mt-1 block text-xs text-burgundy">
                    Claimed by {claimant?.name}
                  </span>
                )}
                {isMine && (
                  <span className="mt-1 block text-xs text-brass">
                    Your suspect
                  </span>
                )}
                {isPending && (
                  <span className="mt-1 block text-xs text-text-on-parchment/50">
                    Claiming...
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 font-body text-sm text-burgundy">{error}</p>
        )}

        <ul className="mt-8 space-y-2">
          {game.players.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between rounded-sm border border-parchment-dark/30 bg-parchment px-4 py-3 text-text-on-parchment"
            >
              <span className="font-body">{player.name}</span>
              <span className="font-display text-xs text-brass">
                {player.character
                  ? SUSPECTS.find((s) => s.id === player.character)?.name
                  : "Choosing..."}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
