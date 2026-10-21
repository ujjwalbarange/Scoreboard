/**
 * Optional Broadcast Audio Feedback Utility
 * Phase 3: Esports Broadcast Controller & Live Overlay System
 *
 * Uses the native Web Audio API in a fail-safe wrapper so missing audio hardware
 * or autoplay restrictions never affect operator workflows.
 *
 * Plays restrained broadcast cues ONLY on high-value operator events:
 * - 'WINNER': Team assigned #1 placement (WWCD / Booyah)
 * - 'MATCH_FINAL': Match marked COMPLETED or End-of-Match graphic triggered
 * - 'ROUND_START': New match or Next Round started
 * - 'ERROR': Invalid placement cascade or CSV validation error rejected
 *
 * Never plays sounds on routine +1/-1 kill score updates.
 */

const AUDIO_STORAGE_KEY = 'ebc_broadcast_audio_enabled_v1';

/** @type {AudioContext | null} */
let sharedAudioCtx = null;

function getAudioContextSafe() {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Reads persisted audio feedback preference (defaults to true).
 * @returns {boolean}
 */
export function readAudioEnabledPreference() {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(AUDIO_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

/**
 * Persists audio feedback preference.
 * @param {boolean} enabled
 */
export function writeAudioEnabledPreference(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, String(Boolean(enabled)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Plays a short, clean synthesized tone sequence if audio feedback is enabled.
 *
 * @param {'WINNER' | 'MATCH_FINAL' | 'ROUND_START' | 'ERROR'} cueType
 * @param {boolean} [isEnabled=true]
 */
export function playBroadcastCue(cueType, isEnabled = true) {
  if (!isEnabled) return;

  const ctx = getAudioContextSafe();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    const scheduleNote = (freq, startOffset, duration, type = 'sine', peakGain = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(
        peakGain,
        now + startOffset + 0.015
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + startOffset + duration
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.01);
    };

    switch (cueType) {
      case 'WINNER':
        // Crisp 2-note rising harmonic chime for #1 placement
        scheduleNote(587.33, 0, 0.14, 'triangle', 0.07); // D5
        scheduleNote(880.0, 0.11, 0.22, 'triangle', 0.08); // A5
        break;
      case 'MATCH_FINAL':
        // Broadcast final standings triad
        scheduleNote(523.25, 0, 0.12, 'triangle', 0.06); // C5
        scheduleNote(659.25, 0.09, 0.14, 'triangle', 0.06); // E5
        scheduleNote(783.99, 0.18, 0.28, 'triangle', 0.08); // G5
        break;
      case 'ROUND_START':
        // Clean confirmation pulse
        scheduleNote(659.25, 0, 0.11, 'sine', 0.06);
        scheduleNote(783.99, 0.1, 0.16, 'sine', 0.06);
        break;
      case 'ERROR':
        // Soft low validation warning
        scheduleNote(220.0, 0, 0.16, 'sawtooth', 0.045);
        break;
      default:
        break;
    }
  } catch {
    // Never throw if audio context fails
  }
}
