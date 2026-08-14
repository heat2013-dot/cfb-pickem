"use client";

import { useState, useTransition } from "react";
import { setPick, clearPick } from "@/lib/actions";
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
  homeLogo,
  awayLogo,
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
  homeLogo: string | null;
  awayLogo: string | null;
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
    const alreadySelected = currentPick?.betType === betType && currentPick?.side === side;
    startTransition(async () => {
      try {
        if (alreadySelected) {
          await clearPick(gameId, picker);
        } else {
          await setPick(gameId, picker, betType, side);
        }
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
          ? `↑ ${overUnder ?? ""}`
          : `↓ ${overUnder ?? ""}`;

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
          title={`${awayTeam} ${spread != null ? formatSpread(-spread) : ""}`}
          aria-label={`${awayTeam} ${spread != null ? formatSpread(-spread) : ""}`}
          className={`${btnBase} flex items-center justify-center ${selected("spread", "away")}`}
          onClick={() => pick("spread", "away")}
        >
          {awayLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={awayLogo} alt="" className="h-5 w-5 object-contain" />
          ) : (
            awayTeam
          )}
        </button>
        <button
          type="button"
          disabled={pending || spread == null}
          title={`${homeTeam} ${spread != null ? formatSpread(spread) : ""}`}
          aria-label={`${homeTeam} ${spread != null ? formatSpread(spread) : ""}`}
          className={`${btnBase} flex items-center justify-center ${selected("spread", "home")}`}
          onClick={() => pick("spread", "home")}
        >
          {homeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={homeLogo} alt="" className="h-5 w-5 object-contain" />
          ) : (
            homeTeam
          )}
        </button>
        <button
          type="button"
          disabled={pending || overUnder == null}
          title={`Over ${overUnder ?? ""}`}
          aria-label={`Over ${overUnder ?? ""}`}
          className={`${btnBase} ${selected("total", "over")}`}
          onClick={() => pick("total", "over")}
        >
          ↑ {overUnder ?? "–"}
        </button>
        <button
          type="button"
          disabled={pending || overUnder == null}
          title={`Under ${overUnder ?? ""}`}
          aria-label={`Under ${overUnder ?? ""}`}
          className={`${btnBase} ${selected("total", "under")}`}
          onClick={() => pick("total", "under")}
        >
          ↓ {overUnder ?? "–"}
        </button>
      </div>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
