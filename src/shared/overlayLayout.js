/**
 * Landscape Two-Column Scorecard, Three-Column Controller Grid &
 * Responsive Customizable Broadcast Overlay Layout Engine
 * Phase 3 Addendum: Window Controls, Landscape Scorecard & Customizable Overlay Editor
 */

export const OVERLAY_RESOLUTION_PRESETS = Object.freeze([
  {
    id: '1920x1080',
    label: '1920×1080 (Full HD 1080p)',
    shortLabel: '1920×1080',
    width: 1920,
    height: 1080,
    aspect: '16:9',
  },
  {
    id: '1600x900',
    label: '1600×900 (HD+ 900p)',
    shortLabel: '1600×900',
    width: 1600,
    height: 900,
    aspect: '16:9',
  },
  {
    id: '1280x720',
    label: '1280×720 (HD 720p)',
    shortLabel: '1280×720',
    width: 1280,
    height: 720,
    aspect: '16:9',
  },
  {
    id: 'custom',
    label: 'Custom Dimensions',
    shortLabel: 'Custom',
    width: null,
    height: null,
    aspect: 'custom',
  },
]);

export const OVERLAY_BACKGROUND_SCALE_MODES = Object.freeze([
  { id: 'cover', label: 'Cover (Fill Canvas)' },
  { id: 'contain', label: 'Contain (Fit Inside)' },
  { id: 'stretch', label: 'Stretch (100% × 100%)' },
]);

export const OVERLAY_BACKGROUND_POSITIONS = Object.freeze([
  { id: 'center', label: 'Center', cssValue: 'center center' },
  { id: 'top', label: 'Top Center', cssValue: 'center top' },
  { id: 'bottom', label: 'Bottom Center', cssValue: 'center bottom' },
  { id: 'left', label: 'Center Left', cssValue: 'left center' },
  { id: 'right', label: 'Center Right', cssValue: 'right center' },
  { id: 'top-left', label: 'Top Left', cssValue: 'left top' },
  { id: 'top-right', label: 'Top Right', cssValue: 'right top' },
  { id: 'bottom-left', label: 'Bottom Left', cssValue: 'left bottom' },
  { id: 'bottom-right', label: 'Bottom Right', cssValue: 'right bottom' },
]);

export const OVERLAY_ACCENT_PRESETS = Object.freeze([
  { id: 'gold', label: 'Broadcast Gold', color: '#f59e0b' },
  { id: 'cyan', label: 'Cyber Cyan', color: '#06b6d4' },
  { id: 'emerald', label: 'Arena Emerald', color: '#10b981' },
  { id: 'crimson', label: 'Valor Crimson', color: '#f43f5e' },
  { id: 'violet', label: 'Apex Violet', color: '#8b5cf6' },
]);

export const OVERLAY_COMPOSITION_MODES = Object.freeze([
  {
    id: 'OVERLAY_ONLY',
    label: 'Overlay Only',
    shortLabel: 'Overlay Only',
    description: 'Transparent OBS leaderboard overlay without gameplay feed.',
  },
  {
    id: 'FULLSCREEN_GAMEPLAY',
    label: 'Fullscreen Gameplay',
    shortLabel: 'Fullscreen + Corner',
    description:
      'Gameplay fills the 16:9 canvas with the live leaderboard docked in a configurable corner.',
  },
  {
    id: 'PICTURE_IN_PICTURE',
    label: 'Picture-in-Picture',
    shortLabel: 'PiP Gameplay',
    description:
      'Gameplay appears in a smaller, movable, resizable PiP frame alongside the live leaderboard.',
  },
  {
    id: 'LEADERBOARD_FOCUS',
    label: 'Leaderboard Focus',
    shortLabel: 'Leaderboard Focus',
    description:
      'Leaderboard becomes prominent while gameplay remains visible in a compact secondary frame.',
  },
  {
    id: 'GAMEPLAY_ONLY',
    label: 'Gameplay Only',
    shortLabel: 'Gameplay Only',
    description:
      'Hides the leaderboard without stopping live gameplay capture.',
  },
]);

export const GAMEPLAY_DISPLAY_MODES = Object.freeze([
  {
    id: 'contain',
    label: 'Fitted (Preserve Aspect Ratio)',
    shortLabel: 'Fitted (16:9)',
    cssObjectFit: 'contain',
  },
  {
    id: 'cover',
    label: 'Fullscreen Fill (Crop to Fill)',
    shortLabel: 'Fullscreen Fill',
    cssObjectFit: 'cover',
  },
  {
    id: 'stretch',
    label: 'Stretch (100% × 100%)',
    shortLabel: 'Stretch',
    cssObjectFit: 'fill',
  },
]);

export const CORNER_PRESET_OPTIONS = Object.freeze([
  { id: 'top-left', label: 'Top-Left', shortLabel: 'TL' },
  { id: 'top-right', label: 'Top-Right', shortLabel: 'TR' },
  { id: 'bottom-left', label: 'Bottom-Left', shortLabel: 'BL' },
  { id: 'bottom-right', label: 'Bottom-Right', shortLabel: 'BR' },
  { id: 'center', label: 'Center', shortLabel: 'CTR' },
]);

export const GAMEPLAY_LAYER_ORDER_OPTIONS = Object.freeze([
  {
    id: 'GAMEPLAY_BEHIND',
    label: 'Gameplay Behind Leaderboard (Default)',
    shortLabel: 'Behind Leaderboard',
  },
  {
    id: 'GAMEPLAY_FRONT',
    label: 'Gameplay Frame In Front of Leaderboard',
    shortLabel: 'In Front (PiP)',
  },
]);

export const ALLOWED_BG_MIME_TYPES = Object.freeze(
  new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
);

export const ALLOWED_BG_EXTENSIONS = Object.freeze(
  new Set(['.png', '.jpg', '.jpeg', '.webp'])
);

export const MAX_BACKGROUND_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB safe limit

