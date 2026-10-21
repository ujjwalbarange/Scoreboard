import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveBundledTemplatesDir,
  resolveTournamentConfigPath,
  resolveWritableMatchesDir,
  seedAndMigrateWritableData,
} from '../../electron/utils/runtime-paths.js';
import {
  validateProjectAndBuildArtifacts,
  verifyGeneratedWindowsExecutables,
} from '../../scripts/validate-packaging.js';

test('runtime-paths separates immutable packaged resources from writable userData and migrates safely without overwriting', async () => {
  const tmpRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ebc-userdata-test-')
  );

  try {
    const fakeResourcesDir = path.join(tmpRoot, 'resources');
    const fakeBundledTemplatesDir = path.join(fakeResourcesDir, 'templates');
    const fakeLegacyMatchesDir = path.join(tmpRoot, 'legacy-matches');
    const fakeUserDataDir = path.join(tmpRoot, 'AppData-Roaming-EBC');

    await fs.promises.mkdir(fakeBundledTemplatesDir, { recursive: true });
    await fs.promises.mkdir(fakeLegacyMatchesDir, { recursive: true });
    await fs.promises.mkdir(fakeUserDataDir, { recursive: true });

    // Create bundled config and templates
    const bundledConfigPath = path.join(
      fakeResourcesDir,
      'tournament_config.json'
    );
    await fs.promises.writeFile(
      bundledConfigPath,
      JSON.stringify({ tournamentTitle: 'BUNDLED CONFIG' }),
      'utf-8'
    );
    await fs.promises.writeFile(
      path.join(fakeBundledTemplatesDir, 'template_bgmi.csv'),
      'BUNDLED_BGMI_TEMPLATE\n',
      'utf-8'
    );
    await fs.promises.writeFile(
      path.join(fakeBundledTemplatesDir, 'template_ff.csv'),
      'BUNDLED_FF_TEMPLATE\n',
      'utf-8'
    );

    // Create a legacy match CSV and a pre-existing user match CSV to verify non-destructive migration
    await fs.promises.writeFile(
      path.join(fakeLegacyMatchesDir, 'Match_01_BGMI.csv'),
      'LEGACY_MATCH_01\n',
      'utf-8'
    );
    await fs.promises.writeFile(
      path.join(fakeLegacyMatchesDir, 'Match_02_BGMI.csv'),
      'LEGACY_MATCH_02\n',
      'utf-8'
    );

    // Resolve writable matches directory for packaged app
    const writableMatchesDir = resolveWritableMatchesDir({
      isPackaged: true,
      userDataPath: fakeUserDataDir,
    });
    assert.equal(writableMatchesDir, path.join(fakeUserDataDir, 'matches'));

    // Pre-populate Match_01_BGMI.csv in userData/matches to ensure migration NEVER overwrites existing user data
    await fs.promises.mkdir(writableMatchesDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(writableMatchesDir, 'Match_01_BGMI.csv'),
      'USER_EXISTING_MATCH_01_DO_NOT_OVERWRITE\n',
      'utf-8'
    );

    const resolvedTemplatesDir = resolveBundledTemplatesDir({
      isPackaged: true,
      resourcesPath: fakeResourcesDir,
    });
    assert.equal(resolvedTemplatesDir, fakeBundledTemplatesDir);

    const migrationResult = await seedAndMigrateWritableData({
      writableMatchesDir,
      bundledTemplatesDir: resolvedTemplatesDir,
      legacyMatchesDirs: [fakeLegacyMatchesDir],
      userDataPath: fakeUserDataDir,
      bundledConfigPath,
    });

    assert.equal(migrationResult.ok, true);
    assert.deepEqual(migrationResult.seededTemplates.sort(), [
      'template_bgmi.csv',
      'template_ff.csv',
    ]);
    // Only Match_02_BGMI.csv should be migrated; Match_01_BGMI.csv already existed
    assert.deepEqual(migrationResult.migratedMatches, ['Match_02_BGMI.csv']);
    assert.equal(migrationResult.seededConfig, true);

    // Verify existing user data was NOT overwritten
    const match1Content = await fs.promises.readFile(
      path.join(writableMatchesDir, 'Match_01_BGMI.csv'),
      'utf-8'
    );
    assert.equal(match1Content, 'USER_EXISTING_MATCH_01_DO_NOT_OVERWRITE\n');

    // Verify missing legacy match was migrated
    const match2Content = await fs.promises.readFile(
      path.join(writableMatchesDir, 'Match_02_BGMI.csv'),
      'utf-8'
    );
    assert.equal(match2Content, 'LEGACY_MATCH_02\n');

    // Verify resolveTournamentConfigPath prefers userData config when packaged
    const resolvedConfig = resolveTournamentConfigPath({
      isPackaged: true,
      userDataPath: fakeUserDataDir,
      resourcesPath: fakeResourcesDir,
    });
    assert.equal(
      resolvedConfig,
      path.join(fakeUserDataDir, 'tournament_config.json')
    );
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('validateProjectAndBuildArtifacts and verifyGeneratedWindowsExecutables validate packaging and .exe outputs', async () => {
  const hasBuiltDist =
    fs.existsSync(path.resolve('dist/index.html')) &&
    fs.existsSync(path.resolve('dist/overlay.html'));
  const prepack = validateProjectAndBuildArtifacts(process.cwd(), {
    requireDist: hasBuiltDist,
  });
  assert.equal(
    prepack.ok,
    true,
    `Prepack validation failed: ${prepack.errors.join('; ')}`
  );

  // Test .exe verification in an isolated temp root
  const tmpRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ebc-exe-verify-')
  );
  try {
    await fs.promises.writeFile(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'esports-broadcast-controller', version: '1.0.0' }),
      'utf-8'
    );

    // 1. Fails when dist-release/ is missing
    const missingCheck = verifyGeneratedWindowsExecutables(tmpRoot);
    assert.equal(missingCheck.ok, false);
    assert.match(missingCheck.error || '', /dist-release/);

    // 2. Fails when dist-release/ contains no .exe files
    const releaseDir = path.join(tmpRoot, 'dist-release');
    await fs.promises.mkdir(releaseDir, { recursive: true });
    const emptyCheck = verifyGeneratedWindowsExecutables(tmpRoot);
    assert.equal(emptyCheck.ok, false);
    assert.match(emptyCheck.error || '', /No Windows "\.exe"/);

    // 3. Succeeds when valid Setup and Portable .exe binaries exist (>100KB)
    const dummyBinary = Buffer.alloc(150 * 1024, 0x4d);
    const setupName = 'Esports-Broadcast-Controller-Setup-1.0.0-x64.exe';
    const portableName = 'Esports-Broadcast-Controller-Portable-1.0.0-x64.exe';
    await fs.promises.writeFile(path.join(releaseDir, setupName), dummyBinary);
    await fs.promises.writeFile(
      path.join(releaseDir, portableName),
      dummyBinary
    );

    const validCheck = verifyGeneratedWindowsExecutables(tmpRoot);
    assert.equal(validCheck.ok, true);
    assert.equal(validCheck.setupExe?.fileName, setupName);
    assert.equal(validCheck.portableExe?.fileName, portableName);
    assert.ok(fs.existsSync(validCheck.buildInfoJsonPath!));
    assert.ok(fs.existsSync(validCheck.buildInfoTxtPath!));

    const buildInfo = JSON.parse(
      await fs.promises.readFile(validCheck.buildInfoJsonPath!, 'utf-8')
    );
    assert.equal(buildInfo.version, '1.0.0');
    assert.equal(buildInfo.targetArch, 'x64');
    assert.equal(buildInfo.primaryInstaller, setupName);
    assert.equal(buildInfo.portableExecutable, portableName);
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('GitHub Actions workflow .github/workflows/build-windows.yml is present and configured for Windows x64 and Releases', () => {
  const workflowPath = path.resolve('.github/workflows/build-windows.yml');
  assert.ok(
    fs.existsSync(workflowPath),
    'Missing .github/workflows/build-windows.yml'
  );

  const yamlContent = fs.readFileSync(workflowPath, 'utf-8');
  assert.match(yamlContent, /runs-on:\s*windows-latest/);
  assert.match(yamlContent, /workflow_dispatch:/);
  assert.match(yamlContent, /pull_request:/);
  assert.match(yamlContent, /tags:\s*\n\s*-\s*'v\*\.\*\.\*'/);
  assert.match(yamlContent, /npm run build/);
  assert.match(yamlContent, /npm run dist:win/);
  assert.match(yamlContent, /actions\/upload-artifact@v4/);
  assert.match(yamlContent, /name:\s*esports-broadcast-controller-windows-x64/);
  assert.match(yamlContent, /retention-days:\s*14/);
  assert.match(yamlContent, /publish-github-release:/);
  assert.match(yamlContent, /contents:\s*write/);
});
