import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getBroadcastController } from '../shared/browserBridge.js';
import {
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
  OVERLAY_VIEW_MODES,
} from '../shared/constants.js';
import { filterTeamsByFuzzySearch } from '../shared/fuzzySearch.js';
import { getTeamGridLayoutConfig } from '../shared/overlayLayout.js';
import OverlayViewportApp from '../overlay-viewport/App.jsx';
import Header from './components/Header.jsx';
import MatchToolbar from './components/MatchToolbar.jsx';
import MatchStatus from './components/MatchStatus.jsx';
import TeamCard from './components/TeamCard.jsx';
import OverlayEditorPanel from './components/OverlayEditorPanel.jsx';
import GameplayWindowModal from './components/GameplayWindowModal.jsx';
import { stopGameplayCapture } from '../shared/gameplayCaptureManager.js';
import { useMatchState } from './hooks/useMatchState.js';
import {
  playBroadcastCue,
  readAudioEnabledPreference,
  writeAudioEnabledPreference,
} from './utils/soundEffects.js';
import './styles/control-deck.css';

export default function ControlDeckApp() {
  const [workspaceTab, setWorkspaceTab] = useState('SQUADS'); // 'SQUADS' | 'TOURNAMENT' | 'FINAL_GRAPHIC'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('SLOT_AZ'); // 'SLOT_AZ' | 'LEADERBOARD'
  const [searchQuery, setSearchQuery] = useState('');
  const [manualPosInput, setManualPosInput] = useState('');
  const [showOverlayMonitor, setShowOverlayMonitor] = useState(true);
  const [showOverlayEditor, setShowOverlayEditor] = useState(true);
  const [isGameplayModalOpen, setIsGameplayModalOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(() =>
    readAudioEnabledPreference()
  );

  // Real IPC & Window Lifecycle State
  const [connectionStatus, setConnectionStatus] = useState(
    OVERLAY_CONNECTION_STATE.CHECKING
  );
  const [overlayAlive, setOverlayAlive] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [windowState, setWindowState] = useState({
    isMaximized: false,
    isFullScreen: false,
    isMinimized: false,
  });

  const searchInputRef = useRef(null);

  const handleFocusSearch = useCallback(() => {
    setWorkspaceTab('SQUADS');
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select?.();
      }
    }, 0);
  }, []);

  const handleBroadcastCue = useCallback(
    (cueType) => {
      playBroadcastCue(cueType, audioEnabled);
    },
    [audioEnabled]
  );

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      writeAudioEnabledPreference(next);
      if (next) {
        playBroadcastCue('ROUND_START', true);
      }
      return next;
    });
  }, []);

  // Authoritative Match State & Global Keyboard Controller
  const {
    matchState,
    isBusy,
    heldTeamKey,
    placementBuffer,
    validationBanner,
    clearValidationBanner,
    clearPlacementBuffer,
    submitPlacementBuffer,
    setActiveGame,
    updateBroadcastMeta,
    selectTeam,
    incrementKill,
    decrementKill,
    setPlacement,
    adjustPlacement,
    updateTeamRoster,
    undoLastAction,
    createMatch,
    loadMatch,
    saveMatch,
    importRoster,
    exportMatch,
    createNextRound,
    completeMatch,
    reopenMatch,
  } = useMatchState({
    onFocusSearch: handleFocusSearch,
    onBroadcastCue: handleBroadcastCue,
  });

  // Initialize IPC connection & subscribe to window status events
  useEffect(() => {
    const controller = getBroadcastController();
    let isMounted = true;

    controller
      .getStatus()
      .then((snapshot) => {
        if (!isMounted || !snapshot) return;
        setConnectionStatus(
          snapshot.status || OVERLAY_CONNECTION_STATE.DISCONNECTED
        );
        setOverlayAlive(Boolean(snapshot.overlayAlive));
        setOverlayVisible(Boolean(snapshot.overlayVisible));
        if (snapshot.controlWindowState) {
          setWindowState(snapshot.controlWindowState);
        }
        setLastHeartbeat(snapshot.timestamp || new Date().toISOString());
      })
      .catch(() => {
        if (!isMounted) return;
        setConnectionStatus(OVERLAY_CONNECTION_STATE.DISCONNECTED);
        setOverlayAlive(false);
        setOverlayVisible(false);
      });

    const unsubscribeConnection = controller.onConnectionStatus((snapshot) => {
      if (!isMounted || !snapshot) return;
      setConnectionStatus(
        snapshot.status || OVERLAY_CONNECTION_STATE.DISCONNECTED
      );
      setOverlayAlive(Boolean(snapshot.overlayAlive));
      setOverlayVisible(Boolean(snapshot.overlayVisible));
      if (snapshot.controlWindowState) {
        setWindowState(snapshot.controlWindowState);
      }
      setLastHeartbeat(snapshot.timestamp || new Date().toISOString());
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribeConnection === 'function') unsubscribeConnection();
    };
  }, []);

  // Support F11 keyboard shortcut for fullscreen toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        const controller = getBroadcastController();
        controller
          .toggleFullscreenWindow?.()
          .then((res) => {
            if (res?.windowState) setWindowState(res.windowState);
          })
          .catch(() => {});
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeGame = matchState?.activeGame || 'BGMI';
  const tournamentTitle =
    matchState?.tournamentTitle || 'PRO SERIES INVITATIONAL S4';
  const stageLabel = matchState?.stageLabel || 'Week 01 Day 01';
  const overlayViewMode =
    matchState?.overlayViewMode || OVERLAY_VIEW_MODES.MATCH;
  const selectedSlotKey = matchState?.selectedTeamKey || 'A';
  const teams = matchState?.teams || [];
  const leaderboard = matchState?.leaderboard || [];
  const tournamentStandings = matchState?.tournamentStandings || null;
  const isCompleted = matchState?.matchStatus === MATCH_STATUS.COMPLETED;

  const selectedTeam =
    teams.find((t) => t.Key === selectedSlotKey) || teams[0] || null;

  // Map team Key -> live leaderboard rank
  const rankByKey = new Map();
  leaderboard.forEach((entry, idx) => {
    rankByKey.set(entry.Key, entry.leaderboardRank || idx + 1);
  });

  const handleToggleOverlay = async () => {
    const controller = getBroadcastController();
    await controller.toggleOverlayVisibility();
  };

  const handleCloseOverlay = async () => {
    const controller = getBroadcastController();
    await controller.closeOverlayWindow();
  };

  const handleReopenOverlay = async () => {
    const controller = getBroadcastController();
    await controller.reopenOverlayWindow();
  };

  const handleMinimizeWindow = async () => {
    const controller = getBroadcastController();
    const res = await controller.minimizeWindow?.();
    if (res?.windowState) setWindowState(res.windowState);
  };

  const handleToggleMaximizeWindow = async () => {
    const controller = getBroadcastController();
    const res = await controller.toggleMaximizeWindow?.();
    if (res?.windowState) setWindowState(res.windowState);
  };

  const handleToggleFullscreenWindow = async () => {
    const controller = getBroadcastController();
    const res = await controller.toggleFullscreenWindow?.();
    if (res?.windowState) setWindowState(res.windowState);
  };

  const handleCloseWindow = async () => {
    const controller = getBroadcastController();
    await controller.closeWindow?.();
  };

  const handleManualPlacementSubmit = async (e) => {
    e.preventDefault();
    if (manualPosInput.trim() === '') return;
    const res = await setPlacement(selectedSlotKey, Number(manualPosInput));
    if (res?.ok) {
      setManualPosInput('');
    }
  };

  // Export cumulative tournament standings as CSV
  const handleExportTournamentStandingsCsv = () => {
    const rows = tournamentStandings?.standings || [];
    if (rows.length === 0) return;

    const header =
      'OverallRank,Key,TeamName,MatchesPlayed,Wins,PriorKP,PriorPP,PriorTT,CurrentRoundKP,CurrentRoundPP,CurrentRoundTT,TotalKP,TotalPP,TotalTT';
    const lines = rows.map(
      (r) =>
        `${r.overallRank},${r.Key},"${String(r.TeamName).replace(
          /"/g,
          '""'
        )}",${r.matchesPlayed},${r.winsCount},${r.priorKP},${r.priorPP},${
          r.priorTT
        },${r.currentKP},${r.currentPP},${r.currentTT},${r.totalKP},${
          r.totalPP
        },${r.totalTT}`
    );
    const csvContent = `${[header, ...lines].join('\n')}\n`;

    try {
      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `Tournament_Standings_${activeGame}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Ignore in headless environments
    }
  };

  // Apply status filter first, then Fuzzy Search (preserving typo tolerance & ranking)
  const baseTeamsList = sortOrder === 'LEADERBOARD' ? leaderboard : teams;
  const statusFilteredTeams = baseTeamsList.filter((team) => {
    const isAlive = Number(team.pos) === 0;
    return (
      statusFilter === 'ALL' ||
      (statusFilter === 'ALIVE' && isAlive) ||
      (statusFilter === 'ELIMINATED' && !isAlive)
    );
  });

  const filteredTeams = filterTeamsByFuzzySearch(
    statusFilteredTeams,
    searchQuery
  );

  const teamGridLayout = getTeamGridLayoutConfig({
    isOverviewVisible: showOverlayMonitor,
    totalTeams: filteredTeams.length || 26,
  });

  const aliveSquadCount = teams.filter((t) => Number(t.pos) === 0).length;
  const totalAlivePlayers = aliveSquadCount * 4;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-100">
      {/* 1. Control Deck Top Header & Custom Window Controls */}
      <Header
        selectedGame={activeGame}
        onSelectGame={(gameId) => setActiveGame(gameId)}
        tournamentTitle={tournamentTitle}
        stageLabel={stageLabel}
        onUpdateBroadcastMeta={updateBroadcastMeta}
        matchStatus={matchState?.matchStatus || MATCH_STATUS.LIVE}
        connectionStatus={connectionStatus}
        overlayAlive={overlayAlive}
        overlayVisible={overlayVisible}
        lastHeartbeat={lastHeartbeat}
        audioEnabled={audioEnabled}
        onToggleAudio={handleToggleAudio}
        onToggleOverlay={handleToggleOverlay}
        onCloseOverlay={handleCloseOverlay}
        onReopenOverlay={handleReopenOverlay}
        gameplayCaptureActive={Boolean(
          matchState?.overlayConfig?.gameplay?.captureActive
        )}
        gameplayCompositionMode={
          matchState?.overlayConfig?.gameplay?.compositionMode || 'OVERLAY_ONLY'
        }
        onOpenGameplayWindow={() => setIsGameplayModalOpen(true)}
        windowState={windowState}
        onMinimizeWindow={handleMinimizeWindow}
        onToggleMaximizeWindow={handleToggleMaximizeWindow}
        onToggleFullscreenWindow={handleToggleFullscreenWindow}
        onCloseWindow={handleCloseWindow}
      />

      {/* 2. Match Lifecycle, Overlay Mode & CSV Toolbar */}
      <MatchToolbar
        matchState={matchState}
        isBusy={isBusy}
        onCreateMatch={createMatch}
        onLoadMatch={loadMatch}
        onSaveMatch={saveMatch}
        onImportRoster={importRoster}
        onExportMatch={exportMatch}
        onCreateNextRound={createNextRound}
        onCompleteMatch={completeMatch}
        onReopenMatch={reopenMatch}
        onUpdateBroadcastMeta={updateBroadcastMeta}
        onUndo={undoLastAction}
      />

      {/* 3. Live Match Status, Active Keyboard Selection & Placement Buffer HUD */}
      <MatchStatus
        matchState={matchState}
        heldTeamKey={heldTeamKey}
        placementBuffer={placementBuffer}
        onSubmitPlacementBuffer={submitPlacementBuffer}
        onClearPlacementBuffer={clearPlacementBuffer}
        validationBanner={validationBanner}
        onDismissBanner={clearValidationBanner}
      />

      {/* 4. Main Workspace: Operator Control Deck + Dockable Transparent Overlay Viewport Monitor */}
      <main className="mx-auto w-full flex-1 px-4 sm:px-6 py-4">
        <div className="flex flex-col xl:flex-row items-start gap-6">
          {/* Left / Primary Column */}
          <div className="w-full flex-1 min-w-0">
            {/* Active Selected Team Quick Command Bar */}
            {selectedTeam && (
              <div
                data-testid="selected-team-command-bar"
                className="mb-4 rounded-md border border-cyan-500/40 bg-[#101827] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="deck-mono-font flex h-9 w-9 shrink-0 items-center justify-center rounded bg-cyan-400 text-base font-bold text-slate-950">
                    {selectedTeam.Key}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-white">
                        {selectedTeam.TeamName}
                      </span>
                      <span className="deck-mono-font text-xs text-cyan-300">
                        (POS:{' '}
                        {selectedTeam.pos === 0
                          ? 'ALIVE'
                          : `#${String(selectedTeam.pos).padStart(2, '0')}`}{' '}
                        · KP: {selectedTeam.KP} · PP: {selectedTeam.PP} · TT:{' '}
                        {selectedTeam.TT})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Hotkeys: <code>A–Z</code> Select · <code>+</code>/
                      <code>=</code> +1 KP · <code>-</code> -1 KP ·{' '}
                      <code>0–26 + Enter</code> POS · <code>Ctrl+K</code> Search
                    </p>
                  </div>
                </div>

                {/* Direct Mouse/Keyboard Command Controls for Selected Team */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isCompleted || selectedTeam.KP <= 0}
                    onClick={() => decrementKill(selectedTeam.Key)}
                    className="deck-mono-font rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-200 hover:border-rose-400 hover:text-rose-200 disabled:opacity-40"
                  >
                    -1 KP
                  </button>
                  <button
                    type="button"
                    disabled={isCompleted}
                    onClick={() => incrementKill(selectedTeam.Key)}
                    className="deck-mono-font rounded bg-cyan-400 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
                  >
                    +1 KP
                  </button>

                  <form
                    onSubmit={handleManualPlacementSubmit}
                    className="flex items-center gap-1.5"
                  >
                    <label
                      htmlFor="direct-placement-input"
                      className="sr-only"
                    >
                      Direct Placement Rank (0 to 26)
                    </label>
                    <input
                      id="direct-placement-input"
                      type="number"
                      min={0}
                      max={26}
                      value={manualPosInput}
                      onChange={(e) => setManualPosInput(e.target.value)}
                      placeholder="Rank 0-26"
                      disabled={isCompleted}
                      className="w-24 deck-mono-font rounded border border-slate-700 bg-[#090d14] px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isCompleted || manualPosInput.trim() === ''}
                      className="rounded border border-amber-500/50 bg-amber-950/50 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-900/60 disabled:opacity-40"
                    >
                      Set POS
                    </button>
                  </form>

                  <button
                    type="button"
                    disabled={isCompleted || selectedTeam.pos === 0}
                    onClick={() => setPlacement(selectedTeam.Key, 0)}
                    className="rounded border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-40"
                  >
                    Reset Alive
                  </button>
                </div>
              </div>
            )}

            {/* Workspace View Tabs + Search (Ctrl+K) & Filters Bar */}
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              {/* Primary Workspace Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex flex-wrap items-center gap-1 rounded border border-slate-800 bg-[#0d121c] p-1"
                  role="tablist"
                  aria-label="Operator Workspace Views"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={workspaceTab === 'SQUADS'}
                    data-testid="tab-squad-slots"
                    onClick={() => setWorkspaceTab('SQUADS')}
                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      workspaceTab === 'SQUADS'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Squad Slots ({teams.length || 26})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={workspaceTab === 'TOURNAMENT'}
                    data-testid="tab-tournament-standings"
                    onClick={() => setWorkspaceTab('TOURNAMENT')}
                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      workspaceTab === 'TOURNAMENT'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Tournament Standings (
                    {tournamentStandings?.totalMatchesCounted || 1}{' '}
                    {(tournamentStandings?.totalMatchesCounted || 1) === 1
                      ? 'Match'
                      : 'Matches'}
                    )
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={workspaceTab === 'FINAL_GRAPHIC'}
                    data-testid="tab-final-graphic"
                    onClick={() => setWorkspaceTab('FINAL_GRAPHIC')}
                    className={`rounded px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      workspaceTab === 'FINAL_GRAPHIC'
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    End-of-Match Graphic
                  </button>
                </div>

                <span className="text-xs text-slate-400 hidden 2xl:inline whitespace-nowrap">
                  {aliveSquadCount}/{teams.length || 26} Alive ·{' '}
                  {totalAlivePlayers} Players
                </span>
              </div>

              {/* Sort Order, Status Filter, Fuzzy Search (Ctrl+K) & Monitor Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                {workspaceTab === 'SQUADS' && (
                  <>
                    <div
                      className="flex items-center gap-1 rounded border border-slate-800 bg-[#0d121c] p-1"
                      role="group"
                      aria-label="Sort Team Grid"
                    >
                      <button
                        type="button"
                        onClick={() => setSortOrder('SLOT_AZ')}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          sortOrder === 'SLOT_AZ'
                            ? 'bg-slate-800 text-cyan-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Slot A–Z
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortOrder('LEADERBOARD')}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          sortOrder === 'LEADERBOARD'
                            ? 'bg-slate-800 text-amber-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Standings
                      </button>
                    </div>

                    <div
                      className="flex items-center gap-1 rounded border border-slate-800 bg-[#0d121c] p-1"
                      role="group"
                      aria-label="Filter Teams by Status"
                    >
                      {[
                        { id: 'ALL', label: `All (${teams.length})` },
                        { id: 'ALIVE', label: `Alive (${aliveSquadCount})` },
                        {
                          id: 'ELIMINATED',
                          label: `Placed (${teams.length - aliveSquadCount})`,
                        },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStatusFilter(tab.id)}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            statusFilter === tab.id
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="relative">
                  <label htmlFor="team-search-input" className="sr-only">
                    Search (Ctrl+K)
                  </label>
                  <input
                    ref={searchInputRef}
                    id="team-search-input"
                    data-testid="team-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (workspaceTab !== 'SQUADS') {
                        setWorkspaceTab('SQUADS');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        if (searchQuery) {
                          setSearchQuery('');
                        } else {
                          e.currentTarget.blur();
                        }
                      }
                    }}
                    placeholder="Search (Ctrl+K)"
                    className="w-48 sm:w-56 rounded border border-slate-700 bg-[#0d121c] px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  data-testid="toggle-overview-btn"
                  aria-pressed={showOverlayMonitor}
                  onClick={() => setShowOverlayMonitor((prev) => !prev)}
                  className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  {showOverlayMonitor ? 'Hide Overview' : 'Show Overview'}
                </button>
              </div>
            </div>

            {/* TAB 1: 26-Team Interactive Grid (3-Column Compact when Overview Hidden, 2-Column Detailed when Overview Visible) */}
            {workspaceTab === 'SQUADS' && (
              <>
                {filteredTeams.length === 0 ? (
                  <div className="rounded-md border border-slate-800 bg-[#101622] p-8 text-center">
                    <p className="text-sm font-semibold text-slate-200">
                      No teams match &ldquo;{searchQuery}&rdquo; under the
                      current filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('ALL');
                        setSearchQuery('');
                      }}
                      className="mt-3 rounded bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
                    >
                      Clear Search &amp; Filters
                    </button>
                  </div>
                ) : (
                  <div
                    data-testid="team-cards-grid"
                    data-grid-columns={teamGridLayout.columns}
                    className={teamGridLayout.gridClassName}
                  >
                    {filteredTeams.map((team) => {
                      const key = team.Key || team.slotKey;
                      return (
                        <TeamCard
                          key={key}
                          team={team}
                          leaderboardRank={rankByKey.get(key)}
                          isSelected={selectedSlotKey === key}
                          isHeld={heldTeamKey === key}
                          isLocked={isCompleted}
                          compact={teamGridLayout.compact}
                          onSelect={selectTeam}
                          onIncrementKill={incrementKill}
                          onDecrementKill={decrementKill}
                          onSetPlacement={setPlacement}
                          onAdjustPlacement={adjustPlacement}
                          onUpdateRoster={updateTeamRoster}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* TAB 2: Cumulative Tournament Standings across Completed & Active Rounds */}
            {workspaceTab === 'TOURNAMENT' && (
              <div
                data-testid="tournament-aggregation-view"
                className="rounded-md border border-slate-800 bg-[#101622] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0d121c] px-4 py-3">
                  <div>
                    <h2 className="deck-display-font text-lg font-bold tracking-wide text-white">
                      CUMULATIVE TOURNAMENT STANDINGS ({activeGame})
                    </h2>
                    <p className="text-xs text-slate-400">
                      Aggregated across{' '}
                      <strong className="text-cyan-300">
                        {tournamentStandings?.totalMatchesCounted || 1}
                      </strong>{' '}
                      deduplicated match file(s):{' '}
                      <span className="deck-mono-font text-slate-300">
                        {tournamentStandings?.countedMatchIds?.length > 0
                          ? tournamentStandings.countedMatchIds.join(', ')
                          : matchState?.matchId}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateBroadcastMeta({
                          overlayViewMode:
                            overlayViewMode === OVERLAY_VIEW_MODES.OVERALL
                              ? OVERLAY_VIEW_MODES.MATCH
                              : OVERLAY_VIEW_MODES.OVERALL,
                        })
                      }
                      className="rounded bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
                    >
                      {overlayViewMode === OVERLAY_VIEW_MODES.OVERALL
                        ? 'Switch Overlay to Live Match'
                        : 'Show Overall Standings on Overlay'}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportTournamentStandingsCsv}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
                    >
                      Export Standings CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#090d14] text-[11px] font-semibold text-slate-400">
                        <th className="py-2.5 px-3">RANK</th>
                        <th className="py-2.5 px-3">TEAM</th>
                        <th className="py-2.5 px-2 text-right">MATCHES</th>
                        <th className="py-2.5 px-2 text-right">WINS (#1)</th>
                        <th className="py-2.5 px-3 text-right border-l border-slate-800/80 text-slate-300">
                          PRIOR ROUNDS (KP / PP / TT)
                        </th>
                        <th className="py-2.5 px-3 text-right border-l border-slate-800/80 text-cyan-300">
                          CURRENT {matchState?.matchId} (KP / PP / TT)
                        </th>
                        <th className="py-2.5 px-3 text-right border-l border-slate-800/80 text-amber-300">
                          TOTAL KP
                        </th>
                        <th className="py-2.5 px-3 text-right text-amber-300">
                          TOTAL PP
                        </th>
                        <th className="py-2.5 px-3 text-right text-amber-400 font-bold">
                          OVERALL TOTAL
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 deck-mono-font">
                      {(tournamentStandings?.standings || []).map((row) => (
                        <tr
                          key={row.Key}
                          data-testid={`tournament-row-${row.Key}`}
                          className="hover:bg-slate-900/60"
                        >
                          <td className="py-2 px-3 font-bold text-white">
                            #{String(row.overallRank).padStart(2, '0')}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <span className="deck-mono-font text-cyan-400 font-bold mr-1.5">
                              [{row.Key}]
                            </span>
                            <span className="font-semibold text-white">
                              {row.TeamName}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-slate-300">
                            {row.matchesPlayed}
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-amber-300">
                            {row.winsCount}
                          </td>
                          <td
                            data-testid={`tournament-row-${row.Key}-prior`}
                            className="py-2 px-3 text-right border-l border-slate-800/60 text-slate-400"
                          >
                            {row.priorKP} / {row.priorPP} /{' '}
                            <strong className="text-slate-200">
                              {row.priorTT}
                            </strong>
                          </td>
                          <td
                            data-testid={`tournament-row-${row.Key}-current`}
                            className="py-2 px-3 text-right border-l border-slate-800/60 text-cyan-200"
                          >
                            {row.currentKP} / {row.currentPP} /{' '}
                            <strong className="text-cyan-300">
                              {row.currentTT}
                            </strong>
                          </td>
                          <td className="py-2 px-3 text-right border-l border-slate-800/60 text-slate-200">
                            {String(row.totalKP).padStart(2, '0')}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            {String(row.totalPP).padStart(2, '0')}
                          </td>
                          <td
                            data-testid={`tournament-row-${row.Key}-total`}
                            className="py-2 px-3 text-right font-bold text-amber-400 text-sm"
                          >
                            {String(row.totalTT).padStart(2, '0')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: End-of-Match Broadcast Final Standings Graphic Controller */}
            {workspaceTab === 'FINAL_GRAPHIC' && (
              <div
                data-testid="end-of-match-controller-view"
                className="rounded-md border border-slate-800 bg-[#101622] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="deck-display-font text-lg font-bold tracking-wide text-white">
                      END-OF-MATCH FINAL STANDINGS GRAPHIC ({matchState?.matchId})
                    </h2>
                    <p className="text-xs text-slate-400">
                      Broadcast-ready podium and final match rankings driven by
                      saved match state.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="push-final-graphic-btn"
                      onClick={() =>
                        updateBroadcastMeta({
                          overlayViewMode: OVERLAY_VIEW_MODES.END_OF_MATCH,
                        })
                      }
                      className="rounded bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300"
                    >
                      Show Final Standings on Overlay
                    </button>
                    <button
                      type="button"
                      data-testid="return-live-overlay-btn"
                      onClick={() =>
                        updateBroadcastMeta({
                          overlayViewMode: OVERLAY_VIEW_MODES.MATCH,
                        })
                      }
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/60 hover:text-white"
                    >
                      Return to Live Overlay
                    </button>
                  </div>
                </div>

                {/* Top 3 Podium Summary */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {leaderboard.slice(0, 3).map((team, idx) => (
                    <div
                      key={team.Key}
                      className={`rounded-md border p-3.5 ${
                        idx === 0
                          ? 'border-amber-400/70 bg-amber-950/25'
                          : idx === 1
                          ? 'border-cyan-400/50 bg-cyan-950/20'
                          : 'border-slate-700 bg-[#0c121e]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-bold">
                        <span
                          className={`truncate ${
                            idx === 0
                              ? 'text-amber-400'
                              : idx === 1
                              ? 'text-cyan-300'
                              : 'text-amber-200'
                          }`}
                        >
                          #{idx + 1}{' '}
                          {idx === 0
                            ? 'MATCH WINNER'
                            : idx === 1
                            ? 'RUNNER-UP'
                            : 'THIRD PLACE'}
                        </span>
                        <span className="deck-mono-font text-slate-400 whitespace-nowrap shrink-0">
                          Slot [{team.Key}]
                        </span>
                      </div>
                      <div className="mt-1.5 text-base font-bold text-white truncate">
                        {team.TeamName}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 truncate">
                        {[
                          team.Player1,
                          team.Player2,
                          team.Player3,
                          team.Player4,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 deck-mono-font text-xs">
                        <span className="text-slate-300 whitespace-nowrap">
                          KP: <strong>{team.KP}</strong> · PP:{' '}
                          <strong>{team.PP}</strong>
                        </span>
                        <span className="text-sm font-bold text-amber-400 whitespace-nowrap">
                          TOTAL: {team.TT} PTS
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Full Final Standings Table */}
                <div className="mt-4 overflow-x-auto rounded border border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#090d14] text-[11px] font-semibold text-slate-400">
                        <th className="py-2 px-3">RANK</th>
                        <th className="py-2 px-3">TEAM</th>
                        <th className="py-2 px-3">ROSTER</th>
                        <th className="py-2 px-3 text-right">PLACEMENT</th>
                        <th className="py-2 px-3 text-right">KILL PTS (KP)</th>
                        <th className="py-2 px-3 text-right">PLACE PTS (PP)</th>
                        <th className="py-2 px-3 text-right text-amber-400">
                          TOTAL PTS (TT)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 deck-mono-font">
                      {leaderboard.map((team, idx) => (
                        <tr key={team.Key} className="hover:bg-slate-900/50">
                          <td className="py-1.5 px-3 font-bold text-white">
                            #{String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="py-1.5 px-3 font-sans">
                            <span className="deck-mono-font text-cyan-400 font-bold mr-1.5">
                              [{team.Key}]
                            </span>
                            <span className="font-semibold text-white">
                              {team.TeamName}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-sans text-slate-400">
                            {[
                              team.Player1,
                              team.Player2,
                              team.Player3,
                              team.Player4,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-300">
                            {team.pos === 0
                              ? 'ALIVE'
                              : `#${String(team.pos).padStart(2, '0')}`}
                          </td>
                          <td className="py-1.5 px-3 text-right text-cyan-300">
                            {String(team.KP).padStart(2, '0')}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-200">
                            {String(team.PP).padStart(2, '0')}
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-amber-400">
                            {String(team.TT).padStart(2, '0')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Broadcast Overlay Overview Monitor (16:9 Two-Column OBS Capture Stage) */}
          {showOverlayMonitor && (
            <aside
              data-testid="overview-monitor-panel"
              aria-label="Broadcast Overlay Viewport Monitor"
              className="w-full xl:w-[540px] 2xl:w-[600px] shrink-0 rounded-md border border-slate-800 bg-[#0d121c] p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                <div>
                  <h2 className="deck-display-font text-base font-bold tracking-wide text-white">
                    BROADCAST OVERLAY OVERVIEW (16:9 OBS CAPTURE)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {matchState?.overlayConfig?.canvas?.width || 1920}×
                    {matchState?.overlayConfig?.canvas?.height || 1080} ·{' '}
                    {matchState?.overlayConfig?.background?.imageDataUrl
                      ? 'Custom Background'
                      : 'Transparent (#00000000)'}{' '}
                    · Mode:{' '}
                    <strong className="text-amber-300">{overlayViewMode}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="toggle-overlay-editor-btn"
                    onClick={() => setShowOverlayEditor((prev) => !prev)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      showOverlayEditor
                        ? 'border-cyan-400/60 bg-cyan-950/50 text-cyan-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    {showOverlayEditor ? 'Hide Editor' : 'Customize Overlay'}
                  </button>
                  <a
                    href="./overlay.html"
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-400/60 hover:text-white whitespace-nowrap shrink-0"
                  >
                    Open Overlay URL
                  </a>
                </div>
              </div>

              {/* Checkerboard Alpha Transparency Verification Stage */}
              <div className="obs-transparency-stage mt-3 rounded border border-slate-800/90 p-2">
                {!overlayAlive ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <p className="text-xs font-semibold text-rose-300">
                      Broadcast Overlay Viewport Window is Closed
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Reopen the overlay to resume live HUD rendering.
                    </p>
                    <button
                      type="button"
                      onClick={handleReopenOverlay}
                      className="mt-3 rounded border border-emerald-500/50 bg-emerald-950/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900"
                    >
                      Reopen Overlay
                    </button>
                  </div>
                ) : !overlayVisible ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <p className="text-xs font-semibold text-amber-300">
                      Overlay Window Hidden
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      IPC synchronization remains active. Click Show Overlay to
                      restore OBS capture visibility.
                    </p>
                    <button
                      type="button"
                      onClick={handleToggleOverlay}
                      className="mt-3 rounded border border-cyan-500/50 bg-cyan-950/80 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900"
                    >
                      Show Overlay
                    </button>
                  </div>
                ) : (
                  <OverlayViewportApp
                    embeddedMode={true}
                    overrideOverlayConfig={matchState?.overlayConfig || null}
                    onOpenGameplayWindow={() => setIsGameplayModalOpen(true)}
                  />
                )}
              </div>

              {/* Responsive & Customizable Broadcast Overlay Editor */}
              {showOverlayEditor && (
                <OverlayEditorPanel
                  overlayConfig={matchState?.overlayConfig}
                  overlayViewMode={overlayViewMode}
                  onUpdateOverlayConfig={(partialOverlayConfig) =>
                    updateBroadcastMeta({ overlayConfig: partialOverlayConfig })
                  }
                  onSelectCompositionMode={(modeId) =>
                    updateBroadcastMeta({ compositionMode: modeId })
                  }
                  onApplyCornerPreset={(presetId, target) =>
                    updateBroadcastMeta({
                      applyCornerPreset: { presetId, target },
                    })
                  }
                  onUploadBackground={(backgroundUpload) =>
                    updateBroadcastMeta({ backgroundUpload })
                  }
                  onResetBackground={() =>
                    updateBroadcastMeta({ resetOverlayBackground: true })
                  }
                  onResetScorecard={() =>
                    updateBroadcastMeta({ resetOverlayScorecard: true })
                  }
                  onResetGameplay={() =>
                    updateBroadcastMeta({
                      resetOverlayGameplay: true,
                      preserveCaptureSource: true,
                    })
                  }
                  onResetAll={() =>
                    updateBroadcastMeta({ resetOverlayAll: true })
                  }
                  onOpenGameplayWindow={() => setIsGameplayModalOpen(true)}
                  onStopGameplayCapture={() => {
                    stopGameplayCapture();
                    updateBroadcastMeta({
                      overlayConfig: {
                        gameplay: {
                          ...(matchState?.overlayConfig?.gameplay || {}),
                          captureActive: false,
                          sourceId: null,
                          sourceName: null,
                          sourceType: null,
                          sourceStatus: 'STOPPED',
                          sourceStatusMessage:
                            'Gameplay capture stopped by operator.',
                        },
                      },
                    });
                  }}
                  onApplyWindowBounds={(bounds) => {
                    const controller = getBroadcastController();
                    controller.setOverlayBounds?.(bounds).catch(() => {});
                  }}
                />
              )}
            </aside>
          )}
        </div>
      </main>

      {/* Gameplay Window Source Selector & Composition Modal */}
      <GameplayWindowModal
        isOpen={isGameplayModalOpen}
        onClose={() => setIsGameplayModalOpen(false)}
        overlayConfig={matchState?.overlayConfig}
        onUpdateBroadcastMeta={updateBroadcastMeta}
      />
    </div>
  );
}