export const DEFAULT_OVERLAY_CONFIG = Object.freeze({
  canvas: Object.freeze({
    presetId: '1920x1080',
    width: 1920,
    height: 1080,
    referenceWidth: 1920,
    referenceHeight: 1080,
    lockAspectRatio: true,
    paddingPx: 20,
  }),
  background: Object.freeze({
    imageDataUrl: null,
    fileName: null,
    mimeType: null,
    fileSize: 0,
    opacity: 1,
    scaleMode: 'cover',
    position: 'center',
  }),
  scorecard: Object.freeze({
    widthPercent: 96,
    heightPercent: 92,
    offsetXPercent: 0,
    offsetYPercent: 0,
    columnGapPx: 16,
    rowHeightMode: 'auto', // 'auto' | 'fixed'
    rowHeightPx: 32,
    rowGapPx: 1,
    headerFontSizePx: 22,
    teamFontSizePx: 14,
    scoreFontSizePx: 14,
    tableBgOpacity: 0.9,
    rowBgOpacity: 0.92,
    accentColor: '#f59e0b',
    headerBgColor: '#0a0e17',
    rowBgColor: '#0c111c',
    textColor: '#f8fafc',
    showHeader: true,
    showSlotKey: true,
    showAliveBars: true,
    showKillPoints: true,
    showPlacementPoints: true,
  }),
  gameplay: Object.freeze({
    compositionMode: 'OVERLAY_ONLY', // 'OVERLAY_ONLY' | 'FULLSCREEN_GAMEPLAY' | 'PICTURE_IN_PICTURE' | 'LEADERBOARD_FOCUS' | 'GAMEPLAY_ONLY'
    captureActive: false,
    sourceId: null,
    sourceName: null,
    sourceType: null, // 'window' | 'screen' | 'browser-display' | null
    sourceStatus: 'IDLE', // 'IDLE' | 'CONNECTING' | 'LIVE' | 'MINIMIZED' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'STOPPED'
    sourceStatusMessage: null,
    frameXPercent: 58,
    frameYPercent: 56,
    frameWidthPercent: 38,
    frameHeightPercent: 38,
    displayMode: 'contain', // 'contain' | 'cover' | 'stretch'
    cornerPreset: 'bottom-right',
    opacity: 1,
    borderWidthPx: 2,
    borderColor: '#06b6d4',
    cornerRadiusPx: 8,
    showSourceLabel: true,
    layerOrder: 'GAMEPLAY_BEHIND', // 'GAMEPLAY_BEHIND' | 'GAMEPLAY_FRONT'
    leaderboardVisible: true,
    leaderboardScale: 1,
    leaderboardCornerPreset: 'center',
    leaderboardBorderWidthPx: 0,
    leaderboardBorderColor: '#f59e0b',
    leaderboardCornerRadiusPx: 6,
  }),
});

/**
 * Returns a fresh mutable deep copy of DEFAULT_OVERLAY_CONFIG.
 */
export function createDefaultOverlayConfig() {
  return {
    canvas: { ...DEFAULT_OVERLAY_CONFIG.canvas },
    background: { ...DEFAULT_OVERLAY_CONFIG.background },
    scorecard: { ...DEFAULT_OVERLAY_CONFIG.scorecard },
    gameplay: { ...DEFAULT_OVERLAY_CONFIG.gameplay },
  };
}

