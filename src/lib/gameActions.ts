import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  runTransaction,
  deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import { Game, Player, Suggestion } from "@/types/game";
import { SUSPECTS, ROOMS } from "./constants";

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
    };

    const newGame: Game = {
      id: gameCode,
      gameCode,
      players: [hostPlayer],
      currentTurnIndex: 0,
      phase: "waiting",
      createdAt: Date.now(),
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

export async function submitSuggestion(
  gameCode: string,
  suggesterId: string,
  suspect: string,
  weapon: string,
  room: string
): Promise<void> {
  const gameRef = doc(db, "games", gameCode);

  const suggestion: Suggestion = {
    suggesterId,
    suspect,
    weapon,
    room,
    timestamp: Date.now(),
  };

  await updateDoc(gameRef, { currentSuggestion: suggestion });
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
        : (game.currentTurnIndex + 1) % game.players.length;

    transaction.update(gameRef, {
      currentTurnIndex: nextTurnIndex,
      currentSuggestion: deleteField(),
    });
  });
}
