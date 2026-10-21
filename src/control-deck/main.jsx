import React from 'react';
import { createRoot } from 'react-dom/client';
import ControlDeckApp from './App.jsx';
import OverlayViewportApp from '../overlay-viewport/App.jsx';
import './styles/control-deck.css';

const params = new URLSearchParams(window.location.search);
const isOverlayQuery = params.get('window') === 'overlay';

if (isOverlayQuery) {
  document.documentElement.classList.add('overlay-html');
  document.body.classList.add('overlay-body');
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      {isOverlayQuery ? <OverlayViewportApp /> : <ControlDeckApp />}
    </React.StrictMode>
  );
}
