/**
 * Electron Main Process Entry Point
 * Phase 1: Esports Broadcast Controller & Live Overlay System
 *
 * Manages two independent BrowserWindows:
 * 1. Operator Control Deck (1440x900 normal desktop application window)
 * 2. Broadcast Overlay Viewport (460x680 frameless, transparent, alwaysOnTop OBS overlay window)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  systemPreferences,
} from 'electron';
import { WINDOW_DIMENSIONS } from '../src/shared/constants.js';
import {
  broadcastConnectionStatus,
  isWindowUsable,
  registerIpcHandlers,
} from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev =
  !app.isPackaged &&
  (process.env.NODE_ENV === 'development' ||
    Boolean(process.env.VITE_DEV_SERVER_URL));
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
const openDevTools = !app.isPackaged && process.env.OPEN_DEVTOOLS === 'true';

/** @type {BrowserWindow | null} */
let controlDeckWindow = null;

/** @type {BrowserWindow | null} */
let overlayViewportWindow = null;

/**
 * Shared secure webPreferences for both windows.
 * Enforces contextIsolation: true and nodeIntegration: false.
 */
function getSecureWebPreferences() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

/**
 * Loads the appropriate entry point for Control Deck or Overlay Viewport
 * in both development (Vite dev server) and packaged production builds.
 *
 * @param {BrowserWindow} targetWindow
 * @param {'control-deck' | 'overlay-viewport'} targetType
 */
async function loadWindowEntry(targetWindow, targetType) {
  if (!isWindowUsable(targetWindow)) return;

  if (isDev) {
    const targetUrl =
      targetType === 'overlay-viewport'
        ? `${devServerUrl.replace(/\/$/, '')}/overlay.html`
        : `${devServerUrl.replace(/\/$/, '')}/index.html`;
    await targetWindow.loadURL(targetUrl);
    if (openDevTools) {
      targetWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    const htmlFile =
      targetType === 'overlay-viewport' ? 'overlay.html' : 'index.html';
    const filePath = path.join(__dirname, '../dist', htmlFile);
    await targetWindow.loadFile(filePath);
  }
}

/**
 * Creates the Operator Control Deck BrowserWindow.
 */
function createControlDeckWindow() {
  if (isWindowUsable(controlDeckWindow)) {
    controlDeckWindow.focus();
    return controlDeckWindow;
  }

  controlDeckWindow = new BrowserWindow({
    title: 'Esports Broadcast Controller — Operator Control Deck',
    width: WINDOW_DIMENSIONS.CONTROL_DECK.width,
    height: WINDOW_DIMENSIONS.CONTROL_DECK.height,
    minWidth: WINDOW_DIMENSIONS.CONTROL_DECK.minWidth,
    minHeight: WINDOW_DIMENSIONS.CONTROL_DECK.minHeight,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    show: false,
    backgroundColor: '#0B0E14',
    autoHideMenuBar: true,
    webPreferences: getSecureWebPreferences(),
  });

  controlDeckWindow.once('ready-to-show', () => {
    if (isWindowUsable(controlDeckWindow)) {
      controlDeckWindow.show();
      broadcastConnectionStatus(windowManager, 'CONTROL_DECK_READY');
    }
  });

  const emitControlWindowState = (reason) => {
    if (isWindowUsable(controlDeckWindow)) {
      broadcastConnectionStatus(windowManager, reason);
    }
  };

  controlDeckWindow.on('maximize', () =>
    emitControlWindowState('CONTROL_WINDOW_MAXIMIZED')
  );
  controlDeckWindow.on('unmaximize', () =>
    emitControlWindowState('CONTROL_WINDOW_UNMAXIMIZED')
  );
  controlDeckWindow.on('enter-full-screen', () =>
    emitControlWindowState('CONTROL_WINDOW_FULLSCREEN_ENTER')
  );
  controlDeckWindow.on('leave-full-screen', () =>
    emitControlWindowState('CONTROL_WINDOW_FULLSCREEN_LEAVE')
  );
  controlDeckWindow.on('minimize', () =>
    emitControlWindowState('CONTROL_WINDOW_MINIMIZED')
  );
  controlDeckWindow.on('restore', () =>
    emitControlWindowState('CONTROL_WINDOW_RESTORED')
  );
  controlDeckWindow.on('resize', () =>
    emitControlWindowState('CONTROL_WINDOW_RESIZED')
  );

  controlDeckWindow.on('closed', () => {
    controlDeckWindow = null;
  });

  loadWindowEntry(controlDeckWindow, 'control-deck').catch((err) => {
    console.error('[Main] Failed to load Control Deck window:', err);
  });

  return controlDeckWindow;
}

/**
 * Creates the frameless, transparent Broadcast Overlay Viewport BrowserWindow
 * configured for OBS Studio Window/Game Capture.
 */
function createOverlayViewportWindow() {
  if (isWindowUsable(overlayViewportWindow)) {
    overlayViewportWindow.showInactive();
    broadcastConnectionStatus(windowManager, 'OVERLAY_ALREADY_OPEN');
    return overlayViewportWindow;
  }

  overlayViewportWindow = new BrowserWindow({
    title: 'Esports Broadcast Controller — Broadcast Overlay Viewport',
    width: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.width,
    height: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.height,
    minWidth: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.minWidth,
    minHeight: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.minHeight,
    x: 60,
    y: 60,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    show: true,
    skipTaskbar: false,
    webPreferences: getSecureWebPreferences(),
  });

  overlayViewportWindow.webContents.once('did-finish-load', () => {
    broadcastConnectionStatus(windowManager, 'OVERLAY_LOADED');
  });

  overlayViewportWindow.on('show', () => {
    broadcastConnectionStatus(windowManager, 'OVERLAY_SHOWN');
  });

  overlayViewportWindow.on('hide', () => {
    broadcastConnectionStatus(windowManager, 'OVERLAY_HIDDEN');
  });

  overlayViewportWindow.on('resize', () => {
    broadcastConnectionStatus(windowManager, 'OVERLAY_RESIZED');
  });

  overlayViewportWindow.on('move', () => {
    broadcastConnectionStatus(windowManager, 'OVERLAY_MOVED');
  });

  overlayViewportWindow.on('closed', () => {
    overlayViewportWindow = null;
    broadcastConnectionStatus(windowManager, 'OVERLAY_CLOSED');
  });

  loadWindowEntry(overlayViewportWindow, 'overlay-viewport').catch((err) => {
    console.error('[Main] Failed to load Overlay Viewport window:', err);
  });

  return overlayViewportWindow;
}

const windowManager = {
  getControlWindow: () => controlDeckWindow,
  getOverlayWindow: () => overlayViewportWindow,
  ensureOverlayWindow: () => createOverlayViewportWindow(),
};

app.whenReady().then(() => {
  const runtimeOptions = {
    isPackaged: Boolean(app.isPackaged),
    userDataPath: app.getPath('userData'),
    resourcesPath: process.resourcesPath,
    desktopCapturer,
    systemPreferences,
  };

  registerIpcHandlers(ipcMain, windowManager, runtimeOptions);
  createControlDeckWindow();
  createOverlayViewportWindow();

  app.on('activate', () => {
    // Recreate windows safely on macOS dock activation without creating duplicates
    registerIpcHandlers(ipcMain, windowManager, runtimeOptions);
    if (!isWindowUsable(controlDeckWindow)) {
      createControlDeckWindow();
    }
    if (!isWindowUsable(overlayViewportWindow)) {
      createOverlayViewportWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
