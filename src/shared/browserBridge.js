/**
 * Browser Preview IPC Fallback Bridge
 * Phase 1 & Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * When running inside Electron, `window.broadcastController` is injected by
 * `electron/preload.js` via `contextBridge.exposeInMainWorld`.
 *
 * When running in the web preview environment (`http://localhost:3000`), this
 * bridge connects to the authoritative Node.js MatchManager in `server.ts`
 * (`/api/match/*` + SSE stream) AND synchronizes across browser tabs/frames
 * via `BroadcastChannel`.
 */

import tournamentConfig from '../../tournament_config.json';
import { MatchEngine } from '../../electron/match/match-engine.js';
import {
  parseAndValidateMatchCsv,
  serializeTeamsToCsv,
} from '../../electron/utils/validation.js';
import {
  OVERLAY_CONNECTION_STATE,
  WINDOW_DIMENSIONS,
} from './constants.js';
import {
  createEventId,
  validateOverlayBounds,
  validateTestEventPayload,
} from './ipcValidator.js';

const CHANNEL_NAME = 'esports_broadcast_ipc_channel_v2';
const STATE_STORAGE_KEY = 'esports_broadcast_overlay_state_v1';

function readPersistedOverlayState() {
  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) {
      return {
        overlayAlive: true,
        overlayVisible: true,
        overlayBounds: {
          x: 60,
          y: 60,
          width: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.width,
          height: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.height,
        },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      overlayAlive:
        typeof parsed.overlayAlive === 'boolean' ? parsed.overlayAlive : true,
      overlayVisible:
        typeof parsed.overlayVisible === 'boolean'
          ? parsed.overlayVisible
          : true,
      overlayBounds: parsed.overlayBounds || {
        x: 60,
        y: 60,
        width: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.width,
        height: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.height,
      },
    };
  } catch {
    return {
      overlayAlive: true,
      overlayVisible: true,
      overlayBounds: {
        x: 60,
        y: 60,
        width: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.width,
        height: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.height,
      },
    };
  }
}

function writePersistedOverlayState(nextState) {
  try {
    window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage quota errors
  }
}

