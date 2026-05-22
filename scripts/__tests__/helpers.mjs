/**
 * Test harness for the P8 mock-backend contract.
 *
 * Each test file calls `startMockBackend()` once, gets a unique port +
 * fast tick/min-future overrides, runs assertions, and calls `close()`.
 * Runs the script as a child process so we exercise the same boot path
 * production-shaped consumers do; no in-process refactor needed.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(HERE, '..', 'mock-backend.mjs');

/** Find an unused port by binding to 0 and reading what the OS assigned. */
async function pickPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Spawn the mock-backend with test-friendly env. Resolves once the
 * server has printed its "listening on …" line so tests don't race.
 *
 * Override defaults via opts:
 *   tickMs       — queue fire-time loop interval (default 200ms)
 *   minFutureMs  — minimum snoozeUntil/sendAt offset (default 100ms)
 *   maxPerAccount — quota cap (default 50)
 */
export async function startMockBackend(opts = {}) {
  const port = opts.port ?? (await pickPort());
  const tickMs = opts.tickMs ?? 200;
  const minFutureMs = opts.minFutureMs ?? 100;
  const maxPerAccount = opts.maxPerAccount ?? 50;

  const child = spawn(process.execPath, [MOCK_PATH], {
    env: {
      ...process.env,
      MOCK_BACKEND_PORT: String(port),
      MOCK_QUEUE_TICK_MS: String(tickMs),
      MOCK_QUEUE_MIN_FUTURE_MS: String(minFutureMs),
      MOCK_QUEUE_MAX_PER_ACCOUNT: String(maxPerAccount)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Capture output for debugging on failure; resolve once the boot line
  // appears so subsequent fetches don't race the listener.
  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout.on('data', (d) => {
    stdoutBuf += d.toString();
  });
  child.stderr.on('data', (d) => {
    stderrBuf += d.toString();
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `mock-backend didn't start within 5s\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`
        )
      );
    }, 5000);
    const onData = (d) => {
      if (stdoutBuf.includes('listening on')) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`mock-backend exited early (code ${code})\nstderr:\n${stderrBuf}`));
    });
  });

  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const wsUrl = `ws://127.0.0.1:${port}/push/ws?token=test-token-${port}`;

  async function close() {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        // Force-kill if SIGTERM doesn't take.
        if (child.exitCode === null) child.kill('SIGKILL');
        resolve();
      }, 1000);
      child.on('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  return {
    port,
    baseUrl,
    wsUrl,
    close,
    get stdout() {
      return stdoutBuf;
    },
    get stderr() {
      return stderrBuf;
    }
  };
}

/** Convenience: future ISO timestamp, `ms` from now. */
export function futureIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

/** POST JSON. Returns `{ status, body }` where `body` is parsed JSON if available. */
export async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { status: res.status, body: await safeJson(res) };
}

export async function patchJson(url, payload) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { status: res.status, body: await safeJson(res) };
}

export async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, body: await safeJson(res) };
}

export async function deleteJson(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return { status: res.status, body: await safeJson(res) };
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
