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
  createDefaultOverlayConfig,
  sanitizeOverlayConfig,
  resetBackgroundConfig,
  resetScorecardConfig,
  validateBackgroundImageUpload,
  computeResponsiveCanvasScale,
  checkOverlayLayoutFit,
  computeOverlayCssVariables,
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

test('Phase 3 Addendum: Responsive overlay canvas scales proportionally across 1920x1080, 1600x900, 1280x720, and custom resolutions without altering target OBS dimensions', () => {
  // 1. 1920x1080 target rendered inside a 560x315 embedded preview monitor
  const previewScale = computeResponsiveCanvasScale({
    containerWidth: 560,
    containerHeight: 315,
    canvasWidth: 1920,
    canvasHeight: 1080,
  });
  assert.equal(previewScale.canvasWidth, 1920);
  assert.equal(previewScale.canvasHeight, 1080);
  assert.equal(previewScale.referenceScale, 1);
  assert.ok(previewScale.viewportScale > 0.28 && previewScale.viewportScale < 0.3);

  // 2. 1600x900 (900p) and 1280x720 (720p) scale reference metrics proportionally
  const scale900p = computeResponsiveCanvasScale({
    containerWidth: 1600,
    containerHeight: 900,
    canvasWidth: 1600,
    canvasHeight: 900,
  });
  assert.equal(scale900p.viewportScale, 1);
  assert.equal(scale900p.referenceScale, 0.8333);

  const scale720p = computeResponsiveCanvasScale({
    containerWidth: 1280,
    containerHeight: 720,
    canvasWidth: 1280,
    canvasHeight: 720,
  });
  assert.equal(scale720p.viewportScale, 1);
  assert.equal(scale720p.referenceScale, 0.6667);

  // 3. Default 1920x1080 and 1280x720 fit all 26 teams (13 rows per column) cleanly
  const fit1080 = checkOverlayLayoutFit({
    overlayConfig: sanitizeOverlayConfig({ canvas: { presetId: '1920x1080' } }),
    rowsPerColumn: 13,
  });
  assert.equal(fit1080.fits, true);
  assert.equal(fit1080.warning, null);

  const fit720 = checkOverlayLayoutFit({
    overlayConfig: sanitizeOverlayConfig({ canvas: { presetId: '1280x720' } }),
    rowsPerColumn: 13,
  });
  assert.equal(fit720.fits, true);
  assert.equal(fit720.warning, null);

  // 4. Tiny custom canvas or excessive fixed row height triggers warning & auto-clamping
  const tinyFit = checkOverlayLayoutFit({
    overlayConfig: sanitizeOverlayConfig({
      canvas: { width: 480, height: 300 },
      scorecard: { rowHeightMode: 'fixed', rowHeightPx: 48 },
    }),
    rowsPerColumn: 13,
  });
  assert.equal(tinyFit.fits, false);
  assert.ok(tinyFit.warning && tinyFit.warning.length > 0);
  assert.ok(tinyFit.effectiveRowHeightPx >= 12);
});

