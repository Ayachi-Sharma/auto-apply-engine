/**
 * notifier.js
 *
 * Central SSE event bus.
 * The engine calls notifier.emit(runId, event) — the notifier owns
 * delivery to all SSE clients subscribed to that runId.
 */

// runId -> Set<res>
const clients = new Map();

export function subscribe(runId, res) {
  if (!clients.has(runId)) {
    clients.set(runId, new Set());
  }
  clients.get(runId).add(res);
}

export function unsubscribe(runId, res) {
  const set = clients.get(runId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(runId);
}

export function emit(runId, event) {
  const set = clients.get(runId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}
