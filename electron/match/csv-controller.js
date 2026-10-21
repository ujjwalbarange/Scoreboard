/**
 * CSV Persistence & External File Watcher Controller
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Responsibilities:
 * - Manage `matches/` directory and ensure `template_bgmi.csv` and `template_ff.csv` exist
 * - Load, save, import, and export 10-column CSV files via AtomicFileWriter
 * - Watch only the active match file using fs.watch with debouncing
 * - Ignore self-writes to prevent write-watch feedback loops
 * - Detect conflicts when an external edit occurs while an internal save is pending
 * - Validate external CSV edits completely before accepting; never overwrite valid
 *   in-memory state with malformed external data
 * - Clean up old watchers when switching matches or shutting down
 */

import fs from 'node:fs';
import path from 'node:path';
import { GAME_MODES } from '../../src/shared/constants.js';
import { buildDefaultTemplateTeams } from '../../src/shared/match-types.js';
import { AtomicFileWriter } from '../utils/atomic-write.js';
import {
  parseAndValidateMatchCsv,
  serializeTeamsToCsv,
} from '../utils/validation.js';
import { normalizeGameId } from './scoring-engine.js';

export class CsvController {
  /**
   * @param {string} matchesDir
   * @param {{ debounceMs?: number }} [options]
   */
  constructor(matchesDir, options = {}) {
    this.matchesDir = path.resolve(matchesDir);
    this.debounceMs = options.debounceMs ?? 120;
    this.atomicWriter = new AtomicFileWriter();

    /** @type {fs.FSWatcher | null} */
    this.activeWatcher = null;
    /** @type {string | null} */
    this.watchedFilePath = null;
    /** @type {NodeJS.Timeout | null} */
    this.watchDebounceTimer = null;

    // Track last self-written content and timestamp per file to suppress self-triggering watch events
    /** @type {Map<string, { content: string, timestampMs: number }>} */
    this.lastSelfWrite = new Map();
  }

  /**
   * Ensures `matches/`, `template_bgmi.csv`, and `template_ff.csv` exist on disk.
   */
  async ensureDirectoryAndTemplates() {
    await fs.promises.mkdir(this.matchesDir, { recursive: true });

    const bgmiTemplatePath = path.join(
      this.matchesDir,
      GAME_MODES.BGMI.templateFile
    );
    if (!fs.existsSync(bgmiTemplatePath)) {
      const bgmiCsv = serializeTeamsToCsv(buildDefaultTemplateTeams('BGMI'));
      await this.atomicWriter.writeAtomically(bgmiTemplatePath, bgmiCsv);
    }

    const ffTemplatePath = path.join(
      this.matchesDir,
      GAME_MODES.FREE_FIRE.templateFile
    );
    if (!fs.existsSync(ffTemplatePath)) {
      const ffCsv = serializeTeamsToCsv(buildDefaultTemplateTeams('FREE_FIRE'));
      await this.atomicWriter.writeAtomically(ffTemplatePath, ffCsv);
    }
  }

  /**
   * Generates a unique match filename in `matches/` without ever overwriting an existing file.
   * Format: Match_01_BGMI.csv, Match_02_BGMI.csv, Match_01_FF.csv, etc.
   *
   * @param {string} game
   * @param {number} [preferredRound=1]
   * @returns {Promise<{ matchId: string, fileName: string, filePath: string, roundNumber: number }>}
   */
  async allocateUniqueMatchFile(game = 'BGMI', preferredRound = 1) {
    await this.ensureDirectoryAndTemplates();
    const normGame = normalizeGameId(game);
    const fileTag =
      normGame === 'FREE_FIRE'
        ? GAME_MODES.FREE_FIRE.fileTag
        : GAME_MODES.BGMI.fileTag;

    let round = Math.max(1, Math.floor(Number(preferredRound) || 1));
    while (round < 1000) {
      const padded = String(round).padStart(2, '0');
      const fileName = `Match_${padded}_${fileTag}.csv`;
      const filePath = path.join(this.matchesDir, fileName);
      if (!fs.existsSync(filePath)) {
        return {
          matchId: `Match_${padded}_${fileTag}`,
          fileName,
          filePath,
          roundNumber: round,
        };
      }
      round += 1;
    }

    const fallbackName = `Match_${Date.now()}_${fileTag}.csv`;
    return {
      matchId: fallbackName.replace(/\.csv$/i, ''),
      fileName: fallbackName,
      filePath: path.join(this.matchesDir, fallbackName),
      roundNumber: preferredRound,
    };
  }

