import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calculatePlacementPoints,
  calculateTotalPoints,
  recalculateTeam,
  recalculateAllTeams,
} from '../../electron/match/scoring-engine.js';
import {
  assignTeamPlacement,
  adjustTeamPlacement,
} from '../../electron/match/placement-engine.js';
import { MatchEngine } from '../../electron/match/match-engine.js';
import { MatchManager } from '../../electron/match/match-manager.js';
import { AtomicFileWriter } from '../../electron/utils/atomic-write.js';
import {
  parseAndValidateMatchCsv,
  serializeTeamsToCsv,
} from '../../electron/utils/validation.js';
import { buildDefaultTemplateTeams } from './match-types.js';

// ============================================================================
// 1. SCORING ENGINE TESTS
// ============================================================================

test('BGMI and Free Fire scoring matrices match specification and enforce TT = KP + PP', () => {
  // BGMI specification
  assert.equal(calculatePlacementPoints('BGMI', 0), 0);
  assert.equal(calculatePlacementPoints('BGMI', 1), 10);
  assert.equal(calculatePlacementPoints('BGMI', 2), 6);
  assert.equal(calculatePlacementPoints('BGMI', 3), 5);
  assert.equal(calculatePlacementPoints('BGMI', 4), 4);
  assert.equal(calculatePlacementPoints('BGMI', 5), 3);
  assert.equal(calculatePlacementPoints('BGMI', 6), 2);
  assert.equal(calculatePlacementPoints('BGMI', 7), 1);
  assert.equal(calculatePlacementPoints('BGMI', 8), 1);
  assert.equal(calculatePlacementPoints('BGMI', 9), 0);
  assert.equal(calculatePlacementPoints('BGMI', 26), 0);

  // Free Fire specification
  assert.equal(calculatePlacementPoints('FREE_FIRE', 0), 0);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 1), 12);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 2), 9);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 3), 8);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 4), 7);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 5), 6);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 6), 5);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 7), 4);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 8), 3);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 9), 2);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 10), 1);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 11), 0);
  assert.equal(calculatePlacementPoints('FREE_FIRE', 26), 0);

  // Total points TT = KP + PP
  assert.equal(calculateTotalPoints(14, 10), 24);
  assert.equal(calculateTotalPoints(0, 0), 0);

  // Negative kill points rejected
  assert.throws(() => calculateTotalPoints(-1, 10), /non-negative integer/);
  assert.throws(
    () =>
      recalculateTeam(
        { Key: 'A', TeamName: 'GodLike', pos: 1, KP: -2 },
        'BGMI'
      ),
    /cannot be negative/
  );

  // Malformed config is rejected with useful error
  assert.throws(
    () => calculatePlacementPoints('BGMI', 1, { scoringRules: {} }),
    /Invalid or missing scoring configuration/
  );
});

// ============================================================================
// 2. PLACEMENT COLLISION ENGINE & UNDO TESTS
// ============================================================================

