"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type LiveInfo = {
  state: "pre" | "in" | "post";
  detail: string;
  homeScore: number | null;
  awayScore: number | null;
};

const LiveContext = createContext<Record<number, LiveInfo>>({});

/** Polls the live-scores endpoint while games are on, and pauses while the tab is hidden. */
export function LiveScoresProvider({ weekId, children }: { weekId: number; children: ReactNode }) {
  const [scores, setScores] = useState<Record<number, LiveInfo>>({});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function tick() {
      clearTimeout(timer);
      if (stopped) return;
      let next = 60_000;
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/live-scores?week=${weekId}`);
          if (res.ok) {
            const data = (await res.json()) as { scores: Record<number, LiveInfo>; pollMs: number };
            if (!stopped) setScores(data.scores);
            next = data.pollMs;
          }
        } catch {
          // keep whatever we had and try again
        }
      }
      if (next > 0 && !stopped) timer = setTimeout(tick, next);
    }

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [weekId]);

  return <LiveContext.Provider value={scores}>{children}</LiveContext.Provider>;
}

/** Shows the live score for a game that's in progress; otherwise renders its normal content. */
export function LiveResult({
  gameId,
  isFinal,
  awayTeam,
  homeTeam,
  children,
}: {
  gameId: number;
  isFinal: boolean;
  awayTeam: string;
  homeTeam: string;
  children?: ReactNode;
}) {
  const info = useContext(LiveContext)[gameId];
  if (isFinal || !info || info.state === "pre") return <>{children}</>;

  const live = info.state === "in";
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        {live ? (
          <>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
            <span className="text-red-600">LIVE</span>
            <span className="font-normal text-gray-500">{info.detail}</span>
          </>
        ) : (
          <>
            <span className="text-gray-700">FINAL</span>
            <span className="font-normal text-gray-400">grading pending</span>
          </>
        )}
      </div>
      <div className="font-semibold text-gray-800">
        {awayTeam} {info.awayScore ?? 0} – {homeTeam} {info.homeScore ?? 0}
      </div>
    </div>
  );
}
