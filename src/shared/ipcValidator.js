/**
 * Pure IPC Channel & Payload Validation Logic
 * Used by Electron Main Process, Preload Script, and Browser Preview Bridge
 */

import {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_LISTEN_CHANNELS,
  GAME_MODES,
} from './constants.js';

/**
 * Generates a unique, deterministic-format diagnostic event ID.
 * @param {string} prefix
 * @returns {string}
 */
export function createEventId(prefix = 'evt') {
  const safePrefix =
    typeof prefix === 'string' && /^[a-zA-Z0-9_-]{1,12}$/.test(prefix)
      ? prefix
      : 'evt';
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${safePrefix.toUpperCase()}-${timePart}-${randomPart}`;
}

/**
 * Validates whether a channel is allowlisted for renderer-to-main invoke.
 * @param {unknown} channel
 * @returns {boolean}
 */
export function isAllowedInvokeChannel(channel) {
  return typeof channel === 'string' && ALLOWED_INVOKE_CHANNELS.has(channel);
}

/**
 * Validates whether a channel is allowlisted for main-to-renderer subscription.
 * @param {unknown} channel
 * @returns {boolean}
 */
export function isAllowedListenChannel(channel) {
  return typeof channel === 'string' && ALLOWED_LISTEN_CHANNELS.has(channel);
}

/**
 * Validates and sanitizes an incoming test event payload from the Control Deck.
 * Rejects non-objects, oversized messages, or invalid types.
 * @param {unknown} payload
 * @returns {{ valid: boolean, error?: string, sanitized?: {
 *   eventId: string,
 *   type: string,
 *   message: string,
 *   game: string,
 *   source: string,
 *   sequence: number,
 *   timestamp: string,
 *   sentAtMs: number
 * } }}
 */
export function validateTestEventPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      error: 'Test event payload must be a plain object.',
    };
  }

  const raw = /** @type {Record<string, unknown>} */ (payload);

  const rawMessage =
    typeof raw.message === 'string' ? raw.message.trim() : 'IPC_DIAGNOSTIC_PING';
  if (!rawMessage) {
    return {
      valid: false,
      error: 'Test event message cannot be empty.',
    };
  }
  if (rawMessage.length > 180) {
    return {
      valid: false,
      error: 'Test event message exceeds maximum length of 180 characters.',
    };
  }

  const rawType =
    typeof raw.type === 'string' && raw.type.trim().length > 0
      ? raw.type.trim().toUpperCase()
      : 'DIAGNOSTIC_PING';

  const allowedGames = new Set(Object.keys(GAME_MODES));
  const rawGame =
    typeof raw.game === 'string' && allowedGames.has(raw.game)
      ? raw.game
      : 'BGMI';

  const sequence =
    typeof raw.sequence === 'number' &&
    Number.isFinite(raw.sequence) &&
    raw.sequence >= 1
      ? Math.floor(raw.sequence)
      : 1;

  const eventId =
    typeof raw.eventId === 'string' &&
    /^[A-Z0-9_-]{4,40}$/i.test(raw.eventId.trim())
      ? raw.eventId.trim()
      : createEventId('TEST');

  const nowMs =
    typeof raw.sentAtMs === 'number' && Number.isFinite(raw.sentAtMs)
      ? raw.sentAtMs
      : Date.now();

  const timestamp =
    typeof raw.timestamp === 'string' && raw.timestamp.trim().length > 0
      ? raw.timestamp.trim()
      : new Date(nowMs).toISOString();

  return {
    valid: true,
    sanitized: {
      eventId,
      type: rawType,
      message: rawMessage,
      game: rawGame,
      source: 'CONTROL_DECK',
      sequence,
      timestamp,
      sentAtMs: nowMs,
    },
  };
}

/**
 * Validates overlay window bounds payload for repositioning/resizing in Phase 1.
 * @param {unknown} bounds
 * @returns {{ valid: boolean, error?: string, sanitized?: { x?: number, y?: number, width?: number, height?: number } }}
 */
export function validateOverlayBounds(bounds) {
  if (bounds === null || typeof bounds !== 'object' || Array.isArray(bounds)) {
    return {
      valid: false,
      error: 'Overlay bounds must be a plain object.',
    };
  }

  const raw = /** @type {Record<string, unknown>} */ (bounds);
  /** @type {{ x?: number, y?: number, width?: number, height?: number }} */
  const sanitized = {};

  if (raw.width !== undefined) {
    if (
      typeof raw.width !== 'number' ||
      !Number.isFinite(raw.width) ||
      raw.width < 320 ||
      raw.width > 1920
    ) {
      return {
        valid: false,
        error: 'Overlay width must be a number between 320 and 1920.',
      };
    }
    sanitized.width = Math.round(raw.width);
  }

  if (raw.height !== undefined) {
    if (
      typeof raw.height !== 'number' ||
      !Number.isFinite(raw.height) ||
      raw.height < 360 ||
      raw.height > 1080
    ) {
      return {
        valid: false,
        error: 'Overlay height must be a number between 360 and 1080.',
      };
    }
    sanitized.height = Math.round(raw.height);
  }

  if (raw.x !== undefined) {
    if (
      typeof raw.x !== 'number' ||
      !Number.isFinite(raw.x) ||
      raw.x < -3840 ||
      raw.x > 7680
    ) {
      return {
        valid: false,
        error: 'Overlay X coordinate is out of bounds.',
      };
    }
    sanitized.x = Math.round(raw.x);
  }

  if (raw.y !== undefined) {
    if (
      typeof raw.y !== 'number' ||
      !Number.isFinite(raw.y) ||
      raw.y < -2160 ||
      raw.y > 4320
    ) {
      return {
        valid: false,
        error: 'Overlay Y coordinate is out of bounds.',
      };
    }
    sanitized.y = Math.round(raw.y);
  }

  return {
    valid: true,
    sanitized,
  };
}