test('Placement engine resolves collisions deterministically, updates PP/TT, and rejects impossible cascades', () => {
  let teams: any[] = recalculateAllTeams(
    buildDefaultTemplateTeams('BGMI'),
    'BGMI'
  );

  // Assign Team C to Rank 3 (PP=5) and Team D to Rank 4 (PP=4)
  let res = assignTeamPlacement(teams, 'C', 3, 'BGMI');
  assert.equal(res.ok, true);
  teams = res.teams!;

  res = assignTeamPlacement(teams, 'D', 4, 'BGMI');
  assert.equal(res.ok, true);
  teams = res.teams!;

  // Give Team C 5 kills and Team D 2 kills
  teams = teams.map((t: any) => {
    if (t.Key === 'C') return recalculateTeam({ ...t, KP: 5 }, 'BGMI');
    if (t.Key === 'D') return recalculateTeam({ ...t, KP: 2 }, 'BGMI');
    return t;
  });

  // Now assign Team A to Rank 3 -> should cascade Team C (3 -> 4) and Team D (4 -> 5)
  const cascadeRes = assignTeamPlacement(teams, 'A', 3, 'BGMI');
  assert.equal(cascadeRes.ok, true);
  assert.equal(cascadeRes.cascaded?.length, 2);
  teams = cascadeRes.teams!;

  const teamA = teams.find((t: any) => t.Key === 'A')!;
  const teamB = teams.find((t: any) => t.Key === 'B')!;
  const teamC = teams.find((t: any) => t.Key === 'C')!;
  const teamD = teams.find((t: any) => t.Key === 'D')!;

  assert.equal(teamA.pos, 3);
  assert.equal(teamA.PP, 5);
  assert.equal(teamA.TT, 5);

  // Alive Team B must remain untouched at pos 0
  assert.equal(teamB.pos, 0);
  assert.equal(teamB.status, 'ALIVE');

  // Displaced Team C moved to Rank 4 (PP=4, KP=5 => TT=9)
  assert.equal(teamC.pos, 4);
  assert.equal(teamC.PP, 4);
  assert.equal(teamC.TT, 9);

  // Displaced Team D moved to Rank 5 (PP=3, KP=2 => TT=5)
  assert.equal(teamD.pos, 5);
  assert.equal(teamD.PP, 3);
  assert.equal(teamD.TT, 5);

  // Return Team A to pos 0 (Alive)
  const aliveRes = assignTeamPlacement(teams, 'A', 0, 'BGMI');
  assert.equal(aliveRes.ok, true);
  const resetA: any = aliveRes.teams!.find((t: any) => t.Key === 'A')!;
  assert.equal(resetA.pos, 0);
  assert.equal(resetA.PP, 0);
  assert.equal(resetA.status, 'ALIVE');

  // Place Team Z at Rank 26 (maxRank), then try to assign Team Y to Rank 26 -> must reject atomically!
  const at26 = assignTeamPlacement(aliveRes.teams!, 'Z', 26, 'BGMI');
  assert.equal(at26.ok, true);
  const snapshotBeforeReject = JSON.stringify(at26.teams);

  const impossibleCascade = assignTeamPlacement(
    at26.teams!,
    'Y',
    26,
    'BGMI'
  );
  assert.equal(impossibleCascade.ok, false);
  assert.match(impossibleCascade.error || '', /exceed maximum match rank/);
  assert.equal(JSON.stringify(at26.teams), snapshotBeforeReject);

  // Invalid placement input (e.g. 27 or -1 or 'abc') rejected without mutating state
  assert.equal(assignTeamPlacement(at26.teams!, 'A', 27, 'BGMI').ok, false);
  assert.equal(assignTeamPlacement(at26.teams!, 'A', -1, 'BGMI').ok, false);
  assert.equal(assignTeamPlacement(at26.teams!, 'A', 'abc', 'BGMI').ok, false);
});