function clampNumber(val, min, max, fallback) {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeHexColor(val, fallback) {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

function hexToRgba(hex, alpha = 1) {
  const safeHex = sanitizeHexColor(hex, '#0c111c').replace('#', '');
  const expanded =
    safeHex.length === 3
      ? safeHex
          .split('')
          .map((c) => c + c)
          .join('')
      : safeHex;
  const r = parseInt(expanded.slice(0, 2), 16) || 12;
  const g = parseInt(expanded.slice(2, 4), 16) || 17;
  const b = parseInt(expanded.slice(4, 6), 16) || 28;
  const a = clampNumber(alpha, 0, 1, 1);
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

/**
 * Validates and sanitizes an overlay configuration object, merging partial
 * updates safely over an existing base config.
 *
 * @param {Record<string, any> | null | undefined} input
 * @param {Record<string, any>} [baseConfig]
 */
export function sanitizeOverlayConfig(input, baseConfig = DEFAULT_OVERLAY_CONFIG) {
  const base =
    baseConfig && typeof baseConfig === 'object'
      ? {
          canvas: {
            ...DEFAULT_OVERLAY_CONFIG.canvas,
            ...(baseConfig.canvas || {}),
          },
          background: {
            ...DEFAULT_OVERLAY_CONFIG.background,
            ...(baseConfig.background || {}),
          },
          scorecard: {
            ...DEFAULT_OVERLAY_CONFIG.scorecard,
            ...(baseConfig.scorecard || {}),
          },
          gameplay: {
            ...DEFAULT_OVERLAY_CONFIG.gameplay,
            ...(baseConfig.gameplay || {}),
          },
        }
      : createDefaultOverlayConfig();

  if (!input || typeof input !== 'object') {
    return base;
  }

  const rawCanvas =
    input.canvas && typeof input.canvas === 'object' ? input.canvas : {};
  const rawBg =
    input.background && typeof input.background === 'object'
      ? input.background
      : {};
  const rawScorecard =
    input.scorecard && typeof input.scorecard === 'object'
      ? input.scorecard
      : {};
  const rawGameplay =
    input.gameplay && typeof input.gameplay === 'object' ? input.gameplay : {};

  // 1. Canvas resolution & scaling config
  let width = Math.round(
    clampNumber(rawCanvas.width, 320, 3840, base.canvas.width)
  );
  let height = Math.round(
    clampNumber(rawCanvas.height, 240, 2160, base.canvas.height)
  );
  const validPresetIds = new Set(OVERLAY_RESOLUTION_PRESETS.map((p) => p.id));
  let presetId =
    typeof rawCanvas.presetId === 'string' &&
    validPresetIds.has(rawCanvas.presetId)
      ? rawCanvas.presetId
      : base.canvas.presetId;

  // If a standard preset was explicitly passed without custom dimensions, sync dimensions
  if (
    rawCanvas.presetId &&
    rawCanvas.presetId !== 'custom' &&
    rawCanvas.width === undefined &&
    rawCanvas.height === undefined
  ) {
    const matchedPreset = OVERLAY_RESOLUTION_PRESETS.find(
      (p) => p.id === rawCanvas.presetId
    );
    if (matchedPreset && matchedPreset.width && matchedPreset.height) {
      width = matchedPreset.width;
      height = matchedPreset.height;
    }
  } else {
    // Detect if width/height match a standard preset
    const matchingPreset = OVERLAY_RESOLUTION_PRESETS.find(
      (p) => p.width === width && p.height === height
    );
    presetId = matchingPreset ? matchingPreset.id : 'custom';
  }

  const referenceWidth = Math.round(
    clampNumber(
      rawCanvas.referenceWidth,
      640,
      3840,
      base.canvas.referenceWidth || 1920
    )
  );
  const referenceHeight = Math.round(
    clampNumber(
      rawCanvas.referenceHeight,
      360,
      2160,
      base.canvas.referenceHeight || 1080
    )
  );
  const lockAspectRatio =
    typeof rawCanvas.lockAspectRatio === 'boolean'
      ? rawCanvas.lockAspectRatio
      : base.canvas.lockAspectRatio;
  const paddingPx = Math.round(
    clampNumber(rawCanvas.paddingPx, 0, 80, base.canvas.paddingPx)
  );

  // 2. Background image & styling config
  const validScaleModes = new Set(
    OVERLAY_BACKGROUND_SCALE_MODES.map((m) => m.id)
  );
  const scaleMode =
    typeof rawBg.scaleMode === 'string' && validScaleModes.has(rawBg.scaleMode)
      ? rawBg.scaleMode
      : base.background.scaleMode;

  const validPositions = new Set(OVERLAY_BACKGROUND_POSITIONS.map((p) => p.id));
  const position =
    typeof rawBg.position === 'string' && validPositions.has(rawBg.position)
      ? rawBg.position
      : base.background.position;

  const opacity = Number(
    clampNumber(rawBg.opacity, 0, 1, base.background.opacity).toFixed(2)
  );

  let imageDataUrl = base.background.imageDataUrl;
  let fileName = base.background.fileName;
  let mimeType = base.background.mimeType;
  let fileSize = base.background.fileSize;

  if (rawBg.imageDataUrl === null || rawBg.imageDataUrl === '') {
    imageDataUrl = null;
    fileName = null;
    mimeType = null;
    fileSize = 0;
  } else if (
    typeof rawBg.imageDataUrl === 'string' &&
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(
      rawBg.imageDataUrl.trim()
    )
  ) {
    imageDataUrl = rawBg.imageDataUrl.trim();
    fileName =
      typeof rawBg.fileName === 'string'
        ? rawBg.fileName.trim().slice(0, 120)
        : fileName || 'overlay-background.png';
    mimeType =
      typeof rawBg.mimeType === 'string' &&
      ALLOWED_BG_MIME_TYPES.has(rawBg.mimeType.toLowerCase())
        ? rawBg.mimeType.toLowerCase()
        : mimeType || 'image/png';
    fileSize = Math.round(
      clampNumber(
        rawBg.fileSize,
        0,
        MAX_BACKGROUND_IMAGE_BYTES,
        fileSize || imageDataUrl.length
      )
    );
  }

  // 3. Independent Scorecard / Table customization config
  const widthPercent = Number(
    clampNumber(
      rawScorecard.widthPercent,
      40,
      100,
      base.scorecard.widthPercent
    ).toFixed(1)
  );
  const heightPercent = Number(
    clampNumber(
      rawScorecard.heightPercent,
      40,
      100,
      base.scorecard.heightPercent
    ).toFixed(1)
  );
  const offsetXPercent = Number(
    clampNumber(
      rawScorecard.offsetXPercent,
      -45,
      45,
      base.scorecard.offsetXPercent
    ).toFixed(1)
  );
  const offsetYPercent = Number(
    clampNumber(
      rawScorecard.offsetYPercent,
      -45,
      45,
      base.scorecard.offsetYPercent
    ).toFixed(1)
  );
  const columnGapPx = Math.round(
    clampNumber(rawScorecard.columnGapPx, 0, 64, base.scorecard.columnGapPx)
  );
  const rowHeightMode =
    rawScorecard.rowHeightMode === 'fixed' ||
    rawScorecard.rowHeightMode === 'auto'
      ? rawScorecard.rowHeightMode
      : base.scorecard.rowHeightMode;
  const rowHeightPx = Math.round(
    clampNumber(rawScorecard.rowHeightPx, 16, 64, base.scorecard.rowHeightPx)
  );
  const rowGapPx = Math.round(
    clampNumber(rawScorecard.rowGapPx, 0, 16, base.scorecard.rowGapPx)
  );
  const headerFontSizePx = Math.round(
    clampNumber(
      rawScorecard.headerFontSizePx,
      10,
      48,
      base.scorecard.headerFontSizePx
    )
  );
  const teamFontSizePx = Math.round(
    clampNumber(
      rawScorecard.teamFontSizePx,
      9,
      32,
      base.scorecard.teamFontSizePx
    )
  );
  const scoreFontSizePx = Math.round(
    clampNumber(
      rawScorecard.scoreFontSizePx,
      9,
      32,
      base.scorecard.scoreFontSizePx
    )
  );
  const tableBgOpacity = Number(
    clampNumber(
      rawScorecard.tableBgOpacity,
      0,
      1,
      base.scorecard.tableBgOpacity
    ).toFixed(2)
  );
  const rowBgOpacity = Number(
    clampNumber(
      rawScorecard.rowBgOpacity,
      0,
      1,
      base.scorecard.rowBgOpacity
    ).toFixed(2)
  );

  const accentColor = sanitizeHexColor(
    rawScorecard.accentColor,
    base.scorecard.accentColor
  );
  const headerBgColor = sanitizeHexColor(
    rawScorecard.headerBgColor,
    base.scorecard.headerBgColor
  );
  const rowBgColor = sanitizeHexColor(
    rawScorecard.rowBgColor,
    base.scorecard.rowBgColor
  );
  const textColor = sanitizeHexColor(
    rawScorecard.textColor,
    base.scorecard.textColor
  );

  const showHeader =
    typeof rawScorecard.showHeader === 'boolean'
      ? rawScorecard.showHeader
      : base.scorecard.showHeader;
  const showSlotKey =
    typeof rawScorecard.showSlotKey === 'boolean'
      ? rawScorecard.showSlotKey
      : base.scorecard.showSlotKey;
  const showAliveBars =
    typeof rawScorecard.showAliveBars === 'boolean'
      ? rawScorecard.showAliveBars
      : base.scorecard.showAliveBars;
  const showKillPoints =
    typeof rawScorecard.showKillPoints === 'boolean'
      ? rawScorecard.showKillPoints
      : base.scorecard.showKillPoints;
  const showPlacementPoints =
    typeof rawScorecard.showPlacementPoints === 'boolean'
      ? rawScorecard.showPlacementPoints
      : base.scorecard.showPlacementPoints;

  // 4. Gameplay Capture & Picture-in-Picture Composition config
  const validCompositionModes = new Set(
    OVERLAY_COMPOSITION_MODES.map((m) => m.id)
  );
  const compositionMode =
    typeof rawGameplay.compositionMode === 'string' &&
    validCompositionModes.has(rawGameplay.compositionMode)
      ? rawGameplay.compositionMode
      : base.gameplay.compositionMode;

  const captureActive =
    typeof rawGameplay.captureActive === 'boolean'
      ? rawGameplay.captureActive
      : base.gameplay.captureActive;

  const sourceId =
    rawGameplay.sourceId === null
      ? null
      : typeof rawGameplay.sourceId === 'string' && rawGameplay.sourceId.trim()
      ? rawGameplay.sourceId.trim().slice(0, 160)
      : base.gameplay.sourceId;

  const sourceName =
    rawGameplay.sourceName === null
      ? null
      : typeof rawGameplay.sourceName === 'string' &&
        rawGameplay.sourceName.trim()
      ? rawGameplay.sourceName.trim().slice(0, 160)
      : base.gameplay.sourceName;

  const validSourceTypes = new Set(['window', 'screen', 'browser-display']);
  const sourceType =
    rawGameplay.sourceType === null
      ? null
      : typeof rawGameplay.sourceType === 'string' &&
        validSourceTypes.has(rawGameplay.sourceType)
      ? rawGameplay.sourceType
      : base.gameplay.sourceType;

  const validStatuses = new Set([
    'IDLE',
    'CONNECTING',
    'LIVE',
    'MINIMIZED',
    'PERMISSION_DENIED',
    'UNAVAILABLE',
    'STOPPED',
  ]);
  const sourceStatus =
    typeof rawGameplay.sourceStatus === 'string' &&
    validStatuses.has(rawGameplay.sourceStatus)
      ? rawGameplay.sourceStatus
      : base.gameplay.sourceStatus;

  const sourceStatusMessage =
    rawGameplay.sourceStatusMessage === null
      ? null
      : typeof rawGameplay.sourceStatusMessage === 'string'
      ? rawGameplay.sourceStatusMessage.trim().slice(0, 260)
      : base.gameplay.sourceStatusMessage;

  const frameWidthPercent = Number(
    clampNumber(
      rawGameplay.frameWidthPercent,
      15,
      100,
      base.gameplay.frameWidthPercent
    ).toFixed(1)
  );
  const frameHeightPercent = Number(
    clampNumber(
      rawGameplay.frameHeightPercent,
      15,
      100,
      base.gameplay.frameHeightPercent
    ).toFixed(1)
  );
  const frameXPercent = Number(
    clampNumber(
      rawGameplay.frameXPercent,
      0,
      100 - Math.min(100, frameWidthPercent),
      base.gameplay.frameXPercent
    ).toFixed(1)
  );
  const frameYPercent = Number(
    clampNumber(
      rawGameplay.frameYPercent,
      0,
      100 - Math.min(100, frameHeightPercent),
      base.gameplay.frameYPercent
    ).toFixed(1)
  );

  const validDisplayModes = new Set(GAMEPLAY_DISPLAY_MODES.map((m) => m.id));
  const displayMode =
    typeof rawGameplay.displayMode === 'string' &&
    validDisplayModes.has(rawGameplay.displayMode)
      ? rawGameplay.displayMode
      : base.gameplay.displayMode;

  const validCorners = new Set([
    ...CORNER_PRESET_OPTIONS.map((c) => c.id),
    'custom',
  ]);
  const cornerPreset =
    typeof rawGameplay.cornerPreset === 'string' &&
    validCorners.has(rawGameplay.cornerPreset)
      ? rawGameplay.cornerPreset
      : base.gameplay.cornerPreset;

  const gameplayOpacity = Number(
    clampNumber(rawGameplay.opacity, 0.1, 1, base.gameplay.opacity).toFixed(2)
  );
  const borderWidthPx = Math.round(
    clampNumber(rawGameplay.borderWidthPx, 0, 12, base.gameplay.borderWidthPx)
  );
  const borderColor = sanitizeHexColor(
    rawGameplay.borderColor,
    base.gameplay.borderColor
  );
  const cornerRadiusPx = Math.round(
    clampNumber(rawGameplay.cornerRadiusPx, 0, 36, base.gameplay.cornerRadiusPx)
  );
  const showSourceLabel =
    typeof rawGameplay.showSourceLabel === 'boolean'
      ? rawGameplay.showSourceLabel
      : base.gameplay.showSourceLabel;

  const layerOrder =
    rawGameplay.layerOrder === 'GAMEPLAY_FRONT' ||
    rawGameplay.layerOrder === 'GAMEPLAY_BEHIND'
      ? rawGameplay.layerOrder
      : base.gameplay.layerOrder;

  const leaderboardVisible =
    typeof rawGameplay.leaderboardVisible === 'boolean'
      ? rawGameplay.leaderboardVisible
      : base.gameplay.leaderboardVisible;

  const leaderboardScale = Number(
    clampNumber(
      rawGameplay.leaderboardScale,
      0.35,
      1.25,
      base.gameplay.leaderboardScale
    ).toFixed(2)
  );

  const leaderboardCornerPreset =
    typeof rawGameplay.leaderboardCornerPreset === 'string' &&
    validCorners.has(rawGameplay.leaderboardCornerPreset)
      ? rawGameplay.leaderboardCornerPreset
      : base.gameplay.leaderboardCornerPreset;

  const leaderboardBorderWidthPx = Math.round(
    clampNumber(
      rawGameplay.leaderboardBorderWidthPx,
      0,
      10,
      base.gameplay.leaderboardBorderWidthPx
    )
  );
  const leaderboardBorderColor = sanitizeHexColor(
    rawGameplay.leaderboardBorderColor,
    base.gameplay.leaderboardBorderColor
  );
  const leaderboardCornerRadiusPx = Math.round(
    clampNumber(
      rawGameplay.leaderboardCornerRadiusPx,
      0,
      28,
      base.gameplay.leaderboardCornerRadiusPx
    )
  );

  return {
    canvas: {
      presetId,
      width,
      height,
      referenceWidth,
      referenceHeight,
      lockAspectRatio,
      paddingPx,
    },
    background: {
      imageDataUrl,
      fileName,
      mimeType,
      fileSize,
      opacity,
      scaleMode,
      position,
    },
    scorecard: {
      widthPercent,
      heightPercent,
      offsetXPercent,
      offsetYPercent,
      columnGapPx,
      rowHeightMode,
      rowHeightPx,
      rowGapPx,
      headerFontSizePx,
      teamFontSizePx,
      scoreFontSizePx,
      tableBgOpacity,
      rowBgOpacity,
      accentColor,
      headerBgColor,
      rowBgColor,
      textColor,
      showHeader,
      showSlotKey,
      showAliveBars,
      showKillPoints,
      showPlacementPoints,
    },
    gameplay: {
      compositionMode,
      captureActive,
      sourceId,
      sourceName,
      sourceType,
      sourceStatus,
      sourceStatusMessage,
      frameXPercent,
      frameYPercent,
      frameWidthPercent,
      frameHeightPercent,
      displayMode,
      cornerPreset,
      opacity: gameplayOpacity,
      borderWidthPx,
      borderColor,
      cornerRadiusPx,
      showSourceLabel,
      layerOrder,
      leaderboardVisible,
      leaderboardScale,
      leaderboardCornerPreset,
      leaderboardBorderWidthPx,
      leaderboardBorderColor,
      leaderboardCornerRadiusPx,
    },
  };
}

/**
 * Resets only the background configuration back to transparent defaults,
 * preserving canvas, scorecard, and gameplay customizations.
 */
export function resetBackgroundConfig(currentConfig) {
  const safe = sanitizeOverlayConfig(currentConfig);
  return {
    ...safe,
    background: { ...DEFAULT_OVERLAY_CONFIG.background },
  };
}

/**
 * Resets only the scorecard/table customization back to defaults,
 * preserving canvas, uploaded background, and gameplay configuration.
 */
export function resetScorecardConfig(currentConfig) {
  const safe = sanitizeOverlayConfig(currentConfig);
  return {
    ...safe,
    scorecard: { ...DEFAULT_OVERLAY_CONFIG.scorecard },
  };
}

/**
 * Resets the gameplay & PiP layout configuration back to defaults,
 * while optionally preserving active capture source connection if desired.
 */
export function resetGameplayConfig(currentConfig, options = {}) {
  const safe = sanitizeOverlayConfig(currentConfig);
  const preserveCaptureSource = Boolean(options?.preserveCaptureSource);
  return {
    ...safe,
    scorecard: {
      ...safe.scorecard,
      offsetXPercent: 0,
      offsetYPercent: 0,
    },
    gameplay: {
      ...DEFAULT_OVERLAY_CONFIG.gameplay,
      ...(preserveCaptureSource
        ? {
            captureActive: safe.gameplay.captureActive,
            sourceId: safe.gameplay.sourceId,
            sourceName: safe.gameplay.sourceName,
            sourceType: safe.gameplay.sourceType,
            sourceStatus: safe.gameplay.sourceStatus,
            sourceStatusMessage: safe.gameplay.sourceStatusMessage,
          }
        : {}),
    },
  };
}

/**
 * Applies a corner placement preset ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center')
 * to either the 'gameplay' PiP frame or the 'leaderboard' scorecard stage.
 */
export function applyCornerPlacementPreset(
  currentConfig,
  presetId,
  target = 'gameplay'
) {
  const safe = sanitizeOverlayConfig(currentConfig);
  const validIds = new Set(CORNER_PRESET_OPTIONS.map((c) => c.id));
  const resolvedPreset = validIds.has(presetId) ? presetId : 'center';

  if (target === 'leaderboard') {
    const scale = safe.gameplay.leaderboardScale;
    const effW = safe.scorecard.widthPercent * scale;
    const effH = safe.scorecard.heightPercent * scale;
    const maxOffsetX = Math.min(45, Math.max(0, (100 - effW) / 2 - 2));
    const maxOffsetY = Math.min(45, Math.max(0, (100 - effH) / 2 - 2));

    let offsetX = 0;
    let offsetY = 0;
    if (resolvedPreset === 'top-left') {
      offsetX = -Number(maxOffsetX.toFixed(1));
      offsetY = -Number(maxOffsetY.toFixed(1));
    } else if (resolvedPreset === 'top-right') {
      offsetX = Number(maxOffsetX.toFixed(1));
      offsetY = -Number(maxOffsetY.toFixed(1));
    } else if (resolvedPreset === 'bottom-left') {
      offsetX = -Number(maxOffsetX.toFixed(1));
      offsetY = Number(maxOffsetY.toFixed(1));
    } else if (resolvedPreset === 'bottom-right') {
      offsetX = Number(maxOffsetX.toFixed(1));
      offsetY = Number(maxOffsetY.toFixed(1));
    }

    return sanitizeOverlayConfig(
      {
        scorecard: {
          ...safe.scorecard,
          offsetXPercent: offsetX,
          offsetYPercent: offsetY,
        },
        gameplay: {
          ...safe.gameplay,
          leaderboardCornerPreset: resolvedPreset,
        },
      },
      safe
    );
  }

  // Target === 'gameplay'
  const w = safe.gameplay.frameWidthPercent;
  const h = safe.gameplay.frameHeightPercent;
  const margin = w >= 98 || h >= 98 ? 0 : 3;

  let x = (100 - w) / 2;
  let y = (100 - h) / 2;
  if (resolvedPreset === 'top-left') {
    x = margin;
    y = margin;
  } else if (resolvedPreset === 'top-right') {
    x = Math.max(0, 100 - w - margin);
    y = margin;
  } else if (resolvedPreset === 'bottom-left') {
    x = margin;
    y = Math.max(0, 100 - h - margin);
  } else if (resolvedPreset === 'bottom-right') {
    x = Math.max(0, 100 - w - margin);
    y = Math.max(0, 100 - h - margin);
  }

  return sanitizeOverlayConfig(
    {
      gameplay: {
        ...safe.gameplay,
        cornerPreset: resolvedPreset,
        frameXPercent: Number(x.toFixed(1)),
        frameYPercent: Number(y.toFixed(1)),
      },
    },
    safe
  );
}

/**
 * Applies one of the 5 broadcast composition modes with tailored frame & leaderboard presets:
 * - OVERLAY_ONLY
 * - FULLSCREEN_GAMEPLAY
 * - PICTURE_IN_PICTURE
 * - LEADERBOARD_FOCUS
 * - GAMEPLAY_ONLY
 */
export function applyCompositionModePreset(currentConfig, modeId) {
  const safe = sanitizeOverlayConfig(currentConfig);
  const validModes = new Set(OVERLAY_COMPOSITION_MODES.map((m) => m.id));
  const mode = validModes.has(modeId) ? modeId : 'OVERLAY_ONLY';

  if (mode === 'OVERLAY_ONLY') {
    return sanitizeOverlayConfig(
      {
        scorecard: {
          ...safe.scorecard,
          offsetXPercent: 0,
          offsetYPercent: 0,
        },
        gameplay: {
          ...safe.gameplay,
          compositionMode: 'OVERLAY_ONLY',
          leaderboardVisible: true,
          leaderboardScale: 1,
          leaderboardCornerPreset: 'center',
          layerOrder: 'GAMEPLAY_BEHIND',
        },
      },
      safe
    );
  }

  if (mode === 'FULLSCREEN_GAMEPLAY') {
    // Fullscreen gameplay (100%x100%) with leaderboard docked in a configurable corner (default top-right)
    const corner =
      safe.gameplay.leaderboardCornerPreset &&
      safe.gameplay.leaderboardCornerPreset !== 'center' &&
      safe.gameplay.leaderboardCornerPreset !== 'custom'
        ? safe.gameplay.leaderboardCornerPreset
        : 'top-right';
    const nextWithScale = sanitizeOverlayConfig(
      {
        gameplay: {
          ...safe.gameplay,
          compositionMode: 'FULLSCREEN_GAMEPLAY',
          frameXPercent: 0,
          frameYPercent: 0,
          frameWidthPercent: 100,
          frameHeightPercent: 100,
          cornerPreset: 'center',
          borderWidthPx: 0,
          cornerRadiusPx: 0,
          layerOrder: 'GAMEPLAY_BEHIND',
          leaderboardVisible: true,
          leaderboardScale: 0.62,
          leaderboardCornerPreset: corner,
        },
      },
      safe
    );
    return applyCornerPlacementPreset(nextWithScale, corner, 'leaderboard');
  }

  if (mode === 'PICTURE_IN_PICTURE') {
    // Gameplay in a movable, resizable PiP frame (38%x38% bottom-right) + prominent leaderboard
    const pipCorner =
      safe.gameplay.cornerPreset &&
      safe.gameplay.cornerPreset !== 'custom' &&
      safe.gameplay.cornerPreset !== 'center'
        ? safe.gameplay.cornerPreset
        : 'bottom-right';
    const nextPip = sanitizeOverlayConfig(
      {
        scorecard: {
          ...safe.scorecard,
          offsetXPercent: -4,
          offsetYPercent: -4,
        },
        gameplay: {
          ...safe.gameplay,
          compositionMode: 'PICTURE_IN_PICTURE',
          frameWidthPercent: 38,
          frameHeightPercent: 38,
          borderWidthPx: Math.max(2, safe.gameplay.borderWidthPx || 2),
          cornerRadiusPx: Math.max(8, safe.gameplay.cornerRadiusPx || 8),
          layerOrder: 'GAMEPLAY_FRONT',
          leaderboardVisible: true,
          leaderboardScale: 0.9,
          leaderboardCornerPreset: 'custom',
        },
      },
      safe
    );
    return applyCornerPlacementPreset(nextPip, pipCorner, 'gameplay');
  }

  if (mode === 'LEADERBOARD_FOCUS') {
    // Leaderboard prominent (96% scale) with compact secondary gameplay frame in bottom-right
    const focusPip = sanitizeOverlayConfig(
      {
        scorecard: {
          ...safe.scorecard,
          offsetXPercent: 0,
          offsetYPercent: -3,
        },
        gameplay: {
          ...safe.gameplay,
          compositionMode: 'LEADERBOARD_FOCUS',
          frameWidthPercent: 28,
          frameHeightPercent: 28,
          borderWidthPx: Math.max(2, safe.gameplay.borderWidthPx || 2),
          cornerRadiusPx: Math.max(6, safe.gameplay.cornerRadiusPx || 6),
          layerOrder: 'GAMEPLAY_FRONT',
          leaderboardVisible: true,
          leaderboardScale: 0.96,
          leaderboardCornerPreset: 'center',
        },
      },
      safe
    );
    return applyCornerPlacementPreset(focusPip, 'bottom-right', 'gameplay');
  }

  // GAMEPLAY_ONLY: hide leaderboard without stopping gameplay capture
  return sanitizeOverlayConfig(
    {
      gameplay: {
        ...safe.gameplay,
        compositionMode: 'GAMEPLAY_ONLY',
        frameXPercent: 0,
        frameYPercent: 0,
        frameWidthPercent: 100,
        frameHeightPercent: 100,
        cornerPreset: 'center',
        borderWidthPx: 0,
        cornerRadiusPx: 0,
        leaderboardVisible: false,
      },
    },
    safe
  );
}

/**
 * Validates a background image upload payload (file type, extension, size, and base64 data URL).
 *
 * @param {{
 *   fileName?: string,
 *   mimeType?: string,
 *   fileSize?: number,
 *   dataUrl?: string,
 *   maxBytes?: number
 * }} payload
 */
export function validateBackgroundImageUpload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      error: 'No image file payload provided.',
    };
  }

  const maxBytes =
    typeof payload.maxBytes === 'number' && payload.maxBytes > 0
      ? payload.maxBytes
      : MAX_BACKGROUND_IMAGE_BYTES;

  const rawFileName =
    typeof payload.fileName === 'string' ? payload.fileName.trim() : '';
  if (!rawFileName) {
    return {
      valid: false,
      error: 'Image file name is required.',
    };
  }

  const extMatch = rawFileName.toLowerCase().match(/\.[a-z0-9]+$/);
  const ext = extMatch ? extMatch[0] : '';
  if (!ALLOWED_BG_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported image file extension "${ext || 'unknown'}". Allowed formats: PNG, JPG, JPEG, WebP.`,
    };
  }

  const rawMime =
    typeof payload.mimeType === 'string'
      ? payload.mimeType.trim().toLowerCase()
      : '';
  if (rawMime && !ALLOWED_BG_MIME_TYPES.has(rawMime)) {
    return {
      valid: false,
      error: `Unsupported image MIME type "${rawMime}". Allowed formats: PNG, JPG, WebP.`,
    };
  }

  const rawDataUrl =
    typeof payload.dataUrl === 'string' ? payload.dataUrl.trim() : '';
  if (!rawDataUrl) {
    return {
      valid: false,
      error: 'Image data is empty or unreadable.',
    };
  }

  const dataUrlMatch = rawDataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!dataUrlMatch) {
    return {
      valid: false,
      error:
        'Invalid image encoding. Only valid base64 PNG, JPG, or WebP images are supported.',
    };
  }

  const detectedMime = dataUrlMatch[1].toLowerCase();
  const base64Body = dataUrlMatch[2].replace(/\s+/g, '');
  const estimatedBytes = Math.floor((base64Body.length * 3) / 4);
  const reportedSize =
    typeof payload.fileSize === 'number' && Number.isFinite(payload.fileSize)
      ? payload.fileSize
      : estimatedBytes;

  if (reportedSize <= 0 || estimatedBytes <= 0) {
    return {
      valid: false,
      error: 'Uploaded image file is empty (0 bytes).',
    };
  }

  if (reportedSize > maxBytes || estimatedBytes > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Image file exceeds maximum allowed size of ${maxMb} MB.`,
    };
  }

  return {
    valid: true,
    sanitized: {
      fileName: rawFileName.slice(0, 120),
      mimeType: detectedMime === 'image/jpg' ? 'image/jpeg' : detectedMime,
      fileSize: reportedSize,
      imageDataUrl: `data:${detectedMime === 'image/jpg' ? 'image/jpeg' : detectedMime};base64,${base64Body}`,
    },
  };
}

