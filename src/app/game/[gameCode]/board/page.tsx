"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { submitSuggestion, endTurn } from "@/lib/gameActions";
import { SUSPECTS, WEAPONS, ROOMS } from "@/lib/constants";
import { Game } from "@/types/game";

function cardName(id: string, list: { id: string; name: string }[]) {
  return list.find((c) => c.id === id)?.name ?? id;
}

export default function BoardPage() {
  const params = useParams<{ gameCode: string }>();
  const gameCode = params.gameCode?.toUpperCase();
  const { uid } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestSuspect, setSuggestSuspect] = useState(SUSPECTS[0].id);
  const [suggestWeapon, setSuggestWeapon] = useState(WEAPONS[0].id);
  const [suggestRoom, setSuggestRoom] = useState(ROOMS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      (err) => console.error("Board listener error:", err)
    );
    return () => unsubscribe();
  }, [gameCode]);

  const currentPlayer = game ? game.players[game.currentTurnIndex] : null;
  const isMyTurn = !!currentPlayer && currentPlayer.id === uid;
  const me = game?.players.find((p) => p.id === uid) ?? null;

  function openSuggestForm() {
    if (!me) return;
    setSuggestSuspect(SUSPECTS[0].id);
    setSuggestWeapon(WEAPONS[0].id);
    setSuggestRoom(me.position || ROOMS[0].id);
    setError(null);
    setShowSuggest(true);
  }

  async function handleSubmitSuggestion() {
    if (!game || !uid) return;
    setBusy(true);
    setError(null);
    try {
      await submitSuggestion(
        game.gameCode,
        uid,
        suggestSuspect,
        suggestWeapon,
        suggestRoom
      );
      setShowSuggest(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEndTurn() {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      await endTurn(game.gameCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
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
          Laying out the board...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="font-display text-xs tracking-wide text-brass">
            Case No. {game.gameCode}
          </p>
          <h1 className="mt-1 font-display text-2xl text-text-on-ink">
            {currentPlayer
              ? `${
                  currentPlayer.character
                    ? cardName(currentPlayer.character, SUSPECTS)
                    : currentPlayer.name
                }'s turn`
              : "Waiting for players..."}
          </h1>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            {game.currentSuggestion && (
              <div className="mb-6 rounded-sm border border-brass/40 bg-parchment px-4 py-3 text-text-on-parchment">
                <p className="font-display text-xs text-burgundy">
                  Suggestion on the table
                </p>
                <p className="mt-1 font-body text-sm">
                  {game.players.find(
                    (p) => p.id === game.currentSuggestion?.suggesterId
                  )?.name ?? "Someone"}{" "}
                  suggests it was{" "}
                  <span className="font-display text-brass">
                    {cardName(game.currentSuggestion.suspect, SUSPECTS)}
                  </span>{" "}
                  with the{" "}
                  <span className="font-display text-brass">
                    {cardName(game.currentSuggestion.weapon, WEAPONS)}
                  </span>{" "}
                  in the{" "}
                  <span className="font-display text-brass">
                    {cardName(game.currentSuggestion.room, ROOMS)}
                  </span>
                  .
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {ROOMS.map((room) => {
                const occupants = game.players.filter(
                  (p) => p.position === room.id
                );
                return (
                  <div
                    key={room.id}
                    className="rounded-sm border border-parchment-dark/30 bg-parchment px-3 py-4 text-text-on-parchment"
                  >
                    <p className="font-display text-sm">{room.name}</p>
                    {occupants.length > 0 && (
                      <p className="mt-2 font-body text-xs text-text-on-parchment/60">
                        {occupants.map((p) => p.name).join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <p className="mt-4 font-body text-sm text-burgundy">{error}</p>
            )}

            {isMyTurn && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={openSuggestForm}
                  disabled={busy}
                  className="rounded-sm bg-brass px-4 py-2 font-display text-sm text-parchment transition hover:bg-brass-light disabled:opacity-60"
                >
                  Suggest
                </button>
                <button
                  onClick={handleEndTurn}
                  disabled={busy}
                  className="rounded-sm border border-burgundy px-4 py-2 font-display text-sm text-burgundy transition hover:bg-burgundy hover:text-parchment disabled:opacity-60"
                >
                  End turn
                </button>
              </div>
            )}
          </div>

          <aside>
            <p className="font-display text-xs tracking-wide text-brass">
              Detectives
            </p>
            <ul className="mt-2 space-y-2">
              {game.players.map((player, i) => (
                <li
                  key={player.id}
                  className={`rounded-sm border px-3 py-2 font-body text-sm ${
                    i === game.currentTurnIndex
                      ? "border-brass bg-parchment text-text-on-parchment"
                      : "border-parchment-dark/20 bg-parchment/60 text-text-on-parchment/70"
                  }`}
                >
                  <span className="block font-display text-xs">
                    {player.character
                      ? cardName(player.character, SUSPECTS)
                      : "Unassigned"}
                  </span>
                  <span className="block text-xs opacity-70">
                    {player.name}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      {showSuggest && me && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-sm bg-parchment px-6 py-6 text-text-on-parchment">
            <h2 className="font-display text-lg">Make a suggestion</h2>

            <label className="mt-4 block font-body text-sm">Suspect</label>
            <select
              value={suggestSuspect}
              onChange={(e) => setSuggestSuspect(e.target.value)}
              className="mt-1 w-full rounded-sm border border-parchment-dark bg-white/40 px-3 py-2 font-body text-sm outline-none focus:border-brass"
            >
              {SUSPECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <label className="mt-3 block font-body text-sm">Weapon</label>
            <select
              value={suggestWeapon}
              onChange={(e) => setSuggestWeapon(e.target.value)}
              className="mt-1 w-full rounded-sm border border-parchment-dark bg-white/40 px-3 py-2 font-body text-sm outline-none focus:border-brass"
            >
              {WEAPONS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <label className="mt-3 block font-body text-sm">Room</label>
            <select
              value={suggestRoom}
              onChange={(e) => setSuggestRoom(e.target.value)}
              className="mt-1 w-full rounded-sm border border-parchment-dark bg-white/40 px-3 py-2 font-body text-sm outline-none focus:border-brass"
            >
              {ROOMS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowSuggest(false)}
                disabled={busy}
                className="rounded-sm border border-parchment-dark px-4 py-2 font-display text-xs text-text-on-parchment/70 transition hover:border-brass disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSuggestion}
                disabled={busy}
                className="rounded-sm bg-brass px-4 py-2 font-display text-xs text-parchment transition hover:bg-brass-light disabled:opacity-60"
              >
                {busy ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