export function getBroadcastController() {
  if (typeof window !== 'undefined' && window.broadcastController) {
    return window.broadcastController;
  }

  let internalState = readPersistedOverlayState();
  const connectionListeners = new Set();
  const testEventListeners = new Set();
  const testEventAckListeners = new Set();
  const matchStateListeners = new Set();
  const matchNotificationListeners = new Set();

  // Fallback local engine in case static preview is opened without server.ts
  const fallbackEngine = new MatchEngine({
    config: tournamentConfig,
    initialGame: tournamentConfig.defaultGame || 'BGMI',
  });

  const bus =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;

  function buildSnapshot(reason = 'STATE_SYNC') {
    let status = OVERLAY_CONNECTION_STATE.DISCONNECTED;
    if (internalState.overlayAlive) {
      status = internalState.overlayVisible
        ? OVERLAY_CONNECTION_STATE.CONNECTED
        : OVERLAY_CONNECTION_STATE.HIDDEN;
    }

    return {
      ok: true,
      runtime: 'ipc-bridge',
      status,
      mainProcessReady: true,
      controlDeckAlive: true,
      overlayAlive: internalState.overlayAlive,
      overlayVisible: internalState.overlayVisible,
      overlayBounds: { ...internalState.overlayBounds },
      reason,
      eventId: createEventId('CONN'),
      timestamp: new Date().toISOString(),
    };
  }

  function notifySet(listeners, payload) {
    for (const cb of listeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[IPC Bridge] Listener error:', err);
      }
    }
  }

  function emitBusMessage(msg) {
    if (bus) {
      try {
        bus.postMessage(msg);
      } catch {
        // Ignore closed channel errors
      }
    }
  }

  if (bus) {
    bus.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.kind === 'CONNECTION_STATUS_CHANGED' && data.snapshot) {
        internalState = {
          overlayAlive: data.snapshot.overlayAlive,
          overlayVisible: data.snapshot.overlayVisible,
          overlayBounds:
            data.snapshot.overlayBounds || internalState.overlayBounds,
        };
        notifySet(connectionListeners, data.snapshot);
      } else if (data.kind === 'OVERLAY_TEST_EVENT' && data.payload) {
        notifySet(testEventListeners, data.payload);
      } else if (data.kind === 'TEST_EVENT_ACK' && data.ack) {
        notifySet(testEventAckListeners, data.ack);
      } else if (data.kind === 'MATCH_STATE_UPDATED' && data.snapshot) {
        notifySet(matchStateListeners, data.snapshot);
      } else if (data.kind === 'MATCH_NOTIFICATION' && data.notification) {
        notifySet(matchNotificationListeners, data.notification);
      }
    };
  }

  // Connect to Server-Sent Events stream from server.ts for real-time external CSV watch & state broadcasts
  if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
    try {
      const es = new EventSource('/api/match/stream');
      es.addEventListener('match-state', (e) => {
        try {
          const snapshot = JSON.parse(e.data);
          notifySet(matchStateListeners, snapshot);
        } catch {
          // Ignore malformed event
        }
      });
      es.addEventListener('match-notification', (e) => {
        try {
          const notification = JSON.parse(e.data);
          notifySet(matchNotificationListeners, notification);
        } catch {
          // Ignore malformed event
        }
      });
    } catch {
      // Ignore SSE errors if running offline
    }
  }

  async function invokeServerCommand(action, payload = {}) {
    try {
      const res = await fetch('/api/match/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (json && json.snapshot) {
        emitBusMessage({
          kind: 'MATCH_STATE_UPDATED',
          snapshot: json.snapshot,
        });
        notifySet(matchStateListeners, json.snapshot);
      }
      return json;
    } catch {
      // Fallback to in-memory engine if server route is unreachable
      return executeFallbackCommand(action, payload);
    }
  }

  function executeFallbackCommand(action, payload = {}) {
    let result;
    switch (action) {
      case 'setActiveGame':
        result = fallbackEngine.setActiveGame(payload?.game ?? 'BGMI');
        break;
      case 'updateBroadcastMeta':
        result = fallbackEngine.updateBroadcastMeta(payload || {});
        break;
      case 'selectTeam':
        result = fallbackEngine.selectTeam(payload?.key ?? null);
        break;
      case 'incrementKill':
        result = fallbackEngine.incrementKill(payload?.key);
        break;
      case 'decrementKill':
        result = fallbackEngine.decrementKill(payload?.key);
        break;
      case 'setPlacement':
        result = fallbackEngine.setPlacement(payload?.key, payload?.position);
        break;
      case 'adjustPlacement':
        result = fallbackEngine.adjustPlacement(
          payload?.key,
          payload?.direction
        );
        break;
      case 'updateTeamRoster':
        result = fallbackEngine.updateTeamRoster(payload);
        break;
      case 'undoLastAction':
        result = fallbackEngine.undo();
        break;
      case 'saveMatch':
        result = { ok: true, snapshot: fallbackEngine.getSnapshot() };
        break;
      case 'exportMatch':
        result = {
          ok: true,
          matchId: fallbackEngine.state.matchId,
          fileName: `${fallbackEngine.state.matchId}.csv`,
          csvText: serializeTeamsToCsv(fallbackEngine.state.teams),
        };
        break;
      case 'importRoster': {
        const parsed = parseAndValidateMatchCsv(
          payload?.csvText || '',
          fallbackEngine.state.activeGame,
          tournamentConfig,
          { resetScores: Boolean(payload?.resetScores) }
        );
        if (!parsed.ok) return parsed;
        result = fallbackEngine.replaceMatchState({
          activeGame: fallbackEngine.state.activeGame,
          matchId: fallbackEngine.state.matchId,
          activeFilePath: fallbackEngine.state.activeFilePath,
          teams: parsed.teams,
          pushUndoLabel: 'Before CSV Import',
        });
        break;
      }
      default:
        result = { ok: true, snapshot: fallbackEngine.getSnapshot() };
    }

    if (result && result.snapshot) {
      emitBusMessage({
        kind: 'MATCH_STATE_UPDATED',
        snapshot: result.snapshot,
      });
      notifySet(matchStateListeners, result.snapshot);
    }
    return result;
  }

  const bridgeAPI = Object.freeze({
    runtime: 'ipc-bridge',

    // Phase 1 Methods
    getStatus: async () => {
      internalState = readPersistedOverlayState();
      return buildSnapshot('STATUS_QUERY');
    },

    getTournamentConfig: async () => ({
      ok: true,
      config: tournamentConfig,
      loadedAt: new Date().toISOString(),
    }),

    sendTestEvent: async (payload) => {
      internalState = readPersistedOverlayState();
      const validation = validateTestEventPayload(payload);
      if (!validation.valid || !validation.sanitized) {
        return {
          ok: false,
          error: validation.error || 'Invalid test event payload.',
          timestamp: new Date().toISOString(),
        };
      }

      if (!internalState.overlayAlive) {
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
        overlayVisible: internalState.overlayVisible,
      };

      emitBusMessage({
        kind: 'OVERLAY_TEST_EVENT',
        payload: enrichedEvent,
      });
      notifySet(testEventListeners, enrichedEvent);

      return {
        ok: true,
        eventId: enrichedEvent.eventId,
        deliveredToOverlay: true,
        overlayVisible: internalState.overlayVisible,
        overlayStatus: internalState.overlayVisible
          ? OVERLAY_CONNECTION_STATE.CONNECTED
          : OVERLAY_CONNECTION_STATE.HIDDEN,
        event: enrichedEvent,
        timestamp: enrichedEvent.forwardedByMainAt,
      };
    },

    acknowledgeTestEvent: async (ackPayload) => {
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

      emitBusMessage({
        kind: 'TEST_EVENT_ACK',
        ack: safeAck,
      });
      notifySet(testEventAckListeners, safeAck);

      return safeAck;
    },

    toggleOverlayVisibility: async (options) => {
      internalState = readPersistedOverlayState();
      if (!internalState.overlayAlive) {
        return {
          ok: false,
          error: 'Overlay window is closed. Click Reopen Overlay first.',
          status: OVERLAY_CONNECTION_STATE.DISCONNECTED,
        };
      }

      const nextVisible =
        options && typeof options.show === 'boolean'
          ? options.show
          : !internalState.overlayVisible;

      internalState = {
        ...internalState,
        overlayVisible: nextVisible,
      };
      writePersistedOverlayState(internalState);

      const snapshot = buildSnapshot(
        nextVisible ? 'OVERLAY_SHOWN' : 'OVERLAY_HIDDEN'
      );
      emitBusMessage({
        kind: 'CONNECTION_STATUS_CHANGED',
        snapshot,
      });
      notifySet(connectionListeners, snapshot);

      return {
        ok: true,
        overlayVisible: nextVisible,
        status: snapshot.status,
        snapshot,
      };
    },

    closeOverlayWindow: async () => {
      internalState = {
        ...readPersistedOverlayState(),
        overlayAlive: false,
        overlayVisible: false,
      };
      writePersistedOverlayState(internalState);

      const snapshot = buildSnapshot('OVERLAY_CLOSED_BY_OPERATOR');
      emitBusMessage({
        kind: 'CONNECTION_STATUS_CHANGED',
        snapshot,
      });
      notifySet(connectionListeners, snapshot);

      return {
        ok: true,
        status: OVERLAY_CONNECTION_STATE.DISCONNECTED,
        snapshot,
      };
    },

    reopenOverlayWindow: async () => {
      internalState = {
        ...readPersistedOverlayState(),
        overlayAlive: true,
        overlayVisible: true,
      };
      writePersistedOverlayState(internalState);

      const snapshot = buildSnapshot('OVERLAY_REOPENED_BY_OPERATOR');
      emitBusMessage({
        kind: 'CONNECTION_STATUS_CHANGED',
        snapshot,
      });
      notifySet(connectionListeners, snapshot);

      return {
        ok: true,
        status: snapshot.status,
        snapshot,
      };
    },

    setOverlayBounds: async (bounds) => {
      const validation = validateOverlayBounds(bounds);
      if (!validation.valid || !validation.sanitized) {
        return {
          ok: false,
          error: validation.error || 'Invalid bounds payload.',
        };
      }

      internalState = readPersistedOverlayState();
      if (!internalState.overlayAlive) {
        return {
          ok: false,
          error: 'Overlay window is closed.',
        };
      }

      internalState = {
        ...internalState,
        overlayBounds: {
          ...internalState.overlayBounds,
          ...validation.sanitized,
        },
      };
      writePersistedOverlayState(internalState);

      const snapshot = buildSnapshot('OVERLAY_BOUNDS_UPDATED');
      emitBusMessage({
        kind: 'CONNECTION_STATUS_CHANGED',
        snapshot,
      });
      notifySet(connectionListeners, snapshot);

      return {
        ok: true,
        overlayBounds: { ...internalState.overlayBounds },
        snapshot,
      };
    },

    onConnectionStatus: (callback) => {
      if (typeof callback !== 'function') {
        throw new Error('onConnectionStatus requires a function callback.');
      }
      connectionListeners.add(callback);
      return () => {
        connectionListeners.delete(callback);
      };
    },

    onTestEvent: (callback) => {
      if (typeof callback !== 'function') {
        throw new Error('onTestEvent requires a function callback.');
      }
      testEventListeners.add(callback);
      return () => {
        testEventListeners.delete(callback);
      };
    },

    onTestEventAck: (callback) => {
      if (typeof callback !== 'function') {
        throw new Error('onTestEventAck requires a function callback.');
      }
      testEventAckListeners.add(callback);
      return () => {
        testEventAckListeners.delete(callback);
      };
    },

    // Phase 2 Authoritative Match Methods
    getMatchState: async () => {
      try {
        const res = await fetch('/api/match/state');
        const json = await res.json();
        return json;
      } catch {
        return { ok: true, snapshot: fallbackEngine.getSnapshot() };
      }
    },

    setActiveGame: (game) => invokeServerCommand('setActiveGame', { game }),
    updateBroadcastMeta: (payload) =>
      invokeServerCommand('updateBroadcastMeta', payload || {}),
    selectTeam: (key) => invokeServerCommand('selectTeam', { key }),
    incrementKill: (key) => invokeServerCommand('incrementKill', { key }),
    decrementKill: (key) => invokeServerCommand('decrementKill', { key }),
    setPlacement: (key, position) =>
      invokeServerCommand('setPlacement', { key, position }),
    adjustPlacement: (key, direction) =>
      invokeServerCommand('adjustPlacement', { key, direction }),
    updateTeamRoster: (payload) =>
      invokeServerCommand('updateTeamRoster', payload),
    undoLastAction: () => invokeServerCommand('undoLastAction'),
    createMatch: (options) => invokeServerCommand('createMatch', options || {}),
    loadMatch: (matchId) => invokeServerCommand('loadMatch', { matchId }),
    saveMatch: () => invokeServerCommand('saveMatch'),
    importRoster: (payload) => invokeServerCommand('importRoster', payload),
    exportMatch: () => invokeServerCommand('exportMatch'),
    createNextRound: (options) =>
      invokeServerCommand('createNextRound', options),
    completeMatch: () => invokeServerCommand('completeMatch'),
    reopenMatch: () => invokeServerCommand('reopenMatch'),
    listMatches: () => invokeServerCommand('listMatches'),

    onMatchState: (callback) => {
      if (typeof callback !== 'function') {
        throw new Error('onMatchState requires a function callback.');
      }
      matchStateListeners.add(callback);
      return () => {
        matchStateListeners.delete(callback);
      };
    },

    onMatchNotification: (callback) => {
      if (typeof callback !== 'function') {
        throw new Error('onMatchNotification requires a function callback.');
      }
      matchNotificationListeners.add(callback);
      return () => {
        matchNotificationListeners.delete(callback);
      };
    },
  });

  if (typeof window !== 'undefined') {
    window.broadcastController = bridgeAPI;
  }

  return bridgeAPI;
}
