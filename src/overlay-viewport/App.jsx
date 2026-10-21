import React, { useEffect, useState, useRef } from 'react';
import { getBroadcastController } from '../shared/browserBridge.js';
import { getOverlaySampleLeaderboard } from '../shared/mockTeams.js';
import { OVERLAY_CONNECTION_STATE } from '../shared/constants.js';
import './styles/overlay.css';

/**
 * Broadcast Overlay Viewport React Application
 * Phase 1 & Phase 2: Transparent, Frameless OBS Studio Live Leaderboard Overlay
 *
 * Read-only consumer of the authoritative MatchEngine state from the main process.
 * Never mutates scores or placements independently.
 */
export default function OverlayViewportApp({ embeddedMode = false }) {
  const [matchState, setMatchState] = useState(null);
  const [rowLimit, setRowLimit] = useState(10); // 8 | 10 | 16 | 26
  const [connectionStatus, setConnectionStatus] = useState(
    OVERLAY_CONNECTION_STATE.CONNECTED
  );
  const [showBroadcastStatusBadge, setShowBroadcastStatusBadge] = useState(true);
  const [lastTestEvent, setLastTestEvent] = useState(null);
  const [activeBannerEvent, setActiveBannerEvent] = useState(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const bannerTimerRef = useRef(null);

  useEffect(() => {
    const controller = getBroadcastController();
    let isMounted = true;

    // 1. Initial connection status
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

    // 2. Initial authoritative match state
    controller
      .getMatchState()
      .then((res) => {
        if (!isMounted || !res || !res.ok || !res.snapshot) return;
        setMatchState(res.snapshot);
      })
      .catch(() => {});

    // 3. Subscribe to connection lifecycle updates
    const unsubscribeStatus = controller.onConnectionStatus((snapshot) => {
      if (!isMounted || !snapshot) return;
      setConnectionStatus(
        snapshot.status || OVERLAY_CONNECTION_STATE.CONNECTED
      );
    });

    // 4. Subscribe to real-time authoritative match state broadcasts
    const unsubscribeMatch = controller.onMatchState((snapshot) => {
      if (!isMounted || !snapshot) return;
      setMatchState(snapshot);
    });

    // 5. Subscribe to Phase 1 diagnostic test events & return ACK
    const unsubscribeTestEvent = controller.onTestEvent((eventPayload) => {
      if (!isMounted || !eventPayload) return;

      const receivedAt = new Date().toISOString();
      const enriched = {
        ...eventPayload,
        receivedAt,
      };

      setLastTestEvent(enriched);
      setActiveBannerEvent(enriched);
      setReceivedCount((prev) => prev + 1);

      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
      bannerTimerRef.current = setTimeout(() => {
        if (isMounted) {
          setActiveBannerEvent(null);
        }
      }, 6000);

      controller
        .acknowledgeTestEvent({
          eventId: eventPayload.eventId,
          receivedAt,
        })
        .catch(() => {});
    });

    return () => {
      isMounted = false;
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
      if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
      if (typeof unsubscribeMatch === 'function') unsubscribeMatch();
      if (typeof unsubscribeTestEvent === 'function') unsubscribeTestEvent();
    };
  }, []);

  const isConnected =
    connectionStatus === OVERLAY_CONNECTION_STATE.CONNECTED ||
    connectionStatus === OVERLAY_CONNECTION_STATE.HIDDEN;

  const activeGame = matchState?.activeGame || 'BGMI';
  const tournamentTitle =
    matchState?.tournamentTitle || 'PRO SERIES INVITATIONAL S4';
  const matchId = matchState?.matchId || 'Match_01_BGMI';
  const roundNum = matchState?.roundNumber || 1;
  const matchStatus = matchState?.matchStatus || 'LIVE';
  const aliveTeamsCount = matchState?.aliveTeamsCount ?? 26;
  const totalTeamsCount = matchState?.totalTeamsCount ?? 26;

  // Use authoritative sorted leaderboard when available, fallback to sample
  const fullLeaderboard =
    matchState?.leaderboard && matchState.leaderboard.length > 0
      ? matchState.leaderboard.map((t, index) => ({
          rank: t.leaderboardRank || index + 1,
          slotKey: t.Key,
          teamName: t.TeamName,
          pos: t.pos,
          kp: t.KP,
          pp: t.PP,
          tt: t.TT,
          aliveCount: t.pos === 0 ? 4 : 0,
        }))
      : getOverlaySampleLeaderboard();

  const displayedTeams = fullLeaderboard.slice(0, rowLimit);

  return (
    <div
      className={embeddedMode ? 'w-full text-slate-100' : 'overlay-hud-shell'}
      data-testid="overlay-viewport-root"
    >
      {/* Compact Broadcast Leaderboard Header */}
      <div className="overlay-header-panel overlay-drag-handle rounded-t-md px-3.5 py-2.5">
        {/* Row 1: Game/Round/Alive Metadata & Hideable Broadcast Connection Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-cyan-400 whitespace-nowrap shrink-0">
            <span data-testid="overlay-active-game">
              {activeGame === 'FREE_FIRE' ? 'FREE FIRE' : 'BGMI'}
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span
              data-testid="overlay-match-id"
              className="text-amber-400"
            >
              R{String(roundNum).padStart(2, '0')}
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span className="text-emerald-400">
              {aliveTeamsCount}/{totalTeamsCount} ALIVE
            </span>
          </div>

          <div className="overlay-no-drag flex flex-wrap items-center gap-1 shrink-0">
            {showBroadcastStatusBadge && (
              <span
                data-testid="overlay-connection-indicator"
                className={`broadcast-mono-font text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 ${
                  isConnected
                    ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-950/70 text-rose-300'
                }`}
              >
                {isConnected ? 'IPC LINKED' : 'IPC OFFLINE'}
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                setRowLimit((prev) => (prev === 10 ? 26 : prev === 26 ? 8 : 10))
              }
              aria-label="Cycle Overlay Leaderboard Row Count"
              className="rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Top {rowLimit}
            </button>
            <button
              type="button"
              onClick={() => setShowBroadcastStatusBadge((prev) => !prev)}
              aria-label={
                showBroadcastStatusBadge
                  ? 'Hide overlay connection indicator for clean broadcast'
                  : 'Show overlay connection indicator'
              }
              className="rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {showBroadcastStatusBadge ? 'Hide HUD Tag' : 'Show HUD Tag'}
            </button>
          </div>
        </div>

        {/* Row 2: Full-Width Tournament Title & Match Identifier / Standings Status */}
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <h1 className="broadcast-display-font text-lg sm:text-xl font-bold tracking-wide text-white whitespace-nowrap truncate">
            {tournamentTitle}
          </h1>
          <span className="broadcast-mono-font text-[10px] font-semibold tracking-wider text-slate-300 whitespace-nowrap shrink-0">
            {matchId} · {matchStatus === 'COMPLETED' ? 'FINAL' : 'LIVE'}
          </span>
        </div>
      </div>

      {/* Column Headers matching Tournament Reference Graphics */}
      <div className="overlay-column-header broadcast-display-font grid grid-cols-[42px_1fr_44px_44px_52px] items-center px-2.5 py-1.5 text-xs font-bold tracking-wider">
        <span className="text-center">RANK</span>
        <span className="pl-2">TEAM NAME</span>
        <span className="text-right pr-1">KP</span>
        <span className="text-right pr-1">PP</span>
        <span className="text-right pr-1.5">TT</span>
      </div>

      {/* Live Authoritative Leaderboard Rows */}
      <div
        className="divide-y divide-slate-800/60 border-x border-b border-slate-700/50 rounded-b-md overflow-hidden"
        role="region"
        aria-label="Broadcast Leaderboard Standings"
      >
        {displayedTeams.map((team) => {
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
              data-testid={`overlay-team-row-${team.rank}`}
              className={`overlay-team-row ${
                team.rank <= 3 ? 'overlay-team-row-top3' : ''
              } grid grid-cols-[42px_1fr_44px_44px_52px] items-center px-2.5 py-1.5 text-xs`}
            >
              <div className="flex items-center justify-center">
                <span
                  className={`broadcast-mono-font inline-flex h-5 w-7 items-center justify-center rounded-xs text-[11px] font-bold ${rankClass}`}
                >
                  #{String(team.rank).padStart(2, '0')}
                </span>
              </div>

              <div className="min-w-0 pl-2 pr-2 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="broadcast-mono-font text-[10px] font-bold text-cyan-400 shrink-0">
                    [{team.slotKey}]
                  </span>
                  <span
                    data-testid={`overlay-row-${team.rank}-name`}
                    className="font-semibold text-white truncate"
                  >
                    {team.teamName}
                  </span>
                </div>

                {/* Alive 4-bar micro-indicator OR Placement Rank Badge */}
                {team.pos > 0 ? (
                  <span
                    className="broadcast-mono-font text-[10px] font-semibold text-amber-300 shrink-0"
                    title={`Eliminated at Placement #${team.pos}`}
                  >
                    P#{String(team.pos).padStart(2, '0')}
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-0.5 shrink-0"
                    title="4/4 Squad Alive"
                    aria-label="4 of 4 players alive"
                  >
                    {[0, 1, 2, 3].map((barIdx) => (
                      <span
                        key={barIdx}
                        className="h-2.5 w-1 rounded-xs bg-cyan-400"
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
                className="overlay-total-cell broadcast-mono-font text-right pr-1.5 py-0.5 rounded-xs font-bold"
              >
                {String(team.tt).padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>

      {/* Temporary Active Test IPC Event Notification Banner */}
      {activeBannerEvent && (
        <div
          role="status"
          aria-live="polite"
          data-testid="overlay-test-notification"
          className="overlay-test-toast overlay-no-drag mt-2 rounded-md px-3 py-2 text-xs text-slate-100"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-cyan-300">
              IPC TEST EVENT RECEIVED
            </span>
            <span className="broadcast-mono-font text-[10px] text-amber-300">
              {activeBannerEvent.eventId}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white font-medium">
            {activeBannerEvent.message}
          </p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 broadcast-mono-font">
            <span>SEQ #{activeBannerEvent.sequence}</span>
            <span>{activeBannerEvent.receivedAt}</span>
          </div>
        </div>
      )}

      {/* Persistent Compact Diagnostic Telemetry Footer */}
      {showBroadcastStatusBadge && (
        <div
          data-testid="overlay-test-telemetry"
          className="mt-1.5 flex items-center justify-between rounded bg-slate-950/85 border border-slate-800/80 px-2.5 py-1 text-[10px] text-slate-300 broadcast-mono-font"
        >
          <span>
            EVENTS RX: <strong className="text-cyan-400">{receivedCount}</strong>
          </span>
          <span className="truncate max-w-[230px]">
            {lastTestEvent
              ? `LAST: ${lastTestEvent.eventId} (${lastTestEvent.message})`
              : matchState?.lastEvent
              ? `SYNC: ${matchState.lastEvent.message}`
              : 'WAITING FOR IPC SYNC'}
          </span>
        </div>
      )}
    </div>
  );
}
