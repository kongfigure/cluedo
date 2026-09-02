import { Card } from "@/types/game";

export const SUSPECTS: Card[] = [
  { id: "scarlet", name: "Miss Scarlet", category: "suspect" },
  { id: "mustard", name: "Colonel Mustard", category: "suspect" },
  { id: "white", name: "Mrs. White", category: "suspect" },
  { id: "green", name: "Mr. Green", category: "suspect" },
  { id: "peacock", name: "Mrs. Peacock", category: "suspect" },
  { id: "plum", name: "Professor Plum", category: "suspect" },
];

export const WEAPONS: Card[] = [
  { id: "candlestick", name: "Candlestick", category: "weapon" },
  { id: "knife", name: "Knife", category: "weapon" },
  { id: "leadpipe", name: "Lead Pipe", category: "weapon" },
  { id: "revolver", name: "Revolver", category: "weapon" },
  { id: "rope", name: "Rope", category: "weapon" },
  { id: "wrench", name: "Wrench", category: "weapon" },
];

export const ROOMS: Card[] = [
  { id: "kitchen", name: "Kitchen", category: "room" },
  { id: "ballroom", name: "Ballroom", category: "room" },
  { id: "conservatory", name: "Conservatory", category: "room" },
  { id: "dining", name: "Dining Room", category: "room" },
  { id: "billiard", name: "Billiard Room", category: "room" },
  { id: "library", name: "Library", category: "room" },
  { id: "lounge", name: "Lounge", category: "room" },
  { id: "hall", name: "Hall", category: "room" },
  { id: "study", name: "Study", category: "room" },
];

export const ALL_CARDS: Card[] = [...SUSPECTS, ...WEAPONS, ...ROOMS];
