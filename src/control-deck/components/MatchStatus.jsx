import React from 'react';
import { MATCH_STATUS, SAVE_STATUS } from '../../shared/constants.js';

/**
 * Authoritative Match Status & Keyboard State HUD Strip
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 */
export default function MatchStatus({
  matchState,
  heldTeamKey,
  placementBuffer,
  onSubmitPlacementBuffer,
  onClearPlacementBuffer,
  validationBanner,
  onDismissBanner,
}) {
  if (!matchState) return null;

  const selectedKey = matchState.selectedTeamKey || 'A';
  const selectedTeam =
    matchState.teams?.find((t) => t.Key === selectedKey) || null;

  const isCompleted = matchState.matchStatus === MATCH_STATUS.COMPLETED;
  const saveStatus = matchState.saveStatus || SAVE_STATUS.SAVED;

  let saveColorClass = 'text-emerald-400';
  if (saveStatus === SAVE_STATUS.SAVING) saveColorClass = 'text-amber-400';
  else if (saveStatus === SAVE_STATUS.EXTERNAL_SYNC)
    saveColorClass = 'text-cyan-400';
  else if (saveStatus === SAVE_STATUS.ERROR) saveColorClass = 'text-rose-400';

  return (
    <section
      aria-label="Live Match Engine Status and Keyboard HUD"
      className="border-b border-slate-800 bg-[#0c111b] px-4 sm:px-6 py-2.5"
    >
      <div className="mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        {/* Left: Authoritative Match File, Round & Save Status */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="text-slate-400">Active Match:</span>
          <strong
            data-testid="active-match-id"
            className="deck-mono-font text-white font-bold"
          >
            {matchState.matchId}
          </strong>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-400">Round:</span>
          <strong className="deck-mono-font text-cyan-400">
            R{String(matchState.roundNumber || 1).padStart(2, '0')}
          </strong>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-400">File:</span>
          <code
            data-testid="active-csv-filepath"
            className="deck-mono-font text-[11px] text-slate-300"
          >
            {matchState.activeFilePath}
          </code>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-400">Persistence:</span>
          <span
            data-testid="match-save-status"
            className={`deck-mono-font font-semibold ${saveColorClass}`}
          >
            {saveStatus}
          </span>
          {isCompleted && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="deck-mono-font font-bold text-amber-400">
                LOCKED (COMPLETED)
              </span>
            </>
          )}
        </div>

        {/* Right: Active Keyboard Selection & Placement Digit Buffer */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div
            data-testid="keyboard-active-team-indicator"
            className="flex items-center gap-2 rounded border border-slate-800 bg-[#080b12] px-2.5 py-1"
          >
            <span className="text-slate-400">Active Slot:</span>
            <span className="deck-mono-font font-bold text-cyan-400">
              [{selectedKey}] {selectedTeam ? selectedTeam.TeamName : ''}
            </span>
            {heldTeamKey && (
              <span className="deck-mono-font text-[11px] font-semibold text-emerald-400">
                (KEY [{heldTeamKey}] HELD)
              </span>
            )}
          </div>

          {/* Direct Placement Entry Buffer Indicator */}
          <div
            data-testid="placement-buffer-indicator"
            className={`flex items-center gap-2 rounded border px-2.5 py-1 ${
              placementBuffer
                ? 'border-amber-400/70 bg-amber-950/40 text-amber-200'
                : 'border-slate-800 bg-[#080b12] text-slate-400'
            }`}
          >
            <span>POS Buffer:</span>
            <strong className="deck-mono-font text-white">
              {placementBuffer ? `#${placementBuffer}` : '—'}
            </strong>
            {placementBuffer && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onSubmitPlacementBuffer}
                  className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950 hover:bg-amber-300"
                >
                  Enter
                </button>
                <button
                  type="button"
                  onClick={onClearPlacementBuffer}
                  className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                >
                  Esc
                </button>
              </div>
            )}
          </div>

          <div className="hidden 2xl:flex items-center gap-1.5 text-[11px] text-slate-400 deck-mono-font">
            <span>[A–Z] Select</span>
            <span>·</span>
            <span>[+/=] +1 KP</span>
            <span>·</span>
            <span>[-/_] -1 KP</span>
            <span>·</span>
            <span>[0–26 + Enter] POS</span>
            <span>·</span>
            <span>[↑/↓] Rank</span>
            <span>·</span>
            <span>[Ctrl+Z] Undo</span>
          </div>
        </div>
      </div>

      {/* Live Validation / Persistence Notification Banner */}
      {validationBanner && (
        <div
          role="alert"
          data-testid="match-validation-banner"
          className={`mt-2 flex items-center justify-between gap-3 rounded border px-3 py-1.5 text-xs ${
            validationBanner.level === 'error'
              ? 'border-rose-500/50 bg-rose-950/50 text-rose-200'
              : validationBanner.level === 'warning'
              ? 'border-amber-500/50 bg-amber-950/50 text-amber-200'
              : validationBanner.level === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
              : 'border-cyan-500/40 bg-cyan-950/40 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="deck-mono-font font-bold uppercase shrink-0">
              [{validationBanner.level}]
            </span>
            <span className="truncate">{validationBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={onDismissBanner}
            aria-label="Dismiss notification banner"
            className="text-[11px] font-semibold underline hover:text-white shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
