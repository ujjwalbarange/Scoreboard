/**
 * Validation & RFC-4180 CSV Parsing/Serialization Utilities
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Enforces all 10-column CSV invariants:
 * Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT
 * - Keys are unique A-Z identifiers.
 * - pos is an integer from 0 to N (where N = number of teams, up to 26).
 * - KP >= 0, PP >= 0, TT === KP + PP.
 * - No two eliminated teams (pos > 0) may share the same positive rank.
 * - Handles commas, quotes, and newlines in CSV fields properly.
 */

import { CSV_SCHEMA_HEADERS, TEAM_KEYS_AZ } from '../../src/shared/constants.js';
import { createCanonicalTeam } from '../../src/shared/match-types.js';
import { recalculateTeam } from '../match/scoring-engine.js';

const VALID_KEYS_SET = new Set(TEAM_KEYS_AZ);

/**
 * Validates a single team key (A-Z).
 * @param {unknown} key
 * @returns {{ valid: boolean, key?: string, error?: string }}
 */
export function validateTeamKey(key) {
  if (typeof key !== 'string') {
    return { valid: false, error: 'Team key must be a string A–Z.' };
  }
  const normalized = key.trim().toUpperCase();
  if (!VALID_KEYS_SET.has(normalized)) {
    return {
      valid: false,
      error: `Invalid team key "${key}". Must be a single letter A–Z.`,
    };
  }
  return { valid: true, key: normalized };
}

/**
 * Validates a direct placement input value (integer 0..maxTeams).
 * @param {unknown} rawPos
 * @param {number} maxTeams
 * @returns {{ valid: boolean, position?: number, error?: string }}
 */
export function validatePlacementInput(rawPos, maxTeams = 26) {
  if (rawPos === '' || rawPos === null || rawPos === undefined) {
    return { valid: false, error: 'Placement rank cannot be empty.' };
  }
  const str = String(rawPos).trim();
  if (!/^\d+$/.test(str)) {
    return {
      valid: false,
      error: `Invalid placement "${rawPos}". Enter an integer from 0 (Alive) to ${maxTeams}.`,
    };
  }
  const num = Number(str);
  if (!Number.isInteger(num) || num < 0 || num > maxTeams) {
    return {
      valid: false,
      error: `Placement rank ${num} is out of bounds. Allowed range is 0 to ${maxTeams}.`,
    };
  }
  return { valid: true, position: num };
}

/**
 * Escapes a single CSV field per RFC 4180.
 * Wraps in double quotes if the value contains a comma, double quote, CR, or LF.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parses an RFC-4180 CSV string (supporting quoted fields with commas, escaped quotes "", and newlines)
 * into an array of string rows.
 * @param {string} csvText
 * @returns {{ ok: boolean, rows?: string[][], error?: string }}
 */
export function parseRawCsvGrid(csvText) {
  if (typeof csvText !== 'string') {
    return { ok: false, error: 'CSV content must be a string.' };
  }

  // Strip UTF-8 BOM if present
  const text = csvText.replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        currentField += ch;
        i += 1;
        continue;
      }
    } else {
      if (ch === '"') {
        if (currentField.length > 0) {
          return {
            ok: false,
            error: `Malformed CSV: unexpected quote inside unquoted field near index ${i}.`,
          };
        }
        inQuotes = true;
        i += 1;
        continue;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i += 1;
        continue;
      } else if (ch === '\r') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i += 2;
        } else {
          i += 1;
        }
        continue;
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i += 1;
        continue;
      } else {
        currentField += ch;
        i += 1;
      }
    }
  }

  if (inQuotes) {
    return {
      ok: false,
      error: 'Malformed CSV: unclosed quoted field at end of file.',
    };
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out completely empty trailing lines
  const nonEmptyRows = rows.filter(
    (r) => !(r.length === 1 && r[0].trim() === '')
  );

  return { ok: true, rows: nonEmptyRows };
}

/**
 * Parses and validates a complete 10-column match CSV text into canonical, score-verified teams.
 *
 * @param {string} csvText
 * @param {string} game
 * @param {object} config
 * @param {{ resetScores?: boolean }} [options]
 * @returns {{ ok: boolean, teams?: Array<any>, error?: string }}
 */
