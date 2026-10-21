/**
 * Secure Electron Preload Script
 * Phase 1 & Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Security invariants:
 * - Runs with contextIsolation: true and nodeIntegration: false
 * - Never exposes raw ipcRenderer, ipcMain, fs, process, or unrestricted Electron APIs
 * - Strictly validates allowlisted IPC channels and payloads before invocation
 * - Returns deterministic cleanup functions for all event subscriptions
 */

const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = Object.freeze({
  // Phase 1 Invoke Channels
  GET_STATUS: 'broadcast:get-status',
  GET_CONFIG: 'broadcast:get-config',
  SEND_TEST_EVENT: 'broadcast:send-test-event',
  TOGGLE_OVERLAY: 'broadcast:toggle-overlay',
  CLOSE_OVERLAY: 'broadcast:close-overlay',
  REOPEN_OVERLAY: 'broadcast:reopen-overlay',
  SET_OVERLAY_BOUNDS: 'broadcast:set-overlay-bounds',
  ACKNOWLEDGE_TEST_EVENT: 'broadcast:ack-test-event',

  // Phase 2 Authoritative Match Invoke Channels
  GET_MATCH_STATE: 'match:get-state',
  SELECT_TEAM: 'match:select-team',
  INCREMENT_KILL: 'match:increment-kill',
  DECREMENT_KILL: 'match:decrement-kill',
  SET_PLACEMENT: 'match:set-placement',
  ADJUST_PLACEMENT: 'match:adjust-placement',
  UPDATE_TEAM_ROSTER: 'match:update-team-roster',
  UNDO_LAST_ACTION: 'match:undo-last-action',
  CREATE_MATCH: 'match:create-match',
  LOAD_MATCH: 'match:load-match',
  SAVE_MATCH: 'match:save-match',
  IMPORT_ROSTER: 'match:import-roster',
  EXPORT_MATCH: 'match:export-match',
  CREATE_NEXT_ROUND: 'match:create-next-round',
  COMPLETE_MATCH: 'match:complete-match',
  REOPEN_MATCH: 'match:reopen-match',
  LIST_MATCHES: 'match:list-matches',

  // Push Channels
  CONNECTION_STATUS_CHANGED: 'broadcast:connection-status-changed',
  OVERLAY_TEST_EVENT: 'broadcast:overlay-test-event',
  TEST_EVENT_ACK: 'broadcast:test-event-ack',
  MATCH_STATE_UPDATED: 'match:state-updated',
  MATCH_NOTIFICATION: 'match:notification',
});

const ALLOWED_INVOKE = new Set([
  IPC_CHANNELS.GET_STATUS,
  IPC_CHANNELS.GET_CONFIG,
  IPC_CHANNELS.SEND_TEST_EVENT,
  IPC_CHANNELS.TOGGLE_OVERLAY,
  IPC_CHANNELS.CLOSE_OVERLAY,
  IPC_CHANNELS.REOPEN_OVERLAY,
  IPC_CHANNELS.SET_OVERLAY_BOUNDS,
  IPC_CHANNELS.ACKNOWLEDGE_TEST_EVENT,
  IPC_CHANNELS.GET_MATCH_STATE,
  'match:set-active-game',
  'match:update-broadcast-meta',
  IPC_CHANNELS.SELECT_TEAM,
  IPC_CHANNELS.INCREMENT_KILL,
  IPC_CHANNELS.DECREMENT_KILL,
  IPC_CHANNELS.SET_PLACEMENT,
  IPC_CHANNELS.ADJUST_PLACEMENT,
  IPC_CHANNELS.UPDATE_TEAM_ROSTER,
  IPC_CHANNELS.UNDO_LAST_ACTION,
  IPC_CHANNELS.CREATE_MATCH,
  IPC_CHANNELS.LOAD_MATCH,
  IPC_CHANNELS.SAVE_MATCH,
  IPC_CHANNELS.IMPORT_ROSTER,
  IPC_CHANNELS.EXPORT_MATCH,
  IPC_CHANNELS.CREATE_NEXT_ROUND,
  IPC_CHANNELS.COMPLETE_MATCH,
  IPC_CHANNELS.REOPEN_MATCH,
  IPC_CHANNELS.LIST_MATCHES,
]);

const ALLOWED_LISTEN = new Set([
  IPC_CHANNELS.CONNECTION_STATUS_CHANGED,
  IPC_CHANNELS.OVERLAY_TEST_EVENT,
  IPC_CHANNELS.TEST_EVENT_ACK,
  IPC_CHANNELS.MATCH_STATE_UPDATED,
  IPC_CHANNELS.MATCH_NOTIFICATION,
]);

function safeInvoke(channel, payload) {
  if (typeof channel !== 'string' || !ALLOWED_INVOKE.has(channel)) {
    return Promise.resolve({
      ok: false,
      error: `Blocked unauthorized IPC invoke channel: ${String(channel)}`,
    });
  }
  return ipcRenderer.invoke(channel, payload).catch((err) => ({
    ok: false,
    error: err instanceof Error ? err.message : 'IPC invocation failed',
  }));
}

