type RankingRow = {
  poll: string;
  rank: number;
  team: string;
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
  if (polls.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {polls.map((poll) => (
        <div key={poll}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {POLL_LABELS[poll] ?? poll}
          </h2>
          <ol className="text-sm">
            {byPoll
              .get(poll)!
              .sort((a, b) => a.rank - b.rank)
              .map((r) => (
                <li
                  key={r.team}
                  className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1"
                >
                  <span className="flex min-w-0 gap-2">
                    <span className="w-5 flex-shrink-0 text-right text-gray-400">{r.rank}</span>
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
      ))}
    </div>
  );
}
