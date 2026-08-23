"use client";

import { useState } from "react";

type RankingRow = {
  poll: string;
  rank: number;
  team: string;
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
};

const POLL_ORDER = ["AP Top 25", "Playoff Committee Rankings", "Coaches Poll"];
const POLL_LABELS: Record<string, string> = {
  "AP Top 25": "AP Poll",
  "Playoff Committee Rankings": "CFP Poll",
  "Coaches Poll": "Coaches Poll",
};

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
            className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 flex-shrink-0 text-right text-gray-400">{r.rank}</span>
              {r.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logo} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
              )}
              <span className="truncate font-medium">{r.team}</span>
            </span>
            <span className="flex-shrink-0 text-xs text-gray-500">
              {r.wins}-{r.losses}
              {r.ties ? `-${r.ties}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
