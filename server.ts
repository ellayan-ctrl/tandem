/**
 * TwoWay server: SQLite order book + matching engine + Soroban remainder settlement,
 * serving the React app (Vite middleware in dev, static dist/ in production).
 *
 *   npm run dev      -> http://localhost:3000
 */
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { config } from './server/config.ts';
import { openDb } from './server/db.ts';
import { OrderService } from './server/orders.ts';
import { AccountService } from './server/accounts.ts';
import { offchainNetting } from './server/netting.ts';
import { startExpiryWorker } from './server/worker.ts';
import { apiRouter } from './server/api.ts';

const db = openDb(config.dbPath);
const accounts = new AccountService(db);
const svc = new OrderService(db, offchainNetting, accounts);
await svc.recoverPendingPayouts();
const worker = startExpiryWorker(svc, config.workerIntervalMs);

const app = express();
const httpServer = createServer(app);
app.use('/api', apiRouter(svc, accounts, () => void worker.tick()));

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`TwoWay server on http://localhost:${config.port}`);
  console.log(`  settlement contract ${config.settlementContractId}`);
  console.log(`  operator            ${config.operator.publicKey()}`);
  console.log(`  database            ${config.dbPath}`);
});
