import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  runTransaction,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Card, Game, Player, Solution, Suggestion } from "@/types/game";
import { SUSPECTS, WEAPONS, ROOMS, ALL_CARDS } from "./constants";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Turn order for a disprove check: everyone except the suggester,
// starting with the player right after them and wrapping around.
// Eliminated players are still asked — they can still disprove.
function disproveCandidates(players: Player[], suggesterIndex: number): string[] {
  const order: string[] = [];
  for (let i = 1; i < players.length; i++) {
    order.push(players[(suggesterIndex + i) % players.length].id);
  }
  return order;
}

// The next player whose turn it is, skipping anyone eliminated. Falls
// back to `fromIndex` if literally everyone is eliminated, which
// shouldn't happen — the last-player-standing check in makeAccusation
// ends the game before that point is reached.
function nextActiveTurnIndex(players: Player[], fromIndex: number): number {
  for (let step = 1; step <= players.length; step++) {
    const idx = (fromIndex + step) % players.length;
    if (!players[idx].eliminated) return idx;
  }
  return fromIndex;
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateGameCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function createGame(hostUid: string, hostName: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const gameCode = generateGameCode();
    const gameRef = doc(db, "games", gameCode);
    const existing = await getDoc(gameRef);

    if (existing.exists()) continue;

    const hostPlayer: Player = {
      id: hostUid,
      name: hostName,
      character: "",
      position: ROOMS[0].id,
      isReady: false,
      eliminated: false,
    };

    const newGame: Game = {
      id: gameCode,
      gameCode,
      players: [hostPlayer],
      currentTurnIndex: 0,
      phase: "waiting",
      createdAt: Date.now(),
      dealt: false,
    };

    await setDoc(gameRef, newGame);
    return gameCode;
  }
  throw new Error("Could not generate a unique game code — please try again.");
}

export async function joinGame(
  gameCode: string,
  uid: string,
  name: string
): Promise<void> {
  const gameRef = doc(db, "games", gameCode.toUpperCase());
  const snapshot = await getDoc(gameRef);

  if (!snapshot.exists()) {
    throw new Error("No case found with that number. Double-check the code.");
  }

  const game = snapshot.data() as Game;

  if (game.phase !== "waiting") {
    throw new Error("This case is already underway.");
  }

  if (game.players.some((p) => p.id === uid)) {
    return;
  }

  if (game.players.length >= SUSPECTS.length) {
    throw new Error(
      `This case is full (${SUSPECTS.length} detectives maximum).`
    );
  }

  const newPlayer: Player = {
    id: uid,
    name,
    character: "",
    position: ROOMS[game.players.length % ROOMS.length].id,
    isReady: false,
    eliminated: false,
  };

  await updateDoc(gameRef, {
    players: arrayUnion(newPlayer),
  });
}

export async function selectCharacter(
  gameCode: string,
  uid: string,
  characterId: string
): Promise<void> {
  const gameRef = doc(db, "games", gameCode);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(gameRef);

    if (!snapshot.exists()) {
      throw new Error("This case no longer exists.");
    }

    const game = snapshot.data() as Game;

    if (game.players.some((p) => p.character === characterId)) {
      throw new Error("That suspect has already been claimed.");
    }

    const players = game.players.map((p) =>
      p.id === uid ? { ...p, character: characterId } : p
    );

    transaction.update(gameRef, { players });
  });
}

// Deals the hidden solution and every player's hand, once, when the host
// begins the investigation. Requires the `dealt: false -> true` create
// guard on `private/{uid}` in firestore.rules, since the host is writing
// hand documents that belong to other players.
export async function dealCards(gameCode: string, game: Game): Promise<void> {
  if (game.dealt) return;

  const gameRef = doc(db, "games", gameCode);

  const suspect = SUSPECTS[Math.floor(Math.random() * SUSPECTS.length)];
  const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
  const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];

  const remaining = shuffled(
    ALL_CARDS.filter(
      (card) => card.id !== suspect.id && card.id !== weapon.id && card.id !== room.id
    )
  );

  const hands: Card[][] = game.players.map(() => []);
  remaining.forEach((card, i) => {
    hands[i % game.players.length].push(card);
  });

  const batch = writeBatch(db);

  batch.set(doc(gameRef, "solution", "current"), {
    suspect: suspect.id,
    weapon: weapon.id,
    room: room.id,
  });

  game.players.forEach((player, i) => {
    batch.set(doc(gameRef, "private", player.id), {
      playerId: player.id,
      hand: hands[i],
    });
  });

  batch.update(gameRef, { dealt: true, phase: "playing" });

  await batch.commit();
}

export async function submitSuggestion(
  gameCode: string,
  game: Game,
  suspect: string,
  weapon: string,
  room: string
): Promise<void> {
  const gameRef = doc(db, "games", gameCode);
  const suggesterId = game.players[game.currentTurnIndex]?.id;

  if (!suggesterId) {
    throw new Error("No active player to suggest.");
  }

  const suggestion: Suggestion = {
    suggesterId,
    suspect,
    weapon,
    room,
    timestamp: Date.now(),
  };

  const candidates = disproveCandidates(game.players, game.currentTurnIndex);

  if (candidates.length === 0) {
    await updateDoc(gameRef, {
      currentSuggestion: suggestion,
      pendingDiscloserId: deleteField(),
      disproveQueue: deleteField(),
      disproveResult: { discloserId: null },
    });
    return;
  }

  const [pendingDiscloserId, ...disproveQueue] = candidates;

  await updateDoc(gameRef, {
    currentSuggestion: suggestion,
    pendingDiscloserId,
    disproveQueue,
    disproveResult: deleteField(),
  });
}

