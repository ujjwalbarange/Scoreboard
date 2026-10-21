import React, { useState, useEffect } from 'react';
import {
  APP_METADATA,
  GAME_MODES,
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
} from '../../shared/constants.js';
import ConnectionStatus from './ConnectionStatus.jsx';

/**
 * Operator Control Deck Header & Custom Window Title Bar Component
 * Phase 3 Addendum:
 * - Custom draggable title bar with non-conflicting Minimize, Maximize/Restore, Fullscreen, and Close controls
 * - Inline editable Event/Tournament Title & Stage Subtitle
 * - Game Ruleset Selector (BGMI / Free Fire), Overlay Connection Status, Audio Feedback toggle,
 *   and Overlay Window visibility controls
 */
export default function Header({
  selectedGame,
  onSelectGame,
  tournamentTitle = 'PRO SERIES INVITATIONAL S4',
  stageLabel = 'Week 01 Day 01',
  onUpdateBroadcastMeta,
  matchStatus = MATCH_STATUS.LIVE,
  connectionStatus,
  overlayAlive,
  overlayVisible,
  lastHeartbeat,
  audioEnabled = true,
  onToggleAudio,
  onToggleOverlay,
  onCloseOverlay,
  onReopenOverlay,
  windowState = { isMaximized: false, isFullScreen: false },
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onToggleFullscreenWindow,
  onCloseWindow,
}) {
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [draftTitle, setDraftTitle] = useState(tournamentTitle);
  const [draftStage, setDraftStage] = useState(stageLabel);

  useEffect(() => {
    if (!isEditingEvent) {
      setDraftTitle(tournamentTitle);
      setDraftStage(stageLabel);
    }
  }, [tournamentTitle, stageLabel, isEditingEvent]);

  const isDisconnected =
    !overlayAlive || connectionStatus === OVERLAY_CONNECTION_STATE.DISCONNECTED;

  const isMaximized = Boolean(windowState?.isMaximized);
  const isFullScreen = Boolean(windowState?.isFullScreen);

  const statusColorClass =
    matchStatus === MATCH_STATUS.LIVE
      ? 'text-emerald-400'
      : matchStatus === MATCH_STATUS.COMPLETED
      ? 'text-cyan-300'
      : 'text-amber-400';

  const handleSaveEventTitle = async (e) => {
    e.preventDefault();
    const cleanedTitle = String(draftTitle || '').trim();
    const cleanedStage = String(draftStage || '').trim() || 'LIVE BROADCAST';
    if (!cleanedTitle) return;

    await onUpdateBroadcastMeta?.({
      tournamentTitle: cleanedTitle,
      stageLabel: cleanedStage,
    });
    setIsEditingEvent(false);
  };

  return (
    <header
      className="deck-drag-region border-b border-slate-800 bg-[#0d121c]"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget && onToggleMaximizeWindow) {
          onToggleMaximizeWindow();
        }
      }}
    >
      <div className="mx-auto flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-5 py-2">
        {/* Left Zone: Brand Title, Editable Event Name & Match Status */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h1
            className="deck-display-font text-base sm:text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0"
            onDoubleClick={() => onToggleMaximizeWindow?.()}
          >
            {APP_METADATA.NAME}
          </h1>
          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            ·
          </span>

          {isEditingEvent ? (
            <form
              onSubmit={handleSaveEventTitle}
              className="deck-no-drag flex flex-wrap items-center gap-1.5"
            >
              <label htmlFor="event-title-input" className="sr-only">
                Event / Tournament Name
              </label>
              <input
                id="event-title-input"
                data-testid="event-title-input"
                type="text"
                maxLength={80}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Event / Tournament Name"
                className="w-48 rounded border border-cyan-400 bg-[#070a10] px-2 py-1 text-xs font-semibold text-white focus:outline-none"
              />
              <label htmlFor="event-stage-input" className="sr-only">
                Stage Label
              </label>
              <input
                id="event-stage-input"
                data-testid="event-stage-input"
                type="text"
                maxLength={50}
                value={draftStage}
                onChange={(e) => setDraftStage(e.target.value)}
                placeholder="Stage (e.g. Day 1)"
                className="w-28 rounded border border-slate-700 bg-[#070a10] px-2 py-1 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded bg-cyan-400 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-cyan-300"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingEvent(false)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-white"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="deck-no-drag flex items-center gap-2 min-w-0">
              <span
                data-testid="header-tournament-title"
                className="text-xs font-bold text-amber-300 truncate max-w-[220px]"
                title={`${tournamentTitle} (${stageLabel})`}
              >
                {tournamentTitle}
              </span>
              <span className="text-xs text-slate-400 hidden md:inline whitespace-nowrap shrink-0">
                ({stageLabel})
              </span>
              <button
                type="button"
                data-testid="edit-event-title-btn"
                onClick={() => setIsEditingEvent(true)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-cyan-400/60 hover:text-white whitespace-nowrap shrink-0"
              >
                Edit Event
              </button>
            </div>
          )}

          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            ·
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap shrink-0">
            <span className="text-slate-400">Status:</span>
            <span
              data-testid="match-status-indicator"
              className={`deck-mono-font font-semibold ${statusColorClass}`}
            >
              {matchStatus}
            </span>
          </div>
        </div>

        {/* Center & Right Zone: Game Selector, Connection Status, Overlay Controls & Window Controls */}
        <div className="deck-no-drag flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            className="flex items-center gap-1 rounded border border-slate-800 bg-[#080b11] p-0.5"
            role="group"
            aria-label="Select Esports Game Mode"
          >
            {Object.values(GAME_MODES).map((mode) => {
              const active = selectedGame === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onSelectGame(mode.id)}
                  aria-pressed={active}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <ConnectionStatus
            status={connectionStatus}
            overlayVisible={overlayVisible}
            lastHeartbeat={lastHeartbeat}
          />

          <button
            type="button"
            data-testid="toggle-audio-btn"
            onClick={onToggleAudio}
            aria-pressed={audioEnabled}
            className={`rounded border px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              audioEnabled
                ? 'border-slate-700 bg-slate-900 text-cyan-300 hover:border-cyan-400/60'
                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            {audioEnabled ? 'Audio: On' : 'Audio: Muted'}
          </button>

          <button
            type="button"
            onClick={onToggleOverlay}
            disabled={isDisconnected}
            className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
          </button>

          {isDisconnected ? (
            <button
              type="button"
              onClick={onReopenOverlay}
              className="rounded border border-emerald-500/50 bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/70 transition-colors whitespace-nowrap shrink-0"
            >
              Reopen Overlay
            </button>
          ) : (
            <button
              type="button"
              onClick={onCloseOverlay}
              className="rounded border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              Close Overlay
            </button>
          )}

          {/* Controller Window Controls (Minimize, Maximize/Restore, Fullscreen, Close) */}
          <div
            data-testid="controller-window-controls"
            role="group"
            aria-label="Controller Window Controls"
            className="flex items-center gap-1 border-l border-slate-800 pl-2.5 ml-0.5"
          >
            <button
              type="button"
              data-testid="window-fullscreen-btn"
              onClick={onToggleFullscreenWindow}
              aria-pressed={isFullScreen}
              aria-label={
                isFullScreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'
              }
              title={
                isFullScreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'
              }
              className={`flex h-7 px-2 items-center justify-center rounded border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isFullScreen
                  ? 'border-cyan-400/70 bg-cyan-950/60 text-cyan-300'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              {isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>

            <button
              type="button"
              data-testid="window-minimize-btn"
              onClick={onMinimizeWindow}
              aria-label="Minimize Window"
              title="Minimize Window"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <svg
                width="10"
                height="2"
                viewBox="0 0 10 2"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 1H9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <button
              type="button"
              data-testid="window-maximize-btn"
              onClick={onToggleMaximizeWindow}
              aria-pressed={isMaximized}
              aria-label={isMaximized ? 'Restore Window' : 'Maximize Window'}
              title={isMaximized ? 'Restore Window' : 'Maximize Window'}
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
            >
              {isMaximized ? (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="1.5"
                    y="3.5"
                    width="7"
                    height="7"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M3.5 3.5V2.5C3.5 1.94772 3.94772 1.5 4.5 1.5H9.5C10.0523 1.5 10.5 1.94772 10.5 2.5V7.5C10.5 8.05228 10.0523 8.5 9.5 8.5H8.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="1"
                    y="1"
                    width="8"
                    height="8"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              )}
            </button>

            <button
              type="button"
              data-testid="window-close-btn"
              onClick={onCloseWindow}
              aria-label="Close Window"
              title="Close Window"
              className="flex h-7 w-7 items-center justify-center rounded border border-rose-500/40 bg-rose-950/40 text-rose-300 hover:border-rose-400 hover:bg-rose-600 hover:text-white transition-colors"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
