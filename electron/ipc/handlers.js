/**
 * Electron Main Process IPC Handlers
 * Phase 1 & Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Responsibilities:
 * - Preserve all Phase 1 window & diagnostic IPC handlers
 * - Own the single authoritative MatchManager instance in the main process
 * - Validate incoming renderer commands and forward to MatchManager
 * - Broadcast authoritative match state and notifications to both Control Deck and Overlay Viewport
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPC_CHANNELS,
  OVERLAY_CONNECTION_STATE,
  WINDOW_DIMENSIONS,
} from '../../src/shared/constants.js';
import {
  createEventId,
  validateOverlayBounds,
  validateTestEventPayload,
} from '../../src/shared/ipcValidator.js';
import { MatchManager } from '../match/match-manager.js';
import {
  DEFAULT_APP_ROOT,
  resolveBundledTemplatesDir,
  resolveTournamentConfigPath,
  resolveWritableMatchesDir,
} from '../utils/runtime-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {MatchManager | null} */
let sharedMatchManager = null;

/**
 * Safely checks whether a BrowserWindow instance and its WebContents are alive.
 * @param {import('electron').BrowserWindow | null | undefined} win
 * @returns {boolean}
 */
export function isWindowUsable(win) {
  return Boolean(
    win &&
      typeof win.isDestroyed === 'function' &&
      !win.isDestroyed() &&
      win.webContents &&
      !win.webContents.isDestroyed()
  );
}

/**
 * Computes the current connection snapshot for the Control Deck and Overlay.
 */
