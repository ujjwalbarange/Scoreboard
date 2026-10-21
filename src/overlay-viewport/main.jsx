import React from 'react';
import { createRoot } from 'react-dom/client';
import OverlayViewportApp from './App.jsx';
import './styles/overlay.css';

const container =
  document.getElementById('overlay-root') || document.getElementById('root');

if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <OverlayViewportApp />
    </React.StrictMode>
  );
}
