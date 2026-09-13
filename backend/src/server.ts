import { createServer, type Server } from 'node:http';

import { app } from './app.js';
import { env } from './config/env.js';
import { appDataSource } from './database/data-source.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
let isShuttingDown = false;

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      reject(error);
    };

    server.once('error', handleError);
    server.listen(env.port, () => {
      server.off('error', handleError);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function closeDatabase(): Promise<void> {
  if (appDataSource.isInitialized) {
    await appDataSource.destroy();
  }
}

async function shutdown(signal: NodeJS.Signals, server: Server): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Shutting down safely.`);

  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await closeServer(server);
    await closeDatabase();
    clearTimeout(timeout);
    console.log('HTTP server and database connection closed.');
  } catch {
    clearTimeout(timeout);
    console.error('The application could not shut down cleanly.');
    process.exitCode = 1;
  }
}

function registerShutdownHandlers(server: Server): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  for (const signal of signals) {
    process.once(signal, async () => {
      await shutdown(signal, server);
    });
  }
}

async function startServer(): Promise<void> {
  try {
    await appDataSource.initialize();
  } catch {
    console.error('Database connection failed. API was not started.');
    process.exitCode = 1;
    return;
  }

  const server = createServer(app);

  try {
    await listen(server);
  } catch {
    await closeDatabase();
    console.error('HTTP server failed to start.');
    process.exitCode = 1;
    return;
  }

  registerShutdownHandlers(server);
  console.log(`HSS Finance API listening on port ${env.port}.`);
}

await startServer();
