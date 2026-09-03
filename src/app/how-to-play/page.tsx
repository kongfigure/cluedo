import Link from "next/link";

export default function HowToPlayPage() {
  return (
    <main className="min-h-screen bg-ink px-6 py-16">
      <div className="mx-auto max-w-xl">
        <p className="font-display text-xs tracking-wide text-brass">
          Case File
        </p>
        <h1 className="mt-1 font-display text-2xl text-text-on-ink">
          How to play
        </h1>

        <p className="mt-4 font-body text-sm leading-relaxed text-text-on-ink/80">
          Cluedo is a game of deduction. One of your fellow guests has
          committed a crime — figure out who, with what, and where, before
          anyone else does.
        </p>

        <ol className="mt-6 list-decimal space-y-3 pl-5 font-body text-sm leading-relaxed text-text-on-ink/80">
          <li>
            On your turn, move to a room and make a &quot;suggestion&quot; —
            guess a suspect, weapon, and room (you must suggest the room
            you&apos;re currently in).
          </li>
          <li>
            Going around the table, the first player holding a card
            matching any part of your suggestion must privately show you
            ONE of those cards. This narrows down what&apos;s{" "}
            <em>not</em> the solution.
          </li>
          <li>
            Keep track of what you&apos;ve seen. When you&apos;re
            confident, make an &quot;accusation&quot; instead of a
            suggestion — this checks against the real solution.
          </li>
          <li>
            A correct accusation wins the game immediately. A wrong one
            eliminates you from making further accusations or
            suggestions, though you can still be asked to disprove
            others&apos; suggestions.
          </li>
          <li>
            The last player able to accuse wins by default if everyone
            else is eliminated.
          </li>
        </ol>

        <p className="mt-6 font-body text-xs text-text-on-ink/50">
          This is a simplified version — no board movement between
          specific rooms yet, just suggest from wherever you are.
        </p>

        <Link
          href="/"
          className="mt-8 inline-block font-body text-sm text-brass/80 underline-offset-4 transition hover:text-brass hover:underline"
        >
          Back to case file
        </Link>
      </div>
    </main>
  );
}
