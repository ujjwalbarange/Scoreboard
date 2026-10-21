import React, { useEffect, useState, useRef } from 'react';
import { getBroadcastController } from '../shared/browserBridge.js';
import { getControlDeckPlaceholderTeams } from '../shared/mockTeams.js';
import {
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
  OVERLAY_VIEW_MODES,
} from '../shared/constants.js';
import {
  computeOverlayCssVariables,
  computeResponsiveCanvasScale,
  sanitizeOverlayConfig,
  splitTeamsIntoBalancedColumns,
} from '../shared/overlayLayout.js';
import './styles/overlay.css';

/**
 * Broadcast Overlay Viewport React Application
 * Phase 1, 2 & 3 Addendum: Responsive & Fully Customizable 16:9 Landscape Two-Column OBS Scorecard Overlay
 *
 * - Uses ResizeObserver + proportional CSS custom properties (--ov-*) to scale smoothly
 *   across 1920x1080, 1600x900, 1280x720, and custom canvas resolutions.
 * - Supports optional persistent background image with opacity, scale mode (cover/contain/stretch),
 *   and positioning while remaining strictly transparent (#00000000) when no background is set.
 * - Supports independent scorecard customization (width/height %, X/Y offset, row height/gap,
 *   column spacing, typography sizes, colors/opacity, and column/element visibility).
 */
