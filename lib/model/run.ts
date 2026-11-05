import { prisma } from "@/lib/prisma";
import { gradePick } from "@/lib/grade";
import { fetchModelSeasonData } from "@/lib/model/data";
import { predictGames, type ModelParams, type Prediction, type Priors } from "@/lib/model/engine";
import priorsFile from "@/lib/model/priors2026.json";
import paramsFile from "@/lib/model/params.json";

const priors = priorsFile as unknown as Priors;
const params = paramsFile as unknown as ModelParams;

export const MODEL_PRIOR_SEASON = priors.season;

function probFor(kind: "total" | "spread", edge: number) {
  const c = params.calibration[kind];
  return 1 / (1 + Math.exp(-(c.intercept + c.slope * Math.abs(edge))));
}

/** Confidence tier, expressed through the same calibration so it applies to either bet type. */
export function tierForProbability(p: number): "high" | "medium" | "low" {
  if (p >= probFor("total", params.tier_cutoffs.high)) return "high";
  if (p >= probFor("total", params.tier_cutoffs.medium)) return "medium";
  return "low";
}

interface Chosen {
  betType: "spread" | "total";
  side: "home" | "away" | "over" | "under";
  probability: number;
}

/** One bet per game: whichever has the higher calibrated chance of winning. */
function choose(pred: Prediction): Chosen | null {
  const { edgeSpread, edgeTotal, pSpread, pTotal } = pred;
  if (pTotal != null && edgeTotal != null && (pSpread == null || pTotal >= pSpread)) {
    return { betType: "total", side: edgeTotal > 0 ? "over" : "under", probability: pTotal };
  }
  if (pSpread != null && edgeSpread != null) {
    return { betType: "spread", side: edgeSpread > 0 ? "home" : "away", probability: pSpread };
  }
  return null;
}

/**
 * Generates (or refreshes) model picks for the given weeks, plus any other
 * week in the same seasons that is missing picks (point-in-time backfill).
 * Picks for games that haven't kicked off follow the latest line; once a game
 * has started its pick is frozen and never touched again.
 */
export async function generateModelPicks(weekIds: number[]) {
  const now = Date.now();
  const weeks = await prisma.week.findMany({
    include: { games: { include: { modelPick: true } } },
  });

  const wanted = new Set(weekIds);
  const hasLine = (g: { spread: number | null; overUnder: number | null }) => g.spread != null || g.overUnder != null;
  const needsWork = (g: (typeof weeks)[number]["games"][number], requested: boolean) =>
    hasLine(g) && (!g.modelPick || (requested && g.startDate.getTime() > now));

  const bySeason = new Map<number, typeof weeks>();
  for (const w of weeks) {
    const requested = wanted.has(w.id);
    if (!w.games.some((g) => needsWork(g, requested))) continue;
    if (!bySeason.has(w.season)) bySeason.set(w.season, []);
    bySeason.get(w.season)!.push(w);
  }

  let generated = 0;
  const skipped: string[] = [];
  for (const [season, seasonWeeks] of bySeason) {
    if (season !== priors.season) {
      skipped.push(`No preseason priors built for ${season}.`);
      continue;
    }
    const data = await fetchModelSeasonData(season, seasonWeeks.some((w) => w.seasonType === "postseason"));

    const targets = [];
    const gameByCfbd = new Map<number, { dbId: number; backfilled: boolean }>();
    for (const w of seasonWeeks) {
      const requested = wanted.has(w.id);
      for (const g of w.games) {
        if (!needsWork(g, requested)) continue;
        targets.push({
          id: g.cfbdGameId,
          homeName: g.homeTeam,
          awayName: g.awayTeam,
          startDate: g.startDate.getTime(),
          spread: g.spread,
          overUnder: g.overUnder,
        });
        gameByCfbd.set(g.cfbdGameId, { dbId: g.id, backfilled: g.startDate.getTime() <= now });
      }
    }

    const preds = predictGames({ ...data, priors, params }, targets);
    const targetById = new Map(targets.map((t) => [t.id, t]));
    for (const pred of preds) {
      const chosen = choose(pred);
      const meta = gameByCfbd.get(pred.id)!;
      const t = targetById.get(pred.id)!;
      if (!chosen) continue;

      const totalEst = t.overUnder != null && pred.edgeTotal != null ? t.overUnder + pred.edgeTotal : pred.features.po_t;
      const marginEst = t.spread != null && pred.edgeSpread != null ? -t.spread + pred.edgeSpread : pred.features.po_m;
      const row = {
        betType: chosen.betType,
        side: chosen.side,
        probability: chosen.probability,
        tier: tierForProbability(chosen.probability),
        lineSpread: t.spread,
        lineTotal: t.overUnder,
        edgeSpread: pred.edgeSpread,
        edgeTotal: pred.edgeTotal,
        pSpread: pred.pSpread,
        pTotal: pred.pTotal,
        projHome: (totalEst + marginEst) / 2,
        projAway: (totalEst - marginEst) / 2,
        isCorrect: null,
      };
      await prisma.modelPick.upsert({
        where: { gameId: meta.dbId },
        create: { gameId: meta.dbId, ...row, backfilled: meta.backfilled },
        update: row,
      });
      generated++;
    }
  }
  return { generated, skipped };
}

/** Grades every ungraded model pick whose game has gone final, against the line it was made at. */
export async function gradeModelPicks() {
  const open = await prisma.modelPick.findMany({
    where: { isCorrect: null, game: { status: "final" } },
    include: { game: true },
  });
  let graded = 0;
  for (const p of open) {
    if (p.game.homeScore == null || p.game.awayScore == null) continue;
    const result = gradePick({
      betType: p.betType,
      side: p.side,
      homeScore: p.game.homeScore,
      awayScore: p.game.awayScore,
      spread: p.lineSpread,
      overUnder: p.lineTotal,
    });
    if (result != null) {
      await prisma.modelPick.update({ where: { id: p.id }, data: { isCorrect: result } });
      graded++;
    }
  }
  return graded;
}

/** Failure-tolerant entry point used by Refresh and the crons: model trouble never breaks them. */
export async function runModel(weekIds: number[]) {
  try {
    const gen = await generateModelPicks(weekIds);
    const graded = await gradeModelPicks();
    return { ok: true as const, ...gen, graded };
  } catch (err) {
    console.error("model run failed", err);
    return { ok: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
