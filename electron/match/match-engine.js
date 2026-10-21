/**
 * Authoritative Match State Engine
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Owns the in-memory match state, validates every mutation, coordinates
 * scoring and placement collision engines, and records atomic undo snapshots.
 */

import {
  MATCH_STATUS,
  OVERLAY_VIEW_MODES,
  SAVE_STATUS,
} from '../../src/shared/constants.js';
import { createEventId } from '../../src/shared/ipcValidator.js';
import {
  buildDefaultTemplateTeams,
  createCanonicalTeam,
} from '../../src/shared/match-types.js';
import {
  createDefaultOverlayConfig,
  resetBackgroundConfig,
  resetScorecardConfig,
  sanitizeOverlayConfig,
  validateBackgroundImageUpload,
} from '../../src/shared/overlayLayout.js';
import {
  validateTeamKey,
  validateTeamsStateInvariants,
} from '../utils/validation.js';
import {
  adjustTeamPlacement,
  assignTeamPlacement,
} from './placement-engine.js';
import {
  normalizeGameId,
  recalculateAllTeams,
  recalculateTeam,
  sortTeamsForLeaderboard,
} from './scoring-engine.js';
import { UndoManager } from './undo-manager.js';

const VALID_OVERLAY_MODES = new Set(Object.values(OVERLAY_VIEW_MODES));

