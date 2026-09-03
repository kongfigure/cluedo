"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import {
  submitSuggestion,
  endTurn,
  passDisprove,
  discloseCard,
  makeAccusation,
} from "@/lib/gameActions";
import { SUSPECTS, WEAPONS, ROOMS } from "@/lib/constants";
import { Card, Disprove, Game, PrivateHand, Solution } from "@/types/game";

function cardName(id: string, list: { id: string; name: string }[]) {
  return list.find((c) => c.id === id)?.name ?? id;
}

export default function BoardPage() {
  const params = useParams<{ gameCode: string }>();
  const gameCode = params.gameCode?.toUpperCase();
  const { uid } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [myHand, setMyHand] = useState<Card[] | null>(null);
  const [revealedCards, setRevealedCards] = useState<Record<string, Card>>({});

  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestSuspect, setSuggestSuspect] = useState(SUSPECTS[0].id);
  const [suggestWeapon, setSuggestWeapon] = useState(WEAPONS[0].id);
  const [suggestRoom, setSuggestRoom] = useState(ROOMS[0].id);

  const [showAccuse, setShowAccuse] = useState(false);
  const [accuseSuspect, setAccuseSuspect] = useState(SUSPECTS[0].id);
  const [accuseWeapon, setAccuseWeapon] = useState(WEAPONS[0].id);
  const [accuseRoom, setAccuseRoom] = useState(ROOMS[0].id);
  const [wrongAccusation, setWrongAccusation] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const autoPassedKey = useRef<string | null>(null);
  const fetchedDisproveIds = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (!gameCode || !uid) return;
    const handRef = doc(db, "games", gameCode, "private", uid);
    const unsubscribe = onSnapshot(
      handRef,
      (snapshot) => {
        setMyHand(snapshot.exists() ? (snapshot.data() as PrivateHand).hand : []);
      },
      (err) => console.error("Hand listener error:", err)
    );
    return () => unsubscribe();
  }, [gameCode, uid]);

  // If it's my turn to be checked for a disprove and I have no matching
  // card, auto-pass so the queue advances without me doing anything.
  useEffect(() => {
    if (!game || !uid || myHand === null || !game.currentSuggestion) return;
    if (game.pendingDiscloserId !== uid) return;

    const key = `${game.currentSuggestion.timestamp}-${uid}`;
    if (autoPassedKey.current === key) return;

    const { suspect, weapon, room } = game.currentSuggestion;
    const matches = myHand.filter(
      (c) => c.id === suspect || c.id === weapon || c.id === room
    );

    if (matches.length === 0) {
      autoPassedKey.current = key;
      passDisprove(game.gameCode, uid).catch((err) =>
        console.error("Auto-pass failed:", err)
      );
    }
  }, [game, uid, myHand]);

  // Once a disprove resolves, the suggester and the discloser (and only
  // them — this is exactly what the security rules allow) fetch the
  // actual card that was shown.
  useEffect(() => {
    const result = game?.disproveResult;
    if (!game || !uid || !result?.disproveId || !result.discloserId) return;

    const canSee =
      uid === game.currentSuggestion?.suggesterId || uid === result.discloserId;
    if (!canSee || fetchedDisproveIds.current.has(result.disproveId)) return;

    const disproveId = result.disproveId;
    fetchedDisproveIds.current.add(disproveId);
    const disproveRef = doc(db, "games", game.gameCode, "disproves", disproveId);
    getDoc(disproveRef)
      .then((snap) => {
        if (snap.exists()) {
          const card = (snap.data() as Disprove).cardShown;
          setRevealedCards((prev) => ({ ...prev, [disproveId]: card }));
        }
      })
      .catch((err) => console.error("Failed to read disprove doc:", err));
  }, [game, uid]);

  // Once someone wins (or the last player standing is declared the
  // winner), the solution becomes fair game for everyone to read.
  useEffect(() => {
    if (!gameCode || game?.phase !== "finished") return;
    getDoc(doc(db, "games", gameCode, "solution", "current"))
      .then((snap) => {
        if (snap.exists()) setSolution(snap.data() as Solution);
      })
      .catch((err) => console.error("Failed to read solution:", err));
  }, [gameCode, game?.phase]);

  const currentPlayer = game ? game.players[game.currentTurnIndex] : null;
  const me = game?.players.find((p) => p.id === uid) ?? null;
  const isMyTurn = !!currentPlayer && currentPlayer.id === uid && !me?.eliminated;
  const revealedCard = game?.disproveResult?.disproveId
    ? revealedCards[game.disproveResult.disproveId]
    : undefined;

  const myDisproveMatches =
    game && uid && myHand && game.pendingDiscloserId === uid && game.currentSuggestion
      ? myHand.filter(
          (c) =>
            c.id === game.currentSuggestion!.suspect ||
            c.id === game.currentSuggestion!.weapon ||
            c.id === game.currentSuggestion!.room
        )
      : [];

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
        game,
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

  function openAccuseForm() {
    setAccuseSuspect(SUSPECTS[0].id);
    setAccuseWeapon(WEAPONS[0].id);
    setAccuseRoom(ROOMS[0].id);
    setError(null);
    setShowAccuse(true);
  }

  async function handleSubmitAccusation() {
    if (!game || !uid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await makeAccusation(
        game.gameCode,
        uid,
        accuseSuspect,
        accuseWeapon,
        accuseRoom
      );
      setShowAccuse(false);
      if (!result.correct) {
        setWrongAccusation(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisclose(card: Card) {
    if (!game || !uid || !game.currentSuggestion) return;
    setBusy(true);
    setError(null);
    try {
      await discloseCard(game.gameCode, game.currentSuggestion.suggesterId, uid, card);
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

  if (game.phase === "finished") {
    const winner = game.players.find((p) => p.id === game.winner);
    const winnerName = winner
      ? winner.character
        ? cardName(winner.character, SUSPECTS)
        : winner.name
      : "Someone";

    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-center">
        <div className="max-w-md -rotate-1 rounded-sm bg-parchment px-8 py-10 text-text-on-parchment shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <p className="font-display text-xs tracking-wide text-brass">
            Case No. {game.gameCode}
          </p>
          <h1 className="mt-1 font-display text-2xl">Case closed</h1>
          <p className="mt-3 font-body text-sm text-text-on-parchment/80">
            {solution ? (
              <>
                {winnerName} solved it — it was{" "}
                <span className="font-display text-brass">
                  {cardName(solution.suspect, SUSPECTS)}
                </span>{" "}
                with the{" "}
                <span className="font-display text-brass">
                  {cardName(solution.weapon, WEAPONS)}
                </span>{" "}
                in the{" "}
                <span className="font-display text-brass">
                  {cardName(solution.room, ROOMS)}
                </span>
                .
              </>
            ) : (
              `${winnerName} solved it.`
            )}
          </p>
          {uid === game.winner && (
            <p className="mt-4 font-display text-xs text-burgundy">
              You cracked the case!
            </p>
          )}
        </div>
      </main>
    );
  }

  const suggestion = game.currentSuggestion;
  const result = game.disproveResult;

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
            {suggestion && (
              <div className="mb-6 rounded-sm border border-brass/40 bg-parchment px-4 py-3 text-text-on-parchment">
                <p className="font-display text-xs text-burgundy">
                  Suggestion on the table
                </p>
                <p className="mt-1 font-body text-sm">
                  {game.players.find((p) => p.id === suggestion.suggesterId)
                    ?.name ?? "Someone"}{" "}
                  suggests it was{" "}
                  <span className="font-display text-brass">
                    {cardName(suggestion.suspect, SUSPECTS)}
                  </span>{" "}
                  with the{" "}
                  <span className="font-display text-brass">
                    {cardName(suggestion.weapon, WEAPONS)}
                  </span>{" "}
                  in the{" "}
                  <span className="font-display text-brass">
                    {cardName(suggestion.room, ROOMS)}
                  </span>
                  .
                </p>

                <p className="mt-2 font-body text-xs text-text-on-parchment/70">
                  {!result ? (
                    game.pendingDiscloserId ? (
                      <>
                        Checking with{" "}
                        {game.players.find(
                          (p) => p.id === game.pendingDiscloserId
                        )?.name ?? "a player"}
                        ...
                      </>
                    ) : (
                      "Checking for a disprove..."
                    )
                  ) : result.discloserId === null ? (
                    "No one could disprove this."
                  ) : (
                    <>
                      {game.players.find((p) => p.id === result.discloserId)
                        ?.name ?? "A player"}{" "}
                      showed a card
                      {revealedCard ? (
                        <>
                          {" "}
                          — it was the{" "}
                          <span className="text-brass">
                            {revealedCard.name}
                          </span>
                          .
                        </>
                      ) : (
                        "."
                      )}
                    </>
                  )}
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

            {wrongAccusation && (
              <div className="mt-4 rounded-sm border border-burgundy bg-parchment px-4 py-3 text-text-on-parchment">
                <p className="font-body text-sm">
                  Your accusation was wrong — you&apos;re out, but can still
                  disprove others.
                </p>
                <button
                  onClick={() => setWrongAccusation(false)}
                  className="mt-2 font-display text-xs text-burgundy underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {isMyTurn && (
              <div className="mt-6 flex gap-3">
                {!suggestion && (
                  <>
                    <button
                      onClick={openSuggestForm}
                      disabled={busy}
                      className="rounded-sm bg-brass px-4 py-2 font-display text-sm text-parchment transition hover:bg-brass-light disabled:opacity-60"
                    >
                      Suggest
                    </button>
                    <button
                      onClick={openAccuseForm}
                      disabled={busy}
                      className="rounded-sm border border-burgundy px-4 py-2 font-display text-sm text-burgundy transition hover:bg-burgundy hover:text-parchment disabled:opacity-60"
                    >
                      Accuse
                    </button>
                  </>
                )}
                <button
                  onClick={handleEndTurn}
                  disabled={busy}
                  className="rounded-sm border border-parchment-dark/40 px-4 py-2 font-display text-sm text-text-on-ink transition hover:border-brass disabled:opacity-60"
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
                    player.eliminated
                      ? "border-parchment-dark/20 bg-parchment/40 text-text-on-parchment/40"
                      : i === game.currentTurnIndex
                      ? "border-brass bg-parchment text-text-on-parchment"
                      : "border-parchment-dark/20 bg-parchment/60 text-text-on-parchment/70"
                  }`}
                >
                  <span className="flex items-center justify-between font-display text-xs">
                    <span>
                      {player.character
                        ? cardName(player.character, SUSPECTS)
                        : "Unassigned"}
                    </span>
                    {player.eliminated && (
                      <span className="text-burgundy">Out</span>
                    )}
                  </span>
                  <span className="block text-xs opacity-70">
                    {player.name}
                  </span>
                </li>
              ))}
            </ul>

            {myHand && myHand.length > 0 && (
              <>
                <p className="mt-6 font-display text-xs tracking-wide text-brass">
                  Your hand
                </p>
                <ul className="mt-2 space-y-1">
                  {myHand.map((card) => (
                    <li
                      key={card.id}
                      className="rounded-sm border border-parchment-dark/20 bg-parchment/60 px-3 py-1.5 font-body text-xs text-text-on-parchment/80"
                    >
                      {card.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
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

      {showAccuse && me && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-sm bg-parchment px-6 py-6 text-text-on-parchment">
            <h2 className="font-display text-lg text-burgundy">
              Make an accusation
            </h2>
            <p className="mt-2 font-body text-xs text-text-on-parchment/70">
              If you&apos;re wrong, you&apos;re out of the running for good.
            </p>

            <label className="mt-4 block font-body text-sm">Suspect</label>
            <select
              value={accuseSuspect}
              onChange={(e) => setAccuseSuspect(e.target.value)}
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
              value={accuseWeapon}
              onChange={(e) => setAccuseWeapon(e.target.value)}
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
              value={accuseRoom}
              onChange={(e) => setAccuseRoom(e.target.value)}
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
                onClick={() => setShowAccuse(false)}
                disabled={busy}
                className="rounded-sm border border-parchment-dark px-4 py-2 font-display text-xs text-text-on-parchment/70 transition hover:border-brass disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAccusation}
                disabled={busy}
                className="rounded-sm bg-burgundy px-4 py-2 font-display text-xs text-parchment transition hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Accusing..." : "Accuse"}
              </button>
            </div>
          </div>
        </div>
      )}

      {myDisproveMatches.length > 0 && suggestion && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-sm bg-parchment px-6 py-6 text-text-on-parchment">
            <h2 className="font-display text-lg text-burgundy">
              You can disprove this
            </h2>
            <p className="mt-2 font-body text-sm">
              Show one matching card to{" "}
              {game.players.find((p) => p.id === suggestion.suggesterId)
                ?.name ?? "the suggester"}
              . No one else will see which one.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {myDisproveMatches.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleDisclose(card)}
                  disabled={busy}
                  className="rounded-sm border border-brass px-3 py-2 text-left font-body text-sm transition hover:bg-brass hover:text-parchment disabled:opacity-60"
                >
                  Show {card.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
