/**
 * Electron Runtime Path Resolver & Non-Destructive UserData Migration Utility
 * Phase 2 & Windows Packaging: Esports Broadcast Controller & Live Overlay System
 *
 * Ensures that:
 * 1. Installed Windows applications store writable match CSV files and metadata
 *    under Electron's `app.getPath('userData')` (e.g. `%APPDATA%/Esports Broadcast Controller/matches`)
 *    rather than inside a read-only installation directory (`Program Files` or `app.asar`).
 * 2. Immutable bundled templates (`template_bgmi.csv`, `template_ff.csv`) and default
 *    `tournament_config.json` are resolved from `process.resourcesPath` when packaged
 *    and safely seeded into `userData` without ever overwriting existing user data.
 * 3. Legacy or local `matches/` directories are safely migrated into `userData/matches`
 *    without overwriting any existing match files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_MODES } from '../../src/shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_APP_ROOT = path.resolve(__dirname, '../..');

/**
 * Resolves the bundled (read-only) application root or resources directory.
 *
 * @param {{
 *   isPackaged?: boolean,
 *   resourcesPath?: string,
 *   appRootDir?: string
 * }} [env]
 */
export function resolveBundledResourcesDir(env = {}) {
  const isPackaged = Boolean(env.isPackaged);
  const resourcesPath = env.resourcesPath || process.resourcesPath;
  const appRootDir = env.appRootDir || DEFAULT_APP_ROOT;

  if (isPackaged && resourcesPath && fs.existsSync(resourcesPath)) {
    return path.resolve(resourcesPath);
  }
  return path.resolve(appRootDir);
}

/**
 * Resolves the directory containing immutable bundled match templates
 * (`template_bgmi.csv` and `template_ff.csv`).
 *
 * @param {{
 *   isPackaged?: boolean,
 *   resourcesPath?: string,
 *   appRootDir?: string
 * }} [env]
 */
export function resolveBundledTemplatesDir(env = {}) {
  const resourcesDir = resolveBundledResourcesDir(env);
  const appRootDir = env.appRootDir || DEFAULT_APP_ROOT;

  const candidates = [
    path.join(resourcesDir, 'templates'),
    path.join(resourcesDir, 'matches'),
    path.join(appRootDir, 'matches'),
  ];

  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, GAME_MODES.BGMI.templateFile)) ||
      fs.existsSync(path.join(dir, GAME_MODES.FREE_FIRE.templateFile))
    ) {
      return dir;
    }
  }

  return path.join(appRootDir, 'matches');
}

/**
 * Resolves the writable `matches` directory for storing live match CSVs and `.match_meta.json`.
 * - If `customMatchesDir` is explicitly provided (e.g. unit tests or dev server), uses it.
 * - If running in packaged Electron (or when `userDataPath` is provided with `preferUserData`),
 *   uses `<userDataPath>/matches` so installer updates or read-only `Program Files` never break saves.
 * - Otherwise falls back to `<appRootDir>/matches` in local development.
 *
 * @param {{
 *   customMatchesDir?: string,
 *   isPackaged?: boolean,
 *   userDataPath?: string,
 *   appRootDir?: string
 * }} [env]
 */
export function resolveWritableMatchesDir(env = {}) {
  if (env.customMatchesDir) {
    return path.resolve(env.customMatchesDir);
  }

  if (env.isPackaged && env.userDataPath) {
    return path.join(path.resolve(env.userDataPath), 'matches');
  }

  const appRootDir = env.appRootDir || DEFAULT_APP_ROOT;
  return path.join(path.resolve(appRootDir), 'matches');
}

/**
 * Resolves the active `tournament_config.json` path.
 * Checks `<userDataPath>/tournament_config.json` first when packaged so operators can
 * customize scoring rules in a writable location, falling back to the bundled config.
 *
 * @param {{
 *   isPackaged?: boolean,
 *   userDataPath?: string,
 *   resourcesPath?: string,
 *   appRootDir?: string
 * }} [env]
 */
