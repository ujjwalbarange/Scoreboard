/**
 * Live Gameplay Window Capture & Stream Relay Manager
 * Phase 3 Addendum: Gameplay Window Integration & Picture-in-Picture Broadcast Mode
 *
 * Responsibilities:
 * - Acquire live video streams from Electron desktopCapturer sources (chromeMediaSource: 'desktop')
 * - Support standard browser screen/window capture via navigator.mediaDevices.getDisplayMedia
 * - Share live MediaStream between embedded Control Deck preview and standalone /overlay.html
 *   (via direct Electron desktopCapturer sourceId or local WebRTC RTCPeerConnection over BroadcastChannel)
 * - Detect minimized windows, closed source windows, track termination, and permission denial gracefully
 * - Never display fake static screenshots in place of a live video feed
 */

const WEBRTC_CHANNEL_NAME = 'esports_broadcast_gameplay_webrtc_v1';

/** @type {MediaStream | null} */
let activeLocalStream = null;

/** @type {string | null} */
let activeStreamSourceId = null;

/** @type {{ status: string, message: string | null, sourceId: string | null, sourceName: string | null, sourceType: string | null, resolution: { width: number, height: number } | null }} */
let captureState = {
  status: 'IDLE', // 'IDLE' | 'CONNECTING' | 'LIVE' | 'MINIMIZED' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'STOPPED'
  message: null,
  sourceId: null,
  sourceName: null,
  sourceType: null,
  resolution: null,
};

const streamListeners = new Set();

/** @type {BroadcastChannel | null} */
let signalingChannel = null;

/** @type {Map<string, RTCPeerConnection>} */
const senderPeers = new Map();

/** @type {RTCPeerConnection | null} */
let receiverPeer = null;

function notifyListeners() {
  const snapshot = {
    stream: activeLocalStream,
    ...captureState,
  };
  for (const listener of streamListeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener error
    }
  }
}

function updateCaptureState(patch) {
  captureState = {
    ...captureState,
    ...patch,
  };
  notifyListeners();
}