  /**
   * Lists all available match CSV files inside `matches/` (excluding templates).
   */
  async listMatchFiles() {
    await this.ensureDirectoryAndTemplates();
    const entries = await fs.promises.readdir(this.matchesDir, {
      withFileTypes: true,
    });

    const matches = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.csv')) continue;
      if (entry.name.startsWith('.tmp-')) continue;
      if (entry.name.startsWith('template_')) continue;

      const fullPath = path.join(this.matchesDir, entry.name);
      const stat = await fs.promises.stat(fullPath);
      const upper = entry.name.toUpperCase();
      const detectedGame =
        upper.includes('_FF') || upper.includes('FREE_FIRE')
          ? 'FREE_FIRE'
          : 'BGMI';

      matches.push({
        matchId: entry.name.replace(/\.csv$/i, ''),
        fileName: entry.name,
        filePath: fullPath,
        game: detectedGame,
        updatedAt: stat.mtime.toISOString(),
      });
    }

    matches.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return matches;
  }

  /**
   * Loads and validates a match or template CSV file from disk.
   *
   * @param {string} targetFilePath
   * @param {string} game
   * @param {object | null} config
   * @param {{ resetScores?: boolean }} [options]
   */
  async loadCsvFile(targetFilePath, game = 'BGMI', config = null, options = {}) {
    const resolved = path.resolve(targetFilePath);
    if (!fs.existsSync(resolved)) {
      return {
        ok: false,
        error: `CSV file not found: ${path.basename(resolved)}`,
      };
    }

    try {
      const rawText = await fs.promises.readFile(resolved, 'utf-8');
      const parsed = parseAndValidateMatchCsv(rawText, game, config, options);
      if (!parsed.ok || !parsed.teams) {
        return {
          ok: false,
          error: parsed.error || 'Malformed CSV content.',
        };
      }

      return {
        ok: true,
        filePath: resolved,
        fileName: path.basename(resolved),
        teams: parsed.teams,
        rawText,
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to read CSV file.',
      };
    }
  }

  /**
   * Saves the authoritative teams array to `targetFilePath` atomically and serialized.
   * Records self-write fingerprint so the file watcher ignores our own save.
   *
   * @param {string} targetFilePath
   * @param {Array<object>} teams
   */
  async saveTeamsToCsv(targetFilePath, teams) {
    const resolved = path.resolve(targetFilePath);
    const csvContent = serializeTeamsToCsv(teams);

    this.lastSelfWrite.set(resolved, {
      content: csvContent,
      timestampMs: Date.now(),
    });

    const writeResult = await this.atomicWriter.writeAtomically(
      resolved,
      csvContent
    );

    if (writeResult.ok) {
      this.lastSelfWrite.set(resolved, {
        content: csvContent,
        timestampMs: Date.now(),
      });
    }

    return {
      ...writeResult,
      csvContent,
    };
  }

  /**
   * Starts watching the active match file for external modifications.
   * Automatically closes any previous watcher first.
   *
   * @param {string} filePathToWatch
   * @param {{
   *   getGame: () => string,
   *   getConfig: () => object | null,
   *   getCurrentCsvContent: () => string,
   *   onExternalAccept: (teams: Array<object>, meta: object) => void,
   *   onExternalReject: (error: string, meta: object) => void
   * }} callbacks
   */
  watchActiveMatchFile(filePathToWatch, callbacks) {
    this.stopWatching();

    const resolved = path.resolve(filePathToWatch);
    if (!fs.existsSync(resolved)) {
      return;
    }

    this.watchedFilePath = resolved;
    const watchDir = path.dirname(resolved);
    const watchTargetBase = path.basename(resolved);

    try {
      // Watch the parent directory filtering for the active match filename so atomic
      // renames by external editors (like VS Code, Excel, LibreOffice) continue to trigger events.
      this.activeWatcher = fs.watch(
        watchDir,
        { persistent: false },
        (_eventType, changedFilename) => {
          if (
            changedFilename &&
            changedFilename !== watchTargetBase &&
            !changedFilename.endsWith(watchTargetBase)
          ) {
            return;
          }

          if (this.watchDebounceTimer) {
            clearTimeout(this.watchDebounceTimer);
          }

          this.watchDebounceTimer = setTimeout(() => {
            this._handleDebouncedFileChange(resolved, callbacks);
          }, this.debounceMs);
        }
      );

      this.activeWatcher.on('error', () => {
        // Safely ignore OS watcher errors without crashing main process
      });
    } catch {
      // Fallback if fs.watch fails on restricted filesystems
    }
  }

  /**
   * Internal handler invoked after external filesystem events settle.
   */
  async _handleDebouncedFileChange(resolvedPath, callbacks) {
    if (this.watchedFilePath !== resolvedPath) return;

    // 1. Conflict check: if an internal application save is currently in flight
    if (this.atomicWriter.isWriteInFlight(resolvedPath)) {
      callbacks.onExternalReject(
        'External CSV modification detected while an application save was in flight. Retained authoritative in-memory state to prevent data loss.',
        {
          reason: 'SAVE_CONFLICT',
          filePath: resolvedPath,
          timestamp: new Date().toISOString(),
        }
      );
      return;
    }

    if (!fs.existsSync(resolvedPath)) {
      return;
    }

    let diskContent = '';
    try {
      diskContent = await fs.promises.readFile(resolvedPath, 'utf-8');
    } catch {
      return;
    }

    // Ignore empty partial writes while an external editor is mid-truncate
    if (!diskContent.trim()) {
      return;
    }

    // 2. Self-write suppression check
    const lastSelf = this.lastSelfWrite.get(resolvedPath);
    if (lastSelf) {
      if (lastSelf.content === diskContent) {
        return;
      }
      if (
        Date.now() - lastSelf.timestampMs < 250 &&
        diskContent === callbacks.getCurrentCsvContent()
      ) {
        return;
      }
    }

    // Also ignore if disk content is identical to current serialized in-memory state
    if (diskContent === callbacks.getCurrentCsvContent()) {
      return;
    }

    // 3. Validate external CSV completely before accepting
    const validation = parseAndValidateMatchCsv(
      diskContent,
      callbacks.getGame(),
      callbacks.getConfig()
    );

    if (!validation.ok || !validation.teams) {
      callbacks.onExternalReject(
        `Rejected invalid external CSV edit in ${path.basename(
          resolvedPath
        )}: ${validation.error}`,
        {
          reason: 'VALIDATION_FAILED',
          filePath: resolvedPath,
          timestamp: new Date().toISOString(),
        }
      );
      return;
    }

    // Update last known content so we don't re-trigger on the same external content
    this.lastSelfWrite.set(resolvedPath, {
      content: diskContent,
      timestampMs: Date.now(),
    });

    callbacks.onExternalAccept(validation.teams, {
      reason: 'EXTERNAL_CSV_SYNC',
      filePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Stops and cleans up any active file watcher and pending debounce timer.
   */
  stopWatching() {
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }
    if (this.activeWatcher) {
      try {
        this.activeWatcher.close();
      } catch {
        // Ignore close errors
      }
      this.activeWatcher = null;
    }
    this.watchedFilePath = null;
  }
}