export function resolveTournamentConfigPath(env = {}) {
  const appRootDir = env.appRootDir || DEFAULT_APP_ROOT;
  const resourcesDir = resolveBundledResourcesDir(env);

  if (env.isPackaged && env.userDataPath) {
    const userConfigPath = path.join(
      path.resolve(env.userDataPath),
      'tournament_config.json'
    );
    if (fs.existsSync(userConfigPath)) {
      return userConfigPath;
    }
  }

  const candidates = [
    path.join(resourcesDir, 'tournament_config.json'),
    path.join(appRootDir, 'tournament_config.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(appRootDir, 'tournament_config.json');
}

/**
 * Safely seeds bundled templates/config into the writable user data directory and
 * migrates any existing match CSV files from a legacy directory without ever
 * overwriting existing user files.
 *
 * @param {{
 *   writableMatchesDir: string,
 *   bundledTemplatesDir?: string,
 *   legacyMatchesDirs?: string[],
 *   userDataPath?: string,
 *   bundledConfigPath?: string
 * }} options
 */
export async function seedAndMigrateWritableData(options) {
  const writableMatchesDir = path.resolve(options.writableMatchesDir);
  await fs.promises.mkdir(writableMatchesDir, { recursive: true });

  const seededTemplates = [];
  const migratedMatches = [];

  // 1. Copy immutable templates if missing in writableMatchesDir
  const templateFiles = [
    GAME_MODES.BGMI.templateFile,
    GAME_MODES.FREE_FIRE.templateFile,
  ];

  if (options.bundledTemplatesDir && fs.existsSync(options.bundledTemplatesDir)) {
    const srcTemplatesDir = path.resolve(options.bundledTemplatesDir);
    if (srcTemplatesDir !== writableMatchesDir) {
      for (const tplName of templateFiles) {
        const srcFile = path.join(srcTemplatesDir, tplName);
        const destFile = path.join(writableMatchesDir, tplName);
        if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
          try {
            await fs.promises.copyFile(srcFile, destFile);
            seededTemplates.push(tplName);
          } catch {
            // CsvController.ensureDirectoryAndTemplates() will synthesize defaults if copy fails
          }
        }
      }
    }
  }

  // 2. Non-destructive migration of existing match CSVs & .match_meta.json from legacy directories
  const legacyDirs = Array.isArray(options.legacyMatchesDirs)
    ? options.legacyMatchesDirs
    : [];

  for (const rawLegacyDir of legacyDirs) {
    if (!rawLegacyDir) continue;
    const legacyDir = path.resolve(rawLegacyDir);
    if (legacyDir === writableMatchesDir || !fs.existsSync(legacyDir)) {
      continue;
    }

    try {
      const entries = await fs.promises.readdir(legacyDir, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const isMatchCsv =
          entry.name.endsWith('.csv') && !entry.name.startsWith('.tmp-');
        const isMetaJson = entry.name === '.match_meta.json';
        if (!isMatchCsv && !isMetaJson) continue;

        const srcPath = path.join(legacyDir, entry.name);
        const destPath = path.join(writableMatchesDir, entry.name);

        // NEVER overwrite an existing file in writableMatchesDir
        if (!fs.existsSync(destPath)) {
          await fs.promises.copyFile(srcPath, destPath);
          migratedMatches.push(entry.name);
        }
      }
    } catch {
      // Ignore unreadable legacy directories
    }
  }

  // 3. Seed userData/tournament_config.json if userDataPath is provided and file does not exist
  let seededConfig = false;
  if (
    options.userDataPath &&
    options.bundledConfigPath &&
    fs.existsSync(options.bundledConfigPath)
  ) {
    const userConfigDest = path.join(
      path.resolve(options.userDataPath),
      'tournament_config.json'
    );
    if (
      path.resolve(options.bundledConfigPath) !== userConfigDest &&
      !fs.existsSync(userConfigDest)
    ) {
      try {
        await fs.promises.mkdir(path.dirname(userConfigDest), {
          recursive: true,
        });
        await fs.promises.copyFile(options.bundledConfigPath, userConfigDest);
        seededConfig = true;
      } catch {
        // Non-fatal
      }
    }
  }

  return {
    ok: true,
    writableMatchesDir,
    seededTemplates,
    migratedMatches,
    seededConfig,
  };
}