function initSignalingChannel() {
  if (signalingChannel || typeof BroadcastChannel === 'undefined') {
    return signalingChannel;
  }

  try {
    signalingChannel = new BroadcastChannel(WEBRTC_CHANNEL_NAME);
    signalingChannel.onmessage = async (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      try {
        if (
          msg.type === 'REQUEST_STREAM' &&
          activeLocalStream &&
          activeStreamSourceId === 'browser-display' &&
          typeof RTCPeerConnection !== 'undefined'
        ) {
          const peerId = msg.peerId || 'default-overlay';
          const existing = senderPeers.get(peerId);
          if (existing) {
            try {
              existing.close();
            } catch {}
          }

          const pc = new RTCPeerConnection();
          senderPeers.set(peerId, pc);

          activeLocalStream.getTracks().forEach((track) => {
            pc.addTrack(track, activeLocalStream);
          });

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              signalingChannel.postMessage({
                type: 'ICE_CANDIDATE_FROM_SENDER',
                peerId,
                candidate: e.candidate.toJSON
                  ? e.candidate.toJSON()
                  : e.candidate,
              });
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signalingChannel.postMessage({
            type: 'OFFER',
            peerId,
            sdp: pc.localDescription,
          });
        } else if (
          msg.type === 'ANSWER' &&
          msg.peerId &&
          senderPeers.has(msg.peerId)
        ) {
          const pc = senderPeers.get(msg.peerId);
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          }
        } else if (
          msg.type === 'ICE_CANDIDATE_FROM_RECEIVER' &&
          msg.peerId &&
          senderPeers.has(msg.peerId) &&
          msg.candidate
        ) {
          const pc = senderPeers.get(msg.peerId);
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        } else if (
          msg.type === 'OFFER' &&
          !activeLocalStream &&
          typeof RTCPeerConnection !== 'undefined'
        ) {
          const peerId = msg.peerId || 'default-overlay';
          if (receiverPeer) {
            try {
              receiverPeer.close();
            } catch {}
          }
          const pc = new RTCPeerConnection();
          receiverPeer = pc;

          pc.ontrack = (e) => {
            const remoteStream = e.streams?.[0];
            if (remoteStream) {
              activeLocalStream = remoteStream;
              activeStreamSourceId = 'browser-display-remote';
              updateCaptureState({
                status: 'LIVE',
                message: 'Receiving live gameplay feed from Control Deck.',
              });
            }
          };

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              signalingChannel.postMessage({
                type: 'ICE_CANDIDATE_FROM_RECEIVER',
                peerId,
                candidate: e.candidate.toJSON
                  ? e.candidate.toJSON()
                  : e.candidate,
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingChannel.postMessage({
            type: 'ANSWER',
            peerId,
            sdp: pc.localDescription,
          });
        } else if (
          msg.type === 'ICE_CANDIDATE_FROM_SENDER' &&
          receiverPeer &&
          msg.candidate
        ) {
          await receiverPeer.addIceCandidate(
            new RTCIceCandidate(msg.candidate)
          );
        } else if (msg.type === 'STREAM_STOPPED') {
          if (activeStreamSourceId === 'browser-display-remote') {
            cleanupStreamOnly();
            updateCaptureState({
              status: 'STOPPED',
              message: 'Gameplay capture was stopped by the operator.',
            });
          }
        }
      } catch {
        // Ignore transient WebRTC negotiation errors
      }
    };
  } catch {
    signalingChannel = null;
  }

  return signalingChannel;
}

function cleanupStreamOnly() {
  if (activeLocalStream) {
    try {
      activeLocalStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    } catch {}
  }
  activeLocalStream = null;
  activeStreamSourceId = null;

  for (const pc of senderPeers.values()) {
    try {
      pc.close();
    } catch {}
  }
  senderPeers.clear();

  if (receiverPeer) {
    try {
      receiverPeer.close();
    } catch {}
    receiverPeer = null;
  }
}

function attachTrackLifecycleMonitors(stream, sourceInfo, onEndedCallback) {
  const videoTracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
  const mainTrack = videoTracks[0];
  if (!mainTrack) return;

  const settings =
    typeof mainTrack.getSettings === 'function' ? mainTrack.getSettings() : {};
  const width = Number(settings.width || 0);
  const height = Number(settings.height || 0);

  updateCaptureState({
    status: 'LIVE',
    message: `Capturing live video from "${sourceInfo.sourceName}".`,
    sourceId: sourceInfo.sourceId,
    sourceName: sourceInfo.sourceName,
    sourceType: sourceInfo.sourceType,
    resolution: width > 0 && height > 0 ? { width, height } : null,
  });

  const handleTrackEnded = () => {
    if (activeLocalStream !== stream) return;
    cleanupStreamOnly();
    updateCaptureState({
      status: 'UNAVAILABLE',
      message: `Gameplay source "${sourceInfo.sourceName}" was closed, minimized, or stopped sharing.`,
      resolution: null,
    });
    if (typeof onEndedCallback === 'function') {
      onEndedCallback({
        status: 'UNAVAILABLE',
        message: `Gameplay source "${sourceInfo.sourceName}" was closed or stopped sharing.`,
      });
    }
  };

  const handleTrackMute = () => {
    if (activeLocalStream !== stream) return;
    updateCaptureState({
      status: 'MINIMIZED',
      message: `Source window "${sourceInfo.sourceName}" appears minimized or paused by OS. Restore the window to resume live frames.`,
    });
  };

  const handleTrackUnmute = () => {
    if (activeLocalStream !== stream) return;
    updateCaptureState({
      status: 'LIVE',
      message: `Capturing live video from "${sourceInfo.sourceName}".`,
    });
  };

  mainTrack.addEventListener?.('ended', handleTrackEnded);
  mainTrack.addEventListener?.('mute', handleTrackMute);
  mainTrack.addEventListener?.('unmute', handleTrackUnmute);
}

/**
 * Acquires a live MediaStream from an Electron desktopCapturer sourceId
 * (`window:...` or `screen:...`) using Chromium's desktop capture constraints.
 */
export async function startElectronSourceCapture({
  sourceId,
  sourceName = 'Gameplay Source',
  sourceType = 'window',
  onStreamEnded,
}) {
  initSignalingChannel();

  if (!sourceId || typeof sourceId !== 'string') {
    const msg = 'No valid desktop capture source ID was provided.';
    updateCaptureState({
      status: 'UNAVAILABLE',
      message: msg,
    });
    return { ok: false, status: 'UNAVAILABLE', error: msg };
  }

  // If already capturing this exact sourceId and track is live, reuse it
  if (
    activeLocalStream &&
    activeStreamSourceId === sourceId &&
    activeLocalStream.getVideoTracks().some((t) => t.readyState === 'live')
  ) {
    return {
      ok: true,
      status: 'LIVE',
      stream: activeLocalStream,
      sourceId,
      sourceName,
      sourceType,
    };
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    const msg =
      'navigator.mediaDevices.getUserMedia is not available in this environment.';
    updateCaptureState({
      status: 'UNAVAILABLE',
      message: msg,
    });
    return { ok: false, status: 'UNAVAILABLE', error: msg };
  }

  updateCaptureState({
    status: 'CONNECTING',
    message: `Connecting to live source "${sourceName}"...`,
    sourceId,
    sourceName,
    sourceType,
  });

  try {
    cleanupStreamOnly();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 60,
        },
      },
    });

    activeLocalStream = stream;
    activeStreamSourceId = sourceId;

    attachTrackLifecycleMonitors(
      stream,
      { sourceId, sourceName, sourceType },
      onStreamEnded
    );

    return {
      ok: true,
      status: 'LIVE',
      stream,
      sourceId,
      sourceName,
      sourceType,
    };
  } catch (err) {
    const errName = err?.name || '';
    const errMessage = err?.message || String(err);
    const isPermissionError =
      /PermissionDenied|NotAllowedError|SecurityError/i.test(errName) ||
      /permission|denied/i.test(errMessage);

    const status = isPermissionError ? 'PERMISSION_DENIED' : 'UNAVAILABLE';
    const friendlyMessage = isPermissionError
      ? 'Screen recording permission was denied by the operating system. Grant Screen Recording permission and try again.'
      : `Unable to capture "${sourceName}". The window may be closed, minimized, or protected by DRM/anti-cheat (${errMessage}).`;

    updateCaptureState({
      status,
      message: friendlyMessage,
      sourceId,
      sourceName,
      sourceType,
      resolution: null,
    });

    return {
      ok: false,
      status,
      error: friendlyMessage,
    };
  }
}