export class MatchEngine {
  /**
   * @param {{
   *   config?: object | null,
   *   initialGame?: 'BGMI' | 'FREE_FIRE',
   *   undoDepth?: number
   * }} [options]
   */
  constructor(options = {}) {
    this.config = options.config || null;
    const game = normalizeGameId(options.initialGame || 'BGMI');
    this.undoManager = new UndoManager(options.undoDepth || 50);

    const initialTeams = recalculateAllTeams(
      buildDefaultTemplateTeams(game),
      game,
      this.config
    );

    this.state = {
      tournamentTitle:
        this.config?.tournamentTitle || 'PRO SERIES INVITATIONAL S4',
      stageLabel: this.config?.defaultStageLabel || 'Week 01 Day 01',
      overlayViewMode: OVERLAY_VIEW_MODES.MATCH,
      overlayConfig: createDefaultOverlayConfig(),
      activeGame: game,
      matchId: 'Match_01_BGMI',
      roundNumber: 1,
      matchStatus: MATCH_STATUS.LIVE,
      saveStatus: SAVE_STATUS.SAVED,
      activeFilePath: 'matches/Match_01_BGMI.csv',
      selectedTeamKey: 'A',
      teams: initialTeams,
      lastEvent: {
        eventId: createEventId('INIT'),
        type: 'MATCH_INITIALIZED',
        message: 'Match engine initialized.',
        timestamp: new Date().toISOString(),
      },
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns a serializable snapshot of the complete authoritative match state,
   * including sorted leaderboard standings, overlayConfig, and undo metadata.
   */
  getSnapshot() {
    const clonedTeams = this.state.teams.map((t) => createCanonicalTeam(t));
    const leaderboard = sortTeamsForLeaderboard(clonedTeams);
    const aliveTeamsCount = clonedTeams.filter((t) => t.pos === 0).length;

    return {
      tournamentTitle: this.state.tournamentTitle,
      stageLabel: this.state.stageLabel,
      overlayViewMode: this.state.overlayViewMode,
      overlayConfig: sanitizeOverlayConfig(this.state.overlayConfig),
      activeGame: this.state.activeGame,
      matchId: this.state.matchId,
      roundNumber: this.state.roundNumber,
      matchStatus: this.state.matchStatus,
      saveStatus: this.state.saveStatus,
      activeFilePath: this.state.activeFilePath,
      selectedTeamKey: this.state.selectedTeamKey,
      teams: clonedTeams,
      leaderboard,
      aliveTeamsCount,
      totalTeamsCount: clonedTeams.length,
      undo: this.undoManager.getMetadata(),
      lastEvent: { ...this.state.lastEvent },
      lastError: this.state.lastError,
      updatedAt: this.state.updatedAt,
    };
  }

  /**
   * Captures the restorable core fields for the Undo stack.
   */
  _captureUndoableState() {
    return {
      tournamentTitle: this.state.tournamentTitle,
      stageLabel: this.state.stageLabel,
      overlayViewMode: this.state.overlayViewMode,
      activeGame: this.state.activeGame,
      matchId: this.state.matchId,
      roundNumber: this.state.roundNumber,
      matchStatus: this.state.matchStatus,
      selectedTeamKey: this.state.selectedTeamKey,
      teams: JSON.parse(JSON.stringify(this.state.teams)),
    };
  }

  /**
   * Updates editable broadcast metadata (tournamentTitle, stageLabel, overlayViewMode)
   * and/or responsive overlay customization (overlayConfig, backgroundUpload,
   * resetOverlayBackground, resetOverlayScorecard, resetOverlayAll) and synchronizes live.
   *
   * @param {{
   *   tournamentTitle?: string,
   *   stageLabel?: string,
   *   overlayViewMode?: 'MATCH' | 'OVERALL' | 'END_OF_MATCH',
   *   overlayConfig?: object,
   *   backgroundUpload?: { fileName: string, mimeType?: string, fileSize?: number, dataUrl: string },
   *   resetOverlayBackground?: boolean,
   *   resetOverlayScorecard?: boolean,
   *   resetOverlayAll?: boolean
   * }} payload
   */
  updateBroadcastMeta(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'Invalid broadcast metadata payload.' };
    }

    let nextTitle = this.state.tournamentTitle;
    let nextStage = this.state.stageLabel;
    let nextMode = this.state.overlayViewMode;
    let nextOverlayConfig = sanitizeOverlayConfig(this.state.overlayConfig);

    if (typeof payload.tournamentTitle === 'string') {
      const cleaned = payload.tournamentTitle.trim().slice(0, 80);
      if (!cleaned) {
        return {
          ok: false,
          error: 'Event / Tournament name cannot be empty.',
        };
      }
      nextTitle = cleaned;
    }

    if (typeof payload.stageLabel === 'string') {
      const cleanedStage = payload.stageLabel.trim().slice(0, 60);
      nextStage = cleanedStage || 'LIVE BROADCAST';
    }

    if (typeof payload.overlayViewMode === 'string') {
      const upperMode = payload.overlayViewMode.trim().toUpperCase();
      if (!VALID_OVERLAY_MODES.has(upperMode)) {
        return {
          ok: false,
          error: `Unsupported overlay view mode "${payload.overlayViewMode}".`,
        };
      }
      nextMode = upperMode;
    }

    if (payload.backgroundUpload) {
      const bgValidation = validateBackgroundImageUpload(
        payload.backgroundUpload
      );
      if (!bgValidation.valid || !bgValidation.sanitized) {
        return {
          ok: false,
          error: bgValidation.error || 'Invalid background image upload.',
        };
      }
      nextOverlayConfig = sanitizeOverlayConfig(
        {
          background: {
            ...nextOverlayConfig.background,
            ...bgValidation.sanitized,
          },
        },
        nextOverlayConfig
      );
    }

    if (payload.overlayConfig && typeof payload.overlayConfig === 'object') {
      nextOverlayConfig = sanitizeOverlayConfig(
        payload.overlayConfig,
        nextOverlayConfig
      );
    }

    if (payload.resetOverlayBackground) {
      nextOverlayConfig = resetBackgroundConfig(nextOverlayConfig);
    }

    if (payload.resetOverlayScorecard) {
      nextOverlayConfig = resetScorecardConfig(nextOverlayConfig);
    }

    if (payload.resetOverlayAll) {
      nextOverlayConfig = createDefaultOverlayConfig();
    }

    this.state.tournamentTitle = nextTitle;
    this.state.stageLabel = nextStage;
    this.state.overlayViewMode = nextMode;
    this.state.overlayConfig = nextOverlayConfig;
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('META'),
      type: 'BROADCAST_META_UPDATED',
      overlayViewMode: nextMode,
      message: `Updated broadcast header ("${nextTitle}" · ${nextMode}).`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Selects a team (A-Z) without creating an undo entry.
   * @param {string | null} key
   */
  selectTeam(key) {
    if (key === null || key === '') {
      this.state.selectedTeamKey = null;
      this.state.updatedAt = new Date().toISOString();
      this.state.lastEvent = {
        eventId: createEventId('SEL'),
        type: 'TEAM_SELECTION_CLEARED',
        message: 'Cleared active team selection.',
        timestamp: this.state.updatedAt,
      };
      return { ok: true, snapshot: this.getSnapshot() };
    }

    const check = validateTeamKey(key);
    if (!check.valid || !check.key) {
      return { ok: false, error: check.error };
    }

    const exists = this.state.teams.some((t) => t.Key === check.key);
    if (!exists) {
      return {
        ok: false,
        error: `Team [${check.key}] is not present in the current match.`,
      };
    }

    this.state.selectedTeamKey = check.key;
    this.state.updatedAt = new Date().toISOString();
    const team = this.state.teams.find((t) => t.Key === check.key);
    this.state.lastEvent = {
      eventId: createEventId('SEL'),
      type: 'TEAM_SELECTED',
      teamKey: check.key,
      message: `Selected [${check.key}] ${team ? team.TeamName : check.key}.`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Switches the active game ruleset ('BGMI' or 'FREE_FIRE'), recalculating all
   * Placement Points (PP) and Total Points (TT) with full Undo support.
   * @param {string} rawGame
   */
  setActiveGame(rawGame) {
    if (this.state.matchStatus === MATCH_STATUS.COMPLETED) {
      return {
        ok: false,
        error: 'Match is marked COMPLETED. Reopen the match to switch game rulesets.',
      };
    }

    let nextGame;
    try {
      nextGame = normalizeGameId(rawGame);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unsupported game identifier.',
      };
    }

    if (this.state.activeGame === nextGame) {
      return { ok: true, snapshot: this.getSnapshot() };
    }

    const recalculated = recalculateAllTeams(
      this.state.teams,
      nextGame,
      this.config
    );

    this.undoManager.pushState(
      this._captureUndoableState(),
      `Switch active game ruleset from ${this.state.activeGame} to ${nextGame}`
    );

    this.state.activeGame = nextGame;
    this.state.teams = recalculated;
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('GAME'),
      type: 'GAME_MODE_SWITCHED',
      game: nextGame,
      message: `Switched active scoring engine to ${nextGame} and recalculated all PP/TT standings.`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Increments kill points (KP) by 1 for the specified team key.
   * @param {string} rawKey
   */
  incrementKill(rawKey) {
    if (this.state.matchStatus === MATCH_STATUS.COMPLETED) {
      return {
        ok: false,
        error: 'Match is marked COMPLETED. Reopen the match to modify scores.',
      };
    }

    const check = validateTeamKey(rawKey || this.state.selectedTeamKey);
    if (!check.valid || !check.key) {
      return { ok: false, error: check.error || 'Select a team A–Z first.' };
    }
    const targetKey = check.key;
    const teamIdx = this.state.teams.findIndex((t) => t.Key === targetKey);
    if (teamIdx === -1) {
      return { ok: false, error: `Team [${targetKey}] not found.` };
    }

    const currentTeam = this.state.teams[teamIdx];
    const nextKp = currentTeam.KP + 1;

    const updatedTeam = recalculateTeam(
      { ...currentTeam, KP: nextKp },
      this.state.activeGame,
      this.config
    );

    const nextTeams = this.state.teams.map((t, idx) =>
      idx === teamIdx ? updatedTeam : t
    );

    const invariant = validateTeamsStateInvariants(nextTeams);
    if (!invariant.valid) {
      return { ok: false, error: invariant.error };
    }

    this.undoManager.pushState(
      this._captureUndoableState(),
      `+1 KP for [${targetKey}] ${currentTeam.TeamName}`
    );

    this.state.teams = nextTeams;
    this.state.selectedTeamKey = targetKey;
    if (this.state.matchStatus === MATCH_STATUS.NOT_STARTED) {
      this.state.matchStatus = MATCH_STATUS.LIVE;
    }
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('KP'),
      type: 'KILL_INCREMENTED',
      teamKey: targetKey,
      kp: updatedTeam.KP,
      tt: updatedTeam.TT,
      message: `+1 KP → [${targetKey}] ${updatedTeam.TeamName} (KP: ${updatedTeam.KP}, TT: ${updatedTeam.TT})`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Decrements kill points (KP) by 1 for the specified team key without going below 0.
   * @param {string} rawKey
   */
  decrementKill(rawKey) {
    if (this.state.matchStatus === MATCH_STATUS.COMPLETED) {
      return {
        ok: false,
        error: 'Match is marked COMPLETED. Reopen the match to modify scores.',
      };
    }

    const check = validateTeamKey(rawKey || this.state.selectedTeamKey);
    if (!check.valid || !check.key) {
      return { ok: false, error: check.error || 'Select a team A–Z first.' };
    }
    const targetKey = check.key;
    const teamIdx = this.state.teams.findIndex((t) => t.Key === targetKey);
    if (teamIdx === -1) {
      return { ok: false, error: `Team [${targetKey}] not found.` };
    }

    const currentTeam = this.state.teams[teamIdx];
    if (currentTeam.KP <= 0) {
      return {
        ok: false,
        error: `Team [${targetKey}] ${currentTeam.TeamName} already has 0 KP. Kill points cannot be negative.`,
      };
    }

    const nextKp = currentTeam.KP - 1;
    const updatedTeam = recalculateTeam(
      { ...currentTeam, KP: nextKp },
      this.state.activeGame,
      this.config
    );

    const nextTeams = this.state.teams.map((t, idx) =>
      idx === teamIdx ? updatedTeam : t
    );

    const invariant = validateTeamsStateInvariants(nextTeams);
    if (!invariant.valid) {
      return { ok: false, error: invariant.error };
    }

    this.undoManager.pushState(
      this._captureUndoableState(),
      `-1 KP for [${targetKey}] ${currentTeam.TeamName}`
    );

    this.state.teams = nextTeams;
    this.state.selectedTeamKey = targetKey;
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('KP'),
      type: 'KILL_DECREMENTED',
      teamKey: targetKey,
      kp: updatedTeam.KP,
      tt: updatedTeam.TT,
      message: `-1 KP → [${targetKey}] ${updatedTeam.TeamName} (KP: ${updatedTeam.KP}, TT: ${updatedTeam.TT})`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Assigns a direct placement rank (0..26) with deterministic collision cascading.
   * Produces a single undo entry for the entire cascade.
   *
   * @param {string} rawKey
   * @param {number | string} rawPosition
   */
  setPlacement(rawKey, rawPosition) {
    if (this.state.matchStatus === MATCH_STATUS.COMPLETED) {
      return {
        ok: false,
        error:
          'Match is marked COMPLETED. Reopen the match to modify placements.',
      };
    }

    const targetKey = rawKey || this.state.selectedTeamKey;
    const result = assignTeamPlacement(
      this.state.teams,
      targetKey,
      rawPosition,
      this.state.activeGame,
      this.config
    );

    if (!result.ok || !result.teams) {
      this.state.lastError = result.error || 'Placement assignment rejected.';
      return {
        ok: false,
        error: this.state.lastError,
      };
    }

    if (!result.noOp) {
      this.undoManager.pushState(
        this._captureUndoableState(),
        result.message || `Set placement #${rawPosition} for [${targetKey}]`
      );
      this.state.teams = result.teams;
      if (this.state.matchStatus === MATCH_STATUS.NOT_STARTED) {
        this.state.matchStatus = MATCH_STATUS.LIVE;
      }
    }

    this.state.selectedTeamKey = String(targetKey).trim().toUpperCase();
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('POS'),
      type: 'PLACEMENT_UPDATED',
      teamKey: this.state.selectedTeamKey,
      affectedKeys: result.affectedKeys || [this.state.selectedTeamKey],
      cascaded: result.cascaded || [],
      message: result.message || 'Placement updated.',
      timestamp: this.state.updatedAt,
    };

    return {
      ok: true,
      noOp: Boolean(result.noOp),
      cascaded: result.cascaded || [],
      message: result.message,
      snapshot: this.getSnapshot(),
    };
  }

  /**
   * Adjusts placement by 1 rank UP (toward #1) or DOWN (toward #26).
   * @param {string} rawKey
   * @param {'UP' | 'DOWN'} direction
   */
  adjustPlacement(rawKey, direction) {
    if (this.state.matchStatus === MATCH_STATUS.COMPLETED) {
      return {
        ok: false,
        error:
          'Match is marked COMPLETED. Reopen the match to modify placements.',
      };
    }

    const targetKey = rawKey || this.state.selectedTeamKey;
    const result = adjustTeamPlacement(
      this.state.teams,
      targetKey,
      direction,
      this.state.activeGame,
      this.config
    );

    if (!result.ok || !result.teams) {
      this.state.lastError = result.error || 'Placement adjustment rejected.';
      return {
        ok: false,
        error: this.state.lastError,
      };
    }

    if (!result.noOp) {
      this.undoManager.pushState(
        this._captureUndoableState(),
        result.message || `Adjust placement ${direction} for [${targetKey}]`
      );
      this.state.teams = result.teams;
    }

    this.state.selectedTeamKey = String(targetKey).trim().toUpperCase();
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('POS'),
      type: 'PLACEMENT_ADJUSTED',
      teamKey: this.state.selectedTeamKey,
      affectedKeys: result.affectedKeys || [this.state.selectedTeamKey],
      cascaded: result.cascaded || [],
      message: result.message || 'Placement adjusted.',
      timestamp: this.state.updatedAt,
    };

    return {
      ok: true,
      cascaded: result.cascaded || [],
      message: result.message,
      snapshot: this.getSnapshot(),
    };
  }

  /**
   * Updates a team's display name and four player handles.
   * @param {{ key: string, teamName: string, players: string[] }} payload
   */
  updateTeamRoster(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'Invalid roster update payload.' };
    }
    const keyRes = validateTeamKey(payload.key);
    if (!keyRes.valid || !keyRes.key) {
      return { ok: false, error: keyRes.error };
    }
    const targetKey = keyRes.key;
    const idx = this.state.teams.findIndex((t) => t.Key === targetKey);
    if (idx === -1) {
      return { ok: false, error: `Team [${targetKey}] not found.` };
    }

    const teamName = String(payload.teamName || '').trim();
    if (!teamName) {
      return { ok: false, error: 'Team name cannot be empty.' };
    }

    const players = Array.isArray(payload.players) ? payload.players : [];
    const current = this.state.teams[idx];
    const updated = recalculateTeam(
      {
        ...current,
        TeamName: teamName,
        Player1: String(players[0] ?? current.Player1).trim() || `${targetKey}·Player1`,
        Player2: String(players[1] ?? current.Player2).trim() || `${targetKey}·Player2`,
        Player3: String(players[2] ?? current.Player3).trim() || `${targetKey}·Player3`,
        Player4: String(players[3] ?? current.Player4).trim() || `${targetKey}·Player4`,
      },
      this.state.activeGame,
      this.config
    );

    this.undoManager.pushState(
      this._captureUndoableState(),
      `Roster edit for [${targetKey}] ${teamName}`
    );

    this.state.teams = this.state.teams.map((t, i) => (i === idx ? updated : t));
    this.state.selectedTeamKey = targetKey;
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('ROSTER'),
      type: 'ROSTER_UPDATED',
      teamKey: targetKey,
      message: `Updated roster for [${targetKey}] ${teamName}.`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Restores the most recent valid state from the undo stack without pushing a new undo entry.
   */
  undo() {
    const popped = this.undoManager.popState();
    if (!popped.ok || !popped.entry) {
      return {
        ok: false,
        error: popped.error || 'No undo history available.',
      };
    }

    const { snapshot, label } = popped.entry;
    const game = normalizeGameId(snapshot.activeGame || this.state.activeGame);
    const recalculated = recalculateAllTeams(snapshot.teams, game, this.config);

    this.state.activeGame = game;
    this.state.matchId = snapshot.matchId || this.state.matchId;
    this.state.roundNumber = snapshot.roundNumber || this.state.roundNumber;
    this.state.matchStatus = snapshot.matchStatus || this.state.matchStatus;
    this.state.selectedTeamKey =
      snapshot.selectedTeamKey ?? this.state.selectedTeamKey;
    this.state.teams = recalculated;
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('UNDO'),
      type: 'UNDO_APPLIED',
      message: `Undid action: ${label}`,
      timestamp: this.state.updatedAt,
    };

    return {
      ok: true,
      undoneLabel: label,
      snapshot: this.getSnapshot(),
    };
  }

  /**
   * Replaces the active match state (used when creating, loading, or next-rounding a match).
   *
   * @param {{
   *   activeGame: string,
   *   matchId: string,
   *   roundNumber?: number,
   *   matchStatus?: string,
   *   activeFilePath: string,
   *   teams: Array<object>,
   *   clearUndo?: boolean,
   *   pushUndoLabel?: string,
   *   eventType?: string,
   *   eventMessage?: string
   * }} nextMatch
   */
  replaceMatchState(nextMatch) {
    const game = normalizeGameId(nextMatch.activeGame || this.state.activeGame);
    const recalculated = recalculateAllTeams(nextMatch.teams, game, this.config);
    const invariant = validateTeamsStateInvariants(recalculated);
    if (!invariant.valid) {
      return { ok: false, error: invariant.error };
    }

    if (nextMatch.clearUndo) {
      this.undoManager.clear();
    } else if (nextMatch.pushUndoLabel) {
      this.undoManager.pushState(
        this._captureUndoableState(),
        nextMatch.pushUndoLabel
      );
    }

    this.state.activeGame = game;
    this.state.matchId = nextMatch.matchId || this.state.matchId;
    this.state.roundNumber =
      nextMatch.roundNumber ?? this.state.roundNumber ?? 1;
    this.state.matchStatus = nextMatch.matchStatus || MATCH_STATUS.LIVE;
    this.state.activeFilePath =
      nextMatch.activeFilePath || this.state.activeFilePath;
    this.state.teams = recalculated;
    if (
      !this.state.selectedTeamKey ||
      !recalculated.some((t) => t.Key === this.state.selectedTeamKey)
    ) {
      this.state.selectedTeamKey = recalculated[0]?.Key || 'A';
    }
    this.state.lastError = null;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('MATCH'),
      type: nextMatch.eventType || 'MATCH_LOADED',
      message:
        nextMatch.eventMessage || `Loaded match ${this.state.matchId} (${game}).`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Marks the match as COMPLETED or reopens it to LIVE (undoable).
   * @param {'COMPLETED' | 'LIVE'} targetStatus
   */
  setMatchLifecycleStatus(targetStatus) {
    if (
      targetStatus !== MATCH_STATUS.COMPLETED &&
      targetStatus !== MATCH_STATUS.LIVE
    ) {
      return { ok: false, error: `Invalid match status "${targetStatus}".` };
    }

    if (this.state.matchStatus === targetStatus) {
      return { ok: true, snapshot: this.getSnapshot() };
    }

    this.undoManager.pushState(
      this._captureUndoableState(),
      `Set match status to ${targetStatus}`
    );

    this.state.matchStatus = targetStatus;
    this.state.updatedAt = new Date().toISOString();
    this.state.lastEvent = {
      eventId: createEventId('STATUS'),
      type:
        targetStatus === MATCH_STATUS.COMPLETED
          ? 'MATCH_COMPLETED'
          : 'MATCH_REOPENED',
      message:
        targetStatus === MATCH_STATUS.COMPLETED
          ? `Match ${this.state.matchId} marked as COMPLETED.`
          : `Match ${this.state.matchId} reopened to LIVE scoring.`,
      timestamp: this.state.updatedAt,
    };

    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Updates the persistence indicator status ('SAVED', 'SAVING...', 'EXTERNAL SYNC', 'SAVE ERROR').
   */
  setSaveStatus(saveStatus, errorMsg = null) {
    this.state.saveStatus = saveStatus;
    if (errorMsg) {
      this.state.lastError = errorMsg;
    }
    this.state.updatedAt = new Date().toISOString();
  }
}
