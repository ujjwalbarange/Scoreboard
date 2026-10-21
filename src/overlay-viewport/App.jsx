import React, { useEffect, useState, useRef } from 'react';
import { getBroadcastController } from '../shared/browserBridge.js';
import { getOverlaySampleLeaderboard } from '../shared/mockTeams.js';
import {
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
  OVERLAY_VIEW_MODES,
} from '../shared/constants.js';
import './styles/overlay.css';

/**
 * Broadcast Overlay Viewport React Application
 * Phase 1, 2 & 3: Transparent, Frameless OBS Studio Live Leaderboard & Standings Overlay
 *
 * Read-only consumer of the authoritative MatchEngine state from the main process.
 * Supports 3 live broadcast graphics modes:
 * - 'MATCH': Live Current Match Leaderboard (Rank, Team, Alive/POS, KP, PP, TT)
 * - 'OVERALL': Cumulative Tournament Standings across completed/saved rounds
 * - 'END_OF_MATCH': Broadcast End-of-Match Final Standings Graphic with Top 3 Podium
 */
export default function OverlayViewportApp({ embeddedMode = false }) {
  const [matchState, setMatchState] = useState(null);
  const [rowLimit, setRowLimit] = useState(10); // 10 | 26 | 8
  const [connectionStatus, setConnectionStatus] = useState(
    OVERLAY_CONNECTION_STATE.CONNECTED
  );
  const [localViewOverride, setLocalViewOverride] = useState(null);

  // Track previous team ranks and scores to drive restrained broadcast animations
  const prevMetricsRef = useRef(new Map());
  const [recentChanges, setRecentChanges] = useState({});
  const clearChangesTimerRef = useRef(null);

  useEffect(() => {
    const controller = getBroadcastController();
    let isMounted = true;

    controller
      .getStatus()
      .then((snap) => {
        if (!isMounted || !snap) return;
        setConnectionStatus(snap.status || OVERLAY_CONNECTION_STATE.CONNECTED);
      })
      .catch(() => {
        if (isMounted) {
          setConnectionStatus(OVERLAY_CONNECTION_STATE.DISCONNECTED);
        }
      });

    controller
      .getMatchState()
      .then((res) => {
        if (!isMounted || !res || !res.ok || !res.snapshot) return;
        setMatchState(res.snapshot);
      })
      .catch(() => {});

    const unsubscribeStatus = controller.onConnectionStatus((snapshot) => {
      if (!isMounted || !snapshot) return;
      setConnectionStatus(
        snapshot.status || OVERLAY_CONNECTION_STATE.CONNECTED
      );
    });

    const unsubscribeMatch = controller.onMatchState((snapshot) => {
      if (!isMounted || !snapshot) return;
      setMatchState(snapshot);
      // Clear local override whenever operator pushes a new authoritative overlayViewMode
      setLocalViewOverride(null);
    });

    // Preserve Phase 1 diagnostic test event ACK listener for IPC validation compatibility
    const unsubscribeTestEvent = controller.onTestEvent((eventPayload) => {
      if (!isMounted || !eventPayload) return;
      controller
        .acknowledgeTestEvent({
          eventId: eventPayload.eventId,
          receivedAt: new Date().toISOString(),
        })
        .catch(() => {});
    });

    return () => {
      isMounted = false;
      if (clearChangesTimerRef.current) {
        clearTimeout(clearChangesTimerRef.current);
      }
      if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
      if (typeof unsubscribeMatch === 'function') unsubscribeMatch();
      if (typeof unsubscribeTestEvent === 'function') unsubscribeTestEvent();
    };
  }, []);

  // Compute score & rank deltas whenever matchState.leaderboard updates
  useEffect(() => {
    if (!matchState?.leaderboard || matchState.leaderboard.length === 0) return;

    const prevMap = prevMetricsRef.current;
    const nextMap = new Map();
    const detected = {};

    matchState.leaderboard.forEach((team, idx) => {
      const key = team.Key;
      const rank = team.leaderboardRank || idx + 1;
      const tt = Number(team.TT ?? 0);
      const kp = Number(team.KP ?? 0);
      const pp = Number(team.PP ?? 0);
      const pos = Number(team.pos ?? 0);

      nextMap.set(key, { rank, tt, kp, pp, pos });

      if (prevMap.size > 0 && prevMap.has(key)) {
        const prev = prevMap.get(key);
        const rankDelta = prev.rank - rank; // positive = climbed up
        const ttDelta = tt - prev.tt;
        const kpDelta = kp - prev.kp;

        if (rankDelta !== 0 || ttDelta !== 0 || kpDelta !== 0 || prev.pos !== pos) {
          detected[key] = {
            rankDelta,
            ttDelta,
            kpDelta,
            scoreChanged: ttDelta !== 0 || kpDelta !== 0,
          };
        }
      }
    });

    prevMetricsRef.current = nextMap;

    if (Object.keys(detected).length > 0) {
      setRecentChanges(detected);
      if (clearChangesTimerRef.current) {
        clearTimeout(clearChangesTimerRef.current);
      }
      clearChangesTimerRef.current = setTimeout(() => {
        setRecentChanges({});
      }, 2400);
    }
  }, [matchState?.leaderboard, matchState?.updatedAt]);

  const activeGame = matchState?.activeGame || 'BGMI';
  const tournamentTitle =
    matchState?.tournamentTitle || 'PRO SERIES INVITATIONAL S4';
  const stageLabel = matchState?.stageLabel || 'Week 01 Day 01';
  const matchId = matchState?.matchId || 'Match_01_BGMI';
  const roundNum = matchState?.roundNumber || 1;
  const matchStatus = matchState?.matchStatus || MATCH_STATUS.LIVE;
  const selectedTeamKey = matchState?.selectedTeamKey || null;
  const aliveTeamsCount = matchState?.aliveTeamsCount ?? 26;
  const totalTeamsCount = matchState?.totalTeamsCount ?? 26;

  const effectiveViewMode =
    localViewOverride ||
    matchState?.overlayViewMode ||
    OVERLAY_VIEW_MODES.MATCH;

  const handleSelectViewMode = (mode) => {
    setLocalViewOverride(mode);
    const controller = getBroadcastController();
    controller.updateBroadcastMeta?.({ overlayViewMode: mode }).catch(() => {});
  };

  // 1. Live Match Leaderboard rows
  const fullMatchLeaderboard =
    matchState?.leaderboard && matchState.leaderboard.length > 0
      ? matchState.leaderboard.map((t, index) => ({
          rank: t.leaderboardRank || index + 1,
          slotKey: t.Key,
          teamName: t.TeamName,
          pos: Number(t.pos ?? 0),
          kp: Number(t.KP ?? 0),
          pp: Number(t.PP ?? 0),
          tt: Number(t.TT ?? 0),
          aliveCount: Number(t.pos ?? 0) === 0 ? 4 : 0,
        }))
      : getOverlaySampleLeaderboard();

  // 2. Cumulative Tournament Standings rows
  const tournamentAggregation = matchState?.tournamentStandings || null;
  const fullOverallLeaderboard =
    tournamentAggregation?.standings &&
    tournamentAggregation.standings.length > 0
      ? tournamentAggregation.standings.map((t, index) => ({
          rank: t.overallRank || index + 1,
          slotKey: t.Key,
          teamName: t.TeamName,
          matchesPlayed: t.matchesPlayed,
          winsCount: t.winsCount,
          currentTT: t.currentTT,
          kp: t.totalKP,
          pp: t.totalPP,
          tt: t.totalTT,
        }))
      : fullMatchLeaderboard.map((t) => ({
          rank: t.rank,
          slotKey: t.slotKey,
          teamName: t.teamName,
          matchesPlayed: 1,
          winsCount: t.pos === 1 ? 1 : 0,
          currentTT: t.tt,
          kp: t.kp,
          pp: t.pp,
          tt: t.tt,
        }));

  const displayedMatchTeams = fullMatchLeaderboard.slice(0, rowLimit);
  const displayedOverallTeams = fullOverallLeaderboard.slice(0, rowLimit);
  const podiumTeams = fullMatchLeaderboard.slice(0, 3);
  const runnerUpMatchTeams = fullMatchLeaderboard.slice(
    3,
    Math.max(10, rowLimit)
  );

  const isConnected =
    connectionStatus === OVERLAY_CONNECTION_STATE.CONNECTED ||
    connectionStatus === OVERLAY_CONNECTION_STATE.HIDDEN;

  return (
    <div
      className={embeddedMode ? 'w-full text-slate-100' : 'overlay-hud-shell'}
      data-testid="overlay-viewport-root"
      data-overlay-mode={effectiveViewMode}
    >
      {/* Dynamic Broadcast Header */}
      <div className="overlay-header-panel overlay-drag-handle rounded-t-md px-3.5 py-2.5">
        {/* Top Kicker Row: Game, Round, Alive / Matches Count & View Controls */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-cyan-400 whitespace-nowrap shrink-0">
            <span data-testid="overlay-active-game">
              {activeGame === 'FREE_FIRE' ? 'FREE FIRE' : 'BGMI'}
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span data-testid="overlay-match-id" className="text-amber-400">
              R{String(roundNum).padStart(2, '0')}
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            {effectiveViewMode === OVERLAY_VIEW_MODES.OVERALL ? (
              <span className="text-emerald-400">
                {tournamentAggregation?.totalMatchesCounted || 1}{' '}
                {(tournamentAggregation?.totalMatchesCounted || 1) === 1
                  ? 'MATCH'
                  : 'MATCHES'}
              </span>
            ) : effectiveViewMode === OVERLAY_VIEW_MODES.END_OF_MATCH ? (
              <span className="text-amber-300">FINAL STANDINGS</span>
            ) : (
              <span className="text-emerald-400">
                {aliveTeamsCount}/{totalTeamsCount} ALIVE
              </span>
            )}
          </div>

          {/* Interactive Broadcast Switchers (No-Drag for OBS / Operator clicks) */}
          <div className="overlay-no-drag flex items-center gap-1 shrink-0">
            {[
              { id: OVERLAY_VIEW_MODES.MATCH, label: 'LIVE' },
              { id: OVERLAY_VIEW_MODES.OVERALL, label: 'OVERALL' },
              { id: OVERLAY_VIEW_MODES.END_OF_MATCH, label: 'FINAL' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectViewMode(tab.id)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider transition-colors whitespace-nowrap shrink-0 ${
                  effectiveViewMode === tab.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-slate-700/80 bg-slate-900/80 text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() =>
                setRowLimit((prev) => (prev === 10 ? 26 : prev === 26 ? 8 : 10))
              }
              aria-label="Cycle Overlay Leaderboard Row Count"
              className="rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Top {rowLimit}
            </button>
          </div>
        </div>

        {/* Event / Tournament Title & Stage Subtitle */}
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h1
            data-testid="overlay-tournament-title"
            className="broadcast-display-font text-lg sm:text-xl font-bold tracking-wide text-white truncate"
            title={tournamentTitle}
          >
            {tournamentTitle}
          </h1>
          <span
            data-testid="overlay-stage-label"
            className="broadcast-mono-font text-[10px] font-semibold tracking-wider text-slate-300 whitespace-nowrap shrink-0"
          >
            {stageLabel} ·{' '}
            {!isConnected
              ? 'OFFLINE'
              : matchStatus === MATCH_STATUS.COMPLETED
              ? 'FINAL'
              : 'LIVE'}
          </span>
        </div>
      </div>

      {/* MODE 1: LIVE MATCH STANDINGS TABLE */}
      {effectiveViewMode === OVERLAY_VIEW_MODES.MATCH && (
        <>
          <div className="overlay-column-header broadcast-display-font grid grid-cols-[44px_1fr_38px_38px_48px] items-center px-2.5 py-1.5 text-xs font-bold tracking-wider">
            <span className="text-center">#</span>
            <span className="pl-2">TEAM</span>
            <span className="text-right pr-1">KP</span>
            <span className="text-right pr-1">PP</span>
            <span className="text-right pr-1.5">TOTAL</span>
          </div>

          <div
            className="divide-y divide-slate-800/60 border-x border-b border-slate-700/50 rounded-b-md overflow-hidden"
            role="region"
            aria-label="Broadcast Leaderboard Standings"
          >
            {displayedMatchTeams.map((team) => {
              const rankClass =
                team.rank === 1
                  ? 'overlay-rank-cell-top1'
                  : team.rank === 2
                  ? 'overlay-rank-cell-top2'
                  : team.rank === 3
                  ? 'overlay-rank-cell-top3'
                  : 'overlay-rank-cell';

              const delta = recentChanges[team.slotKey];
              const isSelected = selectedTeamKey === team.slotKey;
              const isEliminated = team.pos > 0;

              return (
                <div
                  key={team.slotKey}
                  data-testid={`overlay-team-row-${team.rank}`}
                  className={`overlay-team-row ${
                    team.rank <= 3 ? 'overlay-team-row-top3' : ''
                  } ${isSelected ? 'overlay-team-row-selected' : ''} ${
                    isEliminated && team.rank > 3
                      ? 'overlay-team-row-eliminated'
                      : ''
                  } ${
                    delta?.scoreChanged ? 'overlay-row-score-pulse' : ''
                  } grid grid-cols-[44px_1fr_38px_38px_48px] items-center px-2.5 py-1.5 text-xs`}
                >
                  {/* Rank + Movement Indicator */}
                  <div className="flex items-center justify-center gap-0.5">
                    <span
                      className={`broadcast-mono-font inline-flex h-5 w-7 items-center justify-center rounded-xs text-[11px] font-bold ${rankClass}`}
                    >
                      #{String(team.rank).padStart(2, '0')}
                    </span>
                    {delta && delta.rankDelta !== 0 && (
                      <span
                        className={`broadcast-mono-font text-[9px] font-bold ${
                          delta.rankDelta > 0
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {delta.rankDelta > 0
                          ? `▲${delta.rankDelta}`
                          : `▼${Math.abs(delta.rankDelta)}`}
                      </span>
                    )}
                  </div>

                  {/* Team Name + Alive Vitality Bars / Eliminated Rank */}
                  <div className="min-w-0 pl-2 pr-2 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="broadcast-mono-font text-[10px] font-bold text-cyan-400 shrink-0">
                        {team.slotKey}
                      </span>
                      <span
                        data-testid={`overlay-row-${team.rank}-name`}
                        className="font-semibold text-white truncate"
                      >
                        {team.teamName}
                      </span>
                    </div>

                    {isEliminated ? (
                      <span
                        className="broadcast-mono-font text-[10px] font-semibold text-amber-300 shrink-0"
                        title={`Placed #${team.pos}`}
                      >
                        #{String(team.pos).padStart(2, '0')}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-0.5 shrink-0"
                        title="4/4 Squad Active"
                        aria-label="4 of 4 players active"
                      >
                        {[0, 1, 2, 3].map((barIdx) => (
                          <span
                            key={barIdx}
                            className="h-2.5 w-1 rounded-xs bg-emerald-400"
                          />
                        ))}
                      </span>
                    )}
                  </div>

                  <span
                    data-testid={`overlay-row-${team.rank}-kp`}
                    className="broadcast-mono-font text-right pr-1 font-medium text-slate-200"
                  >
                    {String(team.kp).padStart(2, '0')}
                  </span>

                  <span
                    data-testid={`overlay-row-${team.rank}-pp`}
                    className="broadcast-mono-font text-right pr-1 font-medium text-slate-300"
                  >
                    {String(team.pp).padStart(2, '0')}
                  </span>

                  <span
                    data-testid={`overlay-row-${team.rank}-tt`}
                    className={`overlay-total-cell broadcast-mono-font text-right pr-1.5 py-0.5 rounded-xs font-bold ${
                      delta?.scoreChanged ? 'overlay-cell-bump' : ''
                    }`}
                  >
                    {String(team.tt).padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MODE 2: CUMULATIVE TOURNAMENT STANDINGS TABLE */}
      {effectiveViewMode === OVERLAY_VIEW_MODES.OVERALL && (
        <>
          <div className="overlay-column-header broadcast-display-font grid grid-cols-[42px_1fr_32px_36px_38px_48px] items-center px-2.5 py-1.5 text-xs font-bold tracking-wider">
            <span className="text-center">#</span>
            <span className="pl-2">TEAM (OVERALL)</span>
            <span className="text-right pr-1" title="Matches Played">
              M
            </span>
            <span className="text-right pr-1" title="Total Wins (#1)">
              WIN
            </span>
            <span className="text-right pr-1">KP</span>
            <span className="text-right pr-1.5">TOTAL</span>
          </div>

          <div
            className="divide-y divide-slate-800/60 border-x border-b border-slate-700/50 rounded-b-md overflow-hidden"
            role="region"
            aria-label="Cumulative Tournament Standings"
          >
            {displayedOverallTeams.map((team) => {
              const rankClass =
                team.rank === 1
                  ? 'overlay-rank-cell-top1'
                  : team.rank === 2
                  ? 'overlay-rank-cell-top2'
                  : team.rank === 3
                  ? 'overlay-rank-cell-top3'
                  : 'overlay-rank-cell';

              return (
                <div
                  key={team.slotKey}
                  data-testid={`overlay-overall-row-${team.rank}`}
                  className={`overlay-team-row ${
                    team.rank <= 3 ? 'overlay-team-row-top3' : ''
                  } grid grid-cols-[42px_1fr_32px_36px_38px_48px] items-center px-2.5 py-1.5 text-xs`}
                >
                  <div className="flex items-center justify-center">
                    <span
                      className={`broadcast-mono-font inline-flex h-5 w-7 items-center justify-center rounded-xs text-[11px] font-bold ${rankClass}`}
                    >
                      #{String(team.rank).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="min-w-0 pl-2 pr-1.5 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="broadcast-mono-font text-[10px] font-bold text-cyan-400 shrink-0">
                        {team.slotKey}
                      </span>
                      <span className="font-semibold text-white truncate">
                        {team.teamName}
                      </span>
                    </div>
                    {team.currentTT > 0 && (
                      <span
                        className="broadcast-mono-font text-[10px] font-semibold text-emerald-400 shrink-0"
                        title={`Current Round ${matchId} Points`}
                      >
                        +{team.currentTT}
                      </span>
                    )}
                  </div>

                  <span className="broadcast-mono-font text-right pr-1 text-slate-300">
                    {team.matchesPlayed}
                  </span>

                  <span className="broadcast-mono-font text-right pr-1 font-semibold text-amber-300">
                    {team.winsCount}
                  </span>

                  <span className="broadcast-mono-font text-right pr-1 font-medium text-slate-200">
                    {String(team.kp).padStart(2, '0')}
                  </span>

                  <span
                    data-testid={`overlay-overall-row-${team.rank}-tt`}
                    className="overlay-total-cell broadcast-mono-font text-right pr-1.5 py-0.5 rounded-xs font-bold"
                  >
                    {String(team.tt).padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MODE 3: END-OF-MATCH FINAL STANDINGS BROADCAST GRAPHIC */}
      {effectiveViewMode === OVERLAY_VIEW_MODES.END_OF_MATCH && (
        <div
          data-testid="overlay-end-of-match-graphic"
          className="border-x border-b border-slate-700/60 rounded-b-md overflow-hidden bg-[#0a0f1a]/95"
        >
          {/* Banner Header for Final Standings */}
          <div className="overlay-column-header flex items-center justify-between px-3 py-1.5">
            <span className="broadcast-display-font text-xs font-bold tracking-wider">
              {matchId} · FINAL MATCH STANDINGS
            </span>
            <button
              type="button"
              onClick={() => handleSelectViewMode(OVERLAY_VIEW_MODES.MATCH)}
              className="overlay-no-drag rounded bg-slate-950/90 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:text-white"
            >
              Return to Live Overlay
            </button>
          </div>

          {/* Top 3 Podium Cards */}
          <div className="grid grid-cols-3 gap-2 p-2.5">
            {podiumTeams.map((team, idx) => (
              <div
                key={team.slotKey}
                data-testid={`overlay-podium-rank-${idx + 1}`}
                className={`rounded p-2 ${
                  idx === 0
                    ? 'overlay-podium-card-first'
                    : 'overlay-podium-card'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                  <span
                    className={` whitespace-nowrap ${
                      idx === 0
                        ? 'text-amber-400'
                        : idx === 1
                        ? 'text-cyan-300'
                        : 'text-amber-200'
                    }`}
                  >
                    #{idx + 1} {idx === 0 ? 'WINNER' : 'PODIUM'}
                  </span>
                  <span className="broadcast-mono-font text-slate-400 whitespace-nowrap shrink-0">
                    [{team.slotKey}]
                  </span>
                </div>
                <div className="mt-1 text-xs font-bold text-white truncate">
                  {team.teamName}
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-1 border-t border-slate-800/80 pt-1 broadcast-mono-font text-[10px]">
                  <span className="text-slate-300 whitespace-nowrap">
                    {team.kp}K · {team.pp}P
                  </span>
                  <strong className="text-[11px] font-bold text-amber-400 whitespace-nowrap shrink-0">
                    {team.tt} PT
                  </strong>
                </div>
              </div>
            ))}
          </div>

          {/* Ranked Table #4..#10 */}
          <div className="divide-y divide-slate-800/60 border-t border-slate-800">
            {runnerUpMatchTeams.map((team) => (
              <div
                key={team.slotKey}
                className="overlay-team-row grid grid-cols-[42px_1fr_40px_40px_48px] items-center px-2.5 py-1 text-xs"
              >
                <span className="broadcast-mono-font text-center text-[11px] font-bold text-slate-300">
                  #{String(team.rank).padStart(2, '0')}
                </span>
                <div className="min-w-0 pl-2 pr-2 flex items-center gap-1.5">
                  <span className="broadcast-mono-font text-[10px] font-bold text-cyan-400 shrink-0">
                    {team.slotKey}
                  </span>
                  <span className="font-semibold text-white truncate">
                    {team.teamName}
                  </span>
                </div>
                <span className="broadcast-mono-font text-right pr-1 text-slate-300">
                  {String(team.kp).padStart(2, '0')}
                </span>
                <span className="broadcast-mono-font text-right pr-1 text-slate-400">
                  {String(team.pp).padStart(2, '0')}
                </span>
                <span className="overlay-total-cell broadcast-mono-font text-right pr-1.5 py-0.5 rounded-xs font-bold">
                  {String(team.tt).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
