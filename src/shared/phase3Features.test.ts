import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  scoreTeamFuzzyMatch,
  filterTeamsByFuzzySearch,
} from './fuzzySearch.js';
import { buildDefaultTemplateTeams } from './match-types.js';
import { MatchManager } from '../../electron/match/match-manager.js';
import { OVERLAY_VIEW_MODES } from './constants.js';
import {
  playBroadcastCue,
  readAudioEnabledPreference,
  writeAudioEnabledPreference,
} from '../control-deck/utils/soundEffects.js';
import {
  splitTeamsIntoBalancedColumns,
  getTeamGridLayoutConfig,
} from './overlayLayout.js';

test('Phase 3 Fuzzy Search matches slot keys, partial names, typos, and player rosters', () => {
  const teams: any[] = buildDefaultTemplateTeams('BGMI');

  // 1. Empty query returns all 26 teams in original order
  const all = filterTeamsByFuzzySearch(teams, '');
  assert.equal(all.length, 26);
  assert.equal(all[0].Key, 'A');

  // 2. Exact Slot Key match ('[B]' or 'b') ranks Slot B first
  const bySlot = filterTeamsByFuzzySearch(teams, '[B]');
  assert.ok(bySlot.length >= 1);
  assert.equal(bySlot[0].Key, 'B');

  // 3. Partial Team Name ('GodLike' -> 'godl')
  const byPartial = filterTeamsByFuzzySearch(teams, 'godl');
  assert.ok(byPartial.length >= 1);
  assert.equal(byPartial[0].Key, 'A');
  assert.equal(byPartial[0].TeamName, 'GodLike');

  // 4. Typo / Subsequence tolerance ('gdlk' -> 'GodLike')
  const byTypo = filterTeamsByFuzzySearch(teams, 'gdlk');
  assert.ok(byTypo.length >= 1);
  assert.equal(byTypo[0].TeamName, 'GodLike');

  // 5. Player Roster Search ('Jonathan' -> Slot A GodLike)
  const byPlayer = filterTeamsByFuzzySearch(teams, 'jonathan');
  assert.ok(byPlayer.length >= 1);
  assert.equal(byPlayer[0].Key, 'A');
  assert.equal(byPlayer[0].TeamName, 'GodLike');

  // 6. Non-matching query returns empty array cleanly
  const noMatch = filterTeamsByFuzzySearch(teams, 'zzzzxxxxqqqq999');
  assert.equal(noMatch.length, 0);

  // Verify scoreTeamFuzzyMatch ranking order (Exact slot > Subsequence)
  const exactScore = scoreTeamFuzzyMatch(teams[0], 'A');
  const subseqScore = scoreTeamFuzzyMatch(teams[0], 'gdlk');
  assert.ok(exactScore > subseqScore);
});

