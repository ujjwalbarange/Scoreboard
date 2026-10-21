import React, { useRef, useState } from 'react';
import {
  CORNER_PRESET_OPTIONS,
  GAMEPLAY_DISPLAY_MODES,
  GAMEPLAY_LAYER_ORDER_OPTIONS,
  OVERLAY_ACCENT_PRESETS,
  OVERLAY_BACKGROUND_POSITIONS,
  OVERLAY_BACKGROUND_SCALE_MODES,
  OVERLAY_COMPOSITION_MODES,
  OVERLAY_RESOLUTION_PRESETS,
  checkOverlayLayoutFit,
  sanitizeOverlayConfig,
  validateBackgroundImageUpload,
} from '../../shared/overlayLayout.js';

/**
 * Broadcast Overlay Customization Editor Panel
 * Phase 3 Addendum: Responsive & Fully Customizable Broadcast Overlay Editor
 * + Gameplay Window Integration & Picture-in-Picture Broadcast Mode
 */
export default function OverlayEditorPanel({
  overlayConfig,
  overlayViewMode = 'MATCH',
  onUpdateOverlayConfig,
  onSelectCompositionMode,
  onApplyCornerPreset,
  onUploadBackground,
  onResetBackground,
  onResetScorecard,
  onResetGameplay,
  onResetAll,
  onApplyWindowBounds,
  onOpenGameplayWindow,
  onStopGameplayCapture,
}) {
  const config = sanitizeOverlayConfig(overlayConfig);
  const { canvas, background, scorecard, gameplay } = config;

  const [activeSection, setActiveSection] = useState('ALL'); // 'ALL' | 'CANVAS' | 'BACKGROUND' | 'SCORECARD' | 'GAMEPLAY'
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fitReport = checkOverlayLayoutFit({
    overlayConfig: config,
    rowsPerColumn: 13,
    viewMode: overlayViewMode,
  });

  const updateCanvas = (patch) => {
    onUpdateOverlayConfig?.({
      canvas: {
        ...canvas,
        ...patch,
      },
    });
  };

  const updateBackground = (patch) => {
    onUpdateOverlayConfig?.({
      background: {
        ...background,
        ...patch,
      },
    });
  };

  const updateScorecard = (patch) => {
    onUpdateOverlayConfig?.({
      scorecard: {
        ...scorecard,
        ...patch,
      },
    });
  };

  const updateGameplay = (patch) => {
    onUpdateOverlayConfig?.({
      gameplay: {
        ...gameplay,
        ...patch,
      },
    });
  };

  const handlePresetChange = (presetId) => {
    const preset = OVERLAY_RESOLUTION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.id === 'custom') {
      updateCanvas({ presetId: 'custom' });
    } else {
      updateCanvas({
        presetId: preset.id,
        width: preset.width,
        height: preset.height,
      });
    }
  };

  const handleCustomWidthChange = (rawVal) => {
    const num = Number(rawVal);
    if (!Number.isFinite(num)) return;
    const clampedW = Math.max(320, Math.min(3840, Math.round(num)));
    if (canvas.lockAspectRatio) {
      const lockedH = Math.max(
        240,
        Math.min(2160, Math.round((clampedW * 9) / 16))
      );
      updateCanvas({
        presetId: 'custom',
        width: clampedW,
        height: lockedH,
      });
    } else {
      updateCanvas({
        presetId: 'custom',
        width: clampedW,
      });
    }
  };

  const handleCustomHeightChange = (rawVal) => {
    const num = Number(rawVal);
    if (!Number.isFinite(num)) return;
    const clampedH = Math.max(240, Math.min(2160, Math.round(num)));
    if (canvas.lockAspectRatio) {
      const lockedW = Math.max(
        320,
        Math.min(3840, Math.round((clampedH * 16) / 9))
      );
      updateCanvas({
        presetId: 'custom',
        width: lockedW,
        height: clampedH,
      });
    } else {
      updateCanvas({
        presetId: 'custom',
        height: clampedH,
      });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (e.target) {
      e.target.value = '';
    }
    if (!file) return;

    setUploadError('');

    // Fast pre-read check for extension, MIME, and file size
    const extMatch = String(file.name || '')
      .toLowerCase()
      .match(/\.[a-z0-9]+$/);
    const ext = extMatch ? extMatch[0] : '';
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      setUploadError(
        `Invalid file format "${ext || file.name}". Please upload a PNG, JPG, or WebP image.`
      );
      return;
    }

    if (file.size <= 0) {
      setUploadError('Selected image file is empty (0 bytes).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError(
        `Image file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 8.0 MB limit.`
      );
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const validation = validateBackgroundImageUpload({
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          dataUrl,
        });

        if (!validation.valid || !validation.sanitized) {
          setUploadError(validation.error || 'Invalid background image.');
          setUploading(false);
          return;
        }

        const res = await onUploadBackground?.({
          fileName: validation.sanitized.fileName,
          mimeType: validation.sanitized.mimeType,
          fileSize: validation.sanitized.fileSize,
          dataUrl: validation.sanitized.imageDataUrl,
        });

        if (res && res.ok === false && res.error) {
          setUploadError(res.error);
        }
      } catch (err) {
        setUploadError(
          err instanceof Error
            ? err.message
            : 'Failed to process background image.'
        );
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read selected image file from disk.');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const showCanvasSection =
    activeSection === 'ALL' || activeSection === 'CANVAS';
  const showBackgroundSection =
    activeSection === 'ALL' || activeSection === 'BACKGROUND';
  const showScorecardSection =
    activeSection === 'ALL' || activeSection === 'SCORECARD';
  const showGameplaySection =
    activeSection === 'ALL' || activeSection === 'GAMEPLAY';

  return (
    <div
      data-testid="overlay-editor-panel"
      className="mt-3 rounded-md border border-slate-800 bg-[#0a0f18] p-3 text-xs text-slate-200 space-y-3"
    >
      {/* Editor Top Bar & Section Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Controls' },
            { id: 'CANVAS', label: '1. Canvas' },
            { id: 'BACKGROUND', label: '2. Background' },
            { id: 'SCORECARD', label: '3. Scorecard' },
            { id: 'GAMEPLAY', label: '4. Gameplay & PiP' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`editor-section-tab-${tab.id.toLowerCase()}`}
              onClick={() => setActiveSection(tab.id)}
              className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                activeSection === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                  : 'border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          data-testid="restore-all-overlay-defaults-btn"
          onClick={() => {
            setUploadError('');
            onResetAll?.();
          }}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-amber-400/60 hover:text-amber-300 transition-colors"
        >
          Restore All Defaults
        </button>
      </div>

      {/* Live Fit Warning Banner when custom canvas or row settings risk clipping */}
      {!fitReport.fits && fitReport.warning && (
        <div
          data-testid="overlay-fit-warning"
          role="alert"
          className="rounded border border-amber-500/50 bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-200 flex items-start justify-between gap-2"
        >
          <div>
            <strong className="font-bold text-amber-400 mr-1">
              Layout Fit Warning:
            </strong>
            <span>{fitReport.warning}</span>
          </div>
          <span className="deck-mono-font text-[10px] text-amber-300 shrink-0">
            Row: {fitReport.effectiveRowHeightPx}px
          </span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. RESPONSIVE OVERLAY CANVAS & RESOLUTION                           */}
      {/* =================================================================== */}
      {showCanvasSection && (
        <section
          data-testid="overlay-editor-canvas-section"
          className="rounded border border-slate-800/90 bg-[#0d1320] p-2.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="deck-display-font text-xs font-bold tracking-wider text-cyan-300 uppercase">
              1. Responsive Overlay Canvas ({canvas.width}×{canvas.height})
            </h3>
            <span className="deck-mono-font text-[10px] text-slate-400">
              Scale: {(fitReport.referenceScale * 100).toFixed(0)}% ·{' '}
              {fitReport.fits ? '26 Teams Fit' : 'Auto-Clamped'}
            </span>
          </div>

          {/* Quick 16:9 Landscape Resolution Preset Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {OVERLAY_RESOLUTION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`canvas-preset-btn-${preset.id}`}
                onClick={() => handlePresetChange(preset.id)}
                className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                  canvas.presetId === preset.id
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'border border-slate-700/80 bg-slate-900 text-slate-300 hover:border-cyan-400/50 hover:text-white'
                }`}
              >
                {preset.shortLabel}
              </button>
            ))}
          </div>

          {/* Custom Width / Height + Lock 16:9 + Apply to OBS Window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">
                Canvas Width (px)
              </span>
              <input
                type="number"
                min={320}
                max={3840}
                step={10}
                data-testid="overlay-custom-width-input"
                aria-label="Overlay Canvas Width"
                value={canvas.width}
                onChange={(e) => handleCustomWidthChange(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#090d14] px-2 py-1 text-xs deck-mono-font text-white focus:border-cyan-400 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">
                Canvas Height (px)
              </span>
              <input
                type="number"
                min={240}
                max={2160}
                step={10}
                data-testid="overlay-custom-height-input"
                aria-label="Overlay Canvas Height"
                value={canvas.height}
                onChange={(e) => handleCustomHeightChange(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#090d14] px-2 py-1 text-xs deck-mono-font text-white focus:border-cyan-400 focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-between gap-1.5">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="overlay-lock-aspect-checkbox"
                  checked={Boolean(canvas.lockAspectRatio)}
                  onChange={(e) =>
                    updateCanvas({ lockAspectRatio: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-900 text-cyan-400"
                />
                <span>16:9</span>
              </label>

              <button
                type="button"
                data-testid="apply-obs-resolution-btn"
                onClick={() =>
                  onApplyWindowBounds?.({
                    width: canvas.width,
                    height: canvas.height,
                  })
                }
                className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:text-white whitespace-nowrap"
                title="Resize live Electron overlay window to match target output dimensions"
              >
                Sync Window
              </button>
            </div>
          </div>

          {/* Canvas Outer Padding */}
          <label className="block">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Canvas Safe Padding</span>
              <span className="deck-mono-font text-slate-200">
                {canvas.paddingPx}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={64}
              step={2}
              data-testid="overlay-canvas-padding-slider"
              aria-label="Canvas Safe Padding"
              value={canvas.paddingPx}
              onChange={(e) =>
                updateCanvas({ paddingPx: Number(e.target.value) })
              }
              className="w-full accent-cyan-400"
            />
          </label>
        </section>
      )}

      {/* =================================================================== */}
      {/* 2. BACKGROUND IMAGE UPLOAD & CONTROLS                               */}
      {/* =================================================================== */}
      {showBackgroundSection && (
        <section
          data-testid="overlay-editor-background-section"
          className="rounded border border-slate-800/90 bg-[#0d1320] p-2.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="deck-display-font text-xs font-bold tracking-wider text-cyan-300 uppercase">
              2. Background Image Customization
            </h3>
            <span
              data-testid="bg-status-badge"
              className={`deck-mono-font text-[10px] px-1.5 py-0.5 rounded ${
                background.imageDataUrl
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              {background.imageDataUrl
                ? `${background.fileName || 'Custom Image'} (${Math.max(1, Math.round((background.fileSize || 1024) / 1024))} KB)`
                : 'Transparent (#00000000)'}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            data-testid="bg-file-input"
            aria-label="Upload Overlay Background Image"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="upload-bg-btn"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded bg-cyan-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Background'}
            </button>

            <button
              type="button"
              data-testid="remove-bg-btn"
              disabled={!background.imageDataUrl}
              onClick={() => {
                setUploadError('');
                onResetBackground?.();
              }}
              className="rounded border border-rose-500/40 bg-rose-950/30 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/40 disabled:opacity-40"
            >
              Remove Background
            </button>

            <button
              type="button"
              data-testid="restore-bg-default-btn"
              onClick={() => {
                setUploadError('');
                onResetBackground?.();
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Restore Default
            </button>
          </div>

          {uploadError && (
            <div
              data-testid="bg-upload-error"
              role="alert"
              className="rounded border border-rose-500/50 bg-rose-950/40 px-2.5 py-1.5 text-[11px] text-rose-200"
            >
              {uploadError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
            {/* Background Opacity */}
            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>BG Opacity</span>
                <span className="deck-mono-font text-slate-200">
                  {Math.round(background.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                data-testid="bg-opacity-slider"
                aria-label="Background Opacity"
                value={background.opacity}
                onChange={(e) =>
                  updateBackground({ opacity: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </label>

            {/* Scaling Mode (cover, contain, stretch) */}
            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">
                Scaling Mode
              </span>
              <select
                data-testid="bg-scale-mode-select"
                aria-label="Background Scaling Mode"
                value={background.scaleMode}
                onChange={(e) =>
                  updateBackground({ scaleMode: e.target.value })
                }
                className="w-full rounded border border-slate-700 bg-[#090d14] px-2 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                {OVERLAY_BACKGROUND_SCALE_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Positioning */}
            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">
                BG Position
              </span>
              <select
                data-testid="bg-position-select"
                aria-label="Background Position"
                value={background.position}
                onChange={(e) => updateBackground({ position: e.target.value })}
                className="w-full rounded border border-slate-700 bg-[#090d14] px-2 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                {OVERLAY_BACKGROUND_POSITIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 3. INDEPENDENT SCORECARD / TABLE CUSTOMIZATION                      */}
      {/* =================================================================== */}
      {showScorecardSection && (
        <section
          data-testid="overlay-editor-scorecard-section"
          className="rounded border border-slate-800/90 bg-[#0d1320] p-2.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="deck-display-font text-xs font-bold tracking-wider text-cyan-300 uppercase">
              3. Independent Scorecard & Table Customization
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="center-scorecard-btn"
                onClick={() =>
                  updateScorecard({ offsetXPercent: 0, offsetYPercent: 0 })
                }
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:border-cyan-400/50 hover:text-white"
              >
                Center Position
              </button>
              <button
                type="button"
                data-testid="reset-scorecard-btn"
                onClick={() => onResetScorecard?.()}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:border-amber-400/60"
              >
                Reset Scorecard
              </button>
            </div>
          </div>

          {/* Table Width & Height + Horizontal & Vertical Position */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Table Width</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.widthPercent}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                data-testid="scorecard-width-slider"
                aria-label="Scorecard Table Width Percent"
                value={scorecard.widthPercent}
                onChange={(e) =>
                  updateScorecard({ widthPercent: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Table Height</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.heightPercent}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                data-testid="scorecard-height-slider"
                aria-label="Scorecard Table Height Percent"
                value={scorecard.heightPercent}
                onChange={(e) =>
                  updateScorecard({ heightPercent: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Position X</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.offsetXPercent > 0
                    ? `+${scorecard.offsetXPercent}%`
                    : `${scorecard.offsetXPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                step={1}
                data-testid="scorecard-offset-x-slider"
                aria-label="Scorecard Horizontal Position"
                value={scorecard.offsetXPercent}
                onChange={(e) =>
                  updateScorecard({ offsetXPercent: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Position Y</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.offsetYPercent > 0
                    ? `+${scorecard.offsetYPercent}%`
                    : `${scorecard.offsetYPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                step={1}
                data-testid="scorecard-offset-y-slider"
                aria-label="Scorecard Vertical Position"
                value={scorecard.offsetYPercent}
                onChange={(e) =>
                  updateScorecard({ offsetYPercent: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </label>
          </div>

          {/* Row Height Mode, Row Height, Row Spacing & Column Spacing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
            <label className="block">
              <span className="block text-[10px] text-slate-400 mb-0.5">
                Row Height Mode
              </span>
              <select
                data-testid="scorecard-row-mode-select"
                aria-label="Row Height Mode"
                value={scorecard.rowHeightMode}
                onChange={(e) =>
                  updateScorecard({ rowHeightMode: e.target.value })
                }
                className="w-full rounded border border-slate-700 bg-[#090d14] px-2 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="auto">Auto Fit (13 Rows)</option>
                <option value="fixed">Custom Row Height</option>
              </select>
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Row Height</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.rowHeightMode === 'auto'
                    ? `Auto (${Math.round(fitReport.effectiveRowHeightPx)}px)`
                    : `${scorecard.rowHeightPx}px`}
                </span>
              </div>
              <input
                type="range"
                min={18}
                max={52}
                step={1}
                data-testid="scorecard-row-height-slider"
                aria-label="Scorecard Row Height"
                value={scorecard.rowHeightPx}
                onChange={(e) =>
                  updateScorecard({
                    rowHeightMode: 'fixed',
                    rowHeightPx: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Row Spacing</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.rowGapPx}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                data-testid="scorecard-row-gap-slider"
                aria-label="Scorecard Row Spacing"
                value={scorecard.rowGapPx}
                onChange={(e) =>
                  updateScorecard({ rowGapPx: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Column Gap</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.columnGapPx}px
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={48}
                step={2}
                data-testid="scorecard-col-gap-slider"
                aria-label="Scorecard Column Gap"
                value={scorecard.columnGapPx}
                onChange={(e) =>
                  updateScorecard({ columnGapPx: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>
          </div>

          {/* Font Sizes: Header Font, Team Name Font, Score/Rank Font */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Header Font Size</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.headerFontSizePx}px
                </span>
              </div>
              <input
                type="range"
                min={14}
                max={36}
                step={1}
                data-testid="scorecard-header-font-slider"
                aria-label="Header Font Size"
                value={scorecard.headerFontSizePx}
                onChange={(e) =>
                  updateScorecard({ headerFontSizePx: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Team Name Font</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.teamFontSizePx}px
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={24}
                step={1}
                data-testid="scorecard-team-font-slider"
                aria-label="Team Name Font Size"
                value={scorecard.teamFontSizePx}
                onChange={(e) =>
                  updateScorecard({ teamFontSizePx: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Score & Rank Font</span>
                <span className="deck-mono-font text-slate-200">
                  {scorecard.scoreFontSizePx}px
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={24}
                step={1}
                data-testid="scorecard-score-font-slider"
                aria-label="Score Font Size"
                value={scorecard.scoreFontSizePx}
                onChange={(e) =>
                  updateScorecard({ scoreFontSizePx: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
            </label>
          </div>

          {/* Table & Row Opacity + Accent Color */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Table Panel Opacity</span>
                <span className="deck-mono-font text-slate-200">
                  {Math.round(scorecard.tableBgOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                data-testid="scorecard-table-opacity-slider"
                aria-label="Table Panel Opacity"
                value={scorecard.tableBgOpacity}
                onChange={(e) =>
                  updateScorecard({ tableBgOpacity: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span>Row Opacity</span>
                <span className="deck-mono-font text-slate-200">
                  {Math.round(scorecard.rowBgOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                data-testid="scorecard-row-opacity-slider"
                aria-label="Row Background Opacity"
                value={scorecard.rowBgOpacity}
                onChange={(e) =>
                  updateScorecard({ rowBgOpacity: Number(e.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <div>
              <span className="block text-[10px] text-slate-400 mb-1">
                Broadcast Accent Color
              </span>
              <div className="flex items-center gap-1.5">
                {OVERLAY_ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`accent-preset-${preset.id}`}
                    aria-label={`Select ${preset.label} Accent`}
                    title={preset.label}
                    onClick={() =>
                      updateScorecard({ accentColor: preset.color })
                    }
                    className={`h-5 w-5 rounded-full border ${
                      scorecard.accentColor.toLowerCase() ===
                      preset.color.toLowerCase()
                        ? 'border-white scale-110 ring-1 ring-white'
                        : 'border-slate-700 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: preset.color }}
                  />
                ))}
                <input
                  type="color"
                  data-testid="scorecard-accent-color-input"
                  aria-label="Custom Accent Color"
                  value={scorecard.accentColor}
                  onChange={(e) =>
                    updateScorecard({ accentColor: e.target.value })
                  }
                  className="h-5 w-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Visibility Toggles */}
          <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="toggle-show-header"
                checked={Boolean(scorecard.showHeader)}
                onChange={(e) =>
                  updateScorecard({ showHeader: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-400"
              />
              <span>Header Bar</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="toggle-show-slot-key"
                checked={Boolean(scorecard.showSlotKey)}
                onChange={(e) =>
                  updateScorecard({ showSlotKey: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-400"
              />
              <span>Slot Key [A-Z]</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="toggle-show-alive-bars"
                checked={Boolean(scorecard.showAliveBars)}
                onChange={(e) =>
                  updateScorecard({ showAliveBars: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-400"
              />
              <span>Alive Bars</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="toggle-show-kp"
                checked={Boolean(scorecard.showKillPoints)}
                onChange={(e) =>
                  updateScorecard({ showKillPoints: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-400"
              />
              <span>Kill Pts (KP)</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="toggle-show-pp"
                checked={Boolean(scorecard.showPlacementPoints)}
                onChange={(e) =>
                  updateScorecard({ showPlacementPoints: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-400"
              />
              <span>Place Pts (PP)</span>
            </label>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 4. GAMEPLAY WINDOW INTEGRATION & PICTURE-IN-PICTURE BROADCAST MODE    */}
      {/* ===================================================================== */}
      {showGameplaySection && (
        <section
          aria-label="Gameplay and Picture-in-Picture Composition Controls"
          data-testid="editor-gameplay-section"
          className="rounded border border-slate-800/90 bg-[#0d1421] p-2.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                4. Gameplay + Leaderboard Composition &amp; PiP Layout
              </h3>
              <p className="text-[11px] text-slate-400">
                Compose live gameplay capture with the transparent leaderboard
                in Fullscreen, Picture-in-Picture, or Focus modes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {onOpenGameplayWindow && (
                <button
                  type="button"
                  data-testid="editor-open-gameplay-window-btn"
                  onClick={onOpenGameplayWindow}
                  className="rounded bg-cyan-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-cyan-300 transition-colors whitespace-nowrap shrink-0"
                >
                  Gameplay Window
                </button>
              )}
              {gameplay.captureActive && onStopGameplayCapture && (
                <button
                  type="button"
                  data-testid="editor-stop-gameplay-btn"
                  onClick={onStopGameplayCapture}
                  className="rounded border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
                >
                  Stop Capture
                </button>
              )}
              <button
                type="button"
                data-testid="reset-gameplay-btn"
                onClick={onResetGameplay}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Reset Layout
              </button>
            </div>
          </div>

          {/* Composition Mode Selector */}
          <div>
            <span className="block text-[11px] font-semibold text-slate-300 mb-1">
              Composition Mode:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {OVERLAY_COMPOSITION_MODES.map((mode) => {
                const active = gameplay.compositionMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`composition-mode-btn-${mode.id}`}
                    onClick={() => onSelectCompositionMode?.(mode.id)}
                    aria-pressed={active}
                    title={mode.description}
                    className={`rounded border px-2.5 py-1.5 text-left transition-colors whitespace-nowrap ${
                      active
                        ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200 font-bold'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="text-[11px]">{mode.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gameplay Frame Position & Dimensions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-800/80">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-width-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Gameplay W:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {gameplay.frameWidthPercent}%
                </span>
              </div>
              <input
                id="gameplay-width-slider"
                data-testid="gameplay-width-slider"
                type="range"
                min="15"
                max="100"
                step="1"
                value={gameplay.frameWidthPercent}
                onChange={(e) =>
                  updateGameplay({
                    frameWidthPercent: Number(e.target.value),
                    cornerPreset: 'custom',
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-height-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Gameplay H:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {gameplay.frameHeightPercent}%
                </span>
              </div>
              <input
                id="gameplay-height-slider"
                data-testid="gameplay-height-slider"
                type="range"
                min="15"
                max="100"
                step="1"
                value={gameplay.frameHeightPercent}
                onChange={(e) =>
                  updateGameplay({
                    frameHeightPercent: Number(e.target.value),
                    cornerPreset: 'custom',
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-x-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Gameplay X:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {gameplay.frameXPercent}%
                </span>
              </div>
              <input
                id="gameplay-x-slider"
                data-testid="gameplay-x-slider"
                type="range"
                min="0"
                max={Math.max(0, 100 - gameplay.frameWidthPercent)}
                step="1"
                value={gameplay.frameXPercent}
                onChange={(e) =>
                  updateGameplay({
                    frameXPercent: Number(e.target.value),
                    cornerPreset: 'custom',
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-y-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Gameplay Y:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {gameplay.frameYPercent}%
                </span>
              </div>
              <input
                id="gameplay-y-slider"
                data-testid="gameplay-y-slider"
                type="range"
                min="0"
                max={Math.max(0, 100 - gameplay.frameHeightPercent)}
                step="1"
                value={gameplay.frameYPercent}
                onChange={(e) =>
                  updateGameplay({
                    frameYPercent: Number(e.target.value),
                    cornerPreset: 'custom',
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Display Fit Mode & Layer Order */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/80">
            <div>
              <label
                htmlFor="gameplay-display-mode-select"
                className="block text-[11px] font-medium text-slate-300 mb-1"
              >
                Gameplay Display Mode (Aspect Ratio):
              </label>
              <select
                id="gameplay-display-mode-select"
                data-testid="gameplay-display-mode-select"
                value={gameplay.displayMode}
                onChange={(e) =>
                  updateGameplay({ displayMode: e.target.value })
                }
                className="w-full rounded border border-slate-700 bg-[#080c14] px-2 py-1 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                {GAMEPLAY_DISPLAY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="gameplay-layer-order-select"
                className="block text-[11px] font-medium text-slate-300 mb-1"
              >
                Layer Order (Z-Index):
              </label>
              <select
                id="gameplay-layer-order-select"
                data-testid="gameplay-layer-order-select"
                value={gameplay.layerOrder}
                onChange={(e) => updateGameplay({ layerOrder: e.target.value })}
                className="w-full rounded border border-slate-700 bg-[#080c14] px-2 py-1 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                {GAMEPLAY_LAYER_ORDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Corner Placement Presets (Gameplay Frame & Leaderboard) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/80">
            <div>
              <span className="block text-[11px] font-medium text-slate-300 mb-1">
                Gameplay PiP Corner Placement Preset:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {CORNER_PRESET_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`gameplay-corner-preset-${c.id}`}
                    onClick={() => onApplyCornerPreset?.(c.id, 'gameplay')}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      gameplay.cornerPreset === c.id
                        ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-300 mb-1">
                Leaderboard Corner Placement Preset:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {CORNER_PRESET_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`leaderboard-corner-preset-${c.id}`}
                    onClick={() => onApplyCornerPreset?.(c.id, 'leaderboard')}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      gameplay.leaderboardCornerPreset === c.id
                        ? 'border-amber-400 bg-amber-950/60 text-amber-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Leaderboard Scale & Visibility + PiP Frame Styling */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-800/80">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="leaderboard-scale-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Leaderboard Scale:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-amber-300">
                  {Math.round(gameplay.leaderboardScale * 100)}%
                </span>
              </div>
              <input
                id="leaderboard-scale-slider"
                data-testid="leaderboard-scale-slider"
                type="range"
                min="0.35"
                max="1.25"
                step="0.05"
                value={gameplay.leaderboardScale}
                onChange={(e) =>
                  updateGameplay({ leaderboardScale: Number(e.target.value) })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-opacity-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Gameplay Opacity:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {Math.round(gameplay.opacity * 100)}%
                </span>
              </div>
              <input
                id="gameplay-opacity-slider"
                data-testid="gameplay-opacity-slider"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={gameplay.opacity}
                onChange={(e) =>
                  updateGameplay({ opacity: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-border-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  PiP Border:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {gameplay.borderWidthPx}px
                </span>
              </div>
              <input
                id="gameplay-border-slider"
                data-testid="gameplay-border-slider"
                type="range"
                min="0"
                max="12"
                step="1"
                value={gameplay.borderWidthPx}
                onChange={(e) =>
                  updateGameplay({ borderWidthPx: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="gameplay-radius-slider"
                  className="text-[11px] font-medium text-slate-300"
                >
                  Corner Radius:
                </label>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-300">
                  {gameplay.cornerRadiusPx}px
                </span>
              </div>
              <input
                id="gameplay-radius-slider"
                data-testid="gameplay-radius-slider"
                type="range"
                min="0"
                max="36"
                step="2"
                value={gameplay.cornerRadiusPx}
                onChange={(e) =>
                  updateGameplay({ cornerRadiusPx: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Toggles: Leaderboard Visibility, Source Badge, and PiP Border Color */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-slate-800/80">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="toggle-leaderboard-visible"
                  checked={Boolean(gameplay.leaderboardVisible)}
                  onChange={(e) =>
                    updateGameplay({ leaderboardVisible: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-900 text-cyan-400"
                />
                <span>Show Leaderboard Overlay</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="toggle-gameplay-source-label"
                  checked={Boolean(gameplay.showSourceLabel)}
                  onChange={(e) =>
                    updateGameplay({ showSourceLabel: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-900 text-cyan-400"
                />
                <span>Show Live Source Badge</span>
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-300">PiP Border Color:</span>
              {OVERLAY_ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateGameplay({ borderColor: preset.color })}
                  title={preset.label}
                  className={`h-4 w-4 rounded-full border ${
                    gameplay.borderColor.toLowerCase() ===
                    preset.color.toLowerCase()
                      ? 'border-white scale-110'
                      : 'border-slate-700'
                  }`}
                  style={{ backgroundColor: preset.color }}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
