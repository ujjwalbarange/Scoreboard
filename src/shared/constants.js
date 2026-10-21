/**
 * Shared Constants & Allowlisted IPC Channels
 * Phase 1 & Phase 2: Esports Broadcast Controller & Live Overlay System
 */

export const APP_METADATA = {
  NAME: 'ESPORTS BROADCAST CONTROLLER',
  PHASE: 'PHASE 2 · LIVE MATCH ENGINE, KEYBOARD CONTROLS & CSV PERSISTENCE',
  VERSION: '2.0.0-phase2',
};

export const GAME_MODES = {
  BGMI: {
    id: 'BGMI',
    label: 'BGMI',
    fullName: 'Battlegrounds Mobile India',
    fileTag: 'BGMI',
    templateFile: 'template_bgmi.csv',
    defaultKillPoints: 1,
    topPlacementPoints: 10,
  },
  FREE_FIRE: {
    id: 'FREE_FIRE',
    label: 'Free Fire',
    fullName: 'Garena Free Fire',
    fileTag: 'FF',
    templateFile: 'template_ff.csv',
    defaultKillPoints: 1,
    topPlacementPoints: 12,
  },
};

export const MATCH_STATUS = {
  NOT_STARTED: 'NOT STARTED',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
};

export const SAVE_STATUS = {
  SAVED: 'SAVED',
  SAVING: 'SAVING...',
  EXTERNAL_SYNC: 'EXTERNAL SYNC',
  UNSAVED: 'UNSAVED',
  ERROR: 'SAVE ERROR',
};

export const OVERLAY_CONNECTION_STATE = {
  CONNECTED: 'CONNECTED',
  HIDDEN: 'CONNECTED (HIDDEN)',
  DISCONNECTED: 'DISCONNECTED',
  CHECKING: 'CHECKING...',
};

export const OVERLAY_VIEW_MODES = Object.freeze({
  MATCH: 'MATCH',
  OVERALL: 'OVERALL',
  END_OF_MATCH: 'END_OF_MATCH',
});

export const BROADCAST_COMPOSITION_MODES = Object.freeze({
  OVERLAY_ONLY: 'OVERLAY_ONLY',
  FULLSCREEN_GAMEPLAY: 'FULLSCREEN_GAMEPLAY',
  PICTURE_IN_PICTURE: 'PICTURE_IN_PICTURE',
  LEADERBOARD_FOCUS: 'LEADERBOARD_FOCUS',
  GAMEPLAY_ONLY: 'GAMEPLAY_ONLY',
});

export const GAMEPLAY_FIT_MODES = Object.freeze({
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'stretch',
});

export const GAMEPLAY_LAYER_ORDERS = Object.freeze({
  GAMEPLAY_BEHIND: 'GAMEPLAY_BEHIND',
  GAMEPLAY_FRONT: 'GAMEPLAY_FRONT',
});

export const CORNER_PLACEMENT_PRESETS = Object.freeze({
  TOP_LEFT: 'top-left',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_RIGHT: 'bottom-right',
  CENTER: 'center',
});

export const CSV_SCHEMA_HEADERS = Object.freeze([
  'Key',
  'TeamName',
  'Player1',
  'Player2',
  'Player3',
  'Player4',
  'pos',
  'KP',
  'PP',
  'TT',
]);

export const TEAM_KEYS_AZ = Object.freeze(
  Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
);

/**
 * Strictly allowlisted IPC channels for Main <-> Renderer communication.
 * Includes all Phase 1 channels plus Phase 2/3 authoritative match, CSV & capture channels.
 */
export const IPC_CHANNELS = Object.freeze({
  // Phase 1 Invoke Channels (Preserved)
  GET_STATUS: 'broadcast:get-status',
  GET_CONFIG: 'broadcast:get-config',
  SEND_TEST_EVENT: 'broadcast:send-test-event',
  TOGGLE_OVERLAY: 'broadcast:toggle-overlay',
  CLOSE_OVERLAY: 'broadcast:close-overlay',
  REOPEN_OVERLAY: 'broadcast:reopen-overlay',
  SET_OVERLAY_BOUNDS: 'broadcast:set-overlay-bounds',
  ACKNOWLEDGE_TEST_EVENT: 'broadcast:ack-test-event',

  // Phase 3 Controller Window Control Invoke Channels
  WINDOW_GET_STATE: 'window:get-state',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'window:maximize-toggle',
  WINDOW_FULLSCREEN_TOGGLE: 'window:fullscreen-toggle',
  WINDOW_CLOSE: 'window:close',

  // Phase 3 Gameplay Window / Desktop Capture Invoke Channels
  GET_CAPTURE_SOURCES: 'capture:get-sources',
  GET_CAPTURE_STATUS: 'capture:get-status',

  // Phase 2 & Phase 3 Authoritative Match Engine Invoke Channels
  GET_MATCH_STATE: 'match:get-state',
  SET_ACTIVE_GAME: 'match:set-active-game',
  UPDATE_BROADCAST_META: 'match:update-broadcast-meta',
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

  // Push Events (Main -> Renderer)
  CONNECTION_STATUS_CHANGED: 'broadcast:connection-status-changed',
  OVERLAY_TEST_EVENT: 'broadcast:overlay-test-event',
  TEST_EVENT_ACK: 'broadcast:test-event-ack',
  MATCH_STATE_UPDATED: 'match:state-updated',
  MATCH_NOTIFICATION: 'match:notification',
});

export const ALLOWED_INVOKE_CHANNELS = new Set([
  IPC_CHANNELS.GET_STATUS,
  IPC_CHANNELS.GET_CONFIG,
  IPC_CHANNELS.SEND_TEST_EVENT,
  IPC_CHANNELS.TOGGLE_OVERLAY,
  IPC_CHANNELS.CLOSE_OVERLAY,
  IPC_CHANNELS.REOPEN_OVERLAY,
  IPC_CHANNELS.SET_OVERLAY_BOUNDS,
  IPC_CHANNELS.ACKNOWLEDGE_TEST_EVENT,
  IPC_CHANNELS.WINDOW_GET_STATE,
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE,
  IPC_CHANNELS.WINDOW_FULLSCREEN_TOGGLE,
  IPC_CHANNELS.WINDOW_CLOSE,
  IPC_CHANNELS.GET_CAPTURE_SOURCES,
  IPC_CHANNELS.GET_CAPTURE_STATUS,
  IPC_CHANNELS.GET_MATCH_STATE,
  IPC_CHANNELS.SET_ACTIVE_GAME,
  IPC_CHANNELS.UPDATE_BROADCAST_META,
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

export const ALLOWED_LISTEN_CHANNELS = new Set([
  IPC_CHANNELS.CONNECTION_STATUS_CHANGED,
  IPC_CHANNELS.OVERLAY_TEST_EVENT,
  IPC_CHANNELS.TEST_EVENT_ACK,
  IPC_CHANNELS.MATCH_STATE_UPDATED,
  IPC_CHANNELS.MATCH_NOTIFICATION,
]);

export const WINDOW_DIMENSIONS = Object.freeze({
  CONTROL_DECK: {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
  },
  OVERLAY_VIEWPORT: {
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    broadcastWidth: 1920,
    broadcastHeight: 1080,
  },
});
