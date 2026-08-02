/**
 * Small, dependency-free helpers for the Windows/JForex append-only CSV loop.
 *
 * JForex appends historical Replay signals to the end of the file. The capture
 * service must therefore key off the file fingerprint, not row order, and must
 * tolerate the short interval in which JForex still has the file open.
 */

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_DELAY_MS = 300;
const DEFAULT_RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000];

function fileSignature(stat) {
  if (!stat) return null;
  return {
    size: Number(stat.size) || 0,
    mtimeMs: Number(stat.mtimeMs) || 0,
    ctimeMs: Number(stat.ctimeMs) || 0,
  };
}

function signatureKey(signature) {
  if (!signature) return '';
  return `${signature.size}:${signature.mtimeMs}:${signature.ctimeMs}`;
}

function hasFileChanged(previous, next) {
  return signatureKey(previous) !== signatureKey(next);
}

function retryDelay(attempt, delays = DEFAULT_RETRY_DELAYS_MS) {
  const list = Array.isArray(delays) && delays.length ? delays : DEFAULT_RETRY_DELAYS_MS;
  return list[Math.min(Math.max(Number(attempt) || 0, 0), list.length - 1)];
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_SETTLE_DELAY_MS,
  DEFAULT_RETRY_DELAYS_MS,
  fileSignature,
  signatureKey,
  hasFileChanged,
  retryDelay,
};
