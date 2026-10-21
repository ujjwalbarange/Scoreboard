import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IPC_CHANNELS,
  GAME_MODES,
  OVERLAY_CONNECTION_STATE,
  WINDOW_DIMENSIONS,
} from './constants.js';
import {
  createEventId,
  isAllowedInvokeChannel,
  isAllowedListenChannel,
  validateTestEventPayload,
  validateOverlayBounds,
} from './ipcValidator.js';
import {
  getControlDeckPlaceholderTeams,
  getOverlaySampleLeaderboard,
} from './mockTeams.js';
import { registerIpcHandlers } from '../../electron/ipc/handlers.js';

test('allowlisted IPC channels validate accurately and block arbitrary channels', () => {
  assert.equal(isAllowedInvokeChannel(IPC_CHANNELS.GET_STATUS), true);
  assert.equal(isAllowedInvokeChannel(IPC_CHANNELS.SEND_TEST_EVENT), true);
  assert.equal(isAllowedInvokeChannel('arbitrary:shell-exec'), false);
  assert.equal(isAllowedInvokeChannel(null), false);

  assert.equal(
    isAllowedListenChannel(IPC_CHANNELS.CONNECTION_STATUS_CHANGED),
    true
  );
  assert.equal(isAllowedListenChannel(IPC_CHANNELS.OVERLAY_TEST_EVENT), true);
  assert.equal(isAllowedListenChannel('arbitrary:listen'), false);
});

test('validateTestEventPayload sanitizes valid payloads and rejects invalid payloads', () => {
  const validResult = validateTestEventPayload({
    type: 'diagnostic_ping',
    message: 'Overlay sync test #1',
    game: 'BGMI',
    sequence: 3,
  });
  assert.equal(validResult.valid, true);
  assert.ok(validResult.sanitized);
  assert.equal(validResult.sanitized.type, 'DIAGNOSTIC_PING');
  assert.equal(validResult.sanitized.message, 'Overlay sync test #1');
  assert.equal(validResult.sanitized.game, 'BGMI');
  assert.equal(validResult.sanitized.sequence, 3);
  assert.match(validResult.sanitized.eventId, /^TEST-/);

  const nullResult = validateTestEventPayload(null);
  assert.equal(nullResult.valid, false);

  const emptyMessageResult = validateTestEventPayload({ message: '   ' });
  assert.equal(emptyMessageResult.valid, false);

  const oversizedResult = validateTestEventPayload({
    message: 'X'.repeat(200),
  });
  assert.equal(oversizedResult.valid, false);
});

test('validateOverlayBounds enforces safe desktop screen coordinates and dimensions', () => {
  const validBounds = validateOverlayBounds({
    width: 460,
    height: 680,
    x: 120,
    y: 80,
  });
  assert.equal(validBounds.valid, true);
  assert.deepEqual(validBounds.sanitized, {
    width: 460,
    height: 680,
    x: 120,
    y: 80,
  });

  const invalidWidth = validateOverlayBounds({ width: 100 });
  assert.equal(invalidWidth.valid, false);
});

test('Phase 1 mock teams provide 26 A-Z teams for Control Deck and 8 sample teams for Overlay', () => {
  const controlTeams = getControlDeckPlaceholderTeams();
  assert.equal(controlTeams.length, 26);
  assert.equal(controlTeams[0].slotKey, 'A');
  assert.equal(controlTeams[0].teamName, 'MH ELITE');
  assert.equal(controlTeams[0].players.length, 4);
  assert.equal(controlTeams[25].slotKey, 'Z');

  const overlayTeams = getOverlaySampleLeaderboard();
  assert.equal(overlayTeams.length, 8);
  assert.equal(overlayTeams[0].rank, 1);
  assert.equal(overlayTeams[7].rank, 8);
});

test('createEventId produces unique formatted identifiers', () => {
  const id1 = createEventId('IPC');
  const id2 = createEventId('IPC');
  assert.notEqual(id1, id2);
  assert.match(id1, /^IPC-[A-Z0-9]+-[A-Z0-9]+$/);
  assert.ok(GAME_MODES.BGMI);
  assert.equal(WINDOW_DIMENSIONS.CONTROL_DECK.width, 1440);
});

