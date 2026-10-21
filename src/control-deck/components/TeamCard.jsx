import React, { useState, useEffect } from 'react';

/**
 * Reusable TeamCard Component for the 26-Team (A-Z) Control Deck Grid
 * Phase 2 & Phase 3 Addendum:
 * - Supports full 2-column card view when Overview panel is visible (`compact = false`)
 * - Supports compact 3-column single-row team selector when Overview panel is hidden (`compact = true`)
 *   so all 26 teams fit on one screen at once at typical desktop resolutions without vertical scrolling
 */
export default function TeamCard({
  team,
  leaderboardRank,
  isSelected,
  isHeld,
  isLocked,
  compact = false,
  onSelect,
  onIncrementKill,
  onDecrementKill,
  onSetPlacement,
  onAdjustPlacement,
  onUpdateRoster,
}) {
  const slotKey = team.Key || team.slotKey;
  const teamName = team.TeamName || team.teamName;
  const pos = Number(team.pos ?? 0);
  const kp = Number(team.KP ?? team.kp ?? 0);
  const pp = Number(team.PP ?? team.pp ?? 0);
  const tt = Number(team.TT ?? team.tt ?? 0);
  const players = Array.isArray(team.players)
    ? team.players
    : [team.Player1, team.Player2, team.Player3, team.Player4];

  const isEliminated = pos > 0;
  const aliveCount = isEliminated ? 0 : 4;

  const [isEditingRoster, setIsEditingRoster] = useState(false);
  const [draftTeamName, setDraftTeamName] = useState(teamName);
  const [draftPlayers, setDraftPlayers] = useState(players);
  const [rosterError, setRosterError] = useState(null);

  useEffect(() => {
    if (!isEditingRoster) {
      setDraftTeamName(teamName);
      setDraftPlayers(players);
      setRosterError(null);
    }
  }, [teamName, players, isEditingRoster]);

  const handleSaveRoster = async (e) => {
    e.preventDefault();
    const trimmedTeam = String(draftTeamName || '').trim();
    if (!trimmedTeam) {
      setRosterError('Team name cannot be empty.');
      return;
    }
    if (onUpdateRoster) {
      const res = await onUpdateRoster({
        key: slotKey,
        teamName: trimmedTeam,
        players: draftPlayers.map(
          (p, i) => String(p || '').trim() || `${slotKey}·Player${i + 1}`
        ),
      });
      if (res && !res.ok) {
        setRosterError(res.error || 'Failed to update roster.');
        return;
      }
    }
    setRosterError(null);
    setIsEditingRoster(false);
  };

  // =========================================================================
  // COMPACT 3-COLUMN TEAM SELECTOR MODE (When Overview Panel is Hidden)
  // =========================================================================
  if (compact) {
    const hoverTooltip = `${slotKey}: ${teamName} (${
      isEliminated ? `Placed #${pos}` : 'ALIVE'
    } · KP: ${kp} · PP: ${pp} · TT: ${tt})`;

    return (
      <article
        data-testid={`team-card-${slotKey}`}
        data-compact-card="true"
        onClick={() => onSelect(slotKey)}
        title={hoverTooltip}
        className={`group cursor-pointer rounded border px-2.5 py-1.5 transition-colors flex items-center justify-between gap-2 ${
          isHeld
            ? 'border-emerald-400 bg-emerald-950/35 ring-1 ring-emerald-400/70'
            : isSelected
            ? 'border-cyan-400 bg-[#132238] ring-1 ring-cyan-400/70'
            : isEliminated
            ? 'border-slate-800/90 bg-[#0d121c]/90 hover:border-slate-700'
            : 'border-slate-800 bg-[#101622] hover:border-slate-600'
        }`}
      >
        {/* Left: Clickable Slot Badge + Gracefully Truncated Team Name */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(slotKey);
            }}
            aria-label={`Select Team Slot ${slotKey}: ${teamName}`}
            aria-pressed={isSelected}
            className={`deck-mono-font flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-bold transition-colors ${
              isHeld
                ? 'border-emerald-300 bg-emerald-400 text-slate-950'
                : isSelected
                ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                : 'border-slate-700 bg-slate-900 text-cyan-400 group-hover:border-cyan-500/60'
            }`}
          >
            {slotKey}
          </button>

          <div className="min-w-0 flex-1">
            <h3
              data-testid={`team-name-${slotKey}`}
              title={teamName}
              className={`truncate text-xs sm:text-[13px] font-bold ${
                isSelected ? 'text-cyan-200' : 'text-white'
              }`}
            >
              {teamName}
            </h3>
          </div>
        </div>

        {/* Right: Compact Status + Tabular Metrics + Quick KP Step */}
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            data-testid={`team-status-${slotKey}`}
            className={`deck-mono-font text-[10px] font-semibold ${
              isEliminated ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            <span data-testid={`team-${slotKey}-pos`}>
              {isEliminated ? `#${String(pos).padStart(2, '0')}` : 'ALIVE'}
            </span>
          </span>

          <div className="deck-mono-font flex items-center gap-1.5 text-[11px] border-l border-slate-800 pl-2">
            <span className="text-slate-400">
              K:
              <strong
                data-testid={`team-${slotKey}-kp`}
                className="text-cyan-300 ml-0.5"
              >
                {String(kp).padStart(2, '0')}
              </strong>
            </span>
            <span className="text-slate-500 hidden 2xl:inline">
              P:
              <strong
                data-testid={`team-${slotKey}-pp`}
                className="text-slate-300 ml-0.5"
              >
                {String(pp).padStart(2, '0')}
              </strong>
            </span>
            <span className="text-amber-400/90">
              T:
              <strong
                data-testid={`team-${slotKey}-tt`}
                className="text-amber-400 ml-0.5"
              >
                {String(tt).padStart(2, '0')}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid={`team-${slotKey}-kp-minus`}
              aria-label={`Decrement Kill Points for Team ${slotKey}`}
              disabled={isLocked || kp <= 0}
              onClick={() => {
                onSelect(slotKey);
                onDecrementKill?.(slotKey);
              }}
              className="deck-mono-font rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-slate-200 hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-40"
            >
              -1
            </button>
            <button
              type="button"
              data-testid={`team-${slotKey}-kp-plus`}
              aria-label={`Increment Kill Points for Team ${slotKey}`}
              disabled={isLocked}
              onClick={() => {
                onSelect(slotKey);
                onIncrementKill?.(slotKey);
              }}
              className="deck-mono-font rounded border border-cyan-500/40 bg-cyan-950/50 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-900/70 disabled:opacity-40"
            >
              +1
            </button>
          </div>
        </div>
      </article>
    );
  }

  // =========================================================================
  // DETAILED 2-COLUMN TEAM CARD MODE (When Overview Panel is Visible)
  // =========================================================================
  return (
    <article
      data-testid={`team-card-${slotKey}`}
      onClick={() => onSelect(slotKey)}
      className={`cursor-pointer rounded-md border transition-colors ${
        isSelected
          ? 'border-cyan-400 bg-[#131d31]'
          : isEliminated
          ? 'border-slate-800/90 bg-[#0d121c]/90'
          : 'border-slate-800 bg-[#101622] hover:border-slate-700'
      }`}
    >
      <div className="p-3.5">
        {/* Top Row: Alphabet Key [A-Z], Team Name, Alive/Placement Status & Metrics */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(slotKey);
              }}
              aria-label={`Select Team Slot ${slotKey}: ${teamName}`}
              aria-pressed={isSelected}
              className={`deck-mono-font flex h-8 w-8 shrink-0 items-center justify-center rounded border text-sm font-bold transition-colors ${
                isHeld
                  ? 'border-emerald-300 bg-emerald-400 text-slate-950'
                  : isSelected
                  ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-cyan-400 hover:border-cyan-500/60'
              }`}
            >
              {slotKey}
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3
                  data-testid={`team-name-${slotKey}`}
                  title={teamName}
                  className="truncate text-sm font-bold text-white"
                >
                  {teamName}
                </h3>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                {leaderboardRank && (
                  <>
                    <span className="deck-mono-font font-semibold text-slate-300">
                      Rank #{String(leaderboardRank).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span
                  data-testid={`team-status-${slotKey}`}
                  className={`font-semibold ${
                    isEliminated ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {isEliminated
                    ? `PLACED #${String(pos).padStart(2, '0')}`
                    : 'ALIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: 4-Square Vitality Indicator + POS / KP / PP / TT Metrics */}
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
            <div
              className="flex items-center gap-1"
              title={`Squad Status: ${
                isEliminated ? `Placed #${pos}` : '4/4 Alive'
              }`}
              aria-label={`Squad Status: ${
                isEliminated ? `Placed #${pos}` : '4 of 4 players active'
              }`}
            >
              {[0, 1, 2, 3].map((idx) => (
                <span
                  key={idx}
                  className={`h-3.5 w-1.5 rounded-xs ${
                    idx < aliveCount ? 'bg-emerald-400' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>

            <dl className="deck-mono-font grid grid-cols-4 gap-2.5 text-right sm:border-l border-slate-800 sm:pl-3">
              <div>
                <dt className="text-[10px] font-medium text-slate-400">POS</dt>
                <dd
                  data-testid={`team-${slotKey}-pos`}
                  className={`text-xs font-semibold ${
                    pos === 1
                      ? 'text-amber-300'
                      : pos > 0
                      ? 'text-slate-100'
                      : 'text-emerald-400'
                  }`}
                >
                  {pos === 0 ? 'ALIVE' : `#${String(pos).padStart(2, '0')}`}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-slate-400">KP</dt>
                <dd
                  data-testid={`team-${slotKey}-kp`}
                  className="text-xs font-semibold text-cyan-300"
                >
                  {String(kp).padStart(2, '0')}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-slate-400">PP</dt>
                <dd
                  data-testid={`team-${slotKey}-pp`}
                  className="text-xs font-semibold text-slate-200"
                >
                  {String(pp).padStart(2, '0')}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-amber-400/90">TT</dt>
                <dd
                  data-testid={`team-${slotKey}-tt`}
                  className="text-xs font-bold text-amber-400"
                >
                  {String(tt).padStart(2, '0')}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Middle Row: Quick Operator Controls (KP -/+, Placement Select, Rank ↑/↓, Edit Roster) */}
        <div
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Kill Point Controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">KP:</span>
            <button
              type="button"
              data-testid={`team-${slotKey}-kp-minus`}
              aria-label={`Decrement Kill Points for Team ${slotKey}`}
              disabled={isLocked || kp <= 0}
              onClick={() => {
                onSelect(slotKey);
                onDecrementKill?.(slotKey);
              }}
              className="deck-mono-font rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-bold text-slate-200 hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              -1
            </button>
            <button
              type="button"
              data-testid={`team-${slotKey}-kp-plus`}
              aria-label={`Increment Kill Points for Team ${slotKey}`}
              disabled={isLocked}
              onClick={() => {
                onSelect(slotKey);
                onIncrementKill?.(slotKey);
              }}
              className="deck-mono-font rounded border border-cyan-500/40 bg-cyan-950/50 px-2 py-0.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/70 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +1
            </button>
          </div>

          {/* Direct Placement Rank Selector & Step Up/Down */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`pos-select-${slotKey}`}
              className="text-[11px] font-medium text-slate-400"
            >
              POS:
            </label>
            <select
              id={`pos-select-${slotKey}`}
              data-testid={`team-${slotKey}-pos-select`}
              aria-label={`Placement Rank for Team ${slotKey}`}
              value={pos}
              disabled={isLocked}
              onChange={(e) => {
                onSelect(slotKey);
                onSetPlacement?.(slotKey, Number(e.target.value));
              }}
              className="deck-mono-font rounded border border-slate-700 bg-[#090d14] px-1.5 py-0.5 text-xs text-white focus:border-cyan-400 focus:outline-none disabled:opacity-40"
            >
              <option value={0}>00 (Alive)</option>
              {Array.from({ length: 26 }, (_, i) => i + 1).map((rankNum) => (
                <option key={rankNum} value={rankNum}>
                  #{String(rankNum).padStart(2, '0')}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-label={`Move Placement Up for Team ${slotKey}`}
              title="Improve placement rank by 1 (ArrowUp)"
              disabled={isLocked || pos <= 1}
              onClick={() => {
                onSelect(slotKey);
                onAdjustPlacement?.(slotKey, 'UP');
              }}
              className="deck-mono-font rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move Placement Down for Team ${slotKey}`}
              title="Move placement rank down by 1 (ArrowDown)"
              disabled={isLocked || pos === 26}
              onClick={() => {
                onSelect(slotKey);
                onAdjustPlacement?.(slotKey, 'DOWN');
              }}
              className="deck-mono-font rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40"
            >
              ↓
            </button>
          </div>

          {/* Toggle Inline Roster Editor */}
          <button
            type="button"
            aria-label={`Edit Roster for Team ${slotKey}`}
            disabled={isLocked}
            onClick={() => setIsEditingRoster((prev) => !prev)}
            className="rounded border border-slate-700/90 bg-slate-900/90 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-cyan-400/60 hover:text-white disabled:opacity-40"
          >
            {isEditingRoster ? 'Close Edit' : 'Edit Roster'}
          </button>
        </div>

        {/* Inline Roster Edit Form OR 4 Player Readout */}
        {isEditingRoster ? (
          <form
            onSubmit={handleSaveRoster}
            onClick={(e) => e.stopPropagation()}
            className="mt-2.5 rounded border border-slate-700 bg-[#090d15] p-2.5 space-y-2"
          >
            <div>
              <label
                htmlFor={`edit-team-name-${slotKey}`}
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Team {slotKey} Name:
              </label>
              <input
                id={`edit-team-name-${slotKey}`}
                type="text"
                value={draftTeamName}
                onChange={(e) => setDraftTeamName(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#06090f] px-2 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((pIdx) => (
                <div key={pIdx}>
                  <label
                    htmlFor={`edit-player-${slotKey}-${pIdx + 1}`}
                    className="block text-[10px] text-slate-400 mb-0.5"
                  >
                    Player {pIdx + 1}
                  </label>
                  <input
                    id={`edit-player-${slotKey}-${pIdx + 1}`}
                    type="text"
                    value={draftPlayers[pIdx] || ''}
                    onChange={(e) => {
                      const next = [...draftPlayers];
                      next[pIdx] = e.target.value;
                      setDraftPlayers(next);
                    }}
                    className="w-full rounded border border-slate-700 bg-[#06090f] px-2 py-1 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {rosterError && (
              <p className="text-[11px] font-semibold text-rose-400">
                {rosterError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingRoster(false)}
                className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-cyan-400 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-cyan-300"
              >
                Save Roster
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 border-t border-slate-800/80 pt-2">
            {players.map((playerName, idx) => (
              <div
                key={`${slotKey}-p${idx + 1}`}
                title={playerName}
                className={`truncate rounded bg-[#0b0f17] px-2 py-1 text-[11px] border border-slate-800/60 ${
                  !isEliminated
                    ? 'text-slate-300'
                    : 'text-slate-500 line-through'
                }`}
              >
                <span className="deck-mono-font text-[10px] text-slate-500 mr-1">
                  P{idx + 1}
                </span>
                <span>{playerName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
