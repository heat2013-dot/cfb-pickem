"use client";

import { useState } from "react";
import { formatSpread } from "@/lib/format";

export type MapPick = { betType: string; side: string; isCorrect: boolean | null };

export type MapGame = {
  id: number;
  x: number | null;
  y: number | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  spread: number | null;
  overUnder: number | null;
  startDate: string;
  venue: string | null;
  picks: Record<string, MapPick>;
};

const GREEN = "#16a34a";
const RED = "#dc2626";
const NEUTRAL = "#9ca3af";
const OVERVIEW = "#2563eb";

function pickLabel(game: MapGame, pick: MapPick): string {
  if (pick.betType === "spread") {
    const home = pick.side === "home";
    const line = game.spread == null ? null : home ? game.spread : -game.spread;
    return `${home ? game.homeTeam : game.awayTeam}${line == null ? "" : ` ${formatSpread(line)}`}`;
  }
  return `${pick.side === "over" ? "Over" : "Under"}${game.overUnder == null ? "" : ` ${game.overUnder}`}`;
}

function resultFor(game: MapGame, pick: MapPick | undefined): "win" | "loss" | "push" | "pending" | "none" {
  if (!pick) return "none";
  if (pick.isCorrect === true) return "win";
  if (pick.isCorrect === false) return "loss";
  return game.status === "final" ? "push" : "pending";
}

export default function GameMap({
  width,
  height,
  statePaths,
  games,
  pickers,
}: {
  width: number;
  height: number;
  statePaths: string[];
  games: MapGame[];
  pickers: string[];
}) {
  // index 0 is the overview (no picker); 1..n are the pickers
  const [view, setView] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);

  const picker = view === 0 ? null : pickers[view - 1];
  const count = pickers.length + 1;
  const cycle = (step: number) => setView((v) => (v + step + count) % count);

  const mapped = games.filter((g) => g.x != null && g.y != null);
  const offMap = games.filter((g) => g.x == null || g.y == null);
  const active = games.find((g) => g.id === activeId) ?? null;

  const tally = { win: 0, loss: 0, push: 0, pending: 0, none: 0 };
  if (picker) for (const g of games) tally[resultFor(g, g.picks[picker])]++;

  function dotStyle(g: MapGame): { fill: string; glyph: string } {
    if (!picker) return { fill: OVERVIEW, glyph: "" };
    switch (resultFor(g, g.picks[picker])) {
      case "win":
        return { fill: GREEN, glyph: "✓" };
      case "loss":
        return { fill: RED, glyph: "✗" };
      case "push":
        return { fill: NEUTRAL, glyph: "=" };
      default:
        return { fill: NEUTRAL, glyph: "" };
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => cycle(-1)}
          aria-label="Previous picker"
          className="rounded border border-gray-300 px-2.5 py-1 text-sm hover:bg-gray-50"
        >
          ←
        </button>
        {["Overview", ...pickers].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setView(i)}
            className={`rounded border px-3 py-1 text-sm font-medium ${
              view === i
                ? "border-gray-800 bg-gray-800 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => cycle(1)}
          aria-label="Next picker"
          className="rounded border border-gray-300 px-2.5 py-1 text-sm hover:bg-gray-50"
        >
          →
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {picker ? (
          <>
            <span className="font-semibold text-gray-800">{picker}</span>
            <Legend color={GREEN} glyph="✓" label={`Correct (${tally.win})`} />
            <Legend color={RED} glyph="✗" label={`Wrong (${tally.loss})`} />
            <Legend
              color={NEUTRAL}
              glyph=""
              label={`Push / pending / no pick (${tally.push + tally.pending + tally.none})`}
            />
          </>
        ) : (
          <Legend color={OVERVIEW} glyph="" label={`Game location (${mapped.length})`} />
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-4xl rounded-lg border border-gray-200 bg-gray-50"
        role="img"
        aria-label="Map of this week's game locations"
      >
        <g fill="#e5e7eb" stroke="#ffffff" strokeWidth={1} strokeLinejoin="round">
          {statePaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {mapped.map((g) => {
          const { fill, glyph } = dotStyle(g);
          const isActive = g.id === activeId;
          return (
            <g
              key={g.id}
              transform={`translate(${g.x},${g.y})`}
              onPointerEnter={() => setActiveId(g.id)}
              onClick={() => setActiveId(g.id)}
              className="cursor-pointer"
            >
              <title>{`${g.awayTeam} @ ${g.homeTeam}`}</title>
              <circle r={16} fill="transparent" />
              <circle
                r={isActive ? 10 : 8}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={2}
                style={{ transition: "fill 150ms" }}
              />
              {glyph && (
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={isActive ? 12 : 10}
                  fontWeight={700}
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  {glyph}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-3 min-h-20 max-w-4xl rounded-lg border border-gray-200 p-3 text-sm">
        {active ? (
          <GameDetails game={active} picker={picker} pickers={pickers} />
        ) : (
          <p className="text-gray-500">Hover or tap a dot to see the game.</p>
        )}
      </div>

      {offMap.length > 0 && (
        <div className="mt-3 max-w-4xl text-xs text-gray-500">
          Not shown on the map (outside the U.S. or no location on file):{" "}
          {offMap.map((g) => `${g.awayTeam} @ ${g.homeTeam}`).join("; ")}
        </div>
      )}
    </div>
  );
}

function Legend({ color, glyph, label }: { color: string; glyph: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {glyph}
      </span>
      {label}
    </span>
  );
}

function GameDetails({
  game,
  picker,
  pickers,
}: {
  game: MapGame;
  picker: string | null;
  pickers: string[];
}) {
  const when = new Date(game.startDate).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
  const shown = picker ? [picker] : pickers;

  return (
    <div>
      <div className="font-semibold">
        {game.awayTeam} @ {game.homeTeam}
        {game.status === "final" && (
          <span className="ml-2 font-normal text-gray-600">
            Final: {game.awayScore}–{game.homeScore}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        {when}
        {game.venue ? ` · ${game.venue}` : ""}
      </div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {shown.map((p) => {
          const pick = game.picks[p];
          const res = resultFor(game, pick);
          const color =
            res === "win" ? "text-green-700" : res === "loss" ? "text-red-700" : "text-gray-500";
          return (
            <li key={p} className="flex gap-2">
              <span className="w-14 font-medium text-gray-700">{p}</span>
              <span className={color}>
                {pick ? pickLabel(game, pick) : "No pick"}
                {res === "win" && " ✓"}
                {res === "loss" && " ✗"}
                {res === "push" && " (push)"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
