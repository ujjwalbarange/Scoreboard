/**
 * Cumulative Tournament Standings Aggregator
 * Phase 3: Esports Broadcast Controller & Live Overlay System
 *
 * Responsibilities:
 * - Aggregates standings across saved matches for the active game ('BGMI' or 'FREE_FIRE')
 * - Strictly deduplicates by canonical `matchId` so the same match can never be counted twice
 * - Clearly distinguishes:
 *   1. Completed Rounds Totals (`completedKP`, `completedPP`, `completedTT`, `completedMatchesCount`)
 *   2. Current Match Live Scores (`currentKP`, `currentPP`, `currentTT`, `currentPos`)
 *   3. Overall Cumulative Tournament Totals (`totalKP`, `totalPP`, `totalTT`, `winsCount`, `matchesPlayed`)
 * - Sorts cumulative standings by official tournament tie-breaker rules:
 *   1. Total Points (`totalTT` DESC)
 *   2. Total Booyahs / WWCDs (`winsCount` — number of #1 placements DESC)
 *   3. Total Placement Points (`totalPP` DESC)
 *   4. Total Kill Points (`totalKP` DESC)
 *   5. Canonical Slot Key (`Key` A-Z ASC)
 */

import { MATCH_STATUS, TEAM_KEYS_AZ } from '../../src/shared/constants.js';
import { normalizeGameId } from './scoring-engine.js';

/**
 * Computes cumulative tournament standings from a list of loaded match records
 * and the current active in-memory match state.
 *
 * @param {{
 *   activeGame: string,
 *   activeMatchId: string,
 *   activeMatchStatus: string,
 *   activeTeams: Array<object>,
 *   savedMatches: Array<{
 *     matchId: string,
 *     game: string,
 *     roundNumber?: number,
 *     matchStatus?: string,
 *     teams: Array<object>
 *   }>
 * }} params
 */