/**
 * Acquires a live MediaStream via standard Browser Screen/Window Capture (`getDisplayMedia`).
 * Used when running in browser preview mode or when operator selects Browser Screen Share.
 */
export async function startBrowserDisplayCapture({ onStreamEnded } = {}) {
  initSignalingChannel();

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== 'function'
  ) {
    const msg =
      'Screen/window capture (getDisplayMedia) is not supported in this browser context.';
    updateCaptureState({
      status: 'UNAVAILABLE',
      message: msg,
    });
    return { ok: false, status: 'UNAVAILABLE', error: msg };
  }

  updateCaptureState({
    status: 'CONNECTING',
    message: 'Waiting for operator to select a window or screen...',
  });

  try {
    cleanupStreamOnly();

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
      },
      audio: false,
    });

    const videoTrack = stream.getVideoTracks()[0];
    const detectedLabel =
      (videoTrack && videoTrack.label && videoTrack.label.trim()) ||
      'Live Browser Window / Screen';

    activeLocalStream = stream;
    activeStreamSourceId = 'browser-display';

    attachTrackLifecycleMonitors(
      stream,
      {
        sourceId: 'browser-display',
        sourceName: detectedLabel,
        sourceType: 'browser-display',
      },
      onStreamEnded
    );

    // Notify any open standalone /overlay.html tab that a live stream is ready
    if (signalingChannel) {
      signalingChannel.postMessage({
        type: 'STREAM_AVAILABLE',
        sourceName: detectedLabel,
      });
    }

    return {
      ok: true,
      status: 'LIVE',
      stream,
      sourceId: 'browser-display',
      sourceName: detectedLabel,
      sourceType: 'browser-display',
    };
  } catch (err) {
    const errName = err?.name || '';
    const errMessage = err?.message || String(err);
    const isPermissionError =
      /NotAllowedError|PermissionDenied|SecurityError/i.test(errName) ||
      /permission|denied|cancelled|canceled/i.test(errMessage);

    const status = isPermissionError ? 'PERMISSION_DENIED' : 'UNAVAILABLE';
    const friendlyMessage = isPermissionError
      ? 'Screen/window capture prompt was cancelled or denied by the browser.'
      : `Browser screen capture could not start (${errMessage}).`;

    updateCaptureState({
      status,
      message: friendlyMessage,
      resolution: null,
    });

    return {
      ok: false,
      status,
      error: friendlyMessage,
    };
  }
}

/**
 * Requests a remote WebRTC relay stream when running inside standalone `/overlay.html`
 * in browser mode while the Control Deck holds an active `getDisplayMedia` stream.
 */
export function requestRemoteBrowserCaptureStream() {
  const ch = initSignalingChannel();
  if (!ch) return;
  try {
    ch.postMessage({
      type: 'REQUEST_STREAM',
      peerId: `overlay-${Date.now()}`,
    });
  } catch {
    // Ignore
  }
}

/**
 * Stops the active gameplay capture stream and releases all media tracks.
 */
export function stopGameplayCapture() {
  initSignalingChannel();
  cleanupStreamOnly();

  if (signalingChannel) {
    try {
      signalingChannel.postMessage({ type: 'STREAM_STOPPED' });
    } catch {}
  }

  updateCaptureState({
    status: 'STOPPED',
    message: 'Gameplay capture stopped.',
    sourceId: null,
    sourceName: null,
    sourceType: null,
    resolution: null,
  });

  return { ok: true, status: 'STOPPED' };
}

/**
 * Returns the current capture state & live MediaStream reference.
 */
export function getGameplayCaptureSnapshot() {
  return {
    stream: activeLocalStream,
    ...captureState,
  };
}

/**
 * Subscribes to live gameplay MediaStream and status changes.
 */
export function subscribeGameplayCapture(callback) {
  if (typeof callback !== 'function') return () => {};
  initSignalingChannel();
  streamListeners.add(callback);
  callback(getGameplayCaptureSnapshot());
  return () => {
    streamListeners.delete(callback);
  };
}