export function parseAndValidateMatchCsv(
  csvText,
  game = 'BGMI',
  config = null,
  options = {}
) {
  const parsedGrid = parseRawCsvGrid(csvText);
  if (!parsedGrid.ok || !parsedGrid.rows) {
    return { ok: false, error: parsedGrid.error || 'Failed to parse CSV.' };
  }

  const rows = parsedGrid.rows;
  if (rows.length < 2) {
    return {
      ok: false,
      error: 'CSV file must contain a header row and at least one team row.',
    };
  }

  const headerRow = rows[0].map((h) => h.trim());
  if (headerRow.length !== CSV_SCHEMA_HEADERS.length) {
    return {
      ok: false,
      error: `Invalid CSV header column count: expected ${CSV_SCHEMA_HEADERS.length} columns (${CSV_SCHEMA_HEADERS.join(
        ','
      )}), got ${headerRow.length}.`,
    };
  }

  for (let c = 0; c < CSV_SCHEMA_HEADERS.length; c++) {
    if (headerRow[c].toLowerCase() !== CSV_SCHEMA_HEADERS[c].toLowerCase()) {
      return {
        ok: false,
        error: `Invalid CSV header at column ${c + 1}: expected "${
          CSV_SCHEMA_HEADERS[c]
        }", found "${headerRow[c]}".`,
      };
    }
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0 || dataRows.length > 26) {
    return {
      ok: false,
      error: `Invalid team count in CSV: expected between 1 and 26 teams, found ${dataRows.length}.`,
    };
  }

  const maxTeams = dataRows.length;
  const seenKeys = new Set();
  const seenPositivePlacements = new Set();
  const validatedTeams = [];

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const lineNum = r + 2;

    if (row.length !== 10) {
      return {
        ok: false,
        error: `CSV line ${lineNum} has ${row.length} columns; expected exactly 10 columns.`,
      };
    }

    const [
      rawKey,
      rawTeamName,
      rawP1,
      rawP2,
      rawP3,
      rawP4,
      rawPos,
      rawKP,
      rawPP,
      rawTT,
    ] = row;

    const keyCheck = validateTeamKey(rawKey);
    if (!keyCheck.valid || !keyCheck.key) {
      return {
        ok: false,
        error: `CSV line ${lineNum}: ${keyCheck.error}`,
      };
    }

    if (seenKeys.has(keyCheck.key)) {
      return {
        ok: false,
        error: `CSV line ${lineNum}: duplicate team Key "${keyCheck.key}". All keys must be unique.`,
      };
    }
    seenKeys.add(keyCheck.key);

    const teamName = rawTeamName.trim();
    if (!teamName) {
      return {
        ok: false,
        error: `CSV line ${lineNum} (Team ${keyCheck.key}): TeamName cannot be empty.`,
      };
    }

    if (!/^-?\d+$/.test(rawPos.trim())) {
      return {
        ok: false,
        error: `CSV line ${lineNum} (Team ${keyCheck.key}): placement "pos" must be an integer.`,
      };
    }
    const pos = options.resetScores ? 0 : Number(rawPos.trim());
    if (!Number.isInteger(pos) || pos < 0 || pos > maxTeams) {
      return {
        ok: false,
        error: `CSV line ${lineNum} (Team ${keyCheck.key}): placement pos=${pos} is out of valid range 0..${maxTeams}.`,
      };
    }

    if (pos > 0) {
      if (seenPositivePlacements.has(pos)) {
        return {
          ok: false,
          error: `CSV line ${lineNum} (Team ${keyCheck.key}): duplicate positive placement rank #${pos}.`,
        };
      }
      seenPositivePlacements.add(pos);
    }

    if (
      !options.resetScores &&
      (!/^-?\d+$/.test(rawKP.trim()) ||
        !/^-?\d+$/.test(rawPP.trim()) ||
        !/^-?\d+$/.test(rawTT.trim()))
    ) {
      return {
        ok: false,
        error: `CSV line ${lineNum} (Team ${keyCheck.key}): KP, PP, and TT must be non-negative integers.`,
      };
    }

    const kp = options.resetScores ? 0 : Number(rawKP.trim());
    const ppFromFile = options.resetScores ? 0 : Number(rawPP.trim());
    const ttFromFile = options.resetScores ? 0 : Number(rawTT.trim());

    if (kp < 0 || ppFromFile < 0 || ttFromFile < 0) {
      return {
        ok: false,
        error: `CSV line ${lineNum} (Team ${keyCheck.key}): negative point values are not allowed.`,
      };
    }

    const baseTeam = createCanonicalTeam({
      Key: keyCheck.key,
      TeamName: teamName,
      Player1: rawP1.trim() || `${keyCheck.key}·Player1`,
      Player2: rawP2.trim() || `${keyCheck.key}·Player2`,
      Player3: rawP3.trim() || `${keyCheck.key}·Player3`,
      Player4: rawP4.trim() || `${keyCheck.key}·Player4`,
      pos,
      KP: kp,
      PP: 0,
      TT: kp,
    });

    const recalculated = recalculateTeam(baseTeam, game, config);
    validatedTeams.push(recalculated);
  }

  return {
    ok: true,
    teams: validatedTeams,
  };
}