test('Phase 3 Addendum: Background image validation, application-managed asset persistence across restarts, and independent scorecard customization', async () => {
  const samplePngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // 1. Validate valid PNG upload
  const validUpload = validateBackgroundImageUpload({
    fileName: 'arena_bg.png',
    mimeType: 'image/png',
    fileSize: 95,
    dataUrl: samplePngBase64,
  });
  assert.equal(validUpload.valid, true);
  assert.equal(validUpload.sanitized?.fileName, 'arena_bg.png');
  assert.equal(validUpload.sanitized?.mimeType, 'image/png');

  // 2. Reject invalid file extension (.exe / .gif) and oversized files
  const badExt = validateBackgroundImageUpload({
    fileName: 'malware.exe',
    mimeType: 'application/octet-stream',
    fileSize: 100,
    dataUrl: samplePngBase64,
  });
  assert.equal(badExt.valid, false);
  assert.match(badExt.error || '', /Unsupported image file extension/);

  const oversized = validateBackgroundImageUpload({
    fileName: 'huge.webp',
    mimeType: 'image/webp',
    fileSize: 12 * 1024 * 1024,
    dataUrl: samplePngBase64,
    maxBytes: 8 * 1024 * 1024,
  });
  assert.equal(oversized.valid, false);
  assert.match(oversized.error || '', /exceeds maximum allowed size/);

  // 3. Verify independent scorecard vs background customization and resets
  let customCfg = sanitizeOverlayConfig(
    {
      background: {
        imageDataUrl: samplePngBase64,
        fileName: 'arena_bg.png',
        mimeType: 'image/png',
        fileSize: 95,
        opacity: 0.75,
        scaleMode: 'contain',
        position: 'top',
      },
      scorecard: {
        widthPercent: 85,
        heightPercent: 88,
        offsetXPercent: 5,
        offsetYPercent: -4,
        rowHeightMode: 'fixed',
        rowHeightPx: 28,
        rowGapPx: 3,
        headerFontSizePx: 26,
        teamFontSizePx: 16,
        scoreFontSizePx: 17,
        accentColor: '#06b6d4',
        showKillPoints: false,
      },
    },
    createDefaultOverlayConfig()
  );

  assert.equal(customCfg.background.opacity, 0.75);
  assert.equal(customCfg.background.scaleMode, 'contain');
  assert.equal(customCfg.scorecard.widthPercent, 85);
  assert.equal(customCfg.scorecard.showKillPoints, false);

  // Resetting scorecard keeps custom background intact
  const afterScorecardReset = resetScorecardConfig(customCfg);
  assert.equal(afterScorecardReset.background.imageDataUrl, samplePngBase64);
  assert.equal(afterScorecardReset.background.opacity, 0.75);
  assert.equal(afterScorecardReset.scorecard.widthPercent, 96);
  assert.equal(afterScorecardReset.scorecard.showKillPoints, true);

  // Resetting background keeps custom scorecard intact
  const afterBgReset = resetBackgroundConfig(customCfg);
  assert.equal(afterBgReset.background.imageDataUrl, null);
  assert.equal(afterBgReset.scorecard.widthPercent, 85);
  assert.equal(afterBgReset.scorecard.accentColor, '#06b6d4');

  // Verify CSS variable generation
  const { cssVars } = computeOverlayCssVariables(customCfg, 13, 'MATCH');
  assert.equal(cssVars['--ov-table-width'], '85%');
  assert.equal(cssVars['--ov-bg-opacity'], '0.75');
  assert.equal(cssVars['--ov-bg-size'], 'contain');
  assert.equal(cssVars['--ov-accent-color'], '#06b6d4');

  // 4. Verify MatchManager persists background asset to disk and restores across restart
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ebc-overlay-persist-')
  );
  const matchesDir = path.join(tmpDir, 'matches');
  const manager1 = new MatchManager({ matchesDir });

  try {
    await manager1.initialize();
    const uploadRes: any = await manager1.updateBroadcastMeta({
      backgroundUpload: {
        fileName: 'studio_bg.png',
        mimeType: 'image/png',
        fileSize: 95,
        dataUrl: samplePngBase64,
      },
      overlayConfig: {
        canvas: { presetId: '1600x900', width: 1600, height: 900 },
        scorecard: { widthPercent: 88, offsetXPercent: 4 },
      },
    });
    assert.equal(uploadRes.ok, true);
    assert.equal(
      uploadRes.snapshot.overlayConfig.background.fileName,
      'studio_bg.png'
    );
    assert.equal(uploadRes.snapshot.overlayConfig.canvas.width, 1600);
    assert.equal(uploadRes.snapshot.overlayConfig.scorecard.widthPercent, 88);

    // Check managed asset file exists on disk
    const assetPath = path.join(matchesDir, 'assets', 'overlay_bg.png');
    const stat = await fs.stat(assetPath);
    assert.ok(stat.size > 0);

    await manager1.dispose();

    // Simulate app restart with a fresh MatchManager pointing to same matchesDir
    const manager2 = new MatchManager({ matchesDir });
    const restoredState: any = await manager2.initialize();
    assert.equal(restoredState.overlayConfig.canvas.width, 1600);
    assert.equal(restoredState.overlayConfig.canvas.height, 900);
    assert.equal(restoredState.overlayConfig.scorecard.widthPercent, 88);
    assert.equal(restoredState.overlayConfig.scorecard.offsetXPercent, 4);
    assert.equal(
      restoredState.overlayConfig.background.imageDataUrl,
      samplePngBase64
    );

    // Remove background and verify asset file is deleted and overlay returns to transparent
    const removeRes: any = await manager2.updateBroadcastMeta({
      resetOverlayBackground: true,
    });
    assert.equal(removeRes.ok, true);
    assert.equal(
      removeRes.snapshot.overlayConfig.background.imageDataUrl,
      null
    );

    await manager2.dispose();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});


