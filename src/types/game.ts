// Ported 1:1 from the Swift structs (Player, Game, GamePhase, Card).
// Same reasoning applies: define the shape of the data before touching
// Firestore, so the SDK calls later aren't "magic."

export type GamePhase = "waiting" | "playing" | "finished";

export interface Player {
  id: string; // matches Firebase Auth UID
  name: string;
  character: string; // e.g. "Miss Scarlet"
  position: string; // room id the player is currently in (placeholder for real board coordinates)
  isReady: boolean;
  eliminated: boolean; // made a wrong accusation — out of suggestions/accusations, still discloses
}

export type CardCategory = "suspect" | "weapon" | "room";

export interface Card {
  id: string;
  name: string;
  category: CardCategory;
}

// A suggestion made on a player's turn — visible to the whole table.
// Disprove/card-checking logic is a separate piece, built later.
export interface Suggestion {
  suggesterId: string;
  suspect: string; // suspect card id
  weapon: string; // weapon card id
  room: string; // room card id
  timestamp: number;
}

// Public result of a disprove check — who (if anyone) disproved a
// suggestion. Never carries the card itself; that lives in the gated
// `disproves` subcollection so only the suggester/discloser can read it.
export interface DisproveResult {
  discloserId: string | null; // null means no one could disprove
  disproveId?: string; // doc id in `disproves`, for the suggester/discloser to look up the card
}

// Public, shared state — everything every player is allowed to see.
export interface Game {
  id: string; // == gameCode, used as the Firestore doc ID
  gameCode: string;
  players: Player[];
  currentTurnIndex: number;
  phase: GamePhase;
  createdAt: number; // stored as a millis timestamp
  dealt: boolean; // guards the one-time deal so it only ever runs once
  currentSuggestion?: Suggestion;
  // Disprove-check state machine, driven by the game doc since no single
  // client can read every player's hand: `pendingDiscloserId` names whose
  // turn it is to check their own hand, `disproveQueue` holds who's left
  // to ask after them, and `disproveResult` records the outcome.
  pendingDiscloserId?: string;
  disproveQueue?: string[];
  disproveResult?: DisproveResult;
  // Set once a correct accusation (or last-player-standing) ends the
  // game. `solutionRevealed` is the public signal that it's now fine for
  // everyone to see the solution doc, not just via a disprove.
  winner?: string;
  solutionRevealed?: boolean;
}

// Private, per-player state — lives in the `private` subcollection,
// gated by Firestore security rules so only the matching UID can read it.
// Path: games/{gameCode}/private/{uid}
export interface PrivateHand {
  playerId: string;
  hand: Card[];
}

// A record of a card shown during a "disprove" — readable only by the
// suggester and the discloser, not by the whole table.
// Path: games/{gameCode}/disproves/{disproveId}
export interface Disprove {
  id: string;
  suggesterId: string;
  discloserId: string;
  cardShown: Card;
  createdAt: number;
}

// The hidden answer, dealt once at game start. Read access isn't locked
// down yet — that's follow-up work once accusations are built.
// Path: games/{gameCode}/solution/current
export interface Solution {
  suspect: string; // suspect card id
  weapon: string; // weapon card id
  room: string; // room card id
}