/**
 * Serializes an array of canonical teams to the exact 10-column CSV format.
 * Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT
 *
 * @param {Array<any>} teams
 * @returns {string}
 */
export function serializeTeamsToCsv(teams) {
  const headerLine = CSV_SCHEMA_HEADERS.join(',');
  const lines = [headerLine];

  for (const team of teams) {
    const row = [
      escapeCsvField(team.Key),
      escapeCsvField(team.TeamName),
      escapeCsvField(team.Player1),
      escapeCsvField(team.Player2),
      escapeCsvField(team.Player3),
      escapeCsvField(team.Player4),
      String(Number(team.pos) || 0),
      String(Number(team.KP) || 0),
      String(Number(team.PP) || 0),
      String(Number(team.TT) || 0),
    ];
    lines.push(row.join(','));
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Validates all invariant rules across an in-memory teams array before committing state.
 * @param {Array<any>} teams
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTeamsStateInvariants(teams) {
  if (!Array.isArray(teams) || teams.length === 0 || teams.length > 26) {
    return {
      valid: false,
      error: 'Teams array must contain between 1 and 26 teams.',
    };
  }

  const maxRank = teams.length;
  const keys = new Set();
  const positivePositions = new Set();

  for (const team of teams) {
    const keyRes = validateTeamKey(team.Key);
    if (!keyRes.valid) {
      return { valid: false, error: keyRes.error };
    }
    if (keys.has(keyRes.key)) {
      return {
        valid: false,
        error: `Duplicate team key "${keyRes.key}" detected.`,
      };
    }
    keys.add(keyRes.key);

    if (!Number.isInteger(team.pos) || team.pos < 0 || team.pos > maxRank) {
      return {
        valid: false,
        error: `Team ${team.Key} has invalid placement pos=${team.pos} (allowed 0..${maxRank}).`,
      };
    }

    if (team.pos > 0) {
      if (positivePositions.has(team.pos)) {
        return {
          valid: false,
          error: `Duplicate positive placement rank #${team.pos} on Team ${team.Key}.`,
        };
      }
      positivePositions.add(team.pos);
    }

    if (!Number.isInteger(team.KP) || team.KP < 0) {
      return {
        valid: false,
        error: `Team ${team.Key} has invalid KP=${team.KP}. Kill points cannot be negative.`,
      };
    }

    if (!Number.isInteger(team.PP) || team.PP < 0) {
      return {
        valid: false,
        error: `Team ${team.Key} has invalid PP=${team.PP}. Placement points cannot be negative.`,
      };
    }

    if (team.TT !== team.KP + team.PP) {
      return {
        valid: false,
        error: `Team ${team.Key} total points mismatch: TT (${team.TT}) !== KP (${team.KP}) + PP (${team.PP}).`,
      };
    }
  }

  return { valid: true };
}
