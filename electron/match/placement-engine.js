/**
 * Pure Deterministic Placement & Collision Engine
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Invariants enforced:
 * - No two eliminated teams (pos > 0) may occupy the same positive placement rank.
 * - When a team is assigned an occupied positive rank R, the target team takes R
 *   and any colliding eliminated team at R is displaced to R + 1, cascading
 *   downward (R + 1 -> R + 2, etc.) until an open rank <= maxRank is found.
 * - Alive teams (pos === 0) are never silently eliminated by a collision cascade.
 * - If a cascade would exceed maxRank (e.g. assigning rank 26 when rank 26 is
 *   already occupied by another team), the entire operation is rejected atomically
 *   without mutating the input state.
 * - Every affected team has its PP and TT recalculated atomically.
 */

import { recalculateAllTeams } from './scoring-engine.js';
import {
  validatePlacementInput,
  validateTeamKey,
  validateTeamsStateInvariants,
} from '../utils/validation.js';

/**
 * Assigns a placement rank (0..maxRank) to a specific team key and resolves
 * any positive rank collisions deterministically.
 *
 * @param {Array<object>} teams
 * @param {string} rawKey
 * @param {number | string} rawPosition
 * @param {string} game
 * @param {object | null} [config]
 * @returns {{
 *   ok: boolean,
 *   teams?: Array<object>,
 *   affectedKeys?: string[],
 *   cascaded?: Array<{ key: string, teamName: string, fromPos: number, toPos: number }>,
 *   noOp?: boolean,
 *   message?: string,
 *   error?: string
 * }}
 */
export function assignTeamPlacement(
  teams,
  rawKey,
  rawPosition,
  game = 'BGMI',
  config = null
) {
  if (!Array.isArray(teams) || teams.length === 0) {
    return { ok: false, error: 'Teams list cannot be empty.' };
  }

  const maxRank = teams.length;
  const keyValidation = validateTeamKey(rawKey);
  if (!keyValidation.valid || !keyValidation.key) {
    return { ok: false, error: keyValidation.error || 'Invalid team key.' };
  }
  const targetKey = keyValidation.key;

  const targetTeamIndex = teams.findIndex((t) => t.Key === targetKey);
  if (targetTeamIndex === -1) {
    return {
      ok: false,
      error: `Team "${targetKey}" does not exist in the current match roster.`,
    };
  }

  const posValidation = validatePlacementInput(rawPosition, maxRank);
  if (!posValidation.valid || posValidation.position === undefined) {
    return {
      ok: false,
      error: posValidation.error || 'Invalid placement rank.',
    };
  }
  const requestedPos = posValidation.position;
  const currentTeam = teams[targetTeamIndex];

  // Case 1: Re-entering the team's existing rank (no-op)
  if (currentTeam.pos === requestedPos) {
    const recalculated = recalculateAllTeams(teams, game, config);
    return {
      ok: true,
      noOp: true,
      teams: recalculated,
      affectedKeys: [targetKey],
      cascaded: [],
      message:
        requestedPos === 0
          ? `Team [${targetKey}] ${currentTeam.TeamName} is already Alive (POS 0).`
          : `Team [${targetKey}] ${currentTeam.TeamName} already holds Rank #${requestedPos}.`,
    };
  }

  // Clone positions map for atomic trial mutation
  const nextPositions = new Map(teams.map((t) => [t.Key, Number(t.pos) || 0]));
  const cascaded = [];
  const affectedKeys = [targetKey];

  // Case 2: Returning a team to position 0 (Alive)
  if (requestedPos === 0) {
    nextPositions.set(targetKey, 0);
  } else {
    // Case 3: Assigning a positive rank (1..maxRank) with deterministic downward collision cascade
    // First vacate targetKey's old rank so if a cascade reaches it, that slot is available
    nextPositions.set(targetKey, 0);

    // Build reverse lookup of positive rank -> occupying team key (excluding targetKey)
    const rankToKey = new Map();
    for (const t of teams) {
      if (t.Key === targetKey) continue;
      const pos = nextPositions.get(t.Key) || 0;
      if (pos > 0) {
        rankToKey.set(pos, t.Key);
      }
    }

    // Place targetKey at requestedPos and cascade any colliding eliminated teams downward
    let rankToClear = requestedPos;
    const shiftsToApply = [];

    while (rankToKey.has(rankToClear)) {
      const displacedKey = rankToKey.get(rankToClear);
      const nextRank = rankToClear + 1;

      if (nextRank > maxRank) {
        return {
          ok: false,
          error: `Placement collision cascade rejected: displacing Team [${displacedKey}] from #${rankToClear} to #${nextRank} would exceed maximum match rank (#${maxRank}).`,
        };
      }

      shiftsToApply.push({
        key: displacedKey,
        fromPos: rankToClear,
        toPos: nextRank,
      });

      rankToClear = nextRank;
    }

    // Apply shifts in reverse order and assign targetKey
    for (let i = shiftsToApply.length - 1; i >= 0; i--) {
      const shift = shiftsToApply[i];
      nextPositions.set(shift.key, shift.toPos);
    }
    nextPositions.set(targetKey, requestedPos);

    for (const shift of shiftsToApply) {
      const teamObj = teams.find((t) => t.Key === shift.key);
      cascaded.push({
        key: shift.key,
        teamName: teamObj ? teamObj.TeamName : shift.key,
        fromPos: shift.fromPos,
        toPos: shift.toPos,
      });
      affectedKeys.push(shift.key);
    }
  }

  // Build updated teams array and recalculate PP & TT for every team
  const updatedTeams = teams.map((t) => ({
    ...t,
    pos: nextPositions.get(t.Key) ?? t.pos,
  }));

  let recalculatedTeams;
  try {
    recalculatedTeams = recalculateAllTeams(updatedTeams, game, config);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to recalculate scores after placement change.',
    };
  }

  const invariantCheck = validateTeamsStateInvariants(recalculatedTeams);
  if (!invariantCheck.valid) {
    return {
      ok: false,
      error: invariantCheck.error || 'Placement invariant check failed.',
    };
  }

  const cascadeSummary =
    cascaded.length > 0
      ? ` (Cascaded: ${cascaded
          .map((c) => `[${c.key}] #${c.fromPos}→#${c.toPos}`)
          .join(', ')})`
      : '';

  const message =
    requestedPos === 0
      ? `Set [${targetKey}] ${currentTeam.TeamName} to ALIVE (POS 0).`
      : `Assigned Rank #${requestedPos} to [${targetKey}] ${currentTeam.TeamName}${cascadeSummary}.`;

  return {
    ok: true,
    noOp: false,
    teams: recalculatedTeams,
    affectedKeys,
    cascaded,
    message,
  };
}

