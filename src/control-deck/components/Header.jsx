import React, { useState, useEffect } from 'react';
import {
  APP_METADATA,
  GAME_MODES,
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
} from '../../shared/constants.js';
import ConnectionStatus from './ConnectionStatus.jsx';

/**
 * Operator Control Deck Header Component
 * Phase 3: Compact, broadcast-ready top bar with inline editable Event/Tournament Title,
 * Game Ruleset Selector (BGMI / Free Fire), Overlay Connection Status, Audio Feedback toggle,
 * and Overlay Window visibility controls.
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
    <header className="border-b border-slate-800 bg-[#0d121c]">
      <div className="mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 px-4 sm:px-6 py-2.5">
        {/* Left Zone: Brand Title, Editable Event Name & Match Status */}
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <h1 className="deck-display-font text-lg sm:text-xl font-bold tracking-wider text-white whitespace-nowrap shrink-0">
            {APP_METADATA.NAME}
          </h1>
          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            ·
          </span>

          {isEditingEvent ? (
            <form
              onSubmit={handleSaveEventTitle}
              className="flex flex-wrap items-center gap-1.5"
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
                className="w-52 rounded border border-cyan-400 bg-[#070a10] px-2 py-1 text-xs font-semibold text-white focus:outline-none"
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
                className="w-32 rounded border border-slate-700 bg-[#070a10] px-2 py-1 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
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
            <div className="flex items-center gap-2 min-w-0">
              <span
                data-testid="header-tournament-title"
                className="text-xs font-bold text-amber-300 truncate max-w-[240px]"
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

        {/* Center Zone: Game Selector (BGMI / Free Fire) & Connection Status */}
        <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {/* Right Zone: Audio Mute Toggle & Overlay Window Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="toggle-audio-btn"
            onClick={onToggleAudio}
            aria-pressed={audioEnabled}
            className={`rounded border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
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
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
          </button>

          {isDisconnected ? (
            <button
              type="button"
              onClick={onReopenOverlay}
              className="rounded border border-emerald-500/50 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/70 transition-colors whitespace-nowrap shrink-0"
            >
              Reopen Overlay
            </button>
          ) : (
            <button
              type="button"
              onClick={onCloseOverlay}
              className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              Close Overlay
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