/**
 * Computes proportional scaling factors for rendering the broadcast overlay canvas
 * across any container/window resolution without changing the intended OBS output dimensions.
 *
 * @param {{
 *   containerWidth: number,
 *   containerHeight: number,
 *   canvasWidth?: number,
 *   canvasHeight?: number,
 *   referenceWidth?: number,
 *   referenceHeight?: number
 * }} params
 */
export function computeResponsiveCanvasScale(params = {}) {
  const canvasWidth = clampNumber(params.canvasWidth, 320, 3840, 1920);
  const canvasHeight = clampNumber(params.canvasHeight, 240, 2160, 1080);
  const referenceWidth = clampNumber(params.referenceWidth, 640, 3840, 1920);
  const referenceHeight = clampNumber(params.referenceHeight, 360, 2160, 1080);

  const containerWidth = clampNumber(
    params.containerWidth,
    120,
    7680,
    canvasWidth
  );
  const containerHeight = clampNumber(
    params.containerHeight,
    90,
    4320,
    canvasHeight
  );

  // Scale factor that fits the virtual target canvas (e.g. 1920x1080 or 1280x720)
  // inside the actual DOM container (e.g. embedded preview monitor or resized window)
  const scaleX = containerWidth / canvasWidth;
  const scaleY = containerHeight / canvasHeight;
  const viewportScale = Number(Math.min(scaleX, scaleY).toFixed(4));

  // Reference scale factor that scales typography, row heights, and spacing
  // proportionally when the target canvas resolution changes (e.g. 1920x1080 -> 1280x720 = 0.6667)
  const refScaleX = canvasWidth / referenceWidth;
  const refScaleY = canvasHeight / referenceHeight;
  const referenceScale = Number(Math.min(refScaleX, refScaleY).toFixed(4));

  return {
    canvasWidth,
    canvasHeight,
    containerWidth,
    containerHeight,
    viewportScale,
    referenceScale,
    scaledWidthPx: Math.round(canvasWidth * viewportScale),
    scaledHeightPx: Math.round(canvasHeight * viewportScale),
    aspectRatio: Number((canvasWidth / canvasHeight).toFixed(4)),
  };
}

