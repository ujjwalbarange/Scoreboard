import React from 'react';
import {
  APP_METADATA,
  GAME_MODES,
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
} from '../../shared/constants.js';
import ConnectionStatus from './ConnectionStatus.jsx';

/**
 * Operator Control Deck Header Component
 * Phase 1 & Phase 2: Displays authoritative match lifecycle status, active game ruleset
 * selector (BGMI / Free Fire), real-time Overlay IPC connection state, and window controls.
 */
export default function Header({
  selectedGame,
  onSelectGame,
  matchStatus = MATCH_STATUS.LIVE,
  connectionStatus,
  overlayAlive,
  overlayVisible,
  lastHeartbeat,
  onToggleOverlay,
  onCloseOverlay,
  onReopenOverlay,
  onSendTestEvent,
  isSendingTest,
}) {
  const isDisconnected =
    !overlayAlive || connectionStatus === OVERLAY_CONNECTION_STATE.DISCONNECTED;

  const statusColorClass =
    matchStatus === MATCH_STATUS.LIVE
      ? 'text-emerald-400'
      : matchStatus === MATCH_STATUS.COMPLETED
      ? 'text-cyan-300'
      : 'text-amber-400';

  return (
    <header className="border-b border-slate-800 bg-[#0d121c]">
      <div className="mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 sm:px-6 py-3">
        {/* Left Zone: Brand Title & Authoritative Match Status */}
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h1 className="deck-display-font text-xl sm:text-2xl font-bold tracking-wider text-white whitespace-nowrap shrink-0">
            {APP_METADATA.NAME}
          </h1>
          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            /
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap shrink-0">
            <span className="text-slate-400">Match:</span>
            <span
              data-testid="match-status-indicator"
              className={`deck-mono-font font-semibold ${statusColorClass}`}
            >
              {matchStatus}
            </span>
          </div>
        </div>

        {/* Center Zone: Game Selector (BGMI / Free Fire) & Connection Status */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div
            className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#080b11] p-0.5"
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

        {/* Right Zone: Overlay Controls & Send Test Event Action */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleOverlay}
            disabled={isDisconnected}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
          </button>

          {isDisconnected ? (
            <button
              type="button"
              onClick={onReopenOverlay}
              className="rounded-md border border-emerald-500/50 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/70 transition-colors whitespace-nowrap shrink-0"
            >
              Reopen Overlay
            </button>
          ) : (
            <button
              type="button"
              onClick={onCloseOverlay}
              className="rounded-md border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              Close Overlay
            </button>
          )}

          <button
            type="button"
            onClick={onSendTestEvent}
            disabled={isSendingTest}
            className="rounded-md bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            {isSendingTest ? 'Sending IPC...' : 'Send Test Event'}
          </button>
        </div>
      </div>
    </header>
  );
}
