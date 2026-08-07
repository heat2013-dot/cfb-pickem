"use client";

import { useState, useTransition } from "react";
import { setPick } from "@/lib/actions";
import { formatSpread } from "@/lib/format";

type CurrentPick = {
  betType: string;
  side: string;
  isCorrect: boolean | null;
} | null;

export default function PickButtons({
  gameId,
  picker,
  homeTeam,
  awayTeam,
  spread,
  overUnder,
  currentPick,
  locked,
  isFinal,
}: {
  gameId: number;
  picker: string;
  homeTeam: string;
  awayTeam: string;
  spread: number | null;
  overUnder: number | null;
  currentPick: CurrentPick;
  locked: boolean;
  isFinal: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(betType: "spread" | "total", side: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setPick(gameId, picker, betType, side);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save pick");
      }
    });
  }

  if (locked) {
    if (!currentPick) {
      return <span className="text-xs text-gray-400">no pick</span>;
    }
    const label =
      currentPick.betType === "spread"
        ? currentPick.side === "home"
          ? `${homeTeam} ${spread != null ? formatSpread(spread) : ""}`
          : `${awayTeam} ${spread != null ? formatSpread(-spread) : ""}`
        : currentPick.side === "over"
          ? `O ${overUnder ?? ""}`
          : `U ${overUnder ?? ""}`;

    let resultClass = "bg-gray-100 text-gray-600";
    let icon = "";
    if (isFinal) {
      if (currentPick.isCorrect === true) {
        resultClass = "bg-green-100 text-green-700 border border-green-400";
        icon = "✓ ";
      } else if (currentPick.isCorrect === false) {
        resultClass = "bg-red-100 text-red-700 border border-red-400";
        icon = "✗ ";
      } else {
        resultClass = "bg-yellow-100 text-yellow-700 border border-yellow-400";
        icon = "push ";
      }
    }
    return (
      <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${resultClass}`}>
        {icon}
        {label}
      </span>
    );
  }

  const btnBase =
    "rounded border px-1.5 py-1 text-[11px] leading-tight hover:bg-gray-50 disabled:opacity-50";
  const selected = (betType: string, side: string) =>
    currentPick?.betType === betType && currentPick?.side === side
      ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-600"
      : "bg-white text-gray-700 border-gray-300";

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={pending || spread == null}
          className={`${btnBase} ${selected("spread", "home")}`}
          onClick={() => pick("spread", "home")}
        >
          {homeTeam} {spread != null ? formatSpread(spread) : "–"}
        </button>
        <button
          type="button"
          disabled={pending || spread == null}
          className={`${btnBase} ${selected("spread", "away")}`}
          onClick={() => pick("spread", "away")}
        >
          {awayTeam} {spread != null ? formatSpread(-spread) : "–"}
        </button>
        <button
          type="button"
          disabled={pending || overUnder == null}
          className={`${btnBase} ${selected("total", "over")}`}
          onClick={() => pick("total", "over")}
        >
          O {overUnder ?? "–"}
        </button>
        <button
          type="button"
          disabled={pending || overUnder == null}
          className={`${btnBase} ${selected("total", "under")}`}
          onClick={() => pick("total", "under")}
        >
          U {overUnder ?? "–"}
        </button>
      </div>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
