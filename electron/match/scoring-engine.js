/**
 * Pure BGMI & Free Fire Scoring Engine
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Official Specification Matrices:
 * - BGMI:
 *   Rank 1=10, 2=6, 3=5, 4=4, 5=3, 6=2, 7=1, 8=1, 9..26=0. Kill = 1 pt.
 * - Free Fire (FREE_FIRE):
 *   Rank 1=12, 2=9, 3=8, 4=7, 5=6, 6=5, 7=4, 8=3, 9=2, 10=1, 11..26=0. Kill = 1 pt.
 *
 * Always enforces TT = KP + PP.
 */

import { createCanonicalTeam } from '../../src/shared/match-types.js';

export const DEFAULT_SCORING_RULES = Object.freeze({
  BGMI: {
    killPoints: 1,
    placementPoints: {
      1: 10,
      2: 6,
      3: 5,
      4: 4,
      5: 3,
      6: 2,
      7: 1,
      8: 1,
    },
  },
  FREE_FIRE: {
    killPoints: 1,
    placementPoints: {
      1: 12,
      2: 9,
      3: 8,
      4: 7,
      5: 6,
      6: 5,
      7: 4,
      8: 3,
      9: 2,
      10: 1,
    },
  },
});

/**
 * Normalizes game identifier ('BGMI', 'FREE_FIRE', 'FF', 'Free Fire').
 * @param {string} game
 * @returns {'BGMI' | 'FREE_FIRE'}
 */
export function normalizeGameId(game) {
  if (typeof game !== 'string') {
    throw new Error('Game identifier must be a non-empty string.');
  }
  const upper = game.trim().toUpperCase();
  if (upper === 'BGMI') return 'BGMI';
  if (upper === 'FREE_FIRE' || upper === 'FREEFIRE' || upper === 'FF') {
    return 'FREE_FIRE';
  }
  throw new Error(
    `Unsupported game mode "${game}". Expected "BGMI" or "FREE_FIRE".`
  );
}

/**
 * Resolves and validates the placement points map for a given game and optional config.
 * @param {string} game
 * @param {object | null | undefined} config
 */
function resolveGameRules(game, config) {
  const normalizedGame = normalizeGameId(game);

  if (config !== null && config !== undefined) {
    if (typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Tournament configuration must be a valid object.');
    }
    const rulesRoot = config.scoringRules || config;
    const gameRules = rulesRoot[normalizedGame];
    if (
      !gameRules ||
      typeof gameRules !== 'object' ||
      !gameRules.placementPoints ||
      typeof gameRules.placementPoints !== 'object'
    ) {
      throw new Error(
        `Invalid or missing scoring configuration for game "${normalizedGame}".`
      );
    }
    return gameRules;
  }

  return DEFAULT_SCORING_RULES[normalizedGame];
}

/**
 * Calculates placement points (PP) for a given game and placement position.
 * Position 0 (Alive) always yields 0 placement points.
 *
 * @param {string} game
 * @param {number} position
 * @param {object | null} [config]
 * @returns {number}
 */
export function calculatePlacementPoints(game, position, config = null) {
  const rules = resolveGameRules(game, config);
  const pos = Number(position);

  if (!Number.isInteger(pos) || pos < 0 || pos > 26) {
    throw new Error(
      `Invalid placement position "${position}". Must be an integer from 0 to 26.`
    );
  }

  if (pos === 0) {
    return 0;
  }

  const rawPoints =
    rules.placementPoints[String(pos)] ?? rules.placementPoints[pos] ?? 0;
  const pp = Number(rawPoints);

  if (!Number.isInteger(pp) || pp < 0) {
    throw new Error(
      `Invalid placement points value "${rawPoints}" configured for position ${pos}.`
    );
  }

  return pp;
}

/**
 * Calculates total points (TT = KP + PP).
 * Rejects negative kill points or negative placement points.
 *
 * @param {number} killPoints
 * @param {number} placementPoints
 * @returns {number}
 */
export function calculateTotalPoints(killPoints, placementPoints) {
  const kp = Number(killPoints);
  const pp = Number(placementPoints);

  if (!Number.isInteger(kp) || kp < 0) {
    throw new Error(
      `Invalid kill points "${killPoints}". Kill points must be a non-negative integer.`
    );
  }
  if (!Number.isInteger(pp) || pp < 0) {
    throw new Error(
      `Invalid placement points "${placementPoints}". Placement points must be a non-negative integer.`
    );
  }

  return kp + pp;
}

/**
 * Recalculates PP and TT for a single team object immutably.
 *
 * @param {object} team
 * @param {string} game
 * @param {object | null} [config]
 * @returns {object}
 */
export function recalculateTeam(team, game, config = null) {
  if (!team || typeof team !== 'object') {
    throw new Error('Team must be a valid object.');
  }

  const pos = Number(team.pos ?? 0);
  const kp = Number(team.KP ?? team.kp ?? 0);

  if (!Number.isInteger(kp) || kp < 0) {
    throw new Error(
      `Team ${team.Key || 'UNKNOWN'}: kill points (${kp}) cannot be negative.`
    );
  }

  const pp = calculatePlacementPoints(game, pos, config);
  const tt = calculateTotalPoints(kp, pp);

  return createCanonicalTeam({
    ...team,
    pos,
    KP: kp,
    PP: pp,
    TT: tt,
  });
}

/**
 * Recalculates PP and TT for all teams in a match immutably.
 *
 * @param {Array<object>} teams
 * @param {string} game
 * @param {object | null} [config]
 * @returns {Array<object>}
 */
export function recalculateAllTeams(teams, game, config = null) {
  if (!Array.isArray(teams)) {
    throw new Error('Teams must be an array.');
  }
  return teams.map((team) => recalculateTeam(team, game, config));
}

/**
 * Sorts teams for leaderboard display:
 * 1. Total points (TT) descending
 * 2. Placement points (PP) descending
 * 3. Kill points (KP) descending
 * 4. Eliminated rank ascending (1 beats 2; alive teams follow placed teams with equal 0 pts)
 * 5. Alphabetical Key (A-Z) ascending
 *
 * @param {Array<object>} teams
 * @returns {Array<object>}
 */
export function sortTeamsForLeaderboard(teams) {
  return [...teams]
    .sort((a, b) => {
      if (b.TT !== a.TT) return b.TT - a.TT;
      if (b.PP !== a.PP) return b.PP - a.PP;
      if (b.KP !== a.KP) return b.KP - a.KP;
      if (a.pos > 0 && b.pos > 0 && a.pos !== b.pos) return a.pos - b.pos;
      if (a.pos > 0 && b.pos === 0) return -1;
      if (a.pos === 0 && b.pos > 0) return 1;
      return String(a.Key).localeCompare(String(b.Key));
    })
    .map((team, idx) => ({
      ...team,
      rank: idx + 1,
    }));
}
