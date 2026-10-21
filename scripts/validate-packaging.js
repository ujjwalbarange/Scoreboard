/**
 * Build-Time Packaging & Windows Installer Verification Script
 * Esports Broadcast Controller & Live Overlay System
 *
 * Modes:
 *   1. `node scripts/validate-packaging.js --prepack`
 *      Validates project structure, lockfiles, electron-builder.json, Electron main/preload
 *      entry points, tournament_config.json, match templates, and built Vite multi-window
 *      outputs (`dist/index.html` and `dist/overlay.html`) before running `electron-builder`.
 *
 *   2. `node scripts/validate-packaging.js --verify-exe`
 *      Validates that `dist-release/` exists after `electron-builder --win --x64`, locates
 *      the generated NSIS Setup `.exe` and Portable `.exe` dynamically, verifies non-empty
 *      binary sizes, and writes `dist-release/build-info.json` and `dist-release/BUILD_INFO.txt`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`\n[PACKAGING VALIDATION FAILED] ${message}\n`);
  process.exit(1);
}

function info(message) {
  console.log(`[PACKAGING CHECK] ${message}`);
}

export function validateProjectAndBuildArtifacts(rootDir = ROOT_DIR) {
  const errors = [];

  // 1. Validate package.json
  const pkgPath = path.join(rootDir, 'package.json');
  let pkg = null;
  if (!fs.existsSync(pkgPath)) {
    errors.push('Missing package.json at repository root.');
  } else {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (!pkg.name) errors.push('package.json is missing "name".');
      if (!pkg.version) errors.push('package.json is missing "version".');
      if (pkg.main !== 'electron/main.js') {
        errors.push(
          `package.json "main" must be "electron/main.js" (found "${pkg.main}").`
        );
      }
      if (!pkg.scripts?.build) {
        errors.push('package.json is missing "build" script.');
      }
      if (!pkg.scripts?.['dist:win']) {
        errors.push('package.json is missing "dist:win" script.');
      }
    } catch (err) {
      errors.push(
        `Invalid JSON in package.json: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 2. Validate Lockfile presence (package-lock.json or bun.lock) and Windows x64 native optional entries
  const npmLockPath = path.join(rootDir, 'package-lock.json');
  const hasNpmLock = fs.existsSync(npmLockPath);
  const hasBunLock = fs.existsSync(path.join(rootDir, 'bun.lock'));
  if (!hasNpmLock && !hasBunLock) {
    errors.push(
      'Missing dependency lockfile (expected package-lock.json or bun.lock).'
    );
  }
  if (hasNpmLock) {
    try {
      const npmLock = JSON.parse(fs.readFileSync(npmLockPath, 'utf-8'));
      const requiredWinOptionalLockKeys = [
        'node_modules/@typescript/typescript-win32-x64',
        'node_modules/@esbuild/win32-x64',
        'node_modules/@rolldown/binding-win32-x64-msvc',
        'node_modules/@tailwindcss/oxide-win32-x64-msvc',
        'node_modules/lightningcss-win32-x64-msvc',
      ];
      for (const lockKey of requiredWinOptionalLockKeys) {
        if (!npmLock.packages?.[lockKey]) {
          errors.push(
            `package-lock.json is missing Windows x64 native optional dependency "${lockKey}" required for GitHub Actions windows-latest builds.`
          );
        }
      }
    } catch (err) {
      errors.push(
        `Invalid JSON in package-lock.json: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 3. Validate electron-builder.json configuration
  const builderConfigPath = path.join(rootDir, 'electron-builder.json');
  let builderConfig = null;
  if (!fs.existsSync(builderConfigPath)) {
    errors.push('Missing electron-builder.json packaging configuration.');
  } else {
    try {
      builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, 'utf-8'));
      if (!builderConfig.appId) {
        errors.push('electron-builder.json is missing "appId".');
      }
      if (!builderConfig.productName) {
        errors.push('electron-builder.json is missing "productName".');
      }
      if (builderConfig.directories?.output !== 'dist-release') {
        errors.push(
          `electron-builder.json "directories.output" must be "dist-release" (found "${builderConfig.directories?.output}").`
        );
      }
      const winTargets = builderConfig.win?.target;
      if (!Array.isArray(winTargets) || winTargets.length === 0) {
        errors.push('electron-builder.json is missing Windows x64 targets.');
      } else {
        const hasNsisX64 = winTargets.some(
          (t) =>
            (typeof t === 'string' && t === 'nsis') ||
            (t && t.target === 'nsis' && Array.isArray(t.arch) && t.arch.includes('x64'))
        );
        if (!hasNsisX64) {
          errors.push(
            'electron-builder.json must include Windows NSIS x64 target.'
          );
        }
      }
      if (builderConfig.nsis?.deleteAppDataOnUninstall !== false) {
        errors.push(
          'electron-builder.json nsis.deleteAppDataOnUninstall must be false to protect user tournament CSV data.'
        );
      }
    } catch (err) {
      errors.push(
        `Invalid JSON in electron-builder.json: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 4. Validate Electron entry points & preload script
  const requiredFiles = [
    'electron/main.js',
    'electron/preload.js',
    'electron/ipc/handlers.js',
    'electron/utils/runtime-paths.js',
    'tournament_config.json',
    'matches/template_bgmi.csv',
    'matches/template_ff.csv',
  ];

  for (const relPath of requiredFiles) {
    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`Missing required source/resource file: ${relPath}`);
    }
  }

  // 5. Validate tournament_config.json JSON integrity
  const configPath = path.join(rootDir, 'tournament_config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!cfg.scoringRules?.BGMI || !cfg.scoringRules?.FREE_FIRE) {
        errors.push(
          'tournament_config.json is missing BGMI or FREE_FIRE scoringRules.'
        );
      }
    } catch (err) {
      errors.push(
        `Malformed tournament_config.json: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 6. Validate built Vite multi-window frontend output (dist/index.html & dist/overlay.html)
  const distDir = path.join(rootDir, 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const distOverlay = path.join(distDir, 'overlay.html');

  if (!fs.existsSync(distIndex)) {
    errors.push(
      'Missing frontend build output: dist/index.html (run "npm run build" first).'
    );
  } else {
    const indexHtml = fs.readFileSync(distIndex, 'utf-8');
    if (!indexHtml.includes('./assets/')) {
      errors.push(
        'dist/index.html does not use relative "./assets/" paths required for Electron loadFile(). Check "base: \'./\'" in vite.config.ts.'
      );
    }
  }

  if (!fs.existsSync(distOverlay)) {
    errors.push(
      'Missing frontend build output: dist/overlay.html (run "npm run build" first).'
    );
  } else {
    const overlayHtml = fs.readFileSync(distOverlay, 'utf-8');
    if (!overlayHtml.includes('./assets/')) {
      errors.push(
        'dist/overlay.html does not use relative "./assets/" paths required for Electron loadFile(). Check "base: \'./\'" in vite.config.ts.'
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    pkg,
    builderConfig,
  };
}

export function verifyGeneratedWindowsExecutables(rootDir = ROOT_DIR) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    : { name: 'esports-broadcast-controller', version: '1.0.0' };

  const releaseDir = path.join(rootDir, 'dist-release');
  if (!fs.existsSync(releaseDir)) {
    return {
      ok: false,
      error: `Expected output directory "dist-release/" does not exist at ${releaseDir}.`,
    };
  }

  const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
  const exeFiles = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.toLowerCase().endsWith('.exe') &&
        !e.name.toLowerCase().includes('uninstall') &&
        !e.name.toLowerCase().includes('elevate')
    )
    .map((e) => {
      const fullPath = path.join(releaseDir, e.name);
      const stat = fs.statSync(fullPath);
      return {
        fileName: e.name,
        filePath: fullPath,
        sizeBytes: stat.size,
        sizeMB: Number((stat.size / (1024 * 1024)).toFixed(2)),
      };
    })
    .filter((f) => f.sizeBytes > 1024 * 100); // Ensure real non-empty executable (>100KB)

  if (exeFiles.length === 0) {
    return {
      ok: false,
      error:
        'No Windows ".exe" installer or portable executable was generated in dist-release/.',
    };
  }

  const setupExe =
    exeFiles.find((f) => f.fileName.toLowerCase().includes('setup')) ||
    exeFiles[0];
  const portableExe =
    exeFiles.find((f) => f.fileName.toLowerCase().includes('portable')) || null;

  const buildInfo = {
    applicationName: 'Esports Broadcast Controller',
    packageName: pkg.name,
    version: pkg.version,
    targetPlatform: 'win32',
    targetArch: 'x64',
    commitSha:
      process.env.GITHUB_SHA ||
      process.env.CI_COMMIT_SHA ||
      'local-working-tree',
    gitRef: process.env.GITHUB_REF_NAME || 'local',
    workflowRunId: process.env.GITHUB_RUN_ID || 'local',
    builtAt: new Date().toISOString(),
    artifacts: exeFiles.map((f) => ({
      fileName: f.fileName,
      sizeBytes: f.sizeBytes,
      sizeMB: f.sizeMB,
    })),
    primaryInstaller: setupExe.fileName,
    portableExecutable: portableExe ? portableExe.fileName : null,
  };

  const buildInfoJsonPath = path.join(releaseDir, 'build-info.json');
  fs.writeFileSync(
    buildInfoJsonPath,
    JSON.stringify(buildInfo, null, 2),
    'utf-8'
  );

  const buildInfoTxtPath = path.join(releaseDir, 'BUILD_INFO.txt');
  const txtLines = [
    '============================================================',
    'ESPORTS BROADCAST CONTROLLER — WINDOWS x64 BUILD INFORMATION',
    '============================================================',
    `Product Name       : ${buildInfo.applicationName}`,
    `Package Version    : ${buildInfo.version}`,
    `Target Architecture: ${buildInfo.targetPlatform}-${buildInfo.targetArch}`,
    `Commit SHA         : ${buildInfo.commitSha}`,
    `Git Ref / Branch   : ${buildInfo.gitRef}`,
    `Build Timestamp    : ${buildInfo.builtAt}`,
    `NSIS Installer EXE : ${buildInfo.primaryInstaller}`,
    `Portable EXE       : ${buildInfo.portableExecutable || 'N/A'}`,
    '',
    'Generated Executables:',
    ...exeFiles.map((f) => `  - ${f.fileName} (${f.sizeMB} MB)`),
    '============================================================',
    '',
  ];
  fs.writeFileSync(buildInfoTxtPath, txtLines.join('\n'), 'utf-8');

  return {
    ok: true,
    exeFiles,
    setupExe,
    portableExe,
    buildInfo,
    buildInfoJsonPath,
    buildInfoTxtPath,
  };
}

// CLI Execution
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  const runVerifyExe = args.has('--verify-exe');

  info('Running pre-packaging project & frontend build validation...');
  const prepack = validateProjectAndBuildArtifacts(ROOT_DIR);
  if (!prepack.ok) {
    fail(prepack.errors.map((e) => `• ${e}`).join('\n'));
  }

  info(
    `Validated package "${prepack.pkg.name}@${prepack.pkg.version}", dual-window dist/ bundle, Electron main/preload scripts, and templates.`
  );

  if (runVerifyExe) {
    info('Verifying generated Windows x64 .exe artifacts in dist-release/...');
    const exeCheck = verifyGeneratedWindowsExecutables(ROOT_DIR);
    if (!exeCheck.ok) {
      fail(exeCheck.error);
    }
    info(
      `Verified ${exeCheck.exeFiles.length} Windows executable(s): ${exeCheck.exeFiles
        .map((f) => `${f.fileName} (${f.sizeMB} MB)`)
        .join(', ')}`
    );
    info(`Wrote build metadata to ${exeCheck.buildInfoJsonPath}`);
  }
}