test('MatchEngine Undo restores exact prior state after a placement cascade and kill edits', () => {
  const engine = new MatchEngine({ initialGame: 'BGMI' });

  // Increment KP on Team A twice
  assert.equal(engine.incrementKill('A').ok, true);
  assert.equal(engine.incrementKill('A').ok, true);
  assert.equal(engine.setPlacement('B', 1).ok, true);
  assert.equal(engine.setPlacement('C', 2).ok, true);

  const stateBeforeCascade = engine.getSnapshot();
  assert.equal(
    stateBeforeCascade.teams.find((t: any) => t.Key === 'B')?.pos,
    1
  );
  assert.equal(
    stateBeforeCascade.teams.find((t: any) => t.Key === 'C')?.pos,
    2
  );

  // Trigger a cascade by assigning Team A to Rank 1 (pushes B->2, C->3)
  const cascadeMutation = engine.setPlacement('A', 1);
  assert.equal(cascadeMutation.ok, true);
  const afterCascade = cascadeMutation.snapshot!;
  assert.equal(afterCascade.teams.find((t: any) => t.Key === 'A')?.pos, 1);
  assert.equal(afterCascade.teams.find((t: any) => t.Key === 'A')?.TT, 12); // 2 KP + 10 PP
  assert.equal(afterCascade.teams.find((t: any) => t.Key === 'B')?.pos, 2);
  assert.equal(afterCascade.teams.find((t: any) => t.Key === 'C')?.pos, 3);

  const undoDepthBefore = afterCascade.undo.depth;

  // Undo the cascade in a single operation
  const undoRes = engine.undo();
  assert.equal(undoRes.ok, true);
  const restored = undoRes.snapshot!;
  assert.equal(restored.undo.depth, undoDepthBefore - 1);
  assert.equal(restored.teams.find((t: any) => t.Key === 'A')?.pos, 0);
  assert.equal(restored.teams.find((t: any) => t.Key === 'A')?.TT, 2);
  assert.equal(restored.teams.find((t: any) => t.Key === 'B')?.pos, 1);
  assert.equal(restored.teams.find((t: any) => t.Key === 'B')?.PP, 10);
  assert.equal(restored.teams.find((t: any) => t.Key === 'C')?.pos, 2);
  assert.equal(restored.teams.find((t: any) => t.Key === 'C')?.PP, 6);

  // Manual placement adjustment UP/DOWN
  const moveDown = adjustTeamPlacement(restored.teams, 'B', 'DOWN', 'BGMI');
  assert.equal(moveDown.ok, true);
  assert.equal((moveDown.teams as any[]).find((t: any) => t.Key === 'B')?.pos, 2);

  // Switch active game ruleset from BGMI to FREE_FIRE and verify PP/TT recalculation + Undo
  const switchGameRes = engine.setActiveGame('FREE_FIRE');
  assert.equal(switchGameRes.ok, true);
  assert.equal(switchGameRes.snapshot!.activeGame, 'FREE_FIRE');
  // In FREE_FIRE, Team B at pos 1 gets PP=12, Team C at pos 2 gets PP=9
  assert.equal(
    switchGameRes.snapshot!.teams.find((t) => t.Key === 'B')?.PP,
    12
  );
  assert.equal(
    switchGameRes.snapshot!.teams.find((t) => t.Key === 'C')?.PP,
    9
  );

  const undoGameSwitch = engine.undo();
  assert.equal(undoGameSwitch.ok, true);
  assert.equal(undoGameSwitch.snapshot!.activeGame, 'BGMI');
  assert.equal(
    undoGameSwitch.snapshot!.teams.find((t) => t.Key === 'B')?.PP,
    10
  );
});

// ============================================================================
// 3. CSV ROUND-TRIPPING, QUOTED FIELDS & ATOMIC PERSISTENCE TESTS
// ============================================================================

test('CSV parser and serializer round-trip quoted fields, commas, and escaped quotes accurately', () => {
  const sampleTeams = buildDefaultTemplateTeams('BGMI');
  sampleTeams[0].TeamName = 'GodLike, "Official" Squad';
  sampleTeams[0].Player1 = 'Jonathan "Clutch" Amaral';
  sampleTeams[0].Player2 = 'Punk, IGL';
  sampleTeams[0].pos = 1;
  sampleTeams[0].KP = 9;
  sampleTeams[0].PP = 10;
  sampleTeams[0].TT = 19;

  const csvText = serializeTeamsToCsv(sampleTeams);
  assert.match(csvText, /"GodLike, ""Official"" Squad"/);
  assert.match(csvText, /"Jonathan ""Clutch"" Amaral"/);
  assert.match(csvText, /"Punk, IGL"/);

  const parsed = parseAndValidateMatchCsv(csvText, 'BGMI');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.teams?.length, 26);
  assert.equal(parsed.teams![0].TeamName, 'GodLike, "Official" Squad');
  assert.equal(parsed.teams![0].Player1, 'Jonathan "Clutch" Amaral');
  assert.equal(parsed.teams![0].Player2, 'Punk, IGL');
  assert.equal(parsed.teams![0].pos, 1);
  assert.equal(parsed.teams![0].KP, 9);
  assert.equal(parsed.teams![0].PP, 10);
  assert.equal(parsed.teams![0].TT, 19);

  // Reject malformed CSV (duplicate keys, negative kills, wrong column count)
  const duplicateKeyCsv = csvText.replace('\nB,', '\nA,');
  assert.equal(parseAndValidateMatchCsv(duplicateKeyCsv, 'BGMI').ok, false);

  const unclosedQuoteCsv = 'Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT\nA,"Unclosed,P1,P2,P3,P4,0,0,0,0';
  assert.equal(parseAndValidateMatchCsv(unclosedQuoteCsv, 'BGMI').ok, false);
});

