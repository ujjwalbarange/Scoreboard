/**
 * Fuzzy Team & Roster Search Engine
 * Phase 3: Esports Broadcast Controller & Live Overlay System
 *
 * Allows tournament operators to rapidly find teams by:
 * - Slot Key ('A'-'Z', '[A]', '#A')
 * - Exact or partial team name substring ('god', 'soul', 'xspark')
 * - Player handle substring ('jonathan', 'manya', 'pahadi')
 * - Minor spelling differences / typos via bounded Levenshtein edit distance
 *   and character subsequence matching ('godlke' -> 'GODLIKE', 'jonthn' -> 'Jonathan')
 */

/**
 * Normalizes a string for case-insensitive alphanumeric comparison.
 * @param {string} value
 * @returns {string}
 */
export function normalizeSearchToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes the Levenshtein edit distance between two normalized strings.
 * Includes adjacent transposition (Damerau-Levenshtein) support for common operator typing slips.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function computeEditDistance(a, b) {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const matrix = Array.from({ length: lenA + 1 }, () =>
    new Array(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Adjacent transposition
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[lenA][lenB];
}

/**
 * Checks whether `needle` appears as an ordered character subsequence inside `haystack`.
 * Example: 'gdlk' in 'godlike' -> true.
 *
 * @param {string} needle
 * @param {string} haystack
 * @returns {boolean}
 */
export function isSubsequence(needle, haystack) {
  if (!needle) return true;
  if (needle.length > haystack.length) return false;
  let nIdx = 0;
  for (let hIdx = 0; hIdx < haystack.length && nIdx < needle.length; hIdx++) {
    if (haystack[hIdx] === needle[nIdx]) {
      nIdx++;
    }
  }
  return nIdx === needle.length;
}

/**
 * Computes a match score for a single query token against a candidate text string.
 * Returns 0 if the token does not match. Higher score = stronger match.
 *
 * @param {string} queryToken
 * @param {string} candidateText
 * @returns {number}
 */
function scoreTokenAgainstText(queryToken, candidateText) {
  if (!queryToken || !candidateText) return 0;

  const normCandidate = normalizeSearchToken(candidateText);
  if (!normCandidate) return 0;

  // 1. Exact full match
  if (normCandidate === queryToken) {
    return 100;
  }

  // 2. Prefix match on whole string
  if (normCandidate.startsWith(queryToken)) {
    return 90;
  }

  const words = normCandidate.split(' ').filter(Boolean);

  // 3. Exact word match or word prefix match
  for (const word of words) {
    if (word === queryToken) return 85;
    if (word.startsWith(queryToken)) return 78;
  }

  // 4. Direct substring match
  if (normCandidate.includes(queryToken)) {
    return 70;
  }

  // 5. Fuzzy typo tolerance on individual words (for tokens >= 3 chars)
  if (queryToken.length >= 3) {
    const maxAllowedDistance = queryToken.length >= 6 ? 2 : 1;

    for (const word of words) {
      if (Math.abs(word.length - queryToken.length) <= maxAllowedDistance) {
        const dist = computeEditDistance(queryToken, word);
        if (dist <= maxAllowedDistance) {
          return 60 - dist * 12;
        }
      }

      // Also check prefix slice of longer words (e.g. 'jonthn' vs 'jonathan')
      if (word.length > queryToken.length) {
        const prefixSlice = word.slice(
          0,
          Math.min(word.length, queryToken.length + 1)
        );
        const dist = computeEditDistance(queryToken, prefixSlice);
        if (dist <= maxAllowedDistance) {
          return 54 - dist * 12;
        }
      }
    }

    // 6. Compacted subsequence match if First Character matches (e.g. 'gdlk' -> 'godlike')
    const compactCandidate = words.join('');
    if (
      compactCandidate[0] === queryToken[0] &&
      isSubsequence(queryToken, compactCandidate)
    ) {
      return 42;
    }
  }

  return 0;
}

/**
 * Scores a team record against a raw search query.
 * Returns 0 when the team does not match.
 *
 * @param {object} team
 * @param {string} rawQuery
 * @returns {number}
 */
export function scoreTeamFuzzyMatch(team, rawQuery) {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) return 1;

  const slotKey = String(team?.Key || team?.slotKey || '').toUpperCase();
  const teamName = String(team?.TeamName || team?.teamName || '');
  const players = Array.isArray(team?.players)
    ? team.players
    : [team?.Player1, team?.Player2, team?.Player3, team?.Player4].filter(
        Boolean
      );

  // Direct single-character or bracketed slot key query (e.g. "a", "[a]", "slot a")
  const slotMatch = trimmed.match(/^(?:slot\s*)?\[?([a-zA-Z])\]?$/i);
  if (slotMatch) {
    const targetSlot = slotMatch[1].toUpperCase();
    if (slotKey === targetSlot) {
      return 120;
    }
    // Still check if team name starts with that letter
    if (teamName.toUpperCase().startsWith(targetSlot)) {
      return 75;
    }
    return 0;
  }

  const queryTokens = normalizeSearchToken(trimmed).split(' ').filter(Boolean);
  if (queryTokens.length === 0) return 1;

  let totalScore = 0;

  for (const token of queryTokens) {
    // Score against slotKey, TeamName, and each Player handle
    const keyScore = slotKey.toLowerCase() === token ? 110 : 0;
    const nameScore = scoreTokenAgainstText(token, teamName);
    let bestPlayerScore = 0;
    for (const player of players) {
      const pScore = scoreTokenAgainstText(token, String(player || ''));
      if (pScore > bestPlayerScore) {
        bestPlayerScore = pScore;
      }
    }

    // Weight TeamName higher than Player handle so team name hits rank first
    const bestTokenScore = Math.max(
      keyScore,
      nameScore,
      bestPlayerScore > 0 ? Math.round(bestPlayerScore * 0.85) : 0
    );

    // Every token in a multi-word query must match at least one field
    if (bestTokenScore <= 0) {
      return 0;
    }

    totalScore += bestTokenScore;
  }

  return totalScore / queryTokens.length;
}

/**
 * Filters and ranks an array of teams using fuzzy matching.
 * When `rawQuery` is empty, preserves the original order of `teams`.
 *
 * @template T
 * @param {T[]} teams
 * @param {string} rawQuery
 * @returns {T[]}
 */
export function filterTeamsByFuzzySearch(teams, rawQuery) {
  if (!Array.isArray(teams)) return [];
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) return teams;

  const scored = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const score = scoreTeamFuzzyMatch(team, trimmed);
    if (score > 0) {
      scored.push({ team, score, originalIndex: i });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((entry) => entry.team);
}
