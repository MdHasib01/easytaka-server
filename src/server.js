import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';

async function main() {
  await connectDB();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.info(`[server] EasyTaka API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
    if (env.demoMode) console.info('[server] Demo endpoints enabled at /api/demo');
  });
  const wss = attachRealtime(server);

  const shutdown = (signal) => {
    console.info(`[server] ${signal} received, shutting down…`);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => console.error('[server] Unhandled rejection', err));
}

main().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
