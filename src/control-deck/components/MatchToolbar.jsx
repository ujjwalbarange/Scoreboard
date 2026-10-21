import React, { useState } from 'react';
import { GAME_MODES, MATCH_STATUS } from '../../shared/constants.js';

/**
 * Match Lifecycle & CSV Persistence Toolbar Component
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Provides operator actions for:
 * - Switching / Loading existing match CSV files
 * - Creating a New Match (BGMI or Free Fire template)
 * - Saving current match atomically
 * - Importing a Roster CSV (via file upload or pasted CSV text with validation)
 * - Exporting the current 10-column CSV
 * - Creating Next Round (with explicit Carry Roster vs Cold Start confirmation modal)
 * - Completing or Reopening a Match (with confirmation)
 * - Triggering Global Undo (Ctrl+Z)
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
  onUndo,
}) {
  const [activeDialog, setActiveDialog] = useState(null); // 'CREATE' | 'NEXT_ROUND' | 'IMPORT' | 'EXPORT' | 'COMPLETE' | null
  const [newMatchGame, setNewMatchGame] = useState(
    matchState?.activeGame || 'BGMI'
  );
  const [nextRoundMode, setNextRoundMode] = useState('CARRY_ROSTER');
  const [importCsvText, setImportCsvText] = useState('');
  const [importResetScores, setImportResetScores] = useState(false);
  const [exportedCsvPreview, setExportedCsvPreview] = useState(null);
  const [dialogError, setDialogError] = useState(null);

  if (!matchState) return null;

  const canUndo = Boolean(matchState.undo?.canUndo);
  const undoDepth = matchState.undo?.depth || 0;
  const isCompleted = matchState.matchStatus === MATCH_STATUS.COMPLETED;
  const availableMatches = matchState.availableMatches || [];

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const handleConfirmImport = async () => {
    setDialogError(null);
    if (!importCsvText.trim()) {
      setDialogError('Paste 10-column CSV data or select a .csv file first.');
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
      setDialogError(res?.error || 'CSV roster validation failed.');
    }
  };

  const handleTriggerExport = async () => {
    const res = await onExportMatch();
    if (res?.ok && res.csvText) {
      setExportedCsvPreview(res);
      setActiveDialog('EXPORT');
      // Also trigger standard browser file download
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
      className="border-b border-slate-800 bg-[#0e1420] px-4 sm:px-6 py-2.5"
    >
      <div className="mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Match Switcher & Lifecycle Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="match-selector-select"
              className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0"
            >
              Switch Match:
            </label>
            <select
              id="match-selector-select"
              value={matchState.matchId}
              onChange={(e) => onLoadMatch(e.target.value)}
              disabled={isBusy}
              className="rounded border border-slate-700 bg-[#090d14] px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
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
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Create Match
          </button>

          <button
            type="button"
            onClick={() => {
              setNextRoundMode('CARRY_ROSTER');
              setDialogError(null);
              setActiveDialog('NEXT_ROUND');
            }}
            disabled={isBusy}
            className="rounded border border-cyan-500/50 bg-cyan-950/50 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Next Round
          </button>

          {isCompleted ? (
            <button
              type="button"
              onClick={onReopenMatch}
              disabled={isBusy}
              className="rounded border border-amber-500/50 bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              Unlock / Reopen Match
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDialogError(null);
                setActiveDialog('COMPLETE');
              }}
              disabled={isBusy}
              className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-200 transition-colors whitespace-nowrap shrink-0"
            >
              Complete Match
            </button>
          )}
        </div>

        {/* Right: CSV Save / Import / Export & Global Undo */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveMatch}
            disabled={isBusy}
            className="rounded border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Save Match CSV
          </button>

          <button
            type="button"
            onClick={() => {
              setDialogError(null);
              setActiveDialog('IMPORT');
            }}
            disabled={isBusy || isCompleted}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            Import Roster CSV
          </button>

          <button
            type="button"
            onClick={handleTriggerExport}
            disabled={isBusy}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || isBusy}
            title={
              canUndo
                ? `Undo: ${matchState.undo?.lastActionLabel}`
                : 'No undo history available'
            }
            className="rounded border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            Undo ({undoDepth})
          </button>
        </div>
      </div>

      {/* Modal 1: Create Match */}
      {activeDialog === 'CREATE' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-match-dialog-title"
          className="mt-3 rounded-md border border-slate-700 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="create-match-dialog-title"
              className="text-sm font-bold text-white"
            >
              Create New Tournament Match File
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
            Creates a new uniquely named CSV file in <code>matches/</code> from
            the selected game template without overwriting existing matches.
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
              Create &amp; Activate Match
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
          className="mt-3 rounded-md border border-cyan-500/40 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="next-round-dialog-title"
              className="text-sm font-bold text-white"
            >
              Start Next Round — Choose Roster Progression Mode
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
                Option 1: Carry Roster (Recommended)
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                Preserves all 26 Team Keys (A–Z), Team Names, and all 4 Player
                names from {matchState.matchId}. Resets POS, KP, PP, and TT to
                zero in a new match CSV file.
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
              <div className="text-xs font-bold text-amber-300">
                Option 2: Cold Start
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                Initializes a fresh round from the {matchState.activeGame}{' '}
                template or a newly imported 10-column CSV roster with all match
                metrics reset to zero.
              </p>
            </button>
          </div>

          {nextRoundMode === 'COLD_START' && (
            <div className="mt-3">
              <label
                htmlFor="cold-start-csv-textarea"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Optional Custom 10-Column CSV Roster (Leave blank to use default{' '}
                {matchState.activeGame} template):
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
              Confirm &amp; Create Next Round
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Import Roster CSV */}
      {activeDialog === 'IMPORT' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-csv-dialog-title"
          className="mt-3 rounded-md border border-slate-700 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="import-csv-dialog-title"
              className="text-sm font-bold text-white"
            >
              Import &amp; Validate 10-Column Match / Roster CSV
            </h3>
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <label
                htmlFor="csv-file-upload-input"
                className="text-xs font-medium text-slate-300 mr-2"
              >
                Upload .csv file:
              </label>
              <input
                id="csv-file-upload-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-cyan-300 hover:file:bg-slate-700"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={importResetScores}
                onChange={(e) => setImportResetScores(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900"
              />
              <span>Reset imported POS, KP, PP, and TT to 0</span>
            </label>
          </div>

          <div className="mt-2.5">
            <label
              htmlFor="import-csv-textarea"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              CSV Content (Schema:{' '}
              <code>Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT</code>
              ):
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
              onClick={handleConfirmImport}
              className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              Validate &amp; Import CSV
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
          className="mt-3 rounded-md border border-slate-700 bg-[#090d16] p-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <h3
              id="export-csv-dialog-title"
              className="text-sm font-bold text-white"
            >
              Exported 10-Column CSV — {exportedCsvPreview.fileName}
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
              Copy CSV to Clipboard
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
          className="mt-3 rounded-md border border-amber-500/40 bg-[#090d16] p-4"
        >
          <h3
            id="complete-match-dialog-title"
            className="text-sm font-bold text-amber-300"
          >
            Confirm Match Completion ({matchState.matchId})
          </h3>
          <p className="mt-1.5 text-xs text-slate-300">
            Marking this match as <strong>COMPLETED</strong> saves the final
            standings to <code>{matchState.activeFilePath}</code> and locks live
            score edits until you click <strong>Unlock / Reopen Match</strong>{' '}
            or press <strong>Undo</strong>.
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
              Mark Match Completed
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
