import React, { useEffect, useState, useRef } from 'react';
import { getBroadcastController } from '../../shared/browserBridge.js';
import {
  OVERLAY_COMPOSITION_MODES,
  sanitizeOverlayConfig,
} from '../../shared/overlayLayout.js';
import {
  startBrowserDisplayCapture,
  startElectronSourceCapture,
  stopGameplayCapture,
  subscribeGameplayCapture,
} from '../../shared/gameplayCaptureManager.js';

/**
 * Gameplay Window Source Selector & Capture Control Modal
 * Phase 3 Addendum: Gameplay Window Integration & Picture-in-Picture Broadcast Mode
 *
 * - Uses Electron's desktopCapturer (via secure contextBridge IPC) to list real application windows & displays
 *   with live thumbnails, icons, and minimized/availability diagnostics.
 * - Also supports standard Browser Screen/Window Capture (navigator.mediaDevices.getDisplayMedia)
 *   when running in web preview mode or when operator prefers OS/Browser native picker.
 * - Provides Refresh Sources, Select Source, Stop Capture, and Composition Mode quick selection.
 * - Handles unavailable/minimized windows, permission denial, and source closure gracefully.
 * - Never fakes a video feed or substitutes a static screenshot for live capture.
 */
export default function GameplayWindowModal({
  isOpen,
  onClose,
  overlayConfig,
  onUpdateBroadcastMeta,
}) {
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('ALL'); // 'ALL' | 'WINDOW' | 'SCREEN'
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState({
    runtime: 'electron-desktop-capturer',
    hasDesktopCapturer: true,
    permissionStatus: 'granted',
    message: null,
  });
  const [errorMessage, setErrorMessage] = useState(null);
  const [captureSnapshot, setCaptureSnapshot] = useState({
    stream: null,
    status: 'IDLE',
    message: null,
    sourceId: null,
    sourceName: null,
  });

  const previewVideoRef = useRef(null);
  const config = sanitizeOverlayConfig(overlayConfig);
  const { gameplay } = config;

  useEffect(() => {
    const unsubscribe = subscribeGameplayCapture((snap) => {
      setCaptureSnapshot(snap);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    const videoEl = previewVideoRef.current;
    if (!videoEl) return;
    if (
      captureSnapshot.stream &&
      videoEl.srcObject !== captureSnapshot.stream
    ) {
      videoEl.srcObject = captureSnapshot.stream;
      videoEl.play?.().catch(() => {});
    } else if (!captureSnapshot.stream && videoEl.srcObject) {
      videoEl.srcObject = null;
    }
  }, [captureSnapshot.stream, isOpen]);

  const fetchCaptureSources = async () => {
    setIsLoadingSources(true);
    setErrorMessage(null);
    try {
      const controller = getBroadcastController();
      const res = await controller.getCaptureSources?.({
        thumbnailWidth: 320,
        thumbnailHeight: 180,
      });

      if (!res) {
        setRuntimeInfo({
          runtime: 'browser-media',
          hasDesktopCapturer: false,
          permissionStatus: 'prompt',
          message:
            'Desktop source enumeration is unavailable. Use Browser Window / Screen Capture below.',
        });
        setSources([]);
        return;
      }

      const list = Array.isArray(res.sources) ? res.sources : [];
      setSources(list);
      setRuntimeInfo({
        runtime: res.runtime || 'browser-media',
        hasDesktopCapturer: Boolean(
          res.runtime === 'electron-desktop-capturer'
        ),
        permissionStatus: res.permissionStatus || 'granted',
        message: res.message || res.error || null,
      });

      if (!res.ok && res.error) {
        setErrorMessage(res.error);
      }

      if (list.length > 0) {
        const currentMatch = list.find(
          (s) => s.id === (selectedSourceId || gameplay.sourceId)
        );
        if (currentMatch) {
          setSelectedSourceId(currentMatch.id);
        } else {
          const firstAvailable =
            list.find((s) => s.captureAvailable && !s.isSelfWindow) || list[0];
          setSelectedSourceId(firstAvailable.id);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to query desktop capture sources.'
      );
    } finally {
      setIsLoadingSources(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCaptureSources();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSources = sources.filter((src) => {
    if (sourceFilter === 'WINDOW') return src.kind === 'window';
    if (sourceFilter === 'SCREEN') return src.kind === 'screen';
    return true;
  });

  const selectedSourceObj =
    sources.find((s) => s.id === selectedSourceId) || null;

  const handleSelectDesktopSource = async () => {
    setErrorMessage(null);
    if (!selectedSourceObj) {
      setErrorMessage(
        'Select an available application window or display source first.'
      );
      return;
    }

    if (!selectedSourceObj.captureAvailable) {
      setErrorMessage(
        selectedSourceObj.unavailableReason ||
          `Source "${selectedSourceObj.name}" is minimized or unavailable. Restore the window on your desktop and click Refresh Sources.`
      );
      return;
    }

    const nextMode =
      gameplay.compositionMode === 'OVERLAY_ONLY'
        ? 'PICTURE_IN_PICTURE'
        : gameplay.compositionMode;

    const captureRes = await startElectronSourceCapture({
      sourceId: selectedSourceObj.id,
      sourceName: selectedSourceObj.name,
      sourceType: selectedSourceObj.kind,
      onStreamEnded: ({ status, message }) => {
        onUpdateBroadcastMeta?.({
          overlayConfig: {
            gameplay: {
              ...gameplay,
              sourceStatus: status,
              sourceStatusMessage: message,
            },
          },
        });
      },
    });

    if (!captureRes.ok) {
      setErrorMessage(captureRes.error || 'Failed to capture selected source.');
      await onUpdateBroadcastMeta?.({
        overlayConfig: {
          gameplay: {
            ...gameplay,
            captureActive: false,
            sourceId: selectedSourceObj.id,
            sourceName: selectedSourceObj.name,
            sourceType: selectedSourceObj.kind,
            sourceStatus: captureRes.status || 'UNAVAILABLE',
            sourceStatusMessage: captureRes.error,
          },
        },
      });
      return;
    }

    await onUpdateBroadcastMeta?.({
      compositionMode: nextMode,
      overlayConfig: {
        gameplay: {
          ...gameplay,
          compositionMode: nextMode,
          captureActive: true,
          sourceId: selectedSourceObj.id,
          sourceName: selectedSourceObj.name,
          sourceType: selectedSourceObj.kind,
          sourceStatus: 'LIVE',
          sourceStatusMessage: `Live feed active: ${selectedSourceObj.name}`,
        },
      },
    });
  };

  const handleStartBrowserCapture = async () => {
    setErrorMessage(null);
    const nextMode =
      gameplay.compositionMode === 'OVERLAY_ONLY'
        ? 'PICTURE_IN_PICTURE'
        : gameplay.compositionMode;

    const res = await startBrowserDisplayCapture({
      onStreamEnded: ({ status, message }) => {
        onUpdateBroadcastMeta?.({
          overlayConfig: {
            gameplay: {
              ...gameplay,
              captureActive: false,
              sourceStatus: status,
              sourceStatusMessage: message,
            },
          },
        });
      },
    });

    if (!res.ok) {
      setErrorMessage(res.error || 'Browser screen/window capture failed.');
      await onUpdateBroadcastMeta?.({
        overlayConfig: {
          gameplay: {
            ...gameplay,
            captureActive: false,
            sourceStatus: res.status || 'PERMISSION_DENIED',
            sourceStatusMessage: res.error,
          },
        },
      });
      return;
    }

    await onUpdateBroadcastMeta?.({
      compositionMode: nextMode,
      overlayConfig: {
        gameplay: {
          ...gameplay,
          compositionMode: nextMode,
          captureActive: true,
          sourceId: res.sourceId,
          sourceName: res.sourceName,
          sourceType: 'browser-display',
          sourceStatus: 'LIVE',
          sourceStatusMessage: `Live feed active: ${res.sourceName}`,
        },
      },
    });
  };

  const handleStopCapture = async () => {
    setErrorMessage(null);
    stopGameplayCapture();
    await onUpdateBroadcastMeta?.({
      overlayConfig: {
        gameplay: {
          ...gameplay,
          captureActive: false,
          sourceId: null,
          sourceName: null,
          sourceType: null,
          sourceStatus: 'STOPPED',
          sourceStatusMessage: 'Gameplay capture stopped by operator.',
        },
      },
    });
  };

  const handleSwitchCompositionMode = async (modeId) => {
    await onUpdateBroadcastMeta?.({
      compositionMode: modeId,
    });
  };

  const isStreamLive = Boolean(captureSnapshot.stream);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameplay-window-modal-title"
      data-testid="gameplay-window-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-md border border-slate-700 bg-[#0b101b] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#0e1525] px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                isStreamLive
                  ? 'bg-emerald-400 animate-pulse'
                  : gameplay.sourceStatus === 'MINIMIZED' ||
                    gameplay.sourceStatus === 'UNAVAILABLE'
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
              }`}
            />
            <h2
              id="gameplay-window-modal-title"
              className="deck-display-font text-base sm:text-lg font-bold tracking-wider text-white uppercase truncate"
            >
              Gameplay Window Capture &amp; Broadcast Composition
            </h2>
            <span
              data-testid="gameplay-capture-status-badge"
              className={`deck-mono-font rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                isStreamLive
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                  : gameplay.sourceStatus === 'PERMISSION_DENIED'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                  : 'bg-slate-900 text-slate-300 border border-slate-700'
              }`}
            >
              {isStreamLive
                ? `LIVE · ${captureSnapshot.sourceName || gameplay.sourceName || 'ACTIVE'}`
                : gameplay.sourceStatus || 'IDLE'}
            </span>
          </div>

          <button
            type="button"
            data-testid="close-gameplay-modal-btn"
            onClick={onClose}
            aria-label="Close Gameplay Window Modal"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Bar: Composition Mode Quick Switcher */}
          <div className="rounded border border-slate-800 bg-[#080c14] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Broadcast Composition Mode (Gameplay + Live Transparent Leaderboard)
              </span>
              <span className="deck-mono-font text-[11px] text-cyan-300">
                Active: {gameplay.compositionMode.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {OVERLAY_COMPOSITION_MODES.map((mode) => {
                const active = gameplay.compositionMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`modal-composition-mode-${mode.id}`}
                    onClick={() => handleSwitchCompositionMode(mode.id)}
                    aria-pressed={active}
                    title={mode.description}
                    className={`rounded border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? 'border-cyan-400 bg-cyan-950/60 text-white'
                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">
                      {mode.label}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {mode.shortLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Toolbar: Refresh Sources, Select Source, Browser Capture, Stop Capture */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded border border-slate-800 bg-[#080c14] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="gameplay-refresh-sources-btn"
                onClick={fetchCaptureSources}
                disabled={isLoadingSources}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/60 hover:text-white disabled:opacity-50 transition-colors"
              >
                {isLoadingSources ? 'Refreshing...' : 'Refresh Sources'}
              </button>

              {runtimeInfo.hasDesktopCapturer && (
                <div
                  className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 p-0.5"
                  role="group"
                  aria-label="Filter Capture Source Type"
                >
                  {[
                    { id: 'ALL', label: `All (${sources.length})` },
                    {
                      id: 'WINDOW',
                      label: `Windows (${sources.filter((s) => s.kind === 'window').length})`,
                    },
                    {
                      id: 'SCREEN',
                      label: `Displays (${sources.filter((s) => s.kind === 'screen').length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSourceFilter(tab.id)}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        sourceFilter === tab.id
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="gameplay-browser-capture-btn"
                onClick={handleStartBrowserCapture}
                className="rounded border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/70 transition-colors"
              >
                Select Window / Screen (System Picker)
              </button>

              {runtimeInfo.hasDesktopCapturer && (
                <button
                  type="button"
                  data-testid="gameplay-select-source-btn"
                  onClick={handleSelectDesktopSource}
                  disabled={!selectedSourceObj}
                  className="rounded bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Select Source
                </button>
              )}

              <button
                type="button"
                data-testid="gameplay-stop-capture-btn"
                onClick={handleStopCapture}
                disabled={!isStreamLive && !gameplay.captureActive}
                className="rounded border border-rose-500/40 bg-rose-950/50 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Stop Capture
              </button>
            </div>
          </div>

          {/* Error / Permission / Unsupported Diagnostic Banner */}
          {(errorMessage ||
            runtimeInfo.permissionStatus === 'denied' ||
            gameplay.sourceStatus === 'MINIMIZED' ||
            gameplay.sourceStatus === 'UNAVAILABLE') && (
            <div
              data-testid="gameplay-diagnostic-banner"
              className="rounded border border-amber-500/40 bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-200"
            >
              <div className="font-bold text-amber-300">
                Capture Status &amp; Troubleshooting
              </div>
              <p className="mt-0.5 text-slate-200">
                {errorMessage ||
                  gameplay.sourceStatusMessage ||
                  runtimeInfo.message}
              </p>
            </div>
          )}

          {/* Live Feed Monitor (When Active) */}
          {isStreamLive && (
            <div className="rounded border border-emerald-500/40 bg-[#070b12] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-emerald-300">
                  Live Gameplay Stream Active ·{' '}
                  {captureSnapshot.sourceName || gameplay.sourceName}
                </span>
                {captureSnapshot.resolution && (
                  <span className="deck-mono-font text-[11px] text-slate-400">
                    {captureSnapshot.resolution.width}×
                    {captureSnapshot.resolution.height}
                  </span>
                )}
              </div>
              <div className="aspect-video max-h-48 w-full overflow-hidden rounded border border-slate-800 bg-black flex items-center justify-center">
                <video
                  ref={previewVideoRef}
                  data-testid="modal-live-preview-video"
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Desktop Capturer Source Grid (Electron Runtime) or Browser Capture Explanation */}
          {runtimeInfo.hasDesktopCapturer ? (
            filteredSources.length > 0 ? (
              <div
                data-testid="gameplay-sources-grid"
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
              >
                {filteredSources.map((src) => {
                  const isSelected = selectedSourceId === src.id;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      data-testid={`capture-source-card-${src.id}`}
                      onClick={() => setSelectedSourceId(src.id)}
                      className={`group flex flex-col rounded border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-950/35 ring-1 ring-cyan-400/50'
                          : 'border-slate-800 bg-[#080c14] hover:border-slate-600'
                      } ${!src.captureAvailable ? 'opacity-65' : ''}`}
                    >
                      <div className="relative aspect-video w-full overflow-hidden rounded border border-slate-800 bg-slate-950 flex items-center justify-center">
                        {src.thumbnailDataUrl ? (
                          <img
                            src={src.thumbnailDataUrl}
                            alt={src.name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="px-3 text-center text-[11px] text-slate-400">
                            {src.captureAvailable
                              ? 'Live Source Ready'
                              : 'Window Minimized / Occluded'}
                          </div>
                        )}
                        <span
                          className={`deck-mono-font absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            src.kind === 'screen'
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-cyan-400 text-slate-950'
                          }`}
                        >
                          {src.kind === 'screen' ? 'DISPLAY' : 'WINDOW'}
                        </span>
                        {!src.captureAvailable && (
                          <span className="deck-mono-font absolute bottom-1.5 right-1.5 rounded bg-rose-950/90 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                            MINIMIZED
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2 min-w-0">
                        {src.appIconDataUrl && (
                          <img
                            src={src.appIconDataUrl}
                            alt=""
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                        )}
                        <span
                          className="text-xs font-semibold text-white truncate"
                          title={src.name}
                        >
                          {src.name}
                        </span>
                      </div>

                      {src.unavailableReason && (
                        <p className="mt-1 text-[10px] text-amber-300 line-clamp-2">
                          {src.unavailableReason}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                data-testid="gameplay-empty-sources"
                className="rounded border border-slate-800 bg-[#080c14] p-6 text-center"
              >
                <div className="text-sm font-bold text-white">
                  No Capturable Windows or Displays Found
                </div>
                <p className="mt-1 text-xs text-slate-400 max-w-lg mx-auto">
                  Ensure the target game window, emulator, or screen-sharing
                  application is open and not minimized on your desktop, then
                  click <strong>Refresh Sources</strong>.
                </p>
              </div>
            )
          ) : (
            <div
              data-testid="gameplay-browser-runtime-panel"
              className="rounded border border-slate-800 bg-[#080c14] p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Live Window &amp; Display Capture Information
                </span>
                <span className="deck-mono-font text-[11px] text-slate-400">
                  Mode: Standard WebRTC DisplayCapture / Electron desktopCapturer
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {runtimeInfo.message ||
                  'Click "Select Window / Screen (System Picker)" above to choose an application window, emulator, or screen to broadcast live. When running the packaged Electron desktop application, native window and display thumbnails from Electron desktopCapturer are also listed directly in this grid.'}
              </p>
              <ul className="text-[11px] text-slate-400 list-disc pl-4 space-y-1">
                <li>
                  <strong>Minimized Windows:</strong> Operating systems pause
                  window compositing when a window is minimized to the taskbar.
                  Keep the game or emulator window restored on screen for
                  continuous real-time frames.
                </li>
                <li>
                  <strong>Hardware / DRM Protected Windows:</strong> Exclusive
                  fullscreen DirectX/Vulkan games with anti-cheat overlays or
                  DRM-protected streams may block window capture. Switch the
                  game to <em>Borderless Windowed</em> mode or select{' '}
                  <strong>Display / Screen Capture</strong> instead.
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-[#090d16] px-5 py-3 text-xs text-slate-400">
          <span>
            Leaderboard stays a live, transparent overlay layered with real-time
            gameplay capture.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-200 hover:text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