export function computeTournamentAggregation(params) {
  const targetGame = normalizeGameId(params.activeGame || 'BGMI');
  const activeMatchId = String(params.activeMatchId || '').trim();
  const activeMatchStatus =
    params.activeMatchStatus || MATCH_STATUS.LIVE;
  const activeTeams = Array.isArray(params.activeTeams)
    ? params.activeTeams
    : [];
  const savedMatches = Array.isArray(params.savedMatches)
    ? params.savedMatches
    : [];

  // 1. Deduplicate saved matches by matchId and filter to targetGame
  /** @type {Map<string, { matchId: string, game: string, roundNumber: number, matchStatus: string, teams: Array<object> }>} */
  const uniqueMatchesById = new Map();

  for (const record of savedMatches) {
    if (!record || !record.matchId || !Array.isArray(record.teams)) continue;
    const id = String(record.matchId).trim();
    if (!id) continue;

    let recordGame = 'BGMI';
    try {
      recordGame = normalizeGameId(record.game || 'BGMI');
    } catch {
      continue;
    }

    if (recordGame !== targetGame) continue;

    // Skip the active match in the historical loop; we handle activeMatch explicitly below
    // so it is never counted twice and always reflects the latest authoritative state.
    if (id === activeMatchId) continue;

    // Include saved matches that are either marked COMPLETED or have recorded scores (TT > 0 or pos > 0)
    const hasScoredActivity = record.teams.some(
      (t) => Number(t.TT) > 0 || Number(t.KP) > 0 || Number(t.pos) > 0
    );
    const isCompletedMatch = record.matchStatus === MATCH_STATUS.COMPLETED;

    if (isCompletedMatch || hasScoredActivity) {
      uniqueMatchesById.set(id, {
        matchId: id,
        game: recordGame,
        roundNumber: Number(record.roundNumber) || 1,
        matchStatus: record.matchStatus || MATCH_STATUS.COMPLETED,
        teams: record.teams,
      });
    }
  }

  const historicalMatchIds = Array.from(uniqueMatchesById.keys()).sort();

  // Initialize aggregation map for all 26 A-Z slots using the active match's team names/players
  const byKey = new Map();
  for (const slotKey of TEAM_KEYS_AZ) {
    const activeTeam = activeTeams.find((t) => t.Key === slotKey);
    byKey.set(slotKey, {
      Key: slotKey,
      TeamName: activeTeam?.TeamName || `Team ${slotKey}`,
      players: activeTeam?.players || [
        activeTeam?.Player1 || `${slotKey}·Player1`,
        activeTeam?.Player2 || `${slotKey}·Player2`,
        activeTeam?.Player3 || `${slotKey}·Player3`,
        activeTeam?.Player4 || `${slotKey}·Player4`,
      ],
      // Prior completed/saved rounds totals
      priorMatchesCount: 0,
      priorWinsCount: 0,
      priorKP: 0,
      priorPP: 0,
      priorTT: 0,
      // Current round live metrics
      currentPos: Number(activeTeam?.pos ?? 0),
      currentKP: Number(activeTeam?.KP ?? 0),
      currentPP: Number(activeTeam?.PP ?? 0),
      currentTT: Number(activeTeam?.TT ?? 0),
      // Cumulative tournament totals (prior + current active match)
      matchesPlayed: 0,
      winsCount: 0,
      totalKP: 0,
      totalPP: 0,
      totalTT: 0,
    });
  }

  // 2. Accumulate prior matches (guaranteed unique by matchId)
  for (const [, matchRecord] of uniqueMatchesById.entries()) {
    for (const row of matchRecord.teams) {
      const key = String(row.Key || '').toUpperCase();
      const agg = byKey.get(key);
      if (!agg) continue;

      const kp = Math.max(0, Number(row.KP) || 0);
      const pp = Math.max(0, Number(row.PP) || 0);
      const tt = Math.max(0, Number(row.TT) || kp + pp);
      const pos = Math.max(0, Number(row.pos) || 0);

      agg.priorMatchesCount += 1;
      if (pos === 1) {
        agg.priorWinsCount += 1;
      }
      agg.priorKP += kp;
      agg.priorPP += pp;
      agg.priorTT += tt;
    }
  }

  // 3. Combine prior rounds with the current active match (counted at most once)
  const countedMatchIds = [...historicalMatchIds];
  if (activeMatchId && !uniqueMatchesById.has(activeMatchId)) {
    countedMatchIds.push(activeMatchId);
  }

  for (const agg of byKey.values()) {
    const currentWin = agg.currentPos === 1 ? 1 : 0;
    const activeMatchCount = activeMatchId ? 1 : 0;

    agg.matchesPlayed = agg.priorMatchesCount + activeMatchCount;
    agg.winsCount = agg.priorWinsCount + currentWin;
    agg.totalKP = agg.priorKP + agg.currentKP;
    agg.totalPP = agg.priorPP + agg.currentPP;
    agg.totalTT = agg.priorTT + agg.currentTT;
  }

  // 4. Sort cumulative standings by official tournament tie-breakers
  const sortedStandings = Array.from(byKey.values()).sort((a, b) => {
    if (b.totalTT !== a.totalTT) return b.totalTT - a.totalTT;
    if (b.winsCount !== a.winsCount) return b.winsCount - a.winsCount;
    if (b.totalPP !== a.totalPP) return b.totalPP - a.totalPP;
    if (b.totalKP !== a.totalKP) return b.totalKP - a.totalKP;
    return a.Key.localeCompare(b.Key);
  });

  const rankedStandings = sortedStandings.map((entry, idx) => ({
    ...entry,
    overallRank: idx + 1,
  }));

  return {
    game: targetGame,
    activeMatchId,
    activeMatchStatus,
    priorMatchesCount: historicalMatchIds.length,
    totalMatchesCounted: countedMatchIds.length,
    countedMatchIds,
    historicalMatchIds,
    standings: rankedStandings,
  };
}
