# Cluedo — Real-time Multiplayer

Next.js + Firebase rebuild of the Cluedo portfolio project (previously a native iOS/Swift build — pivoted back to web for shareability: anyone can click a link and play instead of needing Simulator/TestFlight).

## Stack
- Next.js 15 (App Router, TypeScript, Tailwind)
- Firebase Firestore (real-time game state)
- Firebase Anonymous Auth (per-session identity, no sign-up friction)

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in your Firebase project values
npm run dev
```

You'll need a Firebase project with Firestore and Anonymous Auth enabled.
Deploy the included security rules with the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

## Architecture note (the interesting part)

Firestore security rules can't restrict individual *fields* within a
document — a client either reads the whole document or none of it.
Since Cluedo depends entirely on hidden information (your hand, and
which cards you've shown to disprove a suggestion), sensitive data
lives in **subcollections** gated by Firebase Auth UID instead of as
fields on the main game document:

```
games/{gameCode}                  ← public state (phase, turn order, positions)
  /private/{uid}                  ← this player's hand, readable only by them
  /disproves/{disproveId}         ← readable only by the two players involved
```

See `firestore.rules` for the enforcement and `src/types/game.ts` for
the corresponding TypeScript shapes.

## Structure
```
src/
  lib/firebase.ts       Firebase init (config from env, never hardcoded)
  types/game.ts          Game, Player, Card, GamePhase, PrivateHand, Disprove
  app/                    Next.js App Router pages
    game/[gameCode]/      Dynamic route for an individual game session
```

## Status
Scaffolding + data model + security rules in place. Game loop
(roll → move → suggest → disprove → accuse → win) and UI not yet built.