export default function OverlayViewportApp({
  embeddedMode = false,
  overrideOverlayConfig = null,
}) {
  const [matchState, setMatchState] = useState(null);
  const [rowLimit, setRowLimit] = useState(26); // 26 | 20 | 16
  const [connectionStatus, setConnectionStatus] = useState(
    OVERLAY_CONNECTION_STATE.CONNECTED
  );
  const [localViewOverride, setLocalViewOverride] = useState(null);

  // Observed container dimensions via ResizeObserver for proportional scaling
  const viewportContainerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({
    width: embeddedMode ? 560 : 1280,
    height: embeddedMode ? 315 : 720,
  });

  // Track previous team ranks and scores to drive restrained broadcast animations
  const prevMetricsRef = useRef(new Map());
  const [recentChanges, setRecentChanges] = useState({});
  const clearChangesTimerRef = useRef(null);

  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      if (!viewportContainerRef.current) return;
      const rect = viewportContainerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateDimensions();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateDimensions();
      });
      observer.observe(el);
    }

    window.addEventListener('resize', updateDimensions);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

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
      setLocalViewOverride(null);
    });

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
        const rankDelta = prev.rank - rank;
        const ttDelta = tt - prev.tt;
        const kpDelta = kp - prev.kp;

        if (
          rankDelta !== 0 ||
          ttDelta !== 0 ||
          kpDelta !== 0 ||
          prev.pos !== pos
        ) {
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

  const effectiveOverlayConfig = sanitizeOverlayConfig(
    overrideOverlayConfig || matchState?.overlayConfig
  );

  const handleSelectViewMode = (mode) => {
    setLocalViewOverride(mode);
    const controller = getBroadcastController();
    controller.updateBroadcastMeta?.({ overlayViewMode: mode }).catch(() => {});
  };

  // 1. Live Match Leaderboard rows (all 26 teams)
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
      : getControlDeckPlaceholderTeams().map((t, index) => ({
          rank: t.rank || index + 1,
          slotKey: t.slotKey,
          teamName: t.teamName,
          pos: Number(t.pos ?? 0),
          kp: Number(t.kp ?? 0),
          pp: Number(t.pp ?? 0),
          tt: Number(t.tt ?? 0),
          aliveCount: Number(t.aliveCount ?? 4),
        }));

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

  // Balanced two-column split for Live Match, Overall Standings, and End-of-Match views
  const matchSplit = splitTeamsIntoBalancedColumns(
    fullMatchLeaderboard,
    rowLimit
  );
  const overallSplit = splitTeamsIntoBalancedColumns(
    fullOverallLeaderboard,
    rowLimit
  );
  const podiumTeams = fullMatchLeaderboard.slice(0, 3);
  const finalSplit = splitTeamsIntoBalancedColumns(
    fullMatchLeaderboard,
    rowLimit
  );

  // Compute responsive CSS variables and viewport scale
  const { cssVars, config: normalizedConfig, fitReport } =
    computeOverlayCssVariables(
      effectiveOverlayConfig,
      matchSplit.rowsPerColumn,
      effectiveViewMode
    );

  const scaleMetrics = computeResponsiveCanvasScale({
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    canvasWidth: normalizedConfig.canvas.width,
    canvasHeight: normalizedConfig.canvas.height,
    referenceWidth: normalizedConfig.canvas.referenceWidth,
    referenceHeight: normalizedConfig.canvas.referenceHeight,
  });

  const { scorecard, background, canvas } = normalizedConfig;
  const refScale = scaleMetrics.referenceScale;

  // Dynamic column template for Match & Final tables based on KP/PP visibility
  const rankColW = `${Math.max(36, Math.round(54 * refScale))}px`;
  const kpColW = `${Math.max(30, Math.round(50 * refScale))}px`;
  const ppColW = `${Math.max(30, Math.round(50 * refScale))}px`;
  const totalColW = `${Math.max(40, Math.round(64 * refScale))}px`;

  const matchGridCols = [
    rankColW,
    'minmax(0, 1fr)',
    scorecard.showKillPoints ? kpColW : null,
    scorecard.showPlacementPoints ? ppColW : null,
    totalColW,
  ]
    .filter(Boolean)
    .join(' ');

  const overallGridCols = [
    rankColW,
    'minmax(0, 1fr)',
    `${Math.max(24, Math.round(38 * refScale))}px`,
    `${Math.max(28, Math.round(42 * refScale))}px`,
    scorecard.showKillPoints ? kpColW : null,
    totalColW,
  ]
    .filter(Boolean)
    .join(' ');

  const isConnected =
    connectionStatus === OVERLAY_CONNECTION_STATE.CONNECTED ||
    connectionStatus === OVERLAY_CONNECTION_STATE.HIDDEN;

  const renderMatchTableHeader = () => (
    <div
      className="overlay-column-header broadcast-display-font items-center px-2.5 py-1 font-bold tracking-wider"
      style={{ display: 'grid', gridTemplateColumns: matchGridCols }}
    >
      <span className="text-center">#</span>
      <span className="pl-1.5">TEAM</span>
      {scorecard.showKillPoints && <span className="text-right pr-1">KP</span>}
      {scorecard.showPlacementPoints && (
        <span className="text-right pr-1">PP</span>
      )}
      <span className="text-right pr-1.5">TOTAL</span>
    </div>
  );

  const renderMatchTeamRow = (team) => {
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
        style={{ display: 'grid', gridTemplateColumns: matchGridCols }}
        className={`overlay-team-row ${
          team.rank <= 3 ? 'overlay-team-row-top3' : ''
        } ${isSelected ? 'overlay-team-row-selected' : ''} ${
          isEliminated && team.rank > 3 ? 'overlay-team-row-eliminated' : ''
        } ${delta?.scoreChanged ? 'overlay-row-score-pulse' : ''} items-center px-2.5`}
      >
        {/* Rank + Movement Indicator */}
        <div className="flex items-center justify-center gap-0.5">
          <span
            className={`broadcast-mono-font inline-flex items-center justify-center rounded-xs px-1.5 py-0.5 font-bold ${rankClass}`}
            style={{
              fontSize: `${Math.max(9, Math.round(scorecard.scoreFontSizePx * refScale * 0.86))}px`,
            }}
          >
            #{String(team.rank).padStart(2, '0')}
          </span>
          {delta && delta.rankDelta !== 0 && (
            <span
              className={`broadcast-mono-font text-[10px] font-bold ${
                delta.rankDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {delta.rankDelta > 0
                ? `▲${delta.rankDelta}`
                : `▼${Math.abs(delta.rankDelta)}`}
            </span>
          )}
        </div>

        {/* Team Name + Alive Vitality Bars / Eliminated Rank */}
        <div className="min-w-0 pl-1.5 pr-1.5 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {scorecard.showSlotKey && (
              <span
                className="broadcast-mono-font font-bold text-cyan-400 shrink-0"
                style={{
                  fontSize: `${Math.max(9, Math.round(scorecard.teamFontSizePx * refScale * 0.82))}px`,
                }}
              >
                {team.slotKey}
              </span>
            )}
            <span
              data-testid={`overlay-row-${team.rank}-name`}
              className="font-semibold truncate"
              style={{ color: scorecard.textColor }}
              title={team.teamName}
            >
              {team.teamName}
            </span>
          </div>

          {scorecard.showAliveBars &&
            (isEliminated ? (
              <span
                className="broadcast-mono-font font-semibold text-amber-300 shrink-0"
                style={{
                  fontSize: `${Math.max(9, Math.round(scorecard.scoreFontSizePx * refScale * 0.8))}px`,
                }}
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
                    className="rounded-xs bg-emerald-400"
                    style={{
                      width: `${Math.max(3, Math.round(4 * refScale))}px`,
                      height: `${Math.max(8, Math.round(11 * refScale))}px`,
                    }}
                  />
                ))}
              </span>
            ))}
        </div>

        {scorecard.showKillPoints && (
          <span
            data-testid={`overlay-row-${team.rank}-kp`}
            className="overlay-score-value broadcast-mono-font text-right pr-1 font-medium text-slate-200"
          >
            {String(team.kp).padStart(2, '0')}
          </span>
        )}

        {scorecard.showPlacementPoints && (
          <span
            data-testid={`overlay-row-${team.rank}-pp`}
            className="overlay-score-value broadcast-mono-font text-right pr-1 font-medium text-slate-300"
          >
            {String(team.pp).padStart(2, '0')}
          </span>
        )}

        <span
          data-testid={`overlay-row-${team.rank}-tt`}
          className={`overlay-total-cell overlay-score-value broadcast-mono-font text-right pr-1.5 py-0.5 rounded-xs font-bold ${
            delta?.scoreChanged ? 'overlay-cell-bump' : ''
          }`}
        >
          {String(team.tt).padStart(2, '0')}
        </span>
      </div>
    );
  };

  const renderOverallTeamRow = (team) => {
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
        style={{ display: 'grid', gridTemplateColumns: overallGridCols }}
        className={`overlay-team-row ${
          team.rank <= 3 ? 'overlay-team-row-top3' : ''
        } items-center px-2.5`}
      >
        <div className="flex items-center justify-center">
          <span
            className={`broadcast-mono-font inline-flex items-center justify-center rounded-xs px-1.5 py-0.5 font-bold ${rankClass}`}
            style={{
              fontSize: `${Math.max(9, Math.round(scorecard.scoreFontSizePx * refScale * 0.86))}px`,
            }}
          >
            #{String(team.rank).padStart(2, '0')}
          </span>
        </div>

        <div className="min-w-0 pl-1.5 pr-1.5 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {scorecard.showSlotKey && (
              <span
                className="broadcast-mono-font font-bold text-cyan-400 shrink-0"
                style={{
                  fontSize: `${Math.max(9, Math.round(scorecard.teamFontSizePx * refScale * 0.82))}px`,
                }}
              >
                {team.slotKey}
              </span>
            )}
            <span
              className="font-semibold truncate"
              style={{ color: scorecard.textColor }}
              title={team.teamName}
            >
              {team.teamName}
            </span>
          </div>
          {team.currentTT > 0 && (
            <span
              className="broadcast-mono-font font-semibold text-emerald-400 shrink-0"
              style={{
                fontSize: `${Math.max(9, Math.round(scorecard.scoreFontSizePx * refScale * 0.8))}px`,
              }}
              title={`Current Round ${matchId} Points`}
            >
              +{team.currentTT}
            </span>
          )}
        </div>

        <span className="overlay-score-value broadcast-mono-font text-right pr-1 text-slate-300">
          {team.matchesPlayed}
        </span>

        <span className="overlay-score-value broadcast-mono-font text-right pr-1 font-semibold text-amber-300">
          {team.winsCount}
        </span>

        {scorecard.showKillPoints && (
          <span className="overlay-score-value broadcast-mono-font text-right pr-1 font-medium text-slate-200">
            {String(team.kp).padStart(2, '0')}
          </span>
        )}

        <span
          data-testid={`overlay-overall-row-${team.rank}-tt`}
          className="overlay-total-cell overlay-score-value broadcast-mono-font text-right pr-1.5 py-0.5 rounded-xs font-bold"
        >
          {String(team.tt).padStart(2, '0')}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={viewportContainerRef}
      className={
        embeddedMode
          ? 'overlay-embedded-viewport'
          : 'overlay-landscape-viewport'
      }
      data-testid={
        embeddedMode
          ? 'overlay-embedded-container'
          : 'overlay-standalone-container'
      }
    >
      <div
        className="overlay-scale-frame"
        style={{
          width: `${scaleMetrics.scaledWidthPx}px`,
          height: `${scaleMetrics.scaledHeightPx}px`,
        }}
      >
        <div
          className="overlay-virtual-canvas"
          style={{
            ...cssVars,
            transform: `scale(${scaleMetrics.viewportScale})`,
          }}
          data-testid="overlay-viewport-root"
          data-overlay-mode={effectiveViewMode}
          data-overlay-layout="landscape-16x9-two-column"
          data-canvas-width={canvas.width}
          data-canvas-height={canvas.height}
          data-viewport-scale={scaleMetrics.viewportScale}
          data-reference-scale={scaleMetrics.referenceScale}
          data-has-background={Boolean(background.imageDataUrl)}
          data-layout-fits={fitReport.fits}
        >
          {/* Optional Custom Background Layer (Strictly omitted when no background is uploaded so OBS stays #00000000 transparent) */}
          {background.imageDataUrl && (
            <div
              data-testid="overlay-custom-background"
              className="overlay-custom-background-layer"
              style={{
                backgroundImage: `url("${background.imageDataUrl}")`,
              }}
            />
          )}

          {/* Independent Customizable Scorecard Stage */}
          <div
            data-testid="overlay-scorecard-stage"
            className="overlay-scorecard-stage"
          >
            {/* Dynamic Broadcast Header (Compact 16:9 Top Bar) */}
            {scorecard.showHeader && (
              <div
                data-testid="overlay-header-bar"
                className="overlay-header-panel overlay-drag-handle rounded-t-md px-4 py-2 mb-2 shrink-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Left: Tournament Title, Stage & Live Telemetry */}
                  <div className="flex flex-wrap items-baseline gap-3 min-w-0">
                    <h1
                      data-testid="overlay-tournament-title"
                      className="broadcast-display-font font-bold tracking-wide text-white truncate"
                      style={{ fontSize: 'var(--ov-header-font, 22px)' }}
                      title={tournamentTitle}
                    >
                      {tournamentTitle}
                    </h1>
                    <span
                      data-testid="overlay-stage-label"
                      className="broadcast-mono-font font-semibold tracking-wider text-slate-300 whitespace-nowrap shrink-0"
                      style={{
                        fontSize: `${Math.max(10, Math.round(scorecard.headerFontSizePx * refScale * 0.58))}px`,
                      }}
                    >
                      {stageLabel} ·{' '}
                      {!isConnected
                        ? 'OFFLINE'
                        : matchStatus === MATCH_STATUS.COMPLETED
                        ? 'FINAL'
                        : 'LIVE'}
                    </span>
                  </div>

                  {/* Right: Game, Round, Alive Count & View Switchers */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <div
                      className="flex items-center gap-1.5 font-bold tracking-wider text-cyan-400 whitespace-nowrap shrink-0"
                      style={{
                        fontSize: `${Math.max(10, Math.round(scorecard.headerFontSizePx * refScale * 0.58))}px`,
                      }}
                    >
                      <span data-testid="overlay-active-game">
                        {activeGame === 'FREE_FIRE' ? 'FREE FIRE' : 'BGMI'}
                      </span>
                      <span aria-hidden="true" className="text-slate-500">
                        ·
                      </span>
                      <span
                        data-testid="overlay-match-id"
                        style={{ color: scorecard.accentColor }}
                      >
                        R{String(roundNum).padStart(2, '0')}
                      </span>
                      <span aria-hidden="true" className="text-slate-500">
                        ·
                      </span>
                      {effectiveViewMode === OVERLAY_VIEW_MODES.OVERALL ? (
                        <span className="text-emerald-400">
                          {tournamentAggregation?.totalMatchesCounted || 1}{' '}
                          {(tournamentAggregation?.totalMatchesCounted || 1) ===
                          1
                            ? 'MATCH'
                            : 'MATCHES'}
                        </span>
                      ) : effectiveViewMode ===
                        OVERLAY_VIEW_MODES.END_OF_MATCH ? (
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
                          className={`rounded px-2 py-0.5 text-[11px] font-bold tracking-wider transition-colors whitespace-nowrap shrink-0 ${
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
                          setRowLimit((prev) =>
                            prev === 26 ? 20 : prev === 20 ? 16 : 26
                          )
                        }
                        aria-label="Cycle Overlay Leaderboard Row Count"
                        className="rounded border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
                      >
                        {rowLimit === 26 ? 'All 26' : `Top ${rowLimit}`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODE 1: LIVE MATCH STANDINGS — TWO BALANCED COLUMNS (#01-#13 LEFT, #14-#26 RIGHT) */}
            {effectiveViewMode === OVERLAY_VIEW_MODES.MATCH && (
              <div
                data-testid="overlay-two-column-grid"
                className="overlay-two-column-layout"
                role="region"
                aria-label="Broadcast Leaderboard Standings"
              >
                {/* Left Column: Ranks #01 - #13 */}
                <div
                  data-testid="overlay-column-left"
                  className="overlay-column-card"
                >
                  {renderMatchTableHeader()}
                  <div
                    className="overlay-column-rows"
                    style={{
                      '--overlay-rows-per-col': matchSplit.rowsPerColumn,
                    }}
                  >
                    {matchSplit.leftColumn.map(renderMatchTeamRow)}
                  </div>
                </div>

                {/* Right Column: Ranks #14 - #26 */}
                <div
                  data-testid="overlay-column-right"
                  className="overlay-column-card"
                >
                  {renderMatchTableHeader()}
                  <div
                    className="overlay-column-rows"
                    style={{
                      '--overlay-rows-per-col': matchSplit.rowsPerColumn,
                    }}
                  >
                    {matchSplit.rightColumn.map(renderMatchTeamRow)}
                  </div>
                </div>
              </div>
            )}

            {/* MODE 2: CUMULATIVE TOURNAMENT STANDINGS — TWO BALANCED COLUMNS */}
            {effectiveViewMode === OVERLAY_VIEW_MODES.OVERALL && (
              <div
                data-testid="overlay-overall-two-column-grid"
                className="overlay-two-column-layout"
                role="region"
                aria-label="Cumulative Tournament Standings"
              >
                {/* Left Column */}
                <div
                  data-testid="overlay-overall-column-left"
                  className="overlay-column-card"
                >
                  <div
                    className="overlay-column-header broadcast-display-font items-center px-2.5 py-1 font-bold tracking-wider"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: overallGridCols,
                    }}
                  >
                    <span className="text-center">#</span>
                    <span className="pl-1.5">TEAM (OVERALL)</span>
                    <span className="text-right pr-1" title="Matches Played">
                      M
                    </span>
                    <span className="text-right pr-1" title="Total Wins (#1)">
                      WIN
                    </span>
                    {scorecard.showKillPoints && (
                      <span className="text-right pr-1">KP</span>
                    )}
                    <span className="text-right pr-1.5">TOTAL</span>
                  </div>
                  <div
                    className="overlay-column-rows"
                    style={{
                      '--overlay-rows-per-col': overallSplit.rowsPerColumn,
                    }}
                  >
                    {overallSplit.leftColumn.map(renderOverallTeamRow)}
                  </div>
                </div>

                {/* Right Column */}
                <div
                  data-testid="overlay-overall-column-right"
                  className="overlay-column-card"
                >
                  <div
                    className="overlay-column-header broadcast-display-font items-center px-2.5 py-1 font-bold tracking-wider"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: overallGridCols,
                    }}
                  >
                    <span className="text-center">#</span>
                    <span className="pl-1.5">TEAM (OVERALL)</span>
                    <span className="text-right pr-1" title="Matches Played">
                      M
                    </span>
                    <span className="text-right pr-1" title="Total Wins (#1)">
                      WIN
                    </span>
                    {scorecard.showKillPoints && (
                      <span className="text-right pr-1">KP</span>
                    )}
                    <span className="text-right pr-1.5">TOTAL</span>
                  </div>
                  <div
                    className="overlay-column-rows"
                    style={{
                      '--overlay-rows-per-col': overallSplit.rowsPerColumn,
                    }}
                  >
                    {overallSplit.rightColumn.map(renderOverallTeamRow)}
                  </div>
                </div>
              </div>
            )}

            {/* MODE 3: END-OF-MATCH FINAL STANDINGS BROADCAST GRAPHIC (PODIUM + TWO COLUMNS) */}
            {effectiveViewMode === OVERLAY_VIEW_MODES.END_OF_MATCH && (
              <div
                data-testid="overlay-end-of-match-graphic"
                className="flex-1 min-h-0 flex flex-col gap-2"
              >
                {/* Compact Top 3 Podium Strip */}
                <div
                  className="grid grid-cols-3 shrink-0"
                  style={{ gap: 'var(--ov-col-gap, 16px)' }}
                >
                  {podiumTeams.map((team, idx) => (
                    <div
                      key={team.slotKey}
                      data-testid={`overlay-podium-rank-${idx + 1}`}
                      className={`rounded px-3.5 py-1.5 flex items-center justify-between gap-2 ${
                        idx === 0
                          ? 'overlay-podium-card-first'
                          : 'overlay-podium-card'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold">
                          <span
                            className={`whitespace-nowrap ${
                              idx === 0
                                ? 'text-amber-400'
                                : idx === 1
                                ? 'text-cyan-300'
                                : 'text-amber-200'
                            }`}
                          >
                            #{idx + 1} {idx === 0 ? 'WINNER' : 'PODIUM'}
                          </span>
                          {scorecard.showSlotKey && (
                            <span className="broadcast-mono-font text-slate-400 whitespace-nowrap shrink-0">
                              [{team.slotKey}]
                            </span>
                          )}
                        </div>
                        <div
                          className="font-bold text-white truncate"
                          style={{
                            fontSize: `${Math.max(11, Math.round(scorecard.teamFontSizePx * refScale * 1.1))}px`,
                          }}
                          title={team.teamName}
                        >
                          {team.teamName}
                        </div>
                      </div>
                      <div className="text-right broadcast-mono-font shrink-0">
                        <div className="text-[11px] text-slate-300 whitespace-nowrap">
                          {team.kp}K · {team.pp}P
                        </div>
                        <strong
                          className="font-bold text-amber-400 whitespace-nowrap"
                          style={{
                            fontSize: `${Math.max(11, Math.round(scorecard.scoreFontSizePx * refScale * 1.1))}px`,
                          }}
                        >
                          {team.tt} PTS
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Two-Column Full Standings Below Podium */}
                <div className="overlay-two-column-layout">
                  <div className="overlay-column-card">
                    {renderMatchTableHeader()}
                    <div
                      className="overlay-column-rows"
                      style={{
                        '--overlay-rows-per-col': finalSplit.rowsPerColumn,
                      }}
                    >
                      {finalSplit.leftColumn.map(renderMatchTeamRow)}
                    </div>
                  </div>

                  <div className="overlay-column-card">
                    {renderMatchTableHeader()}
                    <div
                      className="overlay-column-rows"
                      style={{
                        '--overlay-rows-per-col': finalSplit.rowsPerColumn,
                      }}
                    >
                      {finalSplit.rightColumn.map(renderMatchTeamRow)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