test('Electron ipcMain handlers register idempotently, validate payloads, and handle window lifecycle', async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const removedChannels: string[] = [];
  const mockIpcMain = {
    removeHandler: (ch: string) => {
      removedChannels.push(ch);
      handlers.delete(ch);
    },
    handle: (ch: string, fn: (...args: any[]) => any) => {
      handlers.set(ch, fn);
    },
  };

  const sentToControl: Array<{ channel: string; data: any }> = [];
  const sentToOverlay: Array<{ channel: string; data: any }> = [];
  let overlayDestroyed = false;
  let overlayVisible = true;
  let boundsState = { x: 60, y: 60, width: 460, height: 680 };

  const mockControlWin = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel: string, data: any) =>
        sentToControl.push({ channel, data }),
    },
  };

  const mockOverlayWin = {
    isDestroyed: () => overlayDestroyed,
    isVisible: () => overlayVisible,
    showInactive: () => {
      overlayVisible = true;
    },
    hide: () => {
      overlayVisible = false;
    },
    close: () => {
      overlayDestroyed = true;
      overlayVisible = false;
    },
    getBounds: () => ({ ...boundsState }),
    setBounds: (next: Partial<typeof boundsState>) => {
      boundsState = { ...boundsState, ...next };
    },
    webContents: {
      isDestroyed: () => overlayDestroyed,
      send: (channel: string, data: any) =>
        sentToOverlay.push({ channel, data }),
    },
  };

  const windowManager = {
    getControlWindow: () => mockControlWin as any,
    getOverlayWindow: () => (overlayDestroyed ? null : (mockOverlayWin as any)),
    ensureOverlayWindow: () => {
      overlayDestroyed = false;
      overlayVisible = true;
      return mockOverlayWin as any;
    },
  };

  // Register twice to verify idempotency and no duplicate errors
  registerIpcHandlers(mockIpcMain as any, windowManager);
  registerIpcHandlers(mockIpcMain as any, windowManager);
  assert.ok(removedChannels.includes(IPC_CHANNELS.SEND_TEST_EVENT));

  // 1. Verify GET_STATUS
  const statusRes = await handlers.get(IPC_CHANNELS.GET_STATUS)!();
  assert.equal(statusRes.status, OVERLAY_CONNECTION_STATE.CONNECTED);
  assert.equal(statusRes.overlayAlive, true);

  // 2. Verify GET_CONFIG loads tournament_config.json
  const configRes = await handlers.get(IPC_CHANNELS.GET_CONFIG)!();
  assert.equal(configRes.ok, true);
  assert.equal(configRes.config.defaultGame, 'BGMI');

  // 3. Verify SEND_TEST_EVENT forwards to Overlay Viewport
  const sendRes = await handlers.get(IPC_CHANNELS.SEND_TEST_EVENT)!(null, {
    message: 'Unit test ping',
    game: 'BGMI',
    sequence: 1,
  });
  assert.equal(sendRes.ok, true);
  assert.equal(sendRes.deliveredToOverlay, true);
  assert.equal(sentToOverlay.length, 1);
  assert.equal(sentToOverlay[0].channel, IPC_CHANNELS.OVERLAY_TEST_EVENT);
  assert.equal(sentToOverlay[0].data.message, 'Unit test ping');

  // 4. Verify CLOSE_OVERLAY updates status to DISCONNECTED and blocks test event delivery
  const closeRes = await handlers.get(IPC_CHANNELS.CLOSE_OVERLAY)!();
  assert.equal(closeRes.status, OVERLAY_CONNECTION_STATE.DISCONNECTED);

  const sendWhileClosed = await handlers.get(IPC_CHANNELS.SEND_TEST_EVENT)!(
    null,
    {
      message: 'Should fail gracefully',
    }
  );
  assert.equal(sendWhileClosed.ok, false);
  assert.equal(sendWhileClosed.deliveredToOverlay, false);

  // 5. Verify REOPEN_OVERLAY restores connection status
  const reopenRes = await handlers.get(IPC_CHANNELS.REOPEN_OVERLAY)!();
  assert.equal(reopenRes.ok, true);
  assert.equal(reopenRes.status, OVERLAY_CONNECTION_STATE.CONNECTED);

  // 6. Verify Controller Window Controls (Minimize, Maximize/Restore, Fullscreen, Close)
  assert.equal(isAllowedInvokeChannel(IPC_CHANNELS.WINDOW_MINIMIZE), true);
  assert.equal(
    isAllowedInvokeChannel(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),
    true
  );
  assert.equal(
    isAllowedInvokeChannel(IPC_CHANNELS.WINDOW_FULLSCREEN_TOGGLE),
    true
  );
  assert.equal(isAllowedInvokeChannel(IPC_CHANNELS.WINDOW_CLOSE), true);

  let controlMaximized = false;
  let controlFullScreen = false;
  let controlMinimized = false;
  let controlClosed = false;

  Object.assign(mockControlWin, {
    isMaximized: () => controlMaximized,
    isFullScreen: () => controlFullScreen,
    isMinimized: () => controlMinimized,
    minimize: () => {
      controlMinimized = true;
    },
    maximize: () => {
      controlMaximized = true;
      controlMinimized = false;
    },
    unmaximize: () => {
      controlMaximized = false;
    },
    setFullScreen: (flag: boolean) => {
      controlFullScreen = Boolean(flag);
    },
    close: () => {
      controlClosed = true;
    },
  });

  const winStateInitial = await handlers.get(IPC_CHANNELS.WINDOW_GET_STATE)!();
  assert.equal(winStateInitial.ok, true);
  assert.equal(winStateInitial.windowState.isMaximized, false);

  const maxRes = await handlers.get(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)!();
  assert.equal(maxRes.ok, true);
  assert.equal(maxRes.windowState.isMaximized, true);

  const restoreRes = await handlers.get(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)!();
  assert.equal(restoreRes.ok, true);
  assert.equal(restoreRes.windowState.isMaximized, false);

  const fsRes = await handlers.get(IPC_CHANNELS.WINDOW_FULLSCREEN_TOGGLE)!();
  assert.equal(fsRes.ok, true);
  assert.equal(fsRes.windowState.isFullScreen, true);

  const minRes = await handlers.get(IPC_CHANNELS.WINDOW_MINIMIZE)!();
  assert.equal(minRes.ok, true);
  assert.equal(minRes.windowState.isMinimized, true);

  const closeWinRes = await handlers.get(IPC_CHANNELS.WINDOW_CLOSE)!();
  assert.equal(closeWinRes.ok, true);
  assert.equal(controlClosed, true);
});