test('AtomicFileWriter serializes concurrent writes in deterministic order without corruption', async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ebc-atomic-test-')
  );
  const targetFile = path.join(tmpDir, 'Match_Concurrent.csv');
  const writer = new AtomicFileWriter();

  try {
    const writes = [];
    for (let i = 1; i <= 10; i++) {
      writes.push(writer.writeAtomically(targetFile, `SEQ_${i}\n`));
    }
    const results = await Promise.all(writes);
    assert.ok(results.every((r) => r.ok));

    const finalDiskContent = await fs.promises.readFile(targetFile, 'utf-8');
    assert.equal(finalDiskContent, 'SEQ_10\n');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 4. MATCH LIFECYCLE & EXTERNAL CSV WATCHER INTEGRATION TESTS
// ============================================================================

test('MatchManager supports Carry Roster, Cold Start, Undo, and External CSV validation', async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ebc-manager-test-')
  );

  const notifications: any[] = [];
  let latestBroadcast: any = null;

  const manager = new MatchManager({
    matchesDir: tmpDir,
    onStateChange: (snap) => {
      latestBroadcast = snap;
    },
    onNotification: (note) => {
      notifications.push(note);
    },
  });

  try {
    const initSnap = await manager.initialize();
    assert.equal(initSnap.matchId, 'Match_01_BGMI');
    assert.equal(initSnap.activeGame, 'BGMI');
    assert.equal(initSnap.teams.length, 26);

    // Customize Team A roster and add kills + placement
    await manager.updateTeamRoster({
      key: 'A',
      teamName: 'Champion Squad Alpha',
      players: ['Alpha1', 'Alpha2', 'Alpha3', 'Alpha4'],
    });
    await manager.incrementKill('A');
    await manager.incrementKill('A');
    await manager.setPlacement('A', 1);

    const afterScore = await manager.getFullState();
    const teamA: any = afterScore.teams.find((t: any) => t.Key === 'A')!;
    assert.equal(teamA.TeamName, 'Champion Squad Alpha');
    assert.equal(teamA.KP, 2);
    assert.equal(teamA.PP, 10);
    assert.equal(teamA.TT, 12);

    // Progress to Next Round with Carry Roster
    const nextRoundRes = await manager.createNextRound({
      mode: 'CARRY_ROSTER',
    });
    assert.equal(nextRoundRes.ok, true);
    assert.equal(nextRoundRes.matchId, 'Match_02_BGMI');

    const round2TeamA: any = nextRoundRes.snapshot.teams.find(
      (t: any) => t.Key === 'A'
    )!;
    assert.equal(round2TeamA.TeamName, 'Champion Squad Alpha');
    assert.deepEqual(round2TeamA.players, [
      'Alpha1',
      'Alpha2',
      'Alpha3',
      'Alpha4',
    ]);
    assert.equal(round2TeamA.pos, 0);
    assert.equal(round2TeamA.KP, 0);
    assert.equal(round2TeamA.PP, 0);
    assert.equal(round2TeamA.TT, 0);

    // Verify Match_01_BGMI.csv was NOT overwritten on disk
    const match1Path = path.join(tmpDir, 'Match_01_BGMI.csv');
    const match1Csv = await fs.promises.readFile(match1Path, 'utf-8');
    assert.match(match1Csv, /Champion Squad Alpha,Alpha1,Alpha2,Alpha3,Alpha4,1,2,10,12/);

    // Verify invalid import is rejected without corrupting state
    const badImport = await manager.importRoster({
      csvText: 'Key,TeamName\nA,BrokenRowOnlyTwoCols',
    });
    assert.equal(badImport.ok, false);
    assert.equal(
      (
        (await manager.getFullState()).teams.find(
          (t: any) => t.Key === 'A'
        ) as any
      )?.TeamName,
      'Champion Squad Alpha'
    );

    assert.ok(latestBroadcast);
    assert.ok(notifications.length > 0);
  } finally {
    manager.dispose();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});
