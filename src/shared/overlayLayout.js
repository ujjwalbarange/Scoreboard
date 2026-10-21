/**
 * Landscape Two-Column Scorecard & Three-Column Controller Grid Layout Helpers
 * Phase 3 Addendum: Window Controls & Landscape Scorecard Layout
 */

/**
 * Distributes leaderboard teams evenly across two balanced columns (Left & Right)
 * for a 16:9 landscape broadcast scorecard, preserving strict rank order.
 *
 * For 26 teams:
 * - Left Column: Ranks #01–#13 (13 teams)
 * - Right Column: Ranks #14–#26 (13 teams)
 *
 * @param {Array<Record<string, any>>} teams
 * @param {number} [rowLimit=26]
 */
export function splitTeamsIntoBalancedColumns(teams, rowLimit = 26) {
  const safeList = Array.isArray(teams) ? teams : [];
  const limit =
    typeof rowLimit === 'number' && Number.isFinite(rowLimit) && rowLimit > 0
      ? Math.min(safeList.length, Math.floor(rowLimit))
      : safeList.length;

  const displayed = safeList.slice(0, limit);
  const rowsPerColumn = Math.max(1, Math.ceil(displayed.length / 2));
  const leftColumn = displayed.slice(0, rowsPerColumn);
  const rightColumn = displayed.slice(rowsPerColumn);

  return {
    displayed,
    leftColumn,
    rightColumn,
    rowsPerColumn,
    totalDisplayed: displayed.length,
  };
}

/**
 * Computes the Control Deck team selector grid layout configuration based on
 * whether the Overview panel is visible or hidden.
 *
 * @param {{ isOverviewVisible: boolean, totalTeams?: number }} options
 */
export function getTeamGridLayoutConfig(options = { isOverviewVisible: true }) {
  const isOverviewVisible = Boolean(options?.isOverviewVisible);
  const totalTeams =
    typeof options?.totalTeams === 'number' && options.totalTeams > 0
      ? options.totalTeams
      : 26;

  if (!isOverviewVisible) {
    return {
      columns: 3,
      compact: true,
      reclaimedOverviewSpace: true,
      rowsNeeded: Math.ceil(totalTeams / 3),
      gridClassName: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2',
    };
  }

  return {
    columns: 2,
    compact: false,
    reclaimedOverviewSpace: false,
    rowsNeeded: Math.ceil(totalTeams / 2),
    gridClassName: 'grid grid-cols-1 md:grid-cols-2 gap-3',
  };
}
