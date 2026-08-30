import { PICKERS } from "@/lib/pickers";
import { formatRank, formatSpread } from "@/lib/format";
import { networkLogoUrl } from "@/lib/cfbd";
import PickButtons from "@/app/components/PickButtons";

type GameWithPicks = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeRank: number | null;
  awayRank: number | null;
  spread: number | null;
  overUnder: number | null;
  broadcast: string | null;
  startDate: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  picks: { picker: string; betType: string; side: string; isCorrect: boolean | null }[];
};

export default function GameCard({ game, locked }: { game: GameWithPicks; locked: boolean }) {
  const broadcastLogo = game.broadcast ? networkLogoUrl(game.broadcast) : null;

  return (
    <div className="break-inside-avoid rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-center gap-3">
        <div className="flex flex-col items-center gap-1 text-center">
          {game.awayLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.awayLogo} alt="" className="h-12 w-12 object-contain" />
          )}
          <span className="text-xs font-medium leading-tight">
            {formatRank(game.awayRank)}
            {game.awayTeam}
          </span>
        </div>
        <span className="text-gray-400">@</span>
        <div className="flex flex-col items-center gap-1 text-center">
          {game.homeLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.homeLogo} alt="" className="h-12 w-12 object-contain" />
          )}
          <span className="text-xs font-medium leading-tight">
            {formatRank(game.homeRank)}
            {game.homeTeam}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-gray-500">
        <span>
          {game.startDate.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/New_York",
            timeZoneName: "short",
          })}
        </span>
        {game.broadcast && (
          <span className="flex items-center gap-1">
            {broadcastLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={broadcastLogo} alt="" className="h-3.5 w-3.5 object-contain" />
            )}
            <span>{game.broadcast}</span>
          </span>
        )}
      </div>

      {game.status === "final" && (
        <div className="mt-1 text-center text-xs font-semibold text-gray-700">
          Final: {game.awayTeam} {game.awayScore} – {game.homeTeam} {game.homeScore}
        </div>
      )}

      <div className="mt-2 flex items-center justify-center gap-4 text-sm text-gray-700">
        <span>
          <span className="text-gray-400">Spread </span>
          {game.spread != null ? formatSpread(game.spread) : "–"}
        </span>
        <span>
          <span className="text-gray-400">O/U </span>
          {game.overUnder != null ? game.overUnder : "–"}
        </span>
      </div>

      <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100 print:flex print:flex-wrap print:justify-center print:gap-x-4 print:divide-y-0 print:border-t-0 print:pt-2">
        {PICKERS.map((picker) => {
          const currentPick = game.picks.find((p) => p.picker === picker) ?? null;
          return (
            <div
              key={picker}
              className="flex items-center gap-3 py-2 print:flex-col print:items-center print:gap-1 print:py-0"
            >
              <span className="w-14 flex-shrink-0 text-sm font-medium print:w-auto print:text-xs">
                {picker}
              </span>
              <div className="max-w-56 flex-1 print:max-w-none print:flex-none">
                <PickButtons
                  gameId={game.id}
                  picker={picker}
                  homeTeam={game.homeTeam}
                  awayTeam={game.awayTeam}
                  homeLogo={game.homeLogo}
                  awayLogo={game.awayLogo}
                  spread={game.spread}
                  overUnder={game.overUnder}
                  currentPick={currentPick}
                  locked={locked}
                  isFinal={game.status === "final"}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