/**
 * Adjusts a team's placement by 1 rank upward (toward Rank #1) or downward (toward maxRank).
 *
 * - Direction 'UP': moves pos -> pos - 1 (toward Rank #1).
 *   If the team is currently Alive (pos === 0), rejects with a clear prompt to enter a rank first.
 *   If the team is already at Rank #1, rejects with clear feedback.
 * - Direction 'DOWN': moves pos -> pos + 1 (toward worse rank).
 *   If another team occupies pos + 1, swaps the two adjacent ranks cleanly if a downward cascade
 *   would hit maxRank, or cascades downward deterministically.
 *
 * @param {Array<object>} teams
 * @param {string} rawKey
 * @param {'UP' | 'DOWN'} direction
 * @param {string} game
 * @param {object | null} [config]
 */
export function adjustTeamPlacement(
  teams,
  rawKey,
  direction,
  game = 'BGMI',
  config = null
) {
  if (!Array.isArray(teams) || teams.length === 0) {
    return { ok: false, error: 'Teams list cannot be empty.' };
  }

  const maxRank = teams.length;
  const keyValidation = validateTeamKey(rawKey);
  if (!keyValidation.valid || !keyValidation.key) {
    return { ok: false, error: keyValidation.error || 'Invalid team key.' };
  }
  const targetKey = keyValidation.key;
  const targetTeam = teams.find((t) => t.Key === targetKey);
  if (!targetTeam) {
    return {
      ok: false,
      error: `Team "${targetKey}" does not exist in the current match.`,
    };
  }

  if (direction !== 'UP' && direction !== 'DOWN') {
    return {
      ok: false,
      error: `Invalid placement adjustment direction "${direction}". Expected "UP" or "DOWN".`,
    };
  }

  const currentPos = Number(targetTeam.pos) || 0;
  if (currentPos === 0) {
    return {
      ok: false,
      error: `Team [${targetKey}] ${targetTeam.TeamName} is currently Alive (POS 0). Type a placement rank (1–${maxRank}) and press Enter first.`,
    };
  }

  if (direction === 'UP') {
    if (currentPos <= 1) {
      return {
        ok: false,
        error: `Team [${targetKey}] ${targetTeam.TeamName} is already at Rank #1.`,
      };
    }
    return assignTeamPlacement(teams, targetKey, currentPos - 1, game, config);
  } else {
    if (currentPos >= maxRank) {
      return {
        ok: false,
        error: `Team [${targetKey}] ${targetTeam.TeamName} is already at the lowest rank (#${maxRank}).`,
      };
    }

    const nextPos = currentPos + 1;
    // Try standard deterministic cascade first
    const cascadeAttempt = assignTeamPlacement(
      teams,
      targetKey,
      nextPos,
      game,
      config
    );
    if (cascadeAttempt.ok) {
      return cascadeAttempt;
    }

    // If downward cascade hit maxRank because bottom slots are full,
    // deterministically swap with the occupant of nextPos (moving occupant into vacated currentPos)
    const occupant = teams.find((t) => t.pos === nextPos);
    if (occupant) {
      const swappedTeams = teams.map((t) => {
        if (t.Key === targetKey) return { ...t, pos: nextPos };
        if (t.Key === occupant.Key) return { ...t, pos: currentPos };
        return t;
      });
      const recalculated = recalculateAllTeams(swappedTeams, game, config);
      const check = validateTeamsStateInvariants(recalculated);
      if (check.valid) {
        return {
          ok: true,
          noOp: false,
          teams: recalculated,
          affectedKeys: [targetKey, occupant.Key],
          cascaded: [
            {
              key: occupant.Key,
              teamName: occupant.TeamName,
              fromPos: nextPos,
              toPos: currentPos,
            },
          ],
          message: `Adjusted [${targetKey}] ${targetTeam.TeamName} to Rank #${nextPos} (Swapped with [${occupant.Key}] #${nextPos}→#${currentPos}).`,
        };
      }
    }

    return cascadeAttempt;
  }
}
