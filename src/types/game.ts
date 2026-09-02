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

// Public, shared state — everything every player is allowed to see.
export interface Game {
  id: string; // == gameCode, used as the Firestore doc ID
  gameCode: string;
  players: Player[];
  currentTurnIndex: number;
  phase: GamePhase;
  createdAt: number; // stored as a millis timestamp
  currentSuggestion?: Suggestion;
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
