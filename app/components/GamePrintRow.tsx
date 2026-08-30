import { PICKERS } from "@/lib/pickers";
import { formatRank, formatSpread } from "@/lib/format";
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
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  picks: { picker: string; betType: string; side: string; isCorrect: boolean | null }[];
};

/**
 * Print-only, single-row-per-game layout that mirrors the desktop table's
 * density, built from divs instead of a <table> so break-inside: avoid is
 * reliably respected by print engines (table rows are not).
 */
export default function GamePrintRow({ game, locked }: { game: GameWithPicks; locked: boolean }) {
  return (
    <div className="flex items-center gap-2 break-inside-avoid border-b border-gray-200 py-2 text-xs">
      <div className="flex w-40 flex-shrink-0 items-center gap-1">
        {game.awayLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.awayLogo} alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
        )}
        <span className="truncate">
          {formatRank(game.awayRank)}
          {game.awayTeam}
        </span>
        <span className="flex-shrink-0 text-gray-400">@</span>
        {game.homeLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.homeLogo} alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
        )}
        <span className="truncate">
          {formatRank(game.homeRank)}
          {game.homeTeam}
        </span>
      </div>

      <div className="w-14 flex-shrink-0">
        {game.spread != null ? formatSpread(game.spread) : "–"}
      </div>

      <div className="w-14 flex-shrink-0">{game.overUnder != null ? game.overUnder : "–"}</div>

      <div className="w-32 flex-shrink-0 truncate font-semibold text-gray-700">
        {game.status === "final"
          ? `${game.awayTeam} ${game.awayScore} – ${game.homeTeam} ${game.homeScore}`
          : "–"}
      </div>

      <div className="flex flex-1 justify-around gap-1">
        {PICKERS.map((picker) => {
          const currentPick = game.picks.find((p) => p.picker === picker) ?? null;
          return (
            <div key={picker} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium">{picker}</span>
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
          );
        })}
      </div>
    </div>
  );
}