/**
 * Checks whether all leaderboard rows (e.g. 26 teams = 13 rows per column)
 * fit comfortably inside the configured canvas and scorecard dimensions without clipping.
 * Returns a warning and clamped effective row height when dimensions are too small.
 *
 * @param {{
 *   overlayConfig?: Record<string, any>,
 *   rowsPerColumn?: number,
 *   viewMode?: string
 * }} [options]
 */
export function checkOverlayLayoutFit(options = {}) {
  const config = sanitizeOverlayConfig(options.overlayConfig);
  const rowsPerColumn = Math.max(1, Number(options.rowsPerColumn || 13));
  const viewMode = options.viewMode || 'MATCH';

  const { canvas, scorecard } = config;
  const { referenceScale } = computeResponsiveCanvasScale({
    containerWidth: canvas.width,
    containerHeight: canvas.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    referenceWidth: canvas.referenceWidth,
    referenceHeight: canvas.referenceHeight,
  });

  const usableCanvasHeight = Math.max(
    120,
    canvas.height - canvas.paddingPx * 2 * referenceScale
  );
  const scorecardBoxHeight =
    usableCanvasHeight * (scorecard.heightPercent / 100);

  // Chrome overhead: top broadcast header + column table header + optional podium strip
  const topHeaderOverhead = scorecard.showHeader
    ? Math.max(32, (scorecard.headerFontSizePx * 2.2 + 16) * referenceScale)
    : 0;
  const colHeaderOverhead = Math.max(22, 34 * referenceScale);
  const podiumOverhead =
    viewMode === 'END_OF_MATCH' ? Math.max(44, 68 * referenceScale) : 0;
  const totalGapsHeight =
    Math.max(0, rowsPerColumn - 1) * scorecard.rowGapPx * referenceScale;

  const availableRowsHeightPx = Math.max(
    40,
    scorecardBoxHeight -
      topHeaderOverhead -
      colHeaderOverhead -
      podiumOverhead -
      totalGapsHeight
  );

  const maxAutoRowHeightPx = availableRowsHeightPx / rowsPerColumn;
  const requestedRowHeightPx =
    scorecard.rowHeightMode === 'fixed'
      ? scorecard.rowHeightPx * referenceScale
      : maxAutoRowHeightPx;

  // Minimum legible row height based on scaled font sizes (sensible floor of 13px)
  const scaledMaxFont =
    Math.max(scorecard.teamFontSizePx, scorecard.scoreFontSizePx) *
    referenceScale;
  const minLegibleRowHeightPx = Math.max(13, scaledMaxFont + 4);

  const requiredRowsHeightPx =
    rowsPerColumn * Math.max(requestedRowHeightPx, minLegibleRowHeightPx);
  const requiredTotalHeightPx = Math.round(
    requiredRowsHeightPx +
      topHeaderOverhead +
      colHeaderOverhead +
      podiumOverhead +
      totalGapsHeight
  );

  // Check if scorecard overflows canvas due to X/Y offset or tiny dimensions
  const lbScale = config.gameplay?.leaderboardScale || 1;
  const halfWidthMargin = (100 - scorecard.widthPercent * lbScale) / 2;
  const halfHeightMargin = (100 - scorecard.heightPercent * lbScale) / 2;
  const offsetClipsX = Math.abs(scorecard.offsetXPercent) > halfWidthMargin + 1;
  const offsetClipsY =
    Math.abs(scorecard.offsetYPercent) > halfHeightMargin + 1;

  const fitsVertically =
    availableRowsHeightPx + 1 >= requiredRowsHeightPx &&
    canvas.height >= 400 &&
    canvas.width >= 640;
  const fits = fitsVertically && !offsetClipsX && !offsetClipsY;

  const effectiveRowHeightPx = Number(
    Math.max(
      12,
      Math.min(maxAutoRowHeightPx, requestedRowHeightPx)
    ).toFixed(2)
  );

  let warning = null;
  if (canvas.width < 640 || canvas.height < 400) {
    warning = `Canvas resolution (${canvas.width}×${canvas.height}) is below recommended minimum (640×400) for 26 teams. Minimum row sizes applied.`;
  } else if (!fitsVertically) {
    warning = `Selected table height (${scorecard.heightPercent}%), row height (${scorecard.rowHeightPx}px), or font size exceeds available vertical space (${Math.round(
      scorecardBoxHeight
    )}px < ${requiredTotalHeightPx}px needed). Rows auto-clamped to prevent clipping.`;
  } else if (offsetClipsX || offsetClipsY) {
    warning = `Scorecard position offset (${scorecard.offsetXPercent}%, ${scorecard.offsetYPercent}%) pushes the table beyond the canvas edge.`;
  }

  return {
    fits,
    fitsVertically,
    offsetClipsX,
    offsetClipsY,
    availableHeightPx: Math.round(scorecardBoxHeight),
    requiredHeightPx: requiredTotalHeightPx,
    effectiveRowHeightPx,
    referenceScale,
    warning,
  };
}

