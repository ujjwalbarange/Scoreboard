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
});

/**
 * Returns a fresh mutable deep copy of DEFAULT_OVERLAY_CONFIG.
 */
export function createDefaultOverlayConfig() {
  return {
    canvas: { ...DEFAULT_OVERLAY_CONFIG.canvas },
    background: { ...DEFAULT_OVERLAY_CONFIG.background },
    scorecard: { ...DEFAULT_OVERLAY_CONFIG.scorecard },
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
  };
}

/**
 * Resets only the background configuration back to transparent defaults,
 * preserving canvas and scorecard customizations.
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
 * preserving canvas and uploaded background configuration.
 */
export function resetScorecardConfig(currentConfig) {
  const safe = sanitizeOverlayConfig(currentConfig);
  return {
    ...safe,
    scorecard: { ...DEFAULT_OVERLAY_CONFIG.scorecard },
  };
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
  const halfWidthMargin = (100 - scorecard.widthPercent) / 2;
  const halfHeightMargin = (100 - scorecard.heightPercent) / 2;
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
  const { canvas, background, scorecard } = config;
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
      '--overlay-rows-per-col': String(rowsPerColumn),
    },
    config,
    fitReport,
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
