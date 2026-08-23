"use client";

import { useState } from "react";
import ArrowIcon from "@/app/components/ArrowIcon";

type RankingRow = {
  poll: string;
  rank: number;
  team: string;
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
  previousRank: number | null;
};

const POLL_ORDER = ["AP Top 25", "Playoff Committee Rankings", "Coaches Poll"];
const POLL_LABELS: Record<string, string> = {
  "AP Top 25": "AP Poll",
  "Playoff Committee Rankings": "CFP Poll",
  "Coaches Poll": "Coaches Poll",
};

function RankChange({ rank, previousRank }: { rank: number; previousRank: number | null }) {
  if (previousRank == null) {
    return <span className="text-[10px] text-gray-400">NR</span>;
  }
  const change = previousRank - rank;
  if (change === 0) {
    return <span className="text-[10px] text-gray-400">–</span>;
  }
  if (change > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-green-600">
        <ArrowIcon direction="up" className="h-3 w-3" />+{change}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-red-600">
      <ArrowIcon direction="down" className="h-3 w-3" />
      {change}
    </span>
  );
}

export default function PollTables({ rankings }: { rankings: RankingRow[] }) {
  const byPoll = new Map<string, RankingRow[]>();
  for (const row of rankings) {
    if (!byPoll.has(row.poll)) byPoll.set(row.poll, []);
    byPoll.get(row.poll)!.push(row);
  }

  const polls = POLL_ORDER.filter((p) => byPoll.has(p));

  const [selected, setSelected] = useState<string | null>(null);
  if (polls.length === 0) return null;

  const activePoll = selected && polls.includes(selected) ? selected : polls[0];
  const rows = byPoll.get(activePoll)!.sort((a, b) => a.rank - b.rank);

  return (
    <div>
      <select
        value={activePoll}
        onChange={(e) => setSelected(e.target.value)}
        className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
      >
        {polls.map((poll) => (
          <option key={poll} value={poll}>
            {POLL_LABELS[poll] ?? poll}
          </option>
        ))}
      </select>
      <ol className="text-sm">
        {rows.map((r) => (
          <li
            key={r.team}
            className="flex items-baseline gap-2 border-b border-gray-100 py-1"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="w-5 flex-shrink-0 text-right text-gray-400">{r.rank}</span>
              {r.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logo} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
              )}
              <span className="truncate font-medium">{r.team}</span>
            </span>
            <span className="w-12 flex-shrink-0 text-right text-xs text-gray-500">
              {r.wins}-{r.losses}
              {r.ties ? `-${r.ties}` : ""}
            </span>
            <span className="w-9 flex-shrink-0 text-right">
              <RankChange rank={r.rank} previousRank={r.previousRank} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