/**
 * Generates CSS custom properties (`--ov-*`) from the overlay configuration
 * so the Broadcast Overlay scales proportionally at any 16:9 or custom resolution.
 *
 * @param {Record<string, any>} rawConfig
 * @param {number} [rowsPerColumn=13]
 * @param {string} [viewMode='MATCH']
 */
export function computeOverlayCssVariables(
  rawConfig,
  rowsPerColumn = 13,
  viewMode = 'MATCH'
) {
  const config = sanitizeOverlayConfig(rawConfig);
  const { canvas, background, scorecard, gameplay } = config;
  const fitReport = checkOverlayLayoutFit({
    overlayConfig: config,
    rowsPerColumn,
    viewMode,
  });
  const refScale = fitReport.referenceScale;

  const posEntry =
    OVERLAY_BACKGROUND_POSITIONS.find((p) => p.id === background.position) ||
    OVERLAY_BACKGROUND_POSITIONS[0];

  const bgSizeCss =
    background.scaleMode === 'stretch'
      ? '100% 100%'
      : background.scaleMode === 'contain'
      ? 'contain'
      : 'cover';

  const displayEntry =
    GAMEPLAY_DISPLAY_MODES.find((m) => m.id === gameplay.displayMode) ||
    GAMEPLAY_DISPLAY_MODES[0];

  const scaledHeaderFont = Math.max(
    11,
    Number((scorecard.headerFontSizePx * refScale).toFixed(2))
  );
  const scaledTeamFont = Math.max(
    9.5,
    Number((scorecard.teamFontSizePx * refScale).toFixed(2))
  );
  const scaledScoreFont = Math.max(
    9.5,
    Number((scorecard.scoreFontSizePx * refScale).toFixed(2))
  );
  const scaledColGap = Math.max(
    4,
    Number((scorecard.columnGapPx * refScale).toFixed(2))
  );
  const scaledRowGap = Math.max(
    0,
    Number((scorecard.rowGapPx * refScale).toFixed(2))
  );
  const scaledPadding = Math.max(
    0,
    Number((canvas.paddingPx * refScale).toFixed(2))
  );

  const showGameplayLayer = gameplay.compositionMode !== 'OVERLAY_ONLY';
  const showLeaderboardLayer =
    gameplay.compositionMode !== 'GAMEPLAY_ONLY' &&
    Boolean(gameplay.leaderboardVisible);

  const gameplayZIndex = gameplay.layerOrder === 'GAMEPLAY_FRONT' ? 20 : 4;
  const leaderboardZIndex = 10;

  return {
    cssVars: {
      '--ov-canvas-width': `${canvas.width}px`,
      '--ov-canvas-height': `${canvas.height}px`,
      '--ov-ref-scale': String(refScale),
      '--ov-canvas-padding': `${scaledPadding}px`,
      '--ov-table-width': `${scorecard.widthPercent}%`,
      '--ov-table-height': `${scorecard.heightPercent}%`,
      '--ov-offset-x': `${scorecard.offsetXPercent}%`,
      '--ov-offset-y': `${scorecard.offsetYPercent}%`,
      '--ov-lb-scale': String(gameplay.leaderboardScale),
      '--ov-lb-z-index': String(leaderboardZIndex),
      '--ov-lb-border':
        gameplay.leaderboardBorderWidthPx > 0
          ? `${Math.round(gameplay.leaderboardBorderWidthPx * refScale)}px solid ${gameplay.leaderboardBorderColor}`
          : 'none',
      '--ov-lb-radius': `${Math.round(gameplay.leaderboardCornerRadiusPx * refScale)}px`,
      '--ov-col-gap': `${scaledColGap}px`,
      '--ov-row-gap': `${scaledRowGap}px`,
      '--ov-row-height':
        scorecard.rowHeightMode === 'fixed'
          ? `${fitReport.effectiveRowHeightPx}px`
          : '1fr',
      '--ov-header-font': `${scaledHeaderFont}px`,
      '--ov-team-font': `${scaledTeamFont}px`,
      '--ov-score-font': `${scaledScoreFont}px`,
      '--ov-accent-color': scorecard.accentColor,
      '--ov-text-color': scorecard.textColor,
      '--ov-header-bg': hexToRgba(
        scorecard.headerBgColor,
        Math.min(1, scorecard.tableBgOpacity + 0.05)
      ),
      '--ov-table-bg': hexToRgba(
        scorecard.headerBgColor,
        scorecard.tableBgOpacity
      ),
      '--ov-row-bg': hexToRgba(scorecard.rowBgColor, scorecard.rowBgOpacity),
      '--ov-row-top3-bg': hexToRgba(
        '#141f36',
        Math.min(1, scorecard.rowBgOpacity + 0.04)
      ),
      '--ov-bg-opacity': String(background.opacity),
      '--ov-bg-size': bgSizeCss,
      '--ov-bg-position': posEntry.cssValue,
      '--ov-gameplay-x': `${gameplay.frameXPercent}%`,
      '--ov-gameplay-y': `${gameplay.frameYPercent}%`,
      '--ov-gameplay-w': `${gameplay.frameWidthPercent}%`,
      '--ov-gameplay-h': `${gameplay.frameHeightPercent}%`,
      '--ov-gameplay-fit': displayEntry.cssObjectFit,
      '--ov-gameplay-opacity': String(gameplay.opacity),
      '--ov-gameplay-border':
        gameplay.borderWidthPx > 0
          ? `${Math.round(gameplay.borderWidthPx * refScale)}px solid ${gameplay.borderColor}`
          : 'none',
      '--ov-gameplay-radius': `${Math.round(gameplay.cornerRadiusPx * refScale)}px`,
      '--ov-gameplay-z-index': String(gameplayZIndex),
      '--overlay-rows-per-col': String(rowsPerColumn),
    },
    config,
    fitReport,
    compositionState: {
      compositionMode: gameplay.compositionMode,
      showGameplayLayer,
      showLeaderboardLayer,
      gameplayZIndex,
      leaderboardZIndex,
      gameplayObjectFit: displayEntry.cssObjectFit,
    },
  };
}

