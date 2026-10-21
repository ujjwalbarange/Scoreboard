/**
 * Authoritative Match Lifecycle & Persistence Coordinator
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Connects MatchEngine + CsvController:
 * - Persists every score/placement/roster mutation atomically to the active CSV file
 * - Manages Companion Metadata (matches/.match_meta.json) without altering the 10-column CSV schema
 * - Implements Create Match, Load Match, Save Match, Import Roster, Export CSV,
 *   Next Round (Carry Roster vs Cold Start), Complete Match, and Reopen Match
 * - Synchronizes valid external CSV modifications and reports invalid external edits
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  GAME_MODES,
  MATCH_STATUS,
  SAVE_STATUS,
} from '../../src/shared/constants.js';
import { createEventId } from '../../src/shared/ipcValidator.js';
import {
  buildDefaultTemplateTeams,
  createCanonicalTeam,
} from '../../src/shared/match-types.js';
import {
  parseAndValidateMatchCsv,
  serializeTeamsToCsv,
} from '../utils/validation.js';
import { CsvController } from './csv-controller.js';
import { MatchEngine } from './match-engine.js';
import { normalizeGameId } from './scoring-engine.js';
import { computeTournamentAggregation } from './tournament-aggregator.js';
import { seedAndMigrateWritableData } from '../utils/runtime-paths.js';

export class MatchManager {
  /**
   * @param {{
   *   matchesDir: string,
   *   bundledTemplatesDir?: string,
   *   bundledConfigPath?: string,
   *   userDataPath?: string,
   *   legacyMatchesDirs?: string[],
   *   config?: object | null,
   *   onStateChange?: (snapshot: object) => void,
   *   onNotification?: (notification: object) => void
   * }} options
   */
  constructor(options) {
    this.matchesDir = path.resolve(options.matchesDir);
    this.bundledTemplatesDir = options.bundledTemplatesDir || null;
    this.bundledConfigPath = options.bundledConfigPath || null;
    this.userDataPath = options.userDataPath || null;
    this.legacyMatchesDirs = options.legacyMatchesDirs || [];
    this.config = options.config || null;
    this.onStateChange = options.onStateChange || (() => {});
    this.onNotification = options.onNotification || (() => {});

    this.csvController = new CsvController(this.matchesDir);
    this.engine = new MatchEngine({
      config: this.config,
      initialGame: this.config?.defaultGame || 'BGMI',
      undoDepth: 50,
    });

    this.metaFilePath = path.join(this.matchesDir, '.match_meta.json');
    this.initialized = false;
  }

  /**
   * Initializes templates, performs safe non-destructive migration into writable
   * userData when packaged, and loads or creates the initial active match.
   */
  async initialize() {
    if (this.initialized) {
      return this.getFullState();
    }

    await seedAndMigrateWritableData({
      writableMatchesDir: this.matchesDir,
      bundledTemplatesDir: this.bundledTemplatesDir,
      legacyMatchesDirs: this.legacyMatchesDirs,
      userDataPath: this.userDataPath,
      bundledConfigPath: this.bundledConfigPath,
    });

    await this.csvController.ensureDirectoryAndTemplates();
    const existingMatches = await this.csvController.listMatchFiles();
    const savedMeta = await this._readCompanionMeta();

    // Restore persisted tournament title, stage label, and overlay view mode if present
    if (savedMeta && typeof savedMeta === 'object') {
      this.engine.updateBroadcastMeta({
        tournamentTitle: savedMeta.tournamentTitle,
        stageLabel: savedMeta.stageLabel,
        overlayViewMode: savedMeta.overlayViewMode,
      });
    }

    let targetFilePath = null;
    let targetGame = normalizeGameId(this.config?.defaultGame || 'BGMI');
    let targetRound = 1;
    let targetStatus = MATCH_STATUS.LIVE;

    if (savedMeta?.activeMatchId) {
      const found = existingMatches.find(
        (m) => m.matchId === savedMeta.activeMatchId
      );
      if (found) {
        targetFilePath = found.filePath;
        const matchMeta = savedMeta.matches?.[found.matchId];
        targetGame = normalizeGameId(matchMeta?.game || found.game || 'BGMI');
        targetRound = matchMeta?.roundNumber || 1;
        targetStatus = matchMeta?.matchStatus || MATCH_STATUS.LIVE;
      }
    }

    if (!targetFilePath && existingMatches.length > 0) {
      const latest = existingMatches[existingMatches.length - 1];
      targetFilePath = latest.filePath;
      const matchMeta = savedMeta?.matches?.[latest.matchId];
      targetGame = normalizeGameId(matchMeta?.game || latest.game || 'BGMI');
      targetRound = matchMeta?.roundNumber || existingMatches.length;
      targetStatus = matchMeta?.matchStatus || MATCH_STATUS.LIVE;
    }

    if (targetFilePath) {
      const loaded = await this.csvController.loadCsvFile(
        targetFilePath,
        targetGame,
        this.config
      );
      if (loaded.ok && loaded.teams) {
        const matchId = path.basename(targetFilePath, '.csv');
        this.engine.replaceMatchState({
          activeGame: targetGame,
          matchId,
          roundNumber: targetRound,
          matchStatus: targetStatus,
          activeFilePath: this._toRelativeDisplayPath(targetFilePath),
          teams: loaded.teams,
          clearUndo: true,
          eventType: 'MATCH_LOADED',
          eventMessage: `Loaded active match ${matchId} (${targetGame}).`,
        });
        this._bindWatcher(targetFilePath);
        this.initialized = true;
        return this.getFullState();
      }
    }

    // Create initial Match_01_BGMI.csv from template_bgmi.csv
    await this.createMatch({ game: targetGame });
    this.initialized = true;
    return this.getFullState();
  }

  /**
   * Returns the complete authoritative state including available match files list
   * and deduplicated cumulative tournament standings across rounds.
   */
  async getFullState() {
    const matchesList = await this.csvController.listMatchFiles();
    const savedMeta = await this._readCompanionMeta();
    const snapshot = this.engine.getSnapshot();

    // Load saved matches for the active game to compute cumulative tournament standings
    const savedMatchRecords = [];
    for (const m of matchesList) {
      const metaEntry = savedMeta?.matches?.[m.matchId];
      const matchGame = metaEntry?.game
        ? normalizeGameId(metaEntry.game)
        : m.game;
      if (matchGame !== snapshot.activeGame) continue;
      if (m.matchId === snapshot.matchId) continue;

      const loaded = await this.csvController.loadCsvFile(
        m.filePath,
        matchGame,
        this.config
      );
      if (loaded.ok && loaded.teams) {
        savedMatchRecords.push({
          matchId: m.matchId,
          game: matchGame,
          roundNumber: metaEntry?.roundNumber || 1,
          matchStatus: metaEntry?.matchStatus || MATCH_STATUS.COMPLETED,
          teams: loaded.teams,
        });
      }
    }

    const tournamentStandings = computeTournamentAggregation({
      activeGame: snapshot.activeGame,
      activeMatchId: snapshot.matchId,
      activeMatchStatus: snapshot.matchStatus,
      activeTeams: snapshot.teams,
      savedMatches: savedMatchRecords,
    });

    return {
      ...snapshot,
      availableMatches: matchesList.map((m) => ({
        matchId: m.matchId,
        fileName: m.fileName,
        game: savedMeta?.matches?.[m.matchId]?.game || m.game,
        roundNumber: savedMeta?.matches?.[m.matchId]?.roundNumber || 1,
        matchStatus:
          savedMeta?.matches?.[m.matchId]?.matchStatus || MATCH_STATUS.LIVE,
        updatedAt: m.updatedAt,
      })),
      tournamentStandings,
    };
  }

  /**
   * Broadcasts the latest state to all connected windows.
   */
  async _broadcastCurrentState() {
    const fullState = await this.getFullState();
    this.onStateChange(fullState);
    return fullState;
  }

  /**
   * Emits an operational notification to the Control Deck and Overlay.
   */
  _notify(level, category, message, extra = {}) {
    const note = {
      id: createEventId('NOTE'),
      level,
      category,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    this.onNotification(note);
    return note;
  }

  /**
   * Persists the current in-memory state to the active CSV file atomically
   * and updates saveStatus accurately based on the write outcome.
   */
  async _persistCurrentMatch(actionDescription = 'State saved') {
    const absPath = path.resolve(
      this.matchesDir,
      path.basename(this.engine.state.activeFilePath)
    );

    this.engine.setSaveStatus(SAVE_STATUS.SAVING);
    const saveRes = await this.csvController.saveTeamsToCsv(
      absPath,
      this.engine.state.teams
    );

    if (!saveRes.ok) {
      this.engine.setSaveStatus(
        SAVE_STATUS.ERROR,
        saveRes.error || 'Failed to write CSV file.'
      );
      this._notify(
        'error',
        'CSV_SAVE_ERROR',
        `Persistence error for ${path.basename(absPath)}: ${saveRes.error}`
      );
      const snapshot = await this._broadcastCurrentState();
      return {
        ok: false,
        error: saveRes.error || 'CSV persistence failed.',
        snapshot,
      };
    }

    this.engine.setSaveStatus(SAVE_STATUS.SAVED);
    await this._writeCompanionMeta();
    const snapshot = await this._broadcastCurrentState();

    return {
      ok: true,
      savedAt: saveRes.savedAt,
      actionDescription,
      snapshot,
    };
  }

  /**
   * Binds the debounced external CSV file watcher to `absFilePath`.
   */
  _bindWatcher(absFilePath) {
    this.csvController.watchActiveMatchFile(absFilePath, {
      getGame: () => this.engine.state.activeGame,
      getConfig: () => this.config,
      getCurrentCsvContent: () => serializeTeamsToCsv(this.engine.state.teams),
      onExternalAccept: async (externalTeams, meta) => {
        const res = this.engine.replaceMatchState({
          activeGame: this.engine.state.activeGame,
          matchId: this.engine.state.matchId,
          roundNumber: this.engine.state.roundNumber,
          matchStatus: this.engine.state.matchStatus,
          activeFilePath: this.engine.state.activeFilePath,
          teams: externalTeams,
          clearUndo: false,
          pushUndoLabel: `Before external CSV sync (${meta.fileName})`,
          eventType: 'EXTERNAL_CSV_SYNCED',
          eventMessage: `Synchronized external CSV edit from ${meta.fileName}.`,
        });

        if (res.ok) {
          this.engine.setSaveStatus(SAVE_STATUS.EXTERNAL_SYNC);
          this._notify(
            'success',
            'EXTERNAL_CSV',
            `Accepted validated external CSV changes from ${meta.fileName}.`
          );
          await this._broadcastCurrentState();
        }
      },
      onExternalReject: async (errorMsg, meta) => {
        this.engine.state.lastError = errorMsg;
        this._notify('error', 'EXTERNAL_CSV_REJECTED', errorMsg, meta);
        await this._broadcastCurrentState();
      },
    });
  }

  // =========================================================================
  // Operator Commands (All validated in main process before mutation & save)
  // =========================================================================

  async selectTeam(key) {
    const res = this.engine.selectTeam(key);
    if (!res.ok) return res;
    const snapshot = await this._broadcastCurrentState();
    return { ok: true, snapshot };
  }

  async setActiveGame(game) {
    const res = this.engine.setActiveGame(game);
    if (!res.ok) {
      this._notify('error', 'GAME_SWITCH_ERROR', res.error);
      return res;
    }
    this._notify(
      'info',
      'GAME_MODE_SWITCHED',
      res.snapshot.lastEvent.message
    );
    return this._persistCurrentMatch(res.snapshot.lastEvent.message);
  }

  async updateBroadcastMeta(payload) {
    const res = this.engine.updateBroadcastMeta(payload);
    if (!res.ok) {
      this._notify('error', 'BROADCAST_META_ERROR', res.error);
      return res;
    }
    await this._writeCompanionMeta();
    this._notify(
      'info',
      'BROADCAST_META_UPDATED',
      res.snapshot.lastEvent.message
    );
    const snapshot = await this._broadcastCurrentState();
    return { ok: true, snapshot };
  }

  async incrementKill(key) {
    const res = this.engine.incrementKill(key);
    if (!res.ok) {
      this._notify('error', 'SCORE_VALIDATION', res.error);
      return res;
    }
    return this._persistCurrentMatch(res.snapshot.lastEvent.message);
  }

  async decrementKill(key) {
    const res = this.engine.decrementKill(key);
    if (!res.ok) {
      this._notify('warning', 'SCORE_VALIDATION', res.error);
      return res;
    }
    return this._persistCurrentMatch(res.snapshot.lastEvent.message);
  }

  async setPlacement(key, position) {
    const res = this.engine.setPlacement(key, position);
    if (!res.ok) {
      this._notify('error', 'PLACEMENT_REJECTED', res.error);
      return res;
    }
    if (res.cascaded && res.cascaded.length > 0) {
      this._notify('info', 'PLACEMENT_CASCADE', res.message, {
        cascaded: res.cascaded,
      });
    }
    return this._persistCurrentMatch(res.message);
  }

  async adjustPlacement(key, direction) {
    const res = this.engine.adjustPlacement(key, direction);
    if (!res.ok) {
      this._notify('warning', 'PLACEMENT_ADJUST', res.error);
      return res;
    }
    return this._persistCurrentMatch(res.message);
  }

  async updateTeamRoster(payload) {
    const res = this.engine.updateTeamRoster(payload);
    if (!res.ok) {
      this._notify('error', 'ROSTER_VALIDATION', res.error);
      return res;
    }
    this._notify(
      'success',
      'ROSTER_UPDATED',
      res.snapshot.lastEvent.message
    );
    return this._persistCurrentMatch(res.snapshot.lastEvent.message);
  }

  async undoLastAction() {
    const res = this.engine.undo();
    if (!res.ok) {
      this._notify('warning', 'UNDO_EMPTY', res.error);
      return res;
    }
    this._notify('info', 'UNDO_APPLIED', `Undid: ${res.undoneLabel}`);
    return this._persistCurrentMatch(`Undo: ${res.undoneLabel}`);
  }

  /**
   * Explicitly saves the current match to its CSV file on disk.
   */
  async saveMatch() {
    const res = await this._persistCurrentMatch('Manual match save');
    if (res.ok) {
      this._notify(
        'success',
        'CSV_SAVED',
        `Saved ${this.engine.state.matchId} to ${this.engine.state.activeFilePath}.`
      );
    }
    return res;
  }

  /**
   * Creates a new match from the corresponding game template (`template_bgmi.csv` or `template_ff.csv`)
   * without overwriting any existing match file.
   *
   * @param {{ game?: string, customRosterCsv?: string }} [options]
   */
  async createMatch(options = {}) {
    let targetGame;
    try {
      targetGame = normalizeGameId(
        options.game || this.engine.state.activeGame || 'BGMI'
      );
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid game mode.',
      };
    }

    await this.csvController.ensureDirectoryAndTemplates();

    let initialTeams = null;
    if (
      typeof options.customRosterCsv === 'string' &&
      options.customRosterCsv.trim()
    ) {
      const parsed = parseAndValidateMatchCsv(
        options.customRosterCsv,
        targetGame,
        this.config,
        { resetScores: true }
      );
      if (!parsed.ok || !parsed.teams) {
        this._notify('error', 'ROSTER_IMPORT_ERROR', parsed.error);
        return { ok: false, error: parsed.error };
      }
      initialTeams = parsed.teams;
    } else {
      const templateName =
        targetGame === 'FREE_FIRE'
          ? GAME_MODES.FREE_FIRE.templateFile
          : GAME_MODES.BGMI.templateFile;
      const templatePath = path.join(this.matchesDir, templateName);
      const loadedTemplate = await this.csvController.loadCsvFile(
        templatePath,
        targetGame,
        this.config,
        { resetScores: true }
      );
      initialTeams =
        loadedTemplate.ok && loadedTemplate.teams
          ? loadedTemplate.teams
          : buildDefaultTemplateTeams(targetGame);
    }

    const existing = await this.csvController.listMatchFiles();
    const allocated = await this.csvController.allocateUniqueMatchFile(
      targetGame,
      existing.length + 1
    );

    const writeRes = await this.csvController.saveTeamsToCsv(
      allocated.filePath,
      initialTeams
    );
    if (!writeRes.ok) {
      this._notify(
        'error',
        'MATCH_CREATE_ERROR',
        writeRes.error || 'Failed to persist new match file.'
      );
      return { ok: false, error: writeRes.error };
    }

    this.engine.replaceMatchState({
      activeGame: targetGame,
      matchId: allocated.matchId,
      roundNumber: allocated.roundNumber,
      matchStatus: MATCH_STATUS.LIVE,
      activeFilePath: this._toRelativeDisplayPath(allocated.filePath),
      teams: initialTeams,
      clearUndo: true,
      eventType: 'MATCH_CREATED',
      eventMessage: `Created ${allocated.matchId} (${targetGame}) at ${this._toRelativeDisplayPath(
        allocated.filePath
      )}.`,
    });
    this.engine.setSaveStatus(SAVE_STATUS.SAVED);

    this._bindWatcher(allocated.filePath);
    await this._writeCompanionMeta();

    this._notify(
      'success',
      'MATCH_CREATED',
      `Created and activated ${allocated.matchId} (${targetGame}).`
    );

    const snapshot = await this._broadcastCurrentState();
    return {
      ok: true,
      matchId: allocated.matchId,
      filePath: allocated.filePath,
      snapshot,
    };
  }

  /**
   * Loads an existing match CSV file from `matches/` by `matchId` or filename.
   * @param {string} matchIdentifier
   */
  async loadMatch(matchIdentifier) {
    if (!matchIdentifier || typeof matchIdentifier !== 'string') {
      return { ok: false, error: 'Match identifier is required.' };
    }

    const cleanName = path
      .basename(matchIdentifier.trim())
      .replace(/\.csv$/i, '');
    const targetPath = path.join(this.matchesDir, `${cleanName}.csv`);

    if (!fs.existsSync(targetPath)) {
      return {
        ok: false,
        error: `Match file "${cleanName}.csv" does not exist in matches/.`,
      };
    }

    const savedMeta = await this._readCompanionMeta();
    const metaEntry = savedMeta?.matches?.[cleanName];
    const detectedGame = metaEntry?.game
      ? normalizeGameId(metaEntry.game)
      : cleanName.toUpperCase().includes('_FF')
      ? 'FREE_FIRE'
      : 'BGMI';

    const loaded = await this.csvController.loadCsvFile(
      targetPath,
      detectedGame,
      this.config
    );
    if (!loaded.ok || !loaded.teams) {
      this._notify(
        'error',
        'MATCH_LOAD_ERROR',
        loaded.error || 'Failed to load match CSV.'
      );
      return { ok: false, error: loaded.error };
    }

    this.engine.replaceMatchState({
      activeGame: detectedGame,
      matchId: cleanName,
      roundNumber: metaEntry?.roundNumber || 1,
      matchStatus: metaEntry?.matchStatus || MATCH_STATUS.LIVE,
      activeFilePath: this._toRelativeDisplayPath(targetPath),
      teams: loaded.teams,
      clearUndo: true,
      eventType: 'MATCH_LOADED',
      eventMessage: `Loaded match ${cleanName} (${detectedGame}).`,
    });
    this.engine.setSaveStatus(SAVE_STATUS.SAVED);

    this._bindWatcher(targetPath);
    await this._writeCompanionMeta();

    this._notify('success', 'MATCH_LOADED', `Loaded match ${cleanName}.`);
    const snapshot = await this._broadcastCurrentState();
    return { ok: true, snapshot };
  }

  /**
   * Imports a validated CSV roster into the active match (or resets scores if requested).
   * Rejects malformed CSV, duplicate keys, or invalid values without corrupting state.
   *
   * @param {{ csvText: string, resetScores?: boolean }} payload
   */
  async importRoster(payload) {
    if (!payload || typeof payload.csvText !== 'string') {
      return { ok: false, error: 'CSV content string is required for import.' };
    }

    const parsed = parseAndValidateMatchCsv(
      payload.csvText,
      this.engine.state.activeGame,
      this.config,
      { resetScores: Boolean(payload.resetScores) }
    );

    if (!parsed.ok || !parsed.teams) {
      this._notify('error', 'CSV_IMPORT_REJECTED', parsed.error);
      return { ok: false, error: parsed.error };
    }

    const replaceRes = this.engine.replaceMatchState({
      activeGame: this.engine.state.activeGame,
      matchId: this.engine.state.matchId,
      roundNumber: this.engine.state.roundNumber,
      matchStatus: MATCH_STATUS.LIVE,
      activeFilePath: this.engine.state.activeFilePath,
      teams: parsed.teams,
      clearUndo: false,
      pushUndoLabel: `Before CSV roster import (${parsed.teams.length} teams)`,
      eventType: 'ROSTER_IMPORTED',
      eventMessage: `Imported ${parsed.teams.length} validated teams into ${this.engine.state.matchId}.`,
    });

    if (!replaceRes.ok) {
      return replaceRes;
    }

    this._notify(
      'success',
      'CSV_IMPORTED',
      `Imported and validated ${parsed.teams.length} teams.`
    );
    return this._persistCurrentMatch('Imported CSV roster');
  }

  /**
   * Exports the current authoritative match state as a 10-column RFC-4180 CSV string.
   */
  async exportMatch() {
    const csvText = serializeTeamsToCsv(this.engine.state.teams);
    const fileName = `${this.engine.state.matchId}.csv`;
    this._notify(
      'info',
      'CSV_EXPORTED',
      `Exported ${fileName} (${this.engine.state.teams.length} teams).`
    );
    return {
      ok: true,
      matchId: this.engine.state.matchId,
      fileName,
      csvText,
    };
  }

  /**
   * Creates the Next Round match file without overwriting the previous match.
   * Supports two explicit modes:
   * - 'CARRY_ROSTER': Preserves Keys, TeamNames, and Player1..Player4 from the current match,
   *                   resets pos, KP, PP, and TT to 0, preserves active game, and creates a new match file.
   * - 'COLD_START':   Loads a fresh roster (from custom CSV text if provided, or the game template),
   *                   validates all rows, resets match metrics, and creates a new match file.
   *
   * @param {{ mode: 'CARRY_ROSTER' | 'COLD_START', game?: string, customRosterCsv?: string }} options
   */
  async createNextRound(options = { mode: 'CARRY_ROSTER' }) {
    const mode =
      options?.mode === 'COLD_START' ? 'COLD_START' : 'CARRY_ROSTER';
    const targetGame = normalizeGameId(
      options?.game || this.engine.state.activeGame
    );

    // Ensure the current match is saved before progressing to the next round
    await this._persistCurrentMatch('Pre-round progression save');

    if (mode === 'COLD_START') {
      return this.createMatch({
        game: targetGame,
        customRosterCsv: options?.customRosterCsv,
      });
    }

    // CARRY_ROSTER mode: preserve Keys, TeamNames, and all 4 Player names; reset POS, KP, PP, TT to 0
    const carriedTeams = this.engine.state.teams.map((t) =>
      createCanonicalTeam({
        Key: t.Key,
        TeamName: t.TeamName,
        Player1: t.Player1,
        Player2: t.Player2,
        Player3: t.Player3,
        Player4: t.Player4,
        pos: 0,
        KP: 0,
        PP: 0,
        TT: 0,
      })
    );

    const nextRoundNum = (Number(this.engine.state.roundNumber) || 1) + 1;
    const allocated = await this.csvController.allocateUniqueMatchFile(
      targetGame,
      nextRoundNum
    );

    const writeRes = await this.csvController.saveTeamsToCsv(
      allocated.filePath,
      carriedTeams
    );
    if (!writeRes.ok) {
      this._notify(
        'error',
        'NEXT_ROUND_ERROR',
        writeRes.error || 'Failed to save next round CSV.'
      );
      return { ok: false, error: writeRes.error };
    }

    this.engine.replaceMatchState({
      activeGame: targetGame,
      matchId: allocated.matchId,
      roundNumber: allocated.roundNumber,
      matchStatus: MATCH_STATUS.LIVE,
      activeFilePath: this._toRelativeDisplayPath(allocated.filePath),
      teams: carriedTeams,
      clearUndo: true,
      eventType: 'NEXT_ROUND_CREATED',
      eventMessage: `Started Round ${allocated.roundNumber} (${allocated.matchId}) carrying ${carriedTeams.length} team rosters.`,
    });
    this.engine.setSaveStatus(SAVE_STATUS.SAVED);

    this._bindWatcher(allocated.filePath);
    await this._writeCompanionMeta();

    this._notify(
      'success',
      'NEXT_ROUND',
      `Created ${allocated.matchId} (Carry Roster · scores reset to 0).`
    );

    const snapshot = await this._broadcastCurrentState();
    return {
      ok: true,
      mode,
      matchId: allocated.matchId,
      filePath: allocated.filePath,
      snapshot,
    };
  }

  /**
   * Marks the current match as COMPLETED (reversible via reopenMatch or Undo).
   */
  async completeMatch() {
    const res = this.engine.setMatchLifecycleStatus(MATCH_STATUS.COMPLETED);
    if (!res.ok) return res;
    this._notify(
      'success',
      'MATCH_COMPLETED',
      `Match ${this.engine.state.matchId} marked as COMPLETED.`
    );
    return this._persistCurrentMatch('Match marked COMPLETED');
  }

  /**
   * Reopens a COMPLETED match back to LIVE scoring.
   */
  async reopenMatch() {
    const res = this.engine.setMatchLifecycleStatus(MATCH_STATUS.LIVE);
    if (!res.ok) return res;
    this._notify(
      'info',
      'MATCH_REOPENED',
      `Match ${this.engine.state.matchId} reopened to LIVE scoring.`
    );
    return this._persistCurrentMatch('Match reopened to LIVE');
  }

  /**
   * Cleans up file watchers when shutting down.
   */
  dispose() {
    this.csvController.stopWatching();
  }

  // =========================================================================
  // Internal Metadata Helpers
  // =========================================================================

  _toRelativeDisplayPath(absPath) {
    return `matches/${path.basename(absPath)}`;
  }

  async _readCompanionMeta() {
    try {
      if (!fs.existsSync(this.metaFilePath)) return {};
      const raw = await fs.promises.readFile(this.metaFilePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async _writeCompanionMeta() {
    try {
      const current = await this._readCompanionMeta();
      const matchId = this.engine.state.matchId;
      const updated = {
        ...current,
        activeMatchId: matchId,
        tournamentTitle: this.engine.state.tournamentTitle,
        stageLabel: this.engine.state.stageLabel,
        overlayViewMode: this.engine.state.overlayViewMode,
        updatedAt: new Date().toISOString(),
        matches: {
          ...(current.matches || {}),
          [matchId]: {
            matchId,
            game: this.engine.state.activeGame,
            roundNumber: this.engine.state.roundNumber,
            matchStatus: this.engine.state.matchStatus,
            filePath: this.engine.state.activeFilePath,
            updatedAt: new Date().toISOString(),
          },
        },
      };
      await this.csvController.atomicWriter.writeAtomically(
        this.metaFilePath,
        JSON.stringify(updated, null, 2)
      );
    } catch {
      // Non-fatal metadata write error
    }
  }
}
