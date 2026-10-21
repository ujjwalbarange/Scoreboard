import React from 'react';
import { OVERLAY_CONNECTION_STATE } from '../../shared/constants.js';

/**
 * Real-time Overlay Connection Status Indicator Component
 * Driven strictly by actual IPC status responses and window lifecycle events.
 */
export default function ConnectionStatus({
  status,
  overlayVisible,
  lastHeartbeat,
}) {
  const isConnected = status === OVERLAY_CONNECTION_STATE.CONNECTED;
  const isHidden = status === OVERLAY_CONNECTION_STATE.HIDDEN;

  let statusColorClass = 'text-rose-400';
  let statusLabel = 'DISCONNECTED';

  if (isConnected) {
    statusColorClass = 'text-emerald-400';
    statusLabel = 'CONNECTED';
  } else if (isHidden) {
    statusColorClass = 'text-amber-400';
    statusLabel = 'CONNECTED (HIDDEN)';
  } else if (status === OVERLAY_CONNECTION_STATE.CHECKING) {
    statusColorClass = 'text-cyan-400';
    statusLabel = 'CHECKING...';
  }

  return (
    <div
      data-testid="control-deck-connection-status"
      className="flex flex-wrap items-center gap-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="text-slate-400 font-medium whitespace-nowrap shrink-0">
        Overlay IPC:
      </span>
      <span
        className={`deck-mono-font font-semibold whitespace-nowrap shrink-0 ${statusColorClass}`}
      >
        {statusLabel}
      </span>
      <span aria-hidden="true" className="text-slate-600">
        ·
      </span>
      <span className="text-slate-300 whitespace-nowrap shrink-0">
        {overlayVisible ? 'Shown' : 'Hidden'}
      </span>
      {lastHeartbeat && (
        <>
          <span aria-hidden="true" className="text-slate-600 hidden 2xl:inline">
            ·
          </span>
          <span className="deck-mono-font text-[11px] text-slate-400 hidden 2xl:inline whitespace-nowrap shrink-0">
            {new Date(lastHeartbeat).toLocaleTimeString()}
          </span>
        </>
      )}
    </div>
  );
}