test('Phase 3 Cumulative Tournament Aggregator deduplicates active match and sums multi-round standings', async () => {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ebc-phase3-test-')
  );
  const matchesDir = path.join(tmpDir, 'matches');

  const broadcasts: any[] = [];
  const manager = new MatchManager({
    matchesDir,
    onStateChange: (snap: any) => broadcasts.push(snap),
    onNotification: () => {},
  });

  try {
    const initial: any = await manager.initialize();
    assert.equal(initial.matchId, 'Match_01_BGMI');
    assert.equal(initial.tournamentTitle, 'PRO SERIES INVITATIONAL S4');
    assert.equal(initial.tournamentStandings.totalMatchesCounted, 1);

    // Score Round 1: Slot A gets #1 placement (10 PP) + 5 Kills (5 KP) = 15 TT
    await manager.incrementKill('A');
    await manager.incrementKill('A');
    await manager.incrementKill('A');
    await manager.incrementKill('A');
    await manager.incrementKill('A');
    await manager.setPlacement('A', 1);

    // Slot B gets #2 placement (6 PP) + 2 Kills (2 KP) = 8 TT
    await manager.incrementKill('B');
    await manager.incrementKill('B');
    await manager.setPlacement('B', 2);

    const r1State: any = await manager.getFullState();
    const r1StandingA = r1State.tournamentStandings.standings.find(
      (r: any) => r.Key === 'A'
    );
    // Ensure active match is NOT double-counted even though it is saved on disk
    assert.equal(r1State.tournamentStandings.totalMatchesCounted, 1);
    assert.equal(r1StandingA.priorTT, 0);
    assert.equal(r1StandingA.currentTT, 15);
    assert.equal(r1StandingA.totalTT, 15);
    assert.equal(r1StandingA.winsCount, 1);

    // Advance to Round 2 (Carry Roster)
    const nextRes: any = await manager.createNextRound({
      mode: 'CARRY_ROSTER',
      game: 'BGMI',
    });
    assert.equal(nextRes.ok, true);
    assert.equal(nextRes.snapshot.matchId, 'Match_02_BGMI');
    assert.equal(
      nextRes.snapshot.tournamentStandings.totalMatchesCounted,
      2
    );

    // In Round 2 before scoring: Slot A has priorTT=15, currentTT=0, totalTT=15
    const r2InitA = nextRes.snapshot.tournamentStandings.standings.find(
      (r: any) => r.Key === 'A'
    );
    assert.equal(r2InitA.priorKP, 5);
    assert.equal(r2InitA.priorPP, 10);
    assert.equal(r2InitA.priorTT, 15);
    assert.equal(r2InitA.currentTT, 0);
    assert.equal(r2InitA.totalTT, 15);

    // Score Round 2: Slot B wins Round 2 (#1 = 10 PP + 8 KP = 18 TT)
    // Slot B cumulative should be 8 (R1) + 18 (R2) = 26 TT (Rank #1 overall)
    for (let i = 0; i < 8; i += 1) {
      await manager.incrementKill('B');
    }
    await manager.setPlacement('B', 1);

    // Slot A gets 3 KP in Round 2 -> 15 (R1) + 3 (R2) = 18 TT (Rank #2 overall)
    await manager.incrementKill('A');
    await manager.incrementKill('A');
    await manager.incrementKill('A');

    const r2Scored: any = await manager.getFullState();
    const overallTop1 = r2Scored.tournamentStandings.standings[0];
    const overallTop2 = r2Scored.tournamentStandings.standings[1];

    assert.equal(overallTop1.Key, 'B');
    assert.equal(overallTop1.priorTT, 8);
    assert.equal(overallTop1.currentTT, 18);
    assert.equal(overallTop1.totalTT, 26);
    assert.equal(overallTop1.overallRank, 1);
    assert.equal(overallTop1.winsCount, 1);

    assert.equal(overallTop2.Key, 'A');
    assert.equal(overallTop2.priorTT, 15);
    assert.equal(overallTop2.currentTT, 3);
    assert.equal(overallTop2.totalTT, 18);
    assert.equal(overallTop2.overallRank, 2);

    // Test Broadcast Metadata & Overlay View Mode updates
    const metaRes: any = await manager.updateBroadcastMeta({
      tournamentTitle: 'BGIS 2026 FINALS',
      stageLabel: 'Final Day Match 2',
      overlayViewMode: OVERLAY_VIEW_MODES.END_OF_MATCH,
    });
    assert.equal(metaRes.ok, true);
    assert.equal(metaRes.snapshot.tournamentTitle, 'BGIS 2026 FINALS');
    assert.equal(metaRes.snapshot.stageLabel, 'Final Day Match 2');
    assert.equal(
      metaRes.snapshot.overlayViewMode,
      OVERLAY_VIEW_MODES.END_OF_MATCH
    );
  } finally {
    await manager.dispose();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 3 Audio Feedback utility is fail-safe in headless/Node environments', () => {
  assert.doesNotThrow(() => {
    const enabled = readAudioEnabledPreference();
    assert.equal(typeof enabled, 'boolean');
    writeAudioEnabledPreference(false);
    playBroadcastCue('WINNER', true);
    playBroadcastCue('MATCH_FINAL', false);
    playBroadcastCue('ROUND_START', true);
    playBroadcastCue('ERROR', true);
  });
});

test('Phase 3 Addendum: Two-Column Landscape Scorecard distributes 26 teams evenly (13 Left, 13 Right) in rank order', () => {
  const teams = buildDefaultTemplateTeams('BGMI').map((t: any, idx: number) => ({
    rank: idx + 1,
    slotKey: t.Key,
    teamName: t.TeamName,
    kp: t.KP,
    pp: t.PP,
    tt: t.TT,
  }));

  const split26 = splitTeamsIntoBalancedColumns(teams, 26);
  assert.equal(split26.totalDisplayed, 26);
  assert.equal(split26.rowsPerColumn, 13);
  assert.equal(split26.leftColumn.length, 13);
  assert.equal(split26.rightColumn.length, 13);

  // Verify strict ranking order: Left column is #01..#13, Right column is #14..#26
  assert.equal(split26.leftColumn[0].rank, 1);
  assert.equal(split26.leftColumn[0].slotKey, 'A');
  assert.equal(split26.leftColumn[12].rank, 13);
  assert.equal(split26.leftColumn[12].slotKey, 'M');

  assert.equal(split26.rightColumn[0].rank, 14);
  assert.equal(split26.rightColumn[0].slotKey, 'N');
  assert.equal(split26.rightColumn[12].rank, 26);
  assert.equal(split26.rightColumn[12].slotKey, 'Z');

  // Verify Top 20 split (10 Left, 10 Right)
  const split20 = splitTeamsIntoBalancedColumns(teams, 20);
  assert.equal(split20.leftColumn.length, 10);
  assert.equal(split20.rightColumn.length, 10);
  assert.equal(split20.rowsPerColumn, 10);
});

test('Phase 3 Addendum: Controller switches to compact 3-column team selector when Overview is hidden and preserves 2-column layout when Overview is visible', () => {
  const withOverview = getTeamGridLayoutConfig({
    isOverviewVisible: true,
    totalTeams: 26,
  });
  assert.equal(withOverview.columns, 2);
  assert.equal(withOverview.compact, false);
  assert.equal(withOverview.reclaimedOverviewSpace, false);
  assert.equal(withOverview.rowsNeeded, 13);
  assert.match(withOverview.gridClassName, /md:grid-cols-2/);

  const withoutOverview = getTeamGridLayoutConfig({
    isOverviewVisible: false,
    totalTeams: 26,
  });
  assert.equal(withoutOverview.columns, 3);
  assert.equal(withoutOverview.compact, true);
  assert.equal(withoutOverview.reclaimedOverviewSpace, true);
  assert.equal(withoutOverview.rowsNeeded, 9);
  assert.match(withoutOverview.gridClassName, /lg:grid-cols-3/);
});

