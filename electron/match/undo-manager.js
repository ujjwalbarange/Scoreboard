/**
 * Global Undo History Manager
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Maintains a bounded in-memory stack of complete valid match state snapshots.
 * Note: Undo history is kept in memory per match session and resets when the
 * application restarts or switches to a different match file.
 */

export class UndoManager {
  /**
   * @param {number} [maxDepth=50]
   */
  constructor(maxDepth = 50) {
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new Error('UndoManager maxDepth must be a positive integer.');
    }
    this.maxDepth = maxDepth;
    /** @type {Array<{ label: string, timestamp: string, snapshot: object }>} */
    this.stack = [];
  }

  /**
   * Deep-clones and pushes a valid pre-mutation state onto the undo stack.
   * Each logical command (including a multi-team placement cascade) produces
   * exactly one history entry.
   *
   * @param {object} stateSnapshot
   * @param {string} actionLabel
   */
  pushState(stateSnapshot, actionLabel = 'State Mutation') {
    const cloned = JSON.parse(JSON.stringify(stateSnapshot));
    this.stack.push({
      label: actionLabel,
      timestamp: new Date().toISOString(),
      snapshot: cloned,
    });

    if (this.stack.length > this.maxDepth) {
      this.stack.shift();
    }
  }

  /**
   * Pops and returns the most recent state snapshot without generating a new history entry.
   * @returns {{ ok: boolean, entry?: { label: string, timestamp: string, snapshot: object }, error?: string }}
   */
  popState() {
    if (this.stack.length === 0) {
      return {
        ok: false,
        error: 'No undo history available for the current match.',
      };
    }

    const entry = this.stack.pop();
    return {
      ok: true,
      entry: {
        label: entry.label,
        timestamp: entry.timestamp,
        snapshot: JSON.parse(JSON.stringify(entry.snapshot)),
      },
    };
  }

  /**
   * Clears the undo history (e.g., when creating or loading a different match).
   */
  clear() {
    this.stack = [];
  }

  /**
   * Returns current undo stack depth and last action label.
   */
  getMetadata() {
    const top = this.stack[this.stack.length - 1] || null;
    return {
      canUndo: this.stack.length > 0,
      depth: this.stack.length,
      maxDepth: this.maxDepth,
      lastActionLabel: top ? top.label : null,
      lastActionTimestamp: top ? top.timestamp : null,
    };
  }
}