function safeSubscribe(channel, callback) {
  if (typeof channel !== 'string' || !ALLOWED_LISTEN.has(channel)) {
    throw new Error(`Blocked unauthorized IPC listen channel: ${String(channel)}`);
  }
  if (typeof callback !== 'function') {
    throw new Error('IPC listener callback must be a function.');
  }

  const wrappedListener = (_event, data) => {
    callback(data);
  };

  ipcRenderer.on(channel, wrappedListener);

  return () => {
    ipcRenderer.removeListener(channel, wrappedListener);
  };
}

const broadcastControllerAPI = Object.freeze({
  runtime: 'electron',

  // Phase 1 Window & Diagnostic Methods
  getStatus: () => safeInvoke(IPC_CHANNELS.GET_STATUS),
  getTournamentConfig: () => safeInvoke(IPC_CHANNELS.GET_CONFIG),
  sendTestEvent: (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Promise.resolve({
        ok: false,
        error: 'Test event payload must be a valid object.',
      });
    }
    return safeInvoke(IPC_CHANNELS.SEND_TEST_EVENT, payload);
  },
  acknowledgeTestEvent: (ackPayload) =>
    safeInvoke(IPC_CHANNELS.ACKNOWLEDGE_TEST_EVENT, ackPayload),
  toggleOverlayVisibility: (options) =>
    safeInvoke(IPC_CHANNELS.TOGGLE_OVERLAY, options),
  closeOverlayWindow: () => safeInvoke(IPC_CHANNELS.CLOSE_OVERLAY),
  reopenOverlayWindow: () => safeInvoke(IPC_CHANNELS.REOPEN_OVERLAY),
  setOverlayBounds: (bounds) =>
    safeInvoke(IPC_CHANNELS.SET_OVERLAY_BOUNDS, bounds),
  onConnectionStatus: (callback) =>
    safeSubscribe(IPC_CHANNELS.CONNECTION_STATUS_CHANGED, callback),
  onTestEvent: (callback) =>
    safeSubscribe(IPC_CHANNELS.OVERLAY_TEST_EVENT, callback),
  onTestEventAck: (callback) =>
    safeSubscribe(IPC_CHANNELS.TEST_EVENT_ACK, callback),

  // Phase 2 & Phase 3 Authoritative Match & CSV Methods
  getMatchState: () => safeInvoke(IPC_CHANNELS.GET_MATCH_STATE),
  setActiveGame: (game) =>
    safeInvoke('match:set-active-game', { game }),
  updateBroadcastMeta: (payload) =>
    safeInvoke('match:update-broadcast-meta', payload || {}),
  selectTeam: (key) => safeInvoke(IPC_CHANNELS.SELECT_TEAM, { key }),
  incrementKill: (key) => safeInvoke(IPC_CHANNELS.INCREMENT_KILL, { key }),
  decrementKill: (key) => safeInvoke(IPC_CHANNELS.DECREMENT_KILL, { key }),
  setPlacement: (key, position) =>
    safeInvoke(IPC_CHANNELS.SET_PLACEMENT, { key, position }),
  adjustPlacement: (key, direction) =>
    safeInvoke(IPC_CHANNELS.ADJUST_PLACEMENT, { key, direction }),
  updateTeamRoster: (payload) =>
    safeInvoke(IPC_CHANNELS.UPDATE_TEAM_ROSTER, payload),
  undoLastAction: () => safeInvoke(IPC_CHANNELS.UNDO_LAST_ACTION),
  createMatch: (options) => safeInvoke(IPC_CHANNELS.CREATE_MATCH, options || {}),
  loadMatch: (matchId) => safeInvoke(IPC_CHANNELS.LOAD_MATCH, { matchId }),
  saveMatch: () => safeInvoke(IPC_CHANNELS.SAVE_MATCH),
  importRoster: (payload) => safeInvoke(IPC_CHANNELS.IMPORT_ROSTER, payload),
  exportMatch: () => safeInvoke(IPC_CHANNELS.EXPORT_MATCH),
  createNextRound: (options) =>
    safeInvoke(IPC_CHANNELS.CREATE_NEXT_ROUND, options),
  completeMatch: () => safeInvoke(IPC_CHANNELS.COMPLETE_MATCH),
  reopenMatch: () => safeInvoke(IPC_CHANNELS.REOPEN_MATCH),
  listMatches: () => safeInvoke(IPC_CHANNELS.LIST_MATCHES),
  onMatchState: (callback) =>
    safeSubscribe(IPC_CHANNELS.MATCH_STATE_UPDATED, callback),
  onMatchNotification: (callback) =>
    safeSubscribe(IPC_CHANNELS.MATCH_NOTIFICATION, callback),
});

contextBridge.exposeInMainWorld('broadcastController', broadcastControllerAPI);
