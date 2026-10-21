/**
 * Development & Preview Server (Express + Vite Middleware)
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Hosts the authoritative MatchManager (with real CSV atomic persistence and
 * fs.watch external file synchronization on `matches/*.csv`) when running in
 * the web preview environment on port 3000, matching the exact behavior of
 * Electron's main process (`electron/ipc/handlers.js`).
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { MatchManager } from './electron/match/match-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  const configPath = path.resolve(__dirname, 'tournament_config.json');
  let tournamentConfig = null;
  try {
    tournamentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    tournamentConfig = null;
  }

  const sseClients = new Set<express.Response>();

  function broadcastSse(eventType: string, payload: unknown) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  const matchesDir = path.resolve(__dirname, 'matches');
  const matchManager = new MatchManager({
    matchesDir,
    config: tournamentConfig,
    onStateChange: (snapshot) => {
      broadcastSse('match-state', snapshot);
    },
    onNotification: (notification) => {
      broadcastSse('match-notification', notification);
    },
  });

  await matchManager.initialize();

  // Server-Sent Events stream for real-time external CSV watcher & multi-window sync
  app.get('/api/match/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.get('/api/match/state', async (_req, res) => {
    try {
      const snapshot = await matchManager.getFullState();
      res.json({ ok: true, snapshot });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to get match state',
      });
    }
  });

  app.post('/api/match/command', async (req, res) => {
    const { action, payload } = req.body || {};
    try {
      switch (action) {
        case 'setActiveGame':
          return res.json(
            await matchManager.setActiveGame(payload?.game ?? 'BGMI')
          );
        case 'selectTeam':
          return res.json(await matchManager.selectTeam(payload?.key ?? null));
        case 'incrementKill':
          return res.json(await matchManager.incrementKill(payload?.key));
        case 'decrementKill':
          return res.json(await matchManager.decrementKill(payload?.key));
        case 'setPlacement':
          return res.json(
            await matchManager.setPlacement(payload?.key, payload?.position)
          );
        case 'adjustPlacement':
          return res.json(
            await matchManager.adjustPlacement(payload?.key, payload?.direction)
          );
        case 'updateTeamRoster':
          return res.json(await matchManager.updateTeamRoster(payload));
        case 'undoLastAction':
          return res.json(await matchManager.undoLastAction());
        case 'createMatch':
          return res.json(await matchManager.createMatch(payload || {}));
        case 'loadMatch':
          return res.json(await matchManager.loadMatch(payload?.matchId));
        case 'saveMatch':
          return res.json(await matchManager.saveMatch());
        case 'importRoster':
          return res.json(await matchManager.importRoster(payload));
        case 'exportMatch':
          return res.json(await matchManager.exportMatch());
        case 'createNextRound':
          return res.json(await matchManager.createNextRound(payload));
        case 'completeMatch':
          return res.json(await matchManager.completeMatch());
        case 'reopenMatch':
          return res.json(await matchManager.reopenMatch());
        case 'listMatches': {
          const matches = await matchManager.csvController.listMatchFiles();
          return res.json({ ok: true, matches });
        }
        default:
          return res
            .status(400)
            .json({ ok: false, error: `Unknown command action: ${action}` });
      }
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Command execution failed',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'mpa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[Esports Broadcast Controller] Authoritative Match Server listening on http://localhost:${PORT}`
    );
  });
}

startServer();