/**
 * Distributes leaderboard teams evenly across two balanced columns (Left & Right)
 * for a 16:9 landscape broadcast scorecard, preserving strict rank order.
 *
 * For 26 teams:
 * - Left Column: Ranks #01–#13 (13 teams)
 * - Right Column: Ranks #14–#26 (13 teams)
 *
 * @param {Array<Record<string, any>>} teams
 * @param {number} [rowLimit=26]
 */
export function splitTeamsIntoBalancedColumns(teams, rowLimit = 26) {
  const safeList = Array.isArray(teams) ? teams : [];
  const limit =
    typeof rowLimit === 'number' && Number.isFinite(rowLimit) && rowLimit > 0
      ? Math.min(safeList.length, Math.floor(rowLimit))
      : safeList.length;

  const displayed = safeList.slice(0, limit);
  const rowsPerColumn = Math.max(1, Math.ceil(displayed.length / 2));
  const leftColumn = displayed.slice(0, rowsPerColumn);
  const rightColumn = displayed.slice(rowsPerColumn);

  return {
    displayed,
    leftColumn,
    rightColumn,
    rowsPerColumn,
    totalDisplayed: displayed.length,
  };
}

/**
 * Computes the Control Deck team selector grid layout configuration based on
 * whether the Overview panel is visible or hidden.
 *
 * @param {{ isOverviewVisible: boolean, totalTeams?: number }} options
 */
export function getTeamGridLayoutConfig(options = { isOverviewVisible: true }) {
  const isOverviewVisible = Boolean(options?.isOverviewVisible);
  const totalTeams =
    typeof options?.totalTeams === 'number' && options.totalTeams > 0
      ? options.totalTeams
      : 26;

  if (!isOverviewVisible) {
    return {
      columns: 3,
      compact: true,
      reclaimedOverviewSpace: true,
      rowsNeeded: Math.ceil(totalTeams / 3),
      gridClassName: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2',
    };
  }

  return {
    columns: 2,
    compact: false,
    gridClassName: 'grid grid-cols-1 md:grid-cols-2 gap-3',
    reclaimedOverviewSpace: false,
    rowsNeeded: Math.ceil(totalTeams / 2),
  };
}
