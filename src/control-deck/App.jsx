import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getBroadcastController } from '../shared/browserBridge.js';
import {
  MATCH_STATUS,
  OVERLAY_CONNECTION_STATE,
  WINDOW_DIMENSIONS,
} from '../shared/constants.js';
import { createEventId } from '../shared/ipcValidator.js';
import OverlayViewportApp from '../overlay-viewport/App.jsx';
import Header from './components/Header.jsx';
import MatchToolbar from './components/MatchToolbar.jsx';
import MatchStatus from './components/MatchStatus.jsx';
import TeamCard from './components/TeamCard.jsx';
import { useMatchState } from './hooks/useMatchState.js';
import './styles/control-deck.css';

export default function ControlDeckApp() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('SLOT_AZ'); // 'SLOT_AZ' | 'LEADERBOARD'
  const [searchQuery, setSearchQuery] = useState('');
  const [manualPosInput, setManualPosInput] = useState('');

  // Real IPC & Window Lifecycle State (Preserved from Phase 1)
  const [connectionStatus, setConnectionStatus] = useState(
    OVERLAY_CONNECTION_STATE.CHECKING
  );
  const [overlayAlive, setOverlayAlive] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayBounds, setOverlayBounds] = useState({
    x: 60,
    y: 60,
    width: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.width,
    height: WINDOW_DIMENSIONS.OVERLAY_VIEWPORT.height,
  });
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [tournamentConfigSummary, setTournamentConfigSummary] = useState(null);

  // Test Event Dispatch & Operational Log State
  const [testSequence, setTestSequence] = useState(1);
  const [customTestMessage, setCustomTestMessage] = useState(
    'Sync check: Leaderboard HUD & alpha channel ready'
  );
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [operationalLogs, setOperationalLogs] = useState([]);
  const [showOverlayMonitor, setShowOverlayMonitor] = useState(true);

  const sequenceRef = useRef(1);

  const appendOperationalLog = useCallback((entry) => {
    setOperationalLogs((prev) => [
      {
        id: entry.id || createEventId('LOG'),
        level: entry.level || 'info',
        category: entry.category || 'IPC',
        message: entry.message,
        timestamp: entry.timestamp || new Date().toISOString(),
      },
      ...prev.slice(0, 19),
    ]);
  }, []);

  // Authoritative Phase 2 Match State & Global Keyboard Controller
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
    onOperationalLog: appendOperationalLog,
  });

  // Initialize IPC connection, fetch tournament_config.json, and subscribe to events
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
        if (snapshot.overlayBounds) {
          setOverlayBounds(snapshot.overlayBounds);
        }
        setLastHeartbeat(snapshot.timestamp || new Date().toISOString());

        appendOperationalLog({
          id: snapshot.eventId || createEventId('INIT'),
          level: snapshot.overlayAlive ? 'success' : 'warning',
          category: 'CONNECTION',
          message: snapshot.overlayAlive
            ? `Overlay Viewport connected (${snapshot.status}). Main process IPC bridge verified.`
            : 'Overlay Viewport is currently closed or disconnected.',
          timestamp: snapshot.timestamp,
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setConnectionStatus(OVERLAY_CONNECTION_STATE.DISCONNECTED);
        setOverlayAlive(false);
        setOverlayVisible(false);
        appendOperationalLog({
          level: 'error',
          category: 'CONNECTION',
          message: `Failed to query IPC status: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
        });
      });

    controller
      .getTournamentConfig()
      .then((res) => {
        if (!isMounted || !res || !res.ok || !res.config) return;
        setTournamentConfigSummary(res.config);
      })
      .catch(() => {});

    const unsubscribeConnection = controller.onConnectionStatus((snapshot) => {
      if (!isMounted || !snapshot) return;
      setConnectionStatus(
        snapshot.status || OVERLAY_CONNECTION_STATE.DISCONNECTED
      );
      setOverlayAlive(Boolean(snapshot.overlayAlive));
      setOverlayVisible(Boolean(snapshot.overlayVisible));
      if (snapshot.overlayBounds) {
        setOverlayBounds(snapshot.overlayBounds);
      }
      setLastHeartbeat(snapshot.timestamp || new Date().toISOString());

      let logLevel = 'info';
      let logMessage = `Overlay connection state updated: ${snapshot.status}`;
      if (snapshot.reason === 'OVERLAY_CLOSED' || !snapshot.overlayAlive) {
        logLevel = 'error';
        logMessage =
          'Overlay Viewport window closed or disconnected. Connection status updated to DISCONNECTED.';
      } else if (snapshot.reason === 'OVERLAY_REOPENED_BY_OPERATOR') {
        logLevel = 'success';
        logMessage =
          'Overlay Viewport window reopened cleanly without duplicate IPC listeners.';
      } else if (snapshot.reason === 'OVERLAY_HIDDEN') {
        logLevel = 'warning';
        logMessage =
          'Overlay Viewport window hidden by operator (IPC remains connected).';
      } else if (snapshot.reason === 'OVERLAY_SHOWN') {
        logLevel = 'success';
        logMessage = 'Overlay Viewport window shown and active on desktop.';
      }

      appendOperationalLog({
        id: snapshot.eventId || createEventId('CONN'),
        level: logLevel,
        category: 'LIFECYCLE',
        message: logMessage,
        timestamp: snapshot.timestamp,
      });
    });

    const unsubscribeAck = controller.onTestEventAck((ack) => {
      if (!isMounted || !ack) return;
      setLastHeartbeat(ack.receivedAt || new Date().toISOString());
      appendOperationalLog({
        id: ack.ackId || createEventId('ACK'),
        level: 'success',
        category: 'TEST_RX_ACK',
        message: `Overlay confirmed receipt of test event ${ack.eventId} (ACK: ${ack.ackId}).`,
        timestamp: ack.receivedAt,
      });
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribeConnection === 'function') unsubscribeConnection();
      if (typeof unsubscribeAck === 'function') unsubscribeAck();
    };
  }, [appendOperationalLog]);

  const activeGame = matchState?.activeGame || 'BGMI';
  const selectedSlotKey = matchState?.selectedTeamKey || 'A';
  const teams = matchState?.teams || [];
  const leaderboard = matchState?.leaderboard || [];
  const isCompleted = matchState?.matchStatus === MATCH_STATUS.COMPLETED;

  const selectedTeam =
    teams.find((t) => t.Key === selectedSlotKey) || teams[0] || null;

  // Map team Key -> live leaderboard rank
  const rankByKey = new Map();
  leaderboard.forEach((entry, idx) => {
    rankByKey.set(entry.Key, entry.leaderboardRank || idx + 1);
  });

  // Handler: Send validated test event over preload bridge
  const handleSendTestEvent = async () => {
    const controller = getBroadcastController();
    setIsSendingTest(true);

    const currentSeq = sequenceRef.current;
    const teamLabel = selectedTeam
      ? `Slot [${selectedTeam.Key}] ${selectedTeam.TeamName}`
      : 'Slot [A]';
    const eventId = createEventId('TEST');
    const messageToSend =
      customTestMessage.trim() || `Diagnostic Ping #${currentSeq} · ${teamLabel}`;

    const payload = {
      eventId,
      type: 'DIAGNOSTIC_PING',
      game: activeGame,
      sequence: currentSeq,
      message: `${messageToSend} [${teamLabel}]`,
      sentAtMs: Date.now(),
      timestamp: new Date().toISOString(),
    };

    appendOperationalLog({
      id: eventId,
      level: 'info',
      category: 'TEST_TX',
      message: `Dispatched test event ${eventId} (SEQ #${currentSeq}) to main process for ${teamLabel}.`,
      timestamp: payload.timestamp,
    });

    try {
      const response = await controller.sendTestEvent(payload);
      if (response && response.ok) {
        sequenceRef.current = currentSeq + 1;
        setTestSequence(sequenceRef.current);
        setLastHeartbeat(response.timestamp || new Date().toISOString());
      } else {
        appendOperationalLog({
          id: createEventId('ERR'),
          level: 'error',
          category: 'TEST_ERR',
          message:
            (response && response.error) ||
            'Failed to deliver test event to Overlay Viewport.',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      appendOperationalLog({
        id: createEventId('ERR'),
        level: 'error',
        category: 'TEST_ERR',
        message:
          err instanceof Error
            ? err.message
            : 'Unexpected IPC error sending test event.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleToggleOverlay = async () => {
    const controller = getBroadcastController();
    const res = await controller.toggleOverlayVisibility();
    if (!res || !res.ok) {
      appendOperationalLog({
        level: 'error',
        category: 'OVERLAY',
        message:
          (res && res.error) || 'Unable to toggle Overlay Viewport visibility.',
      });
    }
  };

  const handleCloseOverlay = async () => {
    const controller = getBroadcastController();
    await controller.closeOverlayWindow();
  };

  const handleReopenOverlay = async () => {
    const controller = getBroadcastController();
    await controller.reopenOverlayWindow();
  };

  const handleApplyOverlayBounds = async (presetBounds) => {
    const controller = getBroadcastController();
    const res = await controller.setOverlayBounds(presetBounds);
    if (res && res.ok && res.overlayBounds) {
      setOverlayBounds(res.overlayBounds);
    } else if (res && res.error) {
      appendOperationalLog({
        level: 'error',
        category: 'BOUNDS',
        message: res.error,
      });
    }
  };

  const handleManualPlacementSubmit = async (e) => {
    e.preventDefault();
    if (manualPosInput.trim() === '') return;
    const res = await setPlacement(selectedSlotKey, Number(manualPosInput));
    if (res?.ok) {
      setManualPosInput('');
    }
  };

  const baseTeamsList = sortOrder === 'LEADERBOARD' ? leaderboard : teams;

  const filteredTeams = baseTeamsList.filter((team) => {
    const isAlive = Number(team.pos) === 0;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ALIVE' && isAlive) ||
      (statusFilter === 'ELIMINATED' && !isAlive);

    const q = searchQuery.trim().toLowerCase();
    const players = [team.Player1, team.Player2, team.Player3, team.Player4];
    const matchesQuery =
      !q ||
      String(team.TeamName || '')
        .toLowerCase()
        .includes(q) ||
      String(team.Key || '').toLowerCase() === q ||
      players.some((p) => String(p || '').toLowerCase().includes(q));

    return matchesStatus && matchesQuery;
  });

  const aliveSquadCount = teams.filter((t) => Number(t.pos) === 0).length;
  const totalAlivePlayers = aliveSquadCount * 4;
  const activeGameRules =
    tournamentConfigSummary?.scoringRules?.[activeGame] || null;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-100">
      {/* 1. Control Deck Top Header */}
      <Header
        selectedGame={activeGame}
        onSelectGame={(gameId) => setActiveGame(gameId)}
        matchStatus={matchState?.matchStatus || MATCH_STATUS.LIVE}
        connectionStatus={connectionStatus}
        overlayAlive={overlayAlive}
        overlayVisible={overlayVisible}
        lastHeartbeat={lastHeartbeat}
        onToggleOverlay={handleToggleOverlay}
        onCloseOverlay={handleCloseOverlay}
        onReopenOverlay={handleReopenOverlay}
        onSendTestEvent={handleSendTestEvent}
        isSendingTest={isSendingTest}
      />

      {/* 2. Phase 2 Match Lifecycle & CSV Persistence Toolbar */}
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
        onUndo={undoLastAction}
      />

      {/* 3. Phase 2 Live Match Status, Active Keyboard Selection & Placement Buffer HUD */}
      <MatchStatus
        matchState={matchState}
        heldTeamKey={heldTeamKey}
        placementBuffer={placementBuffer}
        onSubmitPlacementBuffer={submitPlacementBuffer}
        onClearPlacementBuffer={clearPlacementBuffer}
        validationBanner={validationBanner}
        onDismissBanner={clearValidationBanner}
      />

      {/* 4. Secondary Operational Feedback & IPC Diagnostics Strip */}
      <section
        aria-label="Operational Feedback and IPC Diagnostics"
        className="border-b border-slate-800/90 bg-[#0f141e] px-4 sm:px-6 py-2.5"
      >
        <div className="mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Custom Test Payload Input & Quick Bounds Presets */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
              <label
                htmlFor="ipc-test-payload-input"
                className="text-xs font-semibold text-slate-300 whitespace-nowrap shrink-0"
              >
                Test Event Payload:
              </label>
              <input
                id="ipc-test-payload-input"
                type="text"
                value={customTestMessage}
                onChange={(e) => setCustomTestMessage(e.target.value)}
                placeholder="Enter diagnostic message for overlay..."
                maxLength={140}
                className="w-full sm:w-64 rounded border border-slate-700 bg-[#090c12] px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 whitespace-nowrap shrink-0">
                Overlay Geometry:
              </span>
              <span className="deck-mono-font text-cyan-300 whitespace-nowrap shrink-0">
                {overlayBounds.width}×{overlayBounds.height} @ (
                {overlayBounds.x},{overlayBounds.y})
              </span>
              <button
                type="button"
                onClick={() =>
                  handleApplyOverlayBounds({
                    x: 60,
                    y: 60,
                    width: 460,
                    height: 680,
                  })
                }
                disabled={!overlayAlive}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                Default 460×680
              </button>
              <button
                type="button"
                onClick={() =>
                  handleApplyOverlayBounds({
                    x: 120,
                    y: 90,
                    width: 420,
                    height: 620,
                  })
                }
                disabled={!overlayAlive}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                Compact 420×620
              </button>
            </div>
          </div>

          {/* Right: Config Summary & Live Overlay Monitor Toggle */}
          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-400">
              <span>Ruleset:</span>
              <span className="deck-mono-font text-slate-200">
                {activeGame} (1st:{' '}
                {activeGameRules?.placementPoints?.['1'] ??
                  (activeGame === 'FREE_FIRE' ? 12 : 10)}
                pt · Kill: {activeGameRules?.killPoints ?? 1}pt)
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Next Seq:{' '}
                <strong className="deck-mono-font text-cyan-400">
                  #{testSequence}
                </strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOverlayMonitor((prev) => !prev)}
                className="rounded border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50 transition-colors whitespace-nowrap shrink-0"
              >
                {showOverlayMonitor
                  ? 'Hide Overlay Monitor'
                  : 'Show Overlay Monitor'}
              </button>
              <a
                href="./overlay.html"
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Standalone /overlay.html
              </a>
            </div>
          </div>
        </div>

        {/* Live Operational Feedback Log Strip */}
        <div
          data-testid="operational-feedback-panel"
          className="mt-2 rounded border border-slate-800 bg-[#090c12] px-3 py-1.5"
        >
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
            <span className="text-[11px] font-semibold tracking-wider text-slate-400">
              OPERATIONAL FEEDBACK &amp; IPC EVENT LOG
            </span>
            <span className="deck-mono-font text-[11px] text-slate-400">
              {operationalLogs.length} events recorded
            </span>
          </div>
          <ul
            className="mt-1 max-h-20 overflow-y-auto space-y-1 text-xs"
            aria-live="polite"
          >
            {operationalLogs.length === 0 ? (
              <li className="text-slate-500 py-0.5">
                Awaiting IPC lifecycle or match events...
              </li>
            ) : (
              operationalLogs.map((log) => {
                const badgeColor =
                  log.level === 'success'
                    ? 'text-emerald-400'
                    : log.level === 'warning'
                    ? 'text-amber-400'
                    : log.level === 'error'
                    ? 'text-rose-400'
                    : 'text-cyan-400';

                return (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-baseline gap-2 text-[11px] leading-relaxed"
                  >
                    <span className="deck-mono-font text-slate-500 shrink-0">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span
                      className={`deck-mono-font font-semibold shrink-0 ${badgeColor}`}
                    >
                      [{log.category}]
                    </span>
                    <span className="deck-mono-font text-slate-400 shrink-0">
                      {log.id}
                    </span>
                    <span className="text-slate-200">{log.message}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </section>

      {/* 5. Main Workspace: 26-Team Two-Column Grid + Dockable Transparent Overlay Viewport Monitor */}
      <main className="mx-auto w-full flex-1 px-4 sm:px-6 py-4">
        <div className="flex flex-col xl:flex-row items-start gap-6">
          {/* Left / Primary Column: Selected Team Command Strip + 26-Team Control Deck Grid */}
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
                      Keyboard: Press <code>+</code>/<code>=</code> for +1 KP,{' '}
                      <code>-</code> for -1 KP, or type placement{' '}
                      <code>0–26</code> + <code>Enter</code>
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
                    Reset Alive (POS 0)
                  </button>
                </div>
              </div>
            )}

            {/* Toolbar Above Team Grid */}
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="deck-display-font text-xl font-bold tracking-wide text-white">
                  TOURNAMENT SQUAD SLOTS (A–Z · 26 TEAMS)
                </h2>
                <p className="text-xs text-slate-400">
                  Selected Slot:{' '}
                  <strong className="deck-mono-font text-cyan-400">
                    [{selectedSlotKey}]
                  </strong>
                  <span aria-hidden="true" className="mx-1.5">
                    ·
                  </span>
                  <span>
                    {aliveSquadCount}/{teams.length || 26} Squads Alive
                  </span>
                  <span aria-hidden="true" className="mx-1.5">
                    ·
                  </span>
                  <span>{totalAlivePlayers}/104 Players Active</span>
                </p>
              </div>

              {/* Sort Order, Filter & Search Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex items-center gap-1 rounded border border-slate-800 bg-[#0d121c] p-1"
                  role="group"
                  aria-label="Sort Team Grid"
                >
                  <button
                    type="button"
                    onClick={() => setSortOrder('SLOT_AZ')}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
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
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      sortOrder === 'LEADERBOARD'
                        ? 'bg-slate-800 text-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Standings Rank
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
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        statusFilter === tab.id
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label htmlFor="team-search-input" className="sr-only">
                    Search Teams or Players
                  </label>
                  <input
                    id="team-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter team, slot A-Z, or player..."
                    className="w-52 rounded border border-slate-800 bg-[#0d121c] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Responsive Two-Column 26-Team Grid */}
            {filteredTeams.length === 0 ? (
              <div className="rounded-md border border-slate-800 bg-[#101622] p-8 text-center">
                <p className="text-sm font-semibold text-slate-200">
                  No teams match the current filter criteria.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-3 rounded bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div
                data-testid="team-cards-grid"
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
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
          </div>

          {/* Right Column: Live Broadcast Overlay Viewport Monitor (Simulates OBS Transparent Capture Stage) */}
          {showOverlayMonitor && (
            <aside
              aria-label="Broadcast Overlay Viewport Monitor"
              className="w-full xl:w-[448px] shrink-0 rounded-md border border-slate-800 bg-[#0d121c] p-3.5"
            >
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                <div>
                  <h2 className="deck-display-font text-base font-bold tracking-wide text-white">
                    BROADCAST OVERLAY VIEWPORT (OBS CAPTURE)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Frameless · Transparent (#00000000) · Live Authoritative Sync
                  </p>
                </div>
                <span className="deck-mono-font text-[11px] font-semibold text-cyan-400">
                  {overlayAlive
                    ? overlayVisible
                      ? 'ACTIVE'
                      : 'HIDDEN'
                    : 'CLOSED'}
                </span>
              </div>

              {/* Checkerboard Alpha Transparency Verification Stage */}
              <div className="obs-transparency-stage mt-3 rounded border border-slate-800/90 p-2.5">
                {!overlayAlive ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <p className="text-xs font-semibold text-rose-300">
                      Broadcast Overlay Viewport Window is Closed
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Connection status updated to DISCONNECTED. Reopen the
                      overlay to resume live HUD rendering.
                    </p>
                    <button
                      type="button"
                      onClick={handleReopenOverlay}
                      className="mt-3 rounded border border-emerald-500/50 bg-emerald-950/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900"
                    >
                      Reopen Overlay Window
                    </button>
                  </div>
                ) : !overlayVisible ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <p className="text-xs font-semibold text-amber-300">
                      Overlay Window Hidden for Troubleshooting
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      IPC channel remains active in the background. Click Show
                      Overlay to restore OBS capture visibility.
                    </p>
                    <button
                      type="button"
                      onClick={handleToggleOverlay}
                      className="mt-3 rounded border border-cyan-500/50 bg-cyan-950/80 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900"
                    >
                      Show Overlay Window
                    </button>
                  </div>
                ) : (
                  <OverlayViewportApp embeddedMode={true} />
                )}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
