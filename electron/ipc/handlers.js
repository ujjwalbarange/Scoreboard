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
 * Computes the current window state of the Operator Control Deck window.
 */
export function buildControlWindowState(controlWin) {
  if (!isWindowUsable(controlWin)) {
    return {
      isMaximized: false,
      isFullScreen: false,
      isMinimized: false,
      resizable: true,
      bounds: {
        x: 0,
        y: 0,
        width: WINDOW_DIMENSIONS.CONTROL_DECK.width,
        height: WINDOW_DIMENSIONS.CONTROL_DECK.height,
      },
    };
  }

  return {
    isMaximized:
      typeof controlWin.isMaximized === 'function'
        ? Boolean(controlWin.isMaximized())
        : false,
    isFullScreen:
      typeof controlWin.isFullScreen === 'function'
        ? Boolean(controlWin.isFullScreen())
        : false,
    isMinimized:
      typeof controlWin.isMinimized === 'function'
        ? Boolean(controlWin.isMinimized())
        : false,
    resizable:
      typeof controlWin.isResizable === 'function'
        ? Boolean(controlWin.isResizable())
        : true,
    bounds:
      typeof controlWin.getBounds === 'function'
        ? controlWin.getBounds()
        : {
            x: 0,
            y: 0,
            width: WINDOW_DIMENSIONS.CONTROL_DECK.width,
            height: WINDOW_DIMENSIONS.CONTROL_DECK.height,
          },
  };
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
    controlWindowState: buildControlWindowState(controlWin),
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
  // Phase 3 Controller Window Controls (Minimize, Maximize/Restore, Fullscreen, Close)
  // =========================================================================

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, async () => {
    const controlWin = windowManager.getControlWindow();
    return {
      ok: true,
      windowState: buildControlWindowState(controlWin),
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    const controlWin = windowManager.getControlWindow();
    if (!isWindowUsable(controlWin)) {
      return { ok: false, error: 'Controller window is not available.' };
    }
    if (typeof controlWin.minimize === 'function') {
      controlWin.minimize();
    }
    const snapshot = broadcastConnectionStatus(
      windowManager,
      'CONTROL_WINDOW_MINIMIZED'
    );
    return {
      ok: true,
      windowState: snapshot.controlWindowState,
      snapshot,
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE, async () => {
    const controlWin = windowManager.getControlWindow();
    if (!isWindowUsable(controlWin)) {
      return { ok: false, error: 'Controller window is not available.' };
    }

    if (
      typeof controlWin.isFullScreen === 'function' &&
      controlWin.isFullScreen() &&
      typeof controlWin.setFullScreen === 'function'
    ) {
      controlWin.setFullScreen(false);
    } else if (
      typeof controlWin.isMaximized === 'function' &&
      controlWin.isMaximized()
    ) {
      if (typeof controlWin.unmaximize === 'function') {
        controlWin.unmaximize();
      } else if (typeof controlWin.restore === 'function') {
        controlWin.restore();
      }
    } else if (typeof controlWin.maximize === 'function') {
      controlWin.maximize();
    }

    const snapshot = broadcastConnectionStatus(
      windowManager,
      'CONTROL_WINDOW_MAXIMIZE_TOGGLED'
    );
    return {
      ok: true,
      windowState: snapshot.controlWindowState,
      snapshot,
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_FULLSCREEN_TOGGLE, async () => {
    const controlWin = windowManager.getControlWindow();
    if (!isWindowUsable(controlWin)) {
      return { ok: false, error: 'Controller window is not available.' };
    }

    const currentlyFull =
      typeof controlWin.isFullScreen === 'function'
        ? Boolean(controlWin.isFullScreen())
        : false;
    if (typeof controlWin.setFullScreen === 'function') {
      controlWin.setFullScreen(!currentlyFull);
    }

    const snapshot = broadcastConnectionStatus(
      windowManager,
      'CONTROL_WINDOW_FULLSCREEN_TOGGLED'
    );
    return {
      ok: true,
      windowState: snapshot.controlWindowState,
      snapshot,
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    const controlWin = windowManager.getControlWindow();
    if (!isWindowUsable(controlWin)) {
      return { ok: false, error: 'Controller window is not available.' };
    }
    if (typeof controlWin.close === 'function') {
      controlWin.close();
    }
    return { ok: true };
  });

  // =========================================================================
  // Phase 3 Gameplay Window / Desktop Capture Handlers
  // =========================================================================

  ipcMain.handle(IPC_CHANNELS.GET_CAPTURE_STATUS, async () => {
    return getDesktopCapturePermissionStatus(
      options.systemPreferences,
      options.desktopCapturer
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.GET_CAPTURE_SOURCES,
    async (_event, queryOpts) => {
      return listDesktopCaptureSources(
        options.desktopCapturer,
        options.systemPreferences,
        queryOpts
      );
    }
  );

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

/**
 * Checks OS screen recording permission status safely across platforms.
 */
export function getDesktopCapturePermissionStatus(
  systemPreferencesApi,
  desktopCapturerApi
) {
  const hasDesktopCapturer = Boolean(
    desktopCapturerApi && typeof desktopCapturerApi.getSources === 'function'
  );
  let permissionStatus = 'granted';
  try {
    if (
      systemPreferencesApi &&
      typeof systemPreferencesApi.getMediaAccessStatus === 'function'
    ) {
      const status = systemPreferencesApi.getMediaAccessStatus('screen');
      if (typeof status === 'string' && status.trim()) {
        permissionStatus = status.trim().toLowerCase();
      }
    }
  } catch {
    permissionStatus = 'unknown';
  }

  const denied =
    permissionStatus === 'denied' || permissionStatus === 'restricted';

  return {
    ok: !denied && hasDesktopCapturer,
    runtime: hasDesktopCapturer ? 'electron-desktop-capturer' : 'browser-media',
    hasDesktopCapturer,
    permissionStatus,
    canCapture: !denied,
    platform: process.platform,
    message: denied
      ? 'OS Screen Recording permission is denied. Enable Screen Recording permission for this application in OS System Settings, then click Refresh Sources.'
      : hasDesktopCapturer
      ? 'Electron desktopCapturer is ready to enumerate application windows and displays.'
      : 'Running outside Electron main process; use standard browser getDisplayMedia screen/window sharing.',
  };
}

/**
 * Enumerates available desktop windows and displays using Electron desktopCapturer,
 * returning sanitized metadata, thumbnails, and availability diagnostics.
 */
export async function listDesktopCaptureSources(
  desktopCapturerApi,
  systemPreferencesApi,
  queryOpts = {}
) {
  const statusReport = getDesktopCapturePermissionStatus(
    systemPreferencesApi,
    desktopCapturerApi
  );

  if (
    statusReport.permissionStatus === 'denied' ||
    statusReport.permissionStatus === 'restricted'
  ) {
    return {
      ok: false,
      permissionStatus: statusReport.permissionStatus,
      runtime: statusReport.runtime,
      error: statusReport.message,
      sources: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  if (!statusReport.hasDesktopCapturer) {
    return {
      ok: false,
      permissionStatus: statusReport.permissionStatus,
      runtime: 'browser-media',
      error:
        'Electron desktopCapturer is not active in this runtime. Use the Browser Window / Screen Share picker (getDisplayMedia) to select a live gameplay window or display.',
      sources: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const thumbWidth =
      typeof queryOpts?.thumbnailWidth === 'number'
        ? Math.min(640, Math.max(120, Math.round(queryOpts.thumbnailWidth)))
        : 320;
    const thumbHeight =
      typeof queryOpts?.thumbnailHeight === 'number'
        ? Math.min(360, Math.max(68, Math.round(queryOpts.thumbnailHeight)))
        : 180;

    const rawSources = await desktopCapturerApi.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: thumbWidth, height: thumbHeight },
      fetchWindowIcons: true,
    });

    const sanitizedSources = (Array.isArray(rawSources) ? rawSources : [])
      .map((src) => {
        const id = String(src?.id || '').trim();
        const name = String(src?.name || 'Untitled Source').trim();
        if (!id) return null;

        const kind = id.startsWith('screen:') ? 'screen' : 'window';
        let thumbnailDataUrl = null;
        let thumbWidthPx = 0;
        let thumbHeightPx = 0;
        let isEmptyThumb = true;

        try {
          if (src.thumbnail) {
            isEmptyThumb =
              typeof src.thumbnail.isEmpty === 'function'
                ? Boolean(src.thumbnail.isEmpty())
                : false;
            const size =
              typeof src.thumbnail.getSize === 'function'
                ? src.thumbnail.getSize()
                : null;
            if (size) {
              thumbWidthPx = Number(size.width || 0);
              thumbHeightPx = Number(size.height || 0);
            }
            if (
              !isEmptyThumb &&
              typeof src.thumbnail.toDataURL === 'function'
            ) {
              const url = src.thumbnail.toDataURL();
              if (
                typeof url === 'string' &&
                url.startsWith('data:image/') &&
                url.length > 32
              ) {
                thumbnailDataUrl = url;
              }
            }
          }
        } catch {
          thumbnailDataUrl = null;
        }

        let appIconDataUrl = null;
        try {
          if (
            src.appIcon &&
            typeof src.appIcon.isEmpty === 'function' &&
            !src.appIcon.isEmpty() &&
            typeof src.appIcon.toDataURL === 'function'
          ) {
            const iconUrl = src.appIcon.toDataURL();
            if (
              typeof iconUrl === 'string' &&
              iconUrl.startsWith('data:image/') &&
              iconUrl.length > 32
            ) {
              appIconDataUrl = iconUrl;
            }
          }
        } catch {
          appIconDataUrl = null;
        }

        const isSelfWindow =
          /Esports Broadcast Controller/i.test(name) ||
          /Broadcast Overlay Viewport/i.test(name) ||
          /Operator Control Deck/i.test(name);

        const appearsMinimized =
          kind === 'window' &&
          (!thumbnailDataUrl || thumbWidthPx === 0 || thumbHeightPx === 0);

        return {
          id,
          name,
          kind,
          displayId: src.display_id ? String(src.display_id) : null,
          thumbnailDataUrl,
          appIconDataUrl,
          thumbnailSize: { width: thumbWidthPx, height: thumbHeightPx },
          isSelfWindow,
          captureAvailable: !appearsMinimized,
          unavailableReason: appearsMinimized
            ? 'Window appears minimized or occluded by OS window manager. Restore the window on desktop to capture its live video feed.'
            : isSelfWindow
            ? 'This is a Broadcast Controller window. Capturing the overlay itself may cause a hall-of-mirrors loop.'
            : null,
        };
      })
      .filter(Boolean);

    // Sort: non-self capturable windows & screens first, then minimized windows, then self windows
    sanitizedSources.sort((a, b) => {
      if (a.isSelfWindow !== b.isSelfWindow) {
        return a.isSelfWindow ? 1 : -1;
      }
      if (a.captureAvailable !== b.captureAvailable) {
        return a.captureAvailable ? -1 : 1;
      }
      if (a.kind !== b.kind) {
        return a.kind === 'window' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      ok: true,
      permissionStatus: statusReport.permissionStatus,
      runtime: 'electron-desktop-capturer',
      sources: sanitizedSources,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      permissionStatus: statusReport.permissionStatus,
      runtime: 'electron-desktop-capturer',
      error:
        err instanceof Error
          ? `Failed to enumerate desktop capture sources: ${err.message}`
          : 'Failed to enumerate desktop capture sources.',
      sources: [],
      fetchedAt: new Date().toISOString(),
    };
  }
}

