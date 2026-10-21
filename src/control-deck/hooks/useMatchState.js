import { useState, useEffect, useCallback, useRef } from 'react';
import { getBroadcastController } from '../../shared/browserBridge.js';
import { TEAM_KEYS_AZ } from '../../shared/constants.js';
import { validatePlacementInput } from '../../../electron/utils/validation.js';

const VALID_TEAM_KEYS = new Set(TEAM_KEYS_AZ);

/**
 * Checks whether a DOM element is an editable text input, textarea, or select
 * where global single-key shortcuts must not intercept user typing.
 * @param {EventTarget | null} target
 */
function isEditableElement(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  return Boolean(target.isContentEditable);
}

/**
 * Authoritative Match State & Global Keyboard Control Hook
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 */
export function useMatchState({ onOperationalLog }) {
  const [matchState, setMatchState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heldTeamKey, setHeldTeamKey] = useState(null);
  const [placementBuffer, setPlacementBuffer] = useState('');
  const [validationBanner, setValidationBanner] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedKeyRef = useRef('A');
  const heldKeyRef = useRef(null);
  const placementBufferRef = useRef('');
  const matchStateRef = useRef(null);

  const showBanner = useCallback(
    (level, message) => {
      setValidationBanner({
        id: `${Date.now()}-${Math.random()}`,
        level,
        message,
        timestamp: new Date().toISOString(),
      });
      if (onOperationalLog) {
        onOperationalLog({
          level,
          category: level === 'error' ? 'VALIDATION' : 'MATCH_ENGINE',
          message,
        });
      }
    },
    [onOperationalLog]
  );

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    matchStateRef.current = snapshot;
    selectedKeyRef.current = snapshot.selectedTeamKey || 'A';
    setMatchState(snapshot);
    setLoading(false);
  }, []);

  // 1. Subscribe to authoritative main-process match state and notifications
  useEffect(() => {
    const controller = getBroadcastController();
    let isMounted = true;

    controller
      .getMatchState()
      .then((res) => {
        if (!isMounted) return;
        if (res && res.ok && res.snapshot) {
          applySnapshot(res.snapshot);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    const unsubState = controller.onMatchState((snapshot) => {
      if (!isMounted || !snapshot) return;
      applySnapshot(snapshot);
    });

    const unsubNote = controller.onMatchNotification((note) => {
      if (!isMounted || !note) return;
      setValidationBanner({
        id: note.id || `${Date.now()}`,
        level: note.level || 'info',
        message: note.message,
        timestamp: note.timestamp || new Date().toISOString(),
      });
      if (onOperationalLog) {
        onOperationalLog({
          id: note.id,
          level: note.level || 'info',
          category: note.category || 'MATCH',
          message: note.message,
          timestamp: note.timestamp,
        });
      }
    });

    return () => {
      isMounted = false;
      if (typeof unsubState === 'function') unsubState();
      if (typeof unsubNote === 'function') unsubNote();
    };
  }, [applySnapshot, onOperationalLog]);

  // 2. Authoritative Command Dispatchers
  const setActiveGame = useCallback(
    async (game) => {
      const controller = getBroadcastController();
      const res = await controller.setActiveGame(game);
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
        showBanner(
          'info',
          res.snapshot.lastEvent?.message || `Switched game mode to ${game}.`
        );
      } else if (res?.error) {
        showBanner('error', res.error);
      }
      return res;
    },
    [applySnapshot, showBanner]
  );

  const selectTeam = useCallback(
    async (key) => {
      const controller = getBroadcastController();
      setPlacementBuffer('');
      placementBufferRef.current = '';
      selectedKeyRef.current = key;
      const res = await controller.selectTeam(key);
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
      } else if (res?.error) {
        showBanner('error', res.error);
      }
      return res;
    },
    [applySnapshot, showBanner]
  );

  const incrementKill = useCallback(
    async (key) => {
      const controller = getBroadcastController();
      const targetKey = key || heldKeyRef.current || selectedKeyRef.current;
      const res = await controller.incrementKill(targetKey);
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
        if (onOperationalLog && res.snapshot.lastEvent) {
          onOperationalLog({
            id: res.snapshot.lastEvent.eventId,
            level: 'success',
            category: 'KILL_PLUS',
            message: res.snapshot.lastEvent.message,
            timestamp: res.snapshot.lastEvent.timestamp,
          });
        }
      } else if (res?.error) {
        showBanner('error', res.error);
      }
      return res;
    },
    [applySnapshot, onOperationalLog, showBanner]
  );

  const decrementKill = useCallback(
    async (key) => {
      const controller = getBroadcastController();
      const targetKey = key || heldKeyRef.current || selectedKeyRef.current;
      const res = await controller.decrementKill(targetKey);
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
        if (onOperationalLog && res.snapshot.lastEvent) {
          onOperationalLog({
            id: res.snapshot.lastEvent.eventId,
            level: 'info',
            category: 'KILL_MINUS',
            message: res.snapshot.lastEvent.message,
            timestamp: res.snapshot.lastEvent.timestamp,
          });
        }
      } else if (res?.error) {
        showBanner('warning', res.error);
      }
      return res;
    },
    [applySnapshot, onOperationalLog, showBanner]
  );

  const setPlacement = useCallback(
    async (key, position) => {
      const controller = getBroadcastController();
      const targetKey = key || heldKeyRef.current || selectedKeyRef.current;
      const maxTeams = matchStateRef.current?.teams?.length || 26;
      const check = validatePlacementInput(position, maxTeams);
      if (!check.valid) {
        showBanner('error', check.error);
        return { ok: false, error: check.error };
      }

      const res = await controller.setPlacement(targetKey, check.position);
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
        showBanner('success', res.snapshot.lastEvent?.message || 'Placement updated.');
      } else if (res?.error) {
        showBanner('error', res.error);
      }
      return res;
    },
    [applySnapshot, showBanner]
  );

  const adjustPlacement = useCallback(
    async (key, direction) => {
      const controller = getBroadcastController();
      const targetKey = key || heldKeyRef.current || selectedKeyRef.current;
      const res = await controller.adjustPlacement(targetKey, direction);
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
        showBanner('info', res.snapshot.lastEvent?.message || `Adjusted placement ${direction}.`);
      } else if (res?.error) {
        showBanner('warning', res.error);
      }
      return res;
    },
    [applySnapshot, showBanner]
  );

  const updateTeamRoster = useCallback(
    async (payload) => {
      const controller = getBroadcastController();
      setIsBusy(true);
      try {
        const res = await controller.updateTeamRoster(payload);
        if (res?.ok && res.snapshot) {
          applySnapshot(res.snapshot);
          showBanner('success', res.snapshot.lastEvent?.message || 'Roster updated.');
        } else if (res?.error) {
          showBanner('error', res.error);
        }
        return res;
      } finally {
        setIsBusy(false);
      }
    },
    [applySnapshot, showBanner]
  );

  const undoLastAction = useCallback(async () => {
    const controller = getBroadcastController();
    const res = await controller.undoLastAction();
    if (res?.ok && res.snapshot) {
      applySnapshot(res.snapshot);
      showBanner('info', res.snapshot.lastEvent?.message || 'Undid last action.');
    } else if (res?.error) {
      showBanner('warning', res.error);
    }
    return res;
  }, [applySnapshot, showBanner]);

  const createMatch = useCallback(
    async (options) => {
      const controller = getBroadcastController();
      setIsBusy(true);
      try {
        const res = await controller.createMatch(options);
        if (res?.ok && res.snapshot) {
          applySnapshot(res.snapshot);
        } else if (res?.error) {
          showBanner('error', res.error);
        }
        return res;
      } finally {
        setIsBusy(false);
      }
    },
    [applySnapshot, showBanner]
  );

  const loadMatch = useCallback(
    async (matchId) => {
      const controller = getBroadcastController();
      setIsBusy(true);
      try {
        const res = await controller.loadMatch(matchId);
        if (res?.ok && res.snapshot) {
          applySnapshot(res.snapshot);
        } else if (res?.error) {
          showBanner('error', res.error);
        }
        return res;
      } finally {
        setIsBusy(false);
      }
    },
    [applySnapshot, showBanner]
  );

  const saveMatch = useCallback(async () => {
    const controller = getBroadcastController();
    setIsBusy(true);
    try {
      const res = await controller.saveMatch();
      if (res?.ok && res.snapshot) {
        applySnapshot(res.snapshot);
      } else if (res?.error) {
        showBanner('error', res.error);
      }
      return res;
    } finally {
      setIsBusy(false);
    }
  }, [applySnapshot, showBanner]);

  const importRoster = useCallback(
    async (payload) => {
      const controller = getBroadcastController();
      setIsBusy(true);
      try {
        const res = await controller.importRoster(payload);
        if (res?.ok && res.snapshot) {
          applySnapshot(res.snapshot);
        } else if (res?.error) {
          showBanner('error', res.error);
        }
        return res;
      } finally {
        setIsBusy(false);
      }
    },
    [applySnapshot, showBanner]
  );

  const exportMatch = useCallback(async () => {
    const controller = getBroadcastController();
    return controller.exportMatch();
  }, []);

  const createNextRound = useCallback(
    async (options) => {
      const controller = getBroadcastController();
      setIsBusy(true);
      try {
        const res = await controller.createNextRound(options);
        if (res?.ok && res.snapshot) {
          applySnapshot(res.snapshot);
        } else if (res?.error) {
          showBanner('error', res.error);
        }
        return res;
      } finally {
        setIsBusy(false);
      }
    },
    [applySnapshot, showBanner]
  );

  const completeMatch = useCallback(async () => {
    const controller = getBroadcastController();
    const res = await controller.completeMatch();
    if (res?.ok && res.snapshot) {
      applySnapshot(res.snapshot);
    } else if (res?.error) {
      showBanner('error', res.error);
    }
    return res;
  }, [applySnapshot, showBanner]);

  const reopenMatch = useCallback(async () => {
    const controller = getBroadcastController();
    const res = await controller.reopenMatch();
    if (res?.ok && res.snapshot) {
      applySnapshot(res.snapshot);
    } else if (res?.error) {
      showBanner('error', res.error);
    }
    return res;
  }, [applySnapshot, showBanner]);

  // 3. Global Keyboard State Machine (keydown / keyup)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Never intercept typing inside inputs, textareas, selects, or contentEditable
      if (isEditableElement(e.target)) {
        return;
      }

      // Preserve OS/Browser modifier combinations except Ctrl+Z / Cmd+Z for Undo
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.shiftKey &&
          !e.altKey &&
          e.key.toLowerCase() === 'z'
        ) {
          e.preventDefault();
          if (!e.repeat) {
            undoLastAction();
          }
        }
        return;
      }

      // Ignore OS key auto-repeat for all scoring/selection/placement actions
      if (e.repeat) {
        return;
      }

      const key = e.key;
      const upper = key.toUpperCase();

      // A. Team Selection (A-Z)
      if (upper.length === 1 && VALID_TEAM_KEYS.has(upper)) {
        e.preventDefault();
        heldKeyRef.current = upper;
        setHeldTeamKey(upper);
        selectTeam(upper);
        return;
      }

      const activeKey = heldKeyRef.current || selectedKeyRef.current;
      if (!activeKey) return;

      // B. Kill-Point Increment ('=' or '+')
      if (key === '=' || key === '+') {
        e.preventDefault();
        incrementKill(activeKey);
        return;
      }

      // C. Kill-Point Decrement ('-' or '_')
      if (key === '-' || key === '_') {
        e.preventDefault();
        decrementKill(activeKey);
        return;
      }

      // D. Direct Placement Digit Entry ('0'-'9', Enter, Backspace, Escape)
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        const nextBuffer = (placementBufferRef.current + key).slice(0, 2);
        placementBufferRef.current = nextBuffer;
        setPlacementBuffer(nextBuffer);
        return;
      }

      if (key === 'Backspace' && placementBufferRef.current.length > 0) {
        e.preventDefault();
        const nextBuffer = placementBufferRef.current.slice(0, -1);
        placementBufferRef.current = nextBuffer;
        setPlacementBuffer(nextBuffer);
        return;
      }

      if (key === 'Escape') {
        if (placementBufferRef.current.length > 0) {
          e.preventDefault();
          placementBufferRef.current = '';
          setPlacementBuffer('');
          showBanner('info', 'Cleared placement digit buffer.');
        }
        return;
      }

      if (key === 'Enter' && placementBufferRef.current.length > 0) {
        e.preventDefault();
        const rawDigits = placementBufferRef.current;
        placementBufferRef.current = '';
        setPlacementBuffer('');
        setPlacement(activeKey, Number(rawDigits));
        return;
      }

      // E. Manual Placement Adjustment (ArrowUp / ArrowDown)
      if (key === 'ArrowUp') {
        e.preventDefault();
        adjustPlacement(activeKey, 'UP');
        return;
      }

      if (key === 'ArrowDown') {
        e.preventDefault();
        adjustPlacement(activeKey, 'DOWN');
        return;
      }
    };

    const handleKeyUp = (e) => {
      const upper = e.key.toUpperCase();
      if (upper.length === 1 && VALID_TEAM_KEYS.has(upper)) {
        if (heldKeyRef.current === upper) {
          heldKeyRef.current = null;
          setHeldTeamKey(null);
        }
      }
    };

    const handleWindowBlur = () => {
      heldKeyRef.current = null;
      setHeldTeamKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    selectTeam,
    incrementKill,
    decrementKill,
    setPlacement,
    adjustPlacement,
    undoLastAction,
    showBanner,
  ]);

  return {
    matchState,
    loading,
    isBusy,
    heldTeamKey,
    placementBuffer,
    validationBanner,
    clearValidationBanner: () => setValidationBanner(null),
    clearPlacementBuffer: () => {
      placementBufferRef.current = '';
      setPlacementBuffer('');
    },
    submitPlacementBuffer: () => {
      if (!placementBufferRef.current) return;
      const rawDigits = placementBufferRef.current;
      placementBufferRef.current = '';
      setPlacementBuffer('');
      const activeKey = heldKeyRef.current || selectedKeyRef.current || 'A';
      return setPlacement(activeKey, Number(rawDigits));
    },
    setActiveGame,
    selectTeam,
    incrementKill,
    decrementKill,
    setPlacement,
    adjustPlacement,
    updateTeamRoster,
    undoLastAction,
    createMatch,
    loadMatch,
    saveMatch,
    importRoster,
    exportMatch,
    createNextRound,
    completeMatch,
    reopenMatch,
  };
}
