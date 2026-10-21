import React, { useState } from 'react';
import {
  GAME_MODES,
  MATCH_STATUS,
  OVERLAY_VIEW_MODES,
} from '../../shared/constants.js';

/**
 * Match Lifecycle, Broadcast Graphics Mode & CSV Persistence Toolbar
 * Phase 3: Esports Broadcast Controller & Live Overlay System
 *
 * Uses concise, broadcast-standard action labels:
 * - Match selector + New Match, Next Round, Complete Match / Reopen Match
 * - Live Overlay Graphic Mode selector: Live Match | Overall Standings | Final Graphic
 * - CSV & History actions: Connect (CSV file / paste sync), Save, Export CSV, Undo
 */
export default function MatchToolbar({
  matchState,
  isBusy,
  onCreateMatch,
  onLoadMatch,
  onSaveMatch,
  onImportRoster,
  onExportMatch,
  onCreateNextRound,
  onCompleteMatch,
  onReopenMatch,
  onUpdateBroadcastMeta,
  onUndo,
}) {
  const [activeDialog, setActiveDialog] = useState(null); // 'CREATE' | 'NEXT_ROUND' | 'CONNECT' | 'EXPORT' | 'COMPLETE' | null
  const [newMatchGame, setNewMatchGame] = useState(
    matchState?.activeGame || 'BGMI'
  );
  const [nextRoundMode, setNextRoundMode] = useState('CARRY_ROSTER');
  const [importCsvText, setImportCsvText] = useState('');
  const [importResetScores, setImportResetScores] = useState(false);
  const [connectedFileName, setConnectedFileName] = useState('');
  const [exportedCsvPreview, setExportedCsvPreview] = useState(null);
  const [dialogError, setDialogError] = useState(null);

  if (!matchState) return null;

  const canUndo = Boolean(matchState.undo?.canUndo);
  const undoDepth = matchState.undo?.depth || 0;
  const isCompleted = matchState.matchStatus === MATCH_STATUS.COMPLETED;
  const availableMatches = matchState.availableMatches || [];
  const overlayViewMode =
    matchState.overlayViewMode || OVERLAY_VIEW_MODES.MATCH;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConnectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImportCsvText(String(evt.target?.result || ''));
      setDialogError(null);
    };
    reader.readAsText(file);
  };

  const handleConfirmCreateMatch = async () => {
    setDialogError(null);
    const res = await onCreateMatch({ game: newMatchGame });
    if (res?.ok) {
      setActiveDialog(null);
    } else {
      setDialogError(res?.error || 'Failed to create match.');
    }
  };

  const handleConfirmNextRound = async () => {
    setDialogError(null);
    const res = await onCreateNextRound({
      mode: nextRoundMode,
      game: matchState.activeGame,
      customRosterCsv:
        nextRoundMode === 'COLD_START' && importCsvText.trim()
          ? importCsvText
          : undefined,
    });
    if (res?.ok) {
      setImportCsvText('');
      setActiveDialog(null);
    } else {
      setDialogError(res?.error || 'Failed to create next round.');
    }
  };

  const handleConfirmConnectCsv = async () => {
    setDialogError(null);
    if (!importCsvText.trim()) {
      setDialogError('Select a .csv file or paste 10-column CSV data first.');
      return;
    }
    const res = await onImportRoster({
      csvText: importCsvText,
      resetScores: importResetScores,
    });
    if (res?.ok) {
      setImportCsvText('');
      setActiveDialog(null);
    } else {
      setDialogError(res?.error || 'CSV validation failed.');
    }
  };

  const handleTriggerExport = async () => {
    const res = await onExportMatch();
    if (res?.ok && res.csvText) {
      setExportedCsvPreview(res);
      setActiveDialog('EXPORT');
      try {
        const blob = new Blob([res.csvText], {
          type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', res.fileName || 'match_export.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        // Ignore blob download restrictions in headless contexts
      }
    }
  };

  const handleConfirmComplete = async () => {
    const res = await onCompleteMatch();
    if (res?.ok) {
      setActiveDialog(null);
    }
  };

  return (
    <section
      aria-label="Match Management and CSV Persistence Controls"
      className="border-b border-slate-800 bg-[#0e1420] px-4 sm:px-6 py-2"
    >
      <div className="mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Match Switcher & Round Lifecycle Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="match-selector-select"
              className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0"
            >
              Match:
            </label>
            <select
              id="match-selector-select"
              value={matchState.matchId}
              onChange={(e) => onLoadMatch(e.target.value)}
              disabled={isBusy}
              className="rounded border border-slate-700 bg-[#090d14] px-2.5 py-1 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
            >
              {availableMatches.length === 0 ? (
                <option value={matchState.matchId}>{matchState.matchId}</option>
              ) : (
                availableMatches.map((m) => (
                  <option key={m.matchId} value={m.matchId}>
                    {m.matchId} ({m.game === 'FREE_FIRE' ? 'FF' : 'BGMI'})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewMatchGame(matchState.activeGame || 'BGMI');
              setDialogError(null);
              setActiveDialog('CREATE');
            }}
            disabled={isBusy}
            className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            New Match
          </button>

          <button
            type="button"
            onClick={() => {
              setNextRoundMode('CARRY_ROSTER');
              setDialogError(null);
              setActiveDialog('NEXT_ROUND');
            }}
            disabled={isBusy}
            className="rounded border border-cyan-500/50 bg-cyan-950/50 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Next Round
          </button>

          {isCompleted ? (
            <button
              type="button"
              onClick={onReopenMatch}
              disabled={isBusy}
              className="rounded border border-amber-500/50 bg-amber-950/50 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              Reopen Match
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDialogError(null);
                setActiveDialog('COMPLETE');
              }}
              disabled={isBusy}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-200 transition-colors whitespace-nowrap shrink-0"
            >
              Complete Match
            </button>
          )}
        </div>

        {/* Center: Live Overlay Broadcast Graphic Mode Switcher */}
        <div
          className="flex items-center gap-1 rounded border border-slate-800 bg-[#090d14] p-0.5"
          role="group"
          aria-label="Overlay Broadcast Graphic Mode"
        >
          <span className="px-2 text-[11px] font-medium text-slate-400 hidden sm:inline whitespace-nowrap shrink-0">
            Overlay Graphic:
          </span>
          {[
            { id: OVERLAY_VIEW_MODES.MATCH, label: 'Live Match' },
            { id: OVERLAY_VIEW_MODES.OVERALL, label: 'Overall Standings' },
            { id: OVERLAY_VIEW_MODES.END_OF_MATCH, label: 'Final Graphic' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              data-testid={`overlay-mode-btn-${mode.id}`}
              onClick={() =>
                onUpdateBroadcastMeta?.({ overlayViewMode: mode.id })
              }
              aria-pressed={overlayViewMode === mode.id}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                overlayViewMode === mode.id
                  ? mode.id === OVERLAY_VIEW_MODES.END_OF_MATCH
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-cyan-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Right: Minimal CSV Actions (Connect, Save, Export CSV, Undo) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="connect-csv-btn"
            onClick={() => {
              setDialogError(null);
              setActiveDialog('CONNECT');
            }}
            disabled={isBusy || isCompleted}
            className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            Connect
          </button>

          <button
            type="button"
            onClick={onSaveMatch}
            disabled={isBusy}
            className="rounded border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Save
          </button>

          <button
            type="button"
            data-testid="export-csv-btn"
            onClick={handleTriggerExport}
            disabled={isBusy}
            className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || isBusy}
            title={
              canUndo
                ? `Undo (Ctrl+Z): ${matchState.undo?.lastActionLabel}`
                : 'No undo history available'
            }
            className="rounded border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            Undo ({undoDepth})
          </button>
        </div>
      </div>

      {/* Modal 1: Create New Match */}
      {activeDialog === 'CREATE' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-match-dialog-title"
          className="mt-2.5 rounded-md border border-slate-700 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="create-match-dialog-title"
              className="text-sm font-bold text-white"
            >
              Create New Match
            </h3>
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-300">
            Creates a new CSV file in <code>matches/</code> from the selected
            ruleset template without overwriting existing matches.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {Object.values(GAME_MODES).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setNewMatchGame(mode.id)}
                className={`rounded border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  newMatchGame === mode.id
                    ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                {mode.fullName} ({mode.label} · 1st={mode.topPlacementPoints}{' '}
                PP)
              </button>
            ))}
          </div>
          {dialogError && (
            <p className="mt-2 text-xs font-semibold text-rose-400">
              {dialogError}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCreateMatch}
              className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              Create Match
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: Next Round (Carry Roster vs Cold Start) */}
      {activeDialog === 'NEXT_ROUND' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="next-round-dialog-title"
          className="mt-2.5 rounded-md border border-cyan-500/40 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="next-round-dialog-title"
              className="text-sm font-bold text-white"
            >
              Start Next Round — Roster Mode
            </h3>
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setNextRoundMode('CARRY_ROSTER')}
              className={`text-left rounded border p-3 transition-colors ${
                nextRoundMode === 'CARRY_ROSTER'
                  ? 'border-cyan-400 bg-cyan-950/40'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-cyan-300">
                Carry Roster (Recommended)
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                Preserves all 26 Team Keys (A–Z), Team Names, and Player names
                from {matchState.matchId}. Resets POS, KP, PP, and TT to 0 in a
                new round file while preserving {matchState.matchId} in
                cumulative tournament standings.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setNextRoundMode('COLD_START')}
              className={`text-left rounded border p-3 transition-colors ${
                nextRoundMode === 'COLD_START'
                  ? 'border-amber-400 bg-amber-950/40'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-amber-300">Cold Start</div>
              <p className="mt-1 text-[11px] text-slate-300">
                Starts a new round from the {matchState.activeGame} template or
                a custom 10-column CSV roster with all match metrics reset to 0.
              </p>
            </button>
          </div>

          {nextRoundMode === 'COLD_START' && (
            <div className="mt-3">
              <label
                htmlFor="cold-start-csv-textarea"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Optional Custom 10-Column CSV Roster:
              </label>
              <textarea
                id="cold-start-csv-textarea"
                rows={4}
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                placeholder="Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT"
                className="w-full deck-mono-font rounded border border-slate-700 bg-[#06090f] p-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          )}

          {dialogError && (
            <p className="mt-2 text-xs font-semibold text-rose-400">
              {dialogError}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmNextRound}
              className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              Start Next Round
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Connect CSV File / Sync Roster */}
      {activeDialog === 'CONNECT' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-csv-dialog-title"
          className="mt-2.5 rounded-md border border-slate-700 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="connect-csv-dialog-title"
              className="text-sm font-bold text-white"
            >
              Connect &amp; Sync CSV File ({matchState.activeFilePath})
            </h3>
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-300">
            Select a local <code>.csv</code> file (exported from Excel or
            LibreOffice Calc) or paste 10-column CSV rows below to validate and
            synchronize with <code>{matchState.activeFilePath}</code>. The live
            file watcher also automatically syncs external edits saved directly
            to <code>{matchState.activeFilePath}</code>.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="csv-file-upload-input"
                className="text-xs font-medium text-slate-300"
              >
                Select CSV File:
              </label>
              <input
                id="csv-file-upload-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-cyan-300 hover:file:bg-slate-700"
              />
              {connectedFileName && (
                <span className="deck-mono-font text-[11px] text-emerald-400">
                  Loaded: {connectedFileName}
                </span>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={importResetScores}
                onChange={(e) => setImportResetScores(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900"
              />
              <span>Reset POS, KP, PP, and TT to 0 on sync</span>
            </label>
          </div>

          <div className="mt-2.5">
            <label
              htmlFor="import-csv-textarea"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              CSV Data (<code>Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT</code>):
            </label>
            <textarea
              id="import-csv-textarea"
              rows={6}
              value={importCsvText}
              onChange={(e) => {
                setImportCsvText(e.target.value);
                setDialogError(null);
              }}
              placeholder={
                'Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT\nA,GodLike,Jonathan,Punk,Jeyy,Admino,0,0,0,0'
              }
              className="w-full deck-mono-font rounded border border-slate-700 bg-[#06090f] p-2.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {dialogError && (
            <p
              data-testid="import-csv-error"
              className="mt-2 text-xs font-semibold text-rose-400"
            >
              {dialogError}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmConnectCsv}
              className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              Sync CSV
            </button>
          </div>
        </div>
      )}

      {/* Modal 4: Export CSV Preview */}
      {activeDialog === 'EXPORT' && exportedCsvPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-csv-dialog-title"
          className="mt-2.5 rounded-md border border-slate-700 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="export-csv-dialog-title"
              className="text-sm font-bold text-white"
            >
              Export CSV — {exportedCsvPreview.fileName}
            </h3>
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <textarea
            readOnly
            rows={7}
            value={exportedCsvPreview.csvText}
            aria-label="Exported CSV Text"
            className="mt-2.5 w-full deck-mono-font rounded border border-slate-800 bg-[#06090f] p-2.5 text-xs text-emerald-300"
          />
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(exportedCsvPreview.csvText);
              }}
              className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white"
            >
              Copy CSV
            </button>
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Modal 5: Confirm Complete Match */}
      {activeDialog === 'COMPLETE' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-match-dialog-title"
          className="mt-2.5 rounded-md border border-amber-500/40 bg-[#090d16] p-4"
        >
          <h3
            id="complete-match-dialog-title"
            className="text-sm font-bold text-amber-300"
          >
            Complete Match ({matchState.matchId})
          </h3>
          <p className="mt-1.5 text-xs text-slate-300">
            Marks <strong>{matchState.matchId}</strong> as{' '}
            <strong>COMPLETED</strong>, saves final standings to{' '}
            <code>{matchState.activeFilePath}</code>, and locks score edits
            until reopened.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmComplete}
              className="rounded bg-amber-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300"
            >
              Confirm Complete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