// Called by a candidate's own client when their hand has no matching
// card — advances the queue to the next candidate, or resolves the
// suggestion as undisprovable if no one is left to ask.
export async function passDisprove(gameCode: string, uid: string): Promise<void> {
  const gameRef = doc(db, "games", gameCode);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(gameRef);
    if (!snapshot.exists()) return;

    const game = snapshot.data() as Game;

    // A stale retry after this player's turn already moved on — ignore.
    if (game.pendingDiscloserId !== uid) return;

    const queue = game.disproveQueue ?? [];

    if (queue.length === 0) {
      transaction.update(gameRef, {
        pendingDiscloserId: deleteField(),
        disproveQueue: deleteField(),
        disproveResult: { discloserId: null },
      });
      return;
    }

    const [next, ...rest] = queue;
    transaction.update(gameRef, {
      pendingDiscloserId: next,
      disproveQueue: rest,
    });
  });
}

// Called by the candidate whose hand DOES have a matching card, once
// they've picked which one to reveal.
export async function discloseCard(
  gameCode: string,
  suggesterId: string,
  discloserId: string,
  cardShown: Card
): Promise<void> {
  const gameRef = doc(db, "games", gameCode);
  const disproveRef = doc(gameRef, "disproves", `${Date.now()}-${discloserId}`);

  await setDoc(disproveRef, {
    id: disproveRef.id,
    suggesterId,
    discloserId,
    cardShown,
    createdAt: Date.now(),
  });

  await updateDoc(gameRef, {
    pendingDiscloserId: deleteField(),
    disproveQueue: deleteField(),
    disproveResult: { discloserId, disproveId: disproveRef.id },
  });
}

export async function endTurn(gameCode: string): Promise<void> {
  const gameRef = doc(db, "games", gameCode);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(gameRef);

    if (!snapshot.exists()) {
      throw new Error("This case no longer exists.");
    }

    const game = snapshot.data() as Game;
    const nextTurnIndex =
      game.players.length === 0
        ? 0
        : nextActiveTurnIndex(game.players, game.currentTurnIndex);

    transaction.update(gameRef, {
      currentTurnIndex: nextTurnIndex,
      currentSuggestion: deleteField(),
      pendingDiscloserId: deleteField(),
      disproveQueue: deleteField(),
      disproveResult: deleteField(),
    });
  });
}

// A player's one shot at solving the case. Right or wrong, their turn
// ends here: a correct guess finishes the game, a wrong one eliminates
// them (or, if that leaves exactly one player standing, hands that
// survivor the win by default) and moves on to the next active player.
export async function makeAccusation(
  gameCode: string,
  uid: string,
  suspect: string,
  weapon: string,
  room: string
): Promise<{ correct: boolean }> {
  const gameRef = doc(db, "games", gameCode);
  const solutionRef = doc(gameRef, "solution", "current");

  return runTransaction(db, async (transaction) => {
    const gameSnap = await transaction.get(gameRef);
    if (!gameSnap.exists()) {
      throw new Error("This case no longer exists.");
    }

    const game = gameSnap.data() as Game;
    const accuser = game.players.find((p) => p.id === uid);

    if (!accuser) {
      throw new Error("You're not part of this case.");
    }
    if (accuser.eliminated) {
      throw new Error("You've already been eliminated from this case.");
    }

    const solutionSnap = await transaction.get(solutionRef);
    if (!solutionSnap.exists()) {
      throw new Error("The case hasn't been dealt yet.");
    }

    const solution = solutionSnap.data() as Solution;
    const correct =
      solution.suspect === suspect &&
      solution.weapon === weapon &&
      solution.room === room;

    if (correct) {
      transaction.update(gameRef, {
        phase: "finished",
        winner: uid,
        solutionRevealed: true,
        currentSuggestion: deleteField(),
        pendingDiscloserId: deleteField(),
        disproveQueue: deleteField(),
        disproveResult: deleteField(),
      });
      return { correct: true };
    }

    const players = game.players.map((p) =>
      p.id === uid ? { ...p, eliminated: true } : p
    );
    const stillActive = players.filter((p) => !p.eliminated);

    if (stillActive.length === 1) {
      transaction.update(gameRef, {
        players,
        phase: "finished",
        winner: stillActive[0].id,
        solutionRevealed: true,
        currentSuggestion: deleteField(),
        pendingDiscloserId: deleteField(),
        disproveQueue: deleteField(),
        disproveResult: deleteField(),
      });
      return { correct: false };
    }

    transaction.update(gameRef, {
      players,
      currentTurnIndex: nextActiveTurnIndex(players, game.currentTurnIndex),
      currentSuggestion: deleteField(),
      pendingDiscloserId: deleteField(),
      disproveQueue: deleteField(),
      disproveResult: deleteField(),
    });
    return { correct: false };
  });
}