export function buildConnectionSnapshot(windowManager) {
  const controlWin = windowManager.getControlWindow();
  const overlayWin = windowManager.getOverlayWindow();
  const overlayAlive = isWindowUsable(overlayWin);
  const overlayVisible = overlayAlive ? overlayWin.isVisible() : false;
  const bounds = overlayAlive
    ? overlayWin.getBounds()
    : {
        x: 80,
        y: 80,
        width: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.width,
        height: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.height,
      };

  let status = OVERLAY_CONNECTION_STATE.DISCONNECTED;
  if (overlayAlive) {
    status = overlayVisible
      ? OVERLAY_CONNECTION_STATE.CONNECTED
      : OVERLAY_CONNECTION_STATE.HIDDEN;
  }

  return {
    ok: true,
    runtime: 'electron-ipc',
    status,
    mainProcessReady: true,
    controlDeckAlive: isWindowUsable(controlWin),
    overlayAlive,
    overlayVisible,
    overlayBounds: bounds,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Emits a connection status update to both windows if usable.
 */
export function broadcastConnectionStatus(windowManager, reason = 'STATE_SYNC') {
  const snapshot = {
    ...buildConnectionSnapshot(windowManager),
    reason,
    eventId: createEventId('CONN'),
  };

  const controlWin = windowManager.getControlWindow();
  if (isWindowUsable(controlWin)) {
    controlWin.webContents.send(
      IPC_CHANNELS.CONNECTION_STATUS_CHANGED,
      snapshot
    );
  }

  const overlayWin = windowManager.getOverlayWindow();
  if (isWindowUsable(overlayWin)) {
    overlayWin.webContents.send(
      IPC_CHANNELS.CONNECTION_STATUS_CHANGED,
      snapshot
    );
  }

  return snapshot;
}

/**
 * Emits an authoritative match state update to both Control Deck and Overlay Viewport.
 */
export function broadcastMatchStateToWindows(windowManager, matchSnapshot) {
  const controlWin = windowManager.getControlWindow();
  if (isWindowUsable(controlWin)) {
    controlWin.webContents.send(IPC_CHANNELS.MATCH_STATE_UPDATED, matchSnapshot);
  }

  const overlayWin = windowManager.getOverlayWindow();
  if (isWindowUsable(overlayWin)) {
    overlayWin.webContents.send(IPC_CHANNELS.MATCH_STATE_UPDATED, matchSnapshot);
  }
}

/**
 * Emits an operational notification to both windows.
 */
export function broadcastMatchNotificationToWindows(windowManager, notification) {
  const controlWin = windowManager.getControlWindow();
  if (isWindowUsable(controlWin)) {
    controlWin.webContents.send(IPC_CHANNELS.MATCH_NOTIFICATION, notification);
  }

  const overlayWin = windowManager.getOverlayWindow();
  if (isWindowUsable(overlayWin)) {
    overlayWin.webContents.send(IPC_CHANNELS.MATCH_NOTIFICATION, notification);
  }
}

/**
 * Reads tournament_config.json safely in the main process, supporting both
 * userData overrides and packaged extraResources.
 */
export function loadTournamentConfigSafe(runtimeOpts = {}) {
  try {
    const configPath = resolveTournamentConfigPath(runtimeOpts);
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      config: parsed,
      configPath,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to read tournament_config.json',
      loadedAt: new Date().toISOString(),
    };
  }
}

/**
 * Gets or initializes the singleton MatchManager in the main process.
 */
export function getOrCreateMatchManager(windowManager, options = {}) {
  if (!sharedMatchManager) {
    const configRes = loadTournamentConfigSafe(options);
    const matchesDir = resolveWritableMatchesDir({
      customMatchesDir: options.matchesDir,
      isPackaged: options.isPackaged,
      userDataPath: options.userDataPath,
    });
    const bundledTemplatesDir = resolveBundledTemplatesDir({
      isPackaged: options.isPackaged,
      resourcesPath: options.resourcesPath,
    });
    const bundledConfigPath = resolveTournamentConfigPath({
      isPackaged: options.isPackaged,
      resourcesPath: options.resourcesPath,
    });

    sharedMatchManager = new MatchManager({
      matchesDir,
      bundledTemplatesDir,
      bundledConfigPath,
      userDataPath: options.userDataPath,
      legacyMatchesDirs: [path.join(DEFAULT_APP_ROOT, 'matches')],
      config: configRes.ok ? configRes.config : null,
      onStateChange: (snapshot) => {
        if (windowManager) {
          broadcastMatchStateToWindows(windowManager, snapshot);
        }
      },
      onNotification: (notification) => {
        if (windowManager) {
          broadcastMatchNotificationToWindows(windowManager, notification);
        }
      },
    });
  }
  return sharedMatchManager;
}

/**
 * Registers all Phase 1 and Phase 2 IPC handlers idempotently.
 */
export function registerIpcHandlers(ipcMain, windowManager, options = {}) {
  const allChannels = Object.values(IPC_CHANNELS);
  for (const channel of allChannels) {
    ipcMain.removeHandler(channel);
  }

  const matchManager =
    options.matchManager || getOrCreateMatchManager(windowManager, options);

  // =========================================================================
  // Phase 1 Handlers (Preserved)
  // =========================================================================

  ipcMain.handle(IPC_CHANNELS.GET_STATUS, async () => {
    return buildConnectionSnapshot(windowManager);
  });

  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, async () => {
    return loadTournamentConfigSafe(options);
  });

  ipcMain.handle(IPC_CHANNELS.SEND_TEST_EVENT, async (_event, payload) => {
    const validation = validateTestEventPayload(payload);
    if (!validation.valid || !validation.sanitized) {
      return {
        ok: false,
        error: validation.error || 'Invalid test event payload.',
        timestamp: new Date().toISOString(),
      };
    }

    const overlayWin = windowManager.getOverlayWindow();
    if (!isWindowUsable(overlayWin)) {
      return {
        ok: false,
        error:
          'Broadcast Overlay Viewport is currently closed or disconnected. Reopen the overlay to deliver events.',
        eventId: validation.sanitized.eventId,
        deliveredToOverlay: false,
        overlayStatus: OVERLAY_CONNECTION_STATE.DISCONNECTED,
        timestamp: new Date().toISOString(),
      };
    }

    const enrichedEvent = {
      ...validation.sanitized,
      forwardedByMainAt: new Date().toISOString(),
      overlayVisible: overlayWin.isVisible(),
    };

    overlayWin.webContents.send(IPC_CHANNELS.OVERLAY_TEST_EVENT, enrichedEvent);

    return {
      ok: true,
      eventId: enrichedEvent.eventId,
      deliveredToOverlay: true,
      overlayVisible: overlayWin.isVisible(),
      overlayStatus: overlayWin.isVisible()
        ? OVERLAY_CONNECTION_STATE.CONNECTED
        : OVERLAY_CONNECTION_STATE.HIDDEN,
      event: enrichedEvent,
      timestamp: enrichedEvent.forwardedByMainAt,
    };
  });

  ipcMain.handle(IPC_CHANNELS.ACKNOWLEDGE_TEST_EVENT, async (_event, ackPayload) => {
    const safeAck = {
      ok: true,
      ackId: createEventId('ACK'),
      eventId:
        ackPayload && typeof ackPayload.eventId === 'string'
          ? ackPayload.eventId
          : 'UNKNOWN',
      receivedAt: new Date().toISOString(),
      overlayRendererReady: true,
    };

    const controlWin = windowManager.getControlWindow();
    if (isWindowUsable(controlWin)) {
      controlWin.webContents.send(IPC_CHANNELS.TEST_EVENT_ACK, safeAck);
    }

    return safeAck;
  });

  ipcMain.handle(IPC_CHANNELS.TOGGLE_OVERLAY, async (_event, toggleOpts) => {
    const overlayWin = windowManager.getOverlayWindow();
    if (!isWindowUsable(overlayWin)) {
      return {
        ok: false,
        error: 'Overlay window is closed. Click Reopen Overlay first.',
        status: OVERLAY_CONNECTION_STATE.DISCONNECTED,
      };
    }

    const explicitShow =
      toggleOpts && typeof toggleOpts.show === 'boolean'
        ? toggleOpts.show
        : !overlayWin.isVisible();

    if (explicitShow) {
      overlayWin.showInactive();
    } else {
      overlayWin.hide();
    }

    const snapshot = broadcastConnectionStatus(
      windowManager,
      explicitShow ? 'OVERLAY_SHOWN' : 'OVERLAY_HIDDEN'
    );

    return {
      ok: true,
      overlayVisible: overlayWin.isVisible(),
      status: snapshot.status,
      snapshot,
    };
  });

  ipcMain.handle(IPC_CHANNELS.CLOSE_OVERLAY, async () => {
    const overlayWin = windowManager.getOverlayWindow();
    if (isWindowUsable(overlayWin)) {
      overlayWin.close();
    }
    const snapshot = broadcastConnectionStatus(
      windowManager,
      'OVERLAY_CLOSED_BY_OPERATOR'
    );
    return {
      ok: true,
      status: OVERLAY_CONNECTION_STATE.DISCONNECTED,
      snapshot,
    };
  });

  ipcMain.handle(IPC_CHANNELS.REOPEN_OVERLAY, async () => {
    const overlayWin = windowManager.ensureOverlayWindow();
    const snapshot = broadcastConnectionStatus(
      windowManager,
      'OVERLAY_REOPENED_BY_OPERATOR'
    );
    return {
      ok: isWindowUsable(overlayWin),
      status: snapshot.status,
      snapshot,
    };
  });

  ipcMain.handle(IPC_CHANNELS.SET_OVERLAY_BOUNDS, async (_event, bounds) => {
    const validation = validateOverlayBounds(bounds);
    if (!validation.valid || !validation.sanitized) {
      return {
        ok: false,
        error: validation.error || 'Invalid bounds payload.',
      };
    }

    const overlayWin = windowManager.getOverlayWindow();
    if (!isWindowUsable(overlayWin)) {
      return {
        ok: false,
        error: 'Overlay window is closed.',
      };
    }

    const currentBounds = overlayWin.getBounds();
    const nextBounds = {
      ...currentBounds,
      ...validation.sanitized,
    };
    overlayWin.setBounds(nextBounds);

    const snapshot = broadcastConnectionStatus(
      windowManager,
      'OVERLAY_BOUNDS_UPDATED'
    );

    return {
      ok: true,
      overlayBounds: overlayWin.getBounds(),
      snapshot,
    };
  });

  // =========================================================================
  // Phase 2 Authoritative Match Engine & CSV Handlers
  // =========================================================================

  ipcMain.handle(IPC_CHANNELS.GET_MATCH_STATE, async () => {
    const snapshot = await matchManager.initialize();
    return { ok: true, snapshot };
  });

  ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_GAME, async (_event, payload) => {
    const game = typeof payload === 'string' ? payload : payload?.game;
    return matchManager.setActiveGame(game);
  });

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_BROADCAST_META,
    async (_event, payload) => {
      return matchManager.updateBroadcastMeta(payload || {});
    }
  );

  ipcMain.handle(IPC_CHANNELS.SELECT_TEAM, async (_event, payload) => {
    const key =
      typeof payload === 'string' || payload === null
        ? payload
        : payload?.key ?? null;
    return matchManager.selectTeam(key);
  });

  ipcMain.handle(IPC_CHANNELS.INCREMENT_KILL, async (_event, payload) => {
    const key = typeof payload === 'string' ? payload : payload?.key;
    return matchManager.incrementKill(key);
  });

  ipcMain.handle(IPC_CHANNELS.DECREMENT_KILL, async (_event, payload) => {
    const key = typeof payload === 'string' ? payload : payload?.key;
    return matchManager.decrementKill(key);
  });

  ipcMain.handle(IPC_CHANNELS.SET_PLACEMENT, async (_event, payload) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'Placement payload must be an object.' };
    }
    return matchManager.setPlacement(payload.key, payload.position);
  });

  ipcMain.handle(IPC_CHANNELS.ADJUST_PLACEMENT, async (_event, payload) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'Adjust placement payload must be an object.' };
    }
    return matchManager.adjustPlacement(payload.key, payload.direction);
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_TEAM_ROSTER, async (_event, payload) => {
    return matchManager.updateTeamRoster(payload);
  });

  ipcMain.handle(IPC_CHANNELS.UNDO_LAST_ACTION, async () => {
    return matchManager.undoLastAction();
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_MATCH, async (_event, payload) => {
    return matchManager.createMatch(payload || {});
  });

  ipcMain.handle(IPC_CHANNELS.LOAD_MATCH, async (_event, payload) => {
    const matchId =
      typeof payload === 'string' ? payload : payload?.matchId || '';
    return matchManager.loadMatch(matchId);
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_MATCH, async () => {
    return matchManager.saveMatch();
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_ROSTER, async (_event, payload) => {
    return matchManager.importRoster(payload);
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_MATCH, async () => {
    return matchManager.exportMatch();
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_NEXT_ROUND, async (_event, payload) => {
    return matchManager.createNextRound(payload);
  });

  ipcMain.handle(IPC_CHANNELS.COMPLETE_MATCH, async () => {
    return matchManager.completeMatch();
  });

  ipcMain.handle(IPC_CHANNELS.REOPEN_MATCH, async () => {
    return matchManager.reopenMatch();
  });

  ipcMain.handle(IPC_CHANNELS.LIST_MATCHES, async () => {
    const matches = await matchManager.csvController.listMatchFiles();
    return { ok: true, matches };
  });
}
