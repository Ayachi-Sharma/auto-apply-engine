/**
 * notifier.js
 *
 * Central SSE event bus.
 * The engine calls notifier.emit(runId, event) — the notifier owns
 * delivery to all SSE clients subscribed to that runId.
 *
 * Recent events are buffered per runId so that a client which subscribes
 * slightly after an event was emitted (common race during resume, where the
 * background job launches a fresh browser before the client's SSE handler
 * has registered) still receives the missed PROGRESS events instead of
 * stalling the UI.
 */

// runId -> Set<res>
const clients = new Map();

// runId -> array of buffered event objects (most recent last), capped size
const buffer = new Map();
const BUFFER_CAP = 60;

function pushBuffer(runId, event) {
  let arr = buffer.get(runId);
  if (!arr) {
    arr = [];
    buffer.set(runId, arr);
  }
  arr.push(event);
  if (arr.length > BUFFER_CAP) arr.splice(0, arr.length - BUFFER_CAP);
}

export function subscribe(runId, res) {
  if (!clients.has(runId)) {
    clients.set(runId, new Set());
  }
  clients.get(runId).add(res);

  // Replay buffered events so the client catches up on anything emitted
  // before this SSE connection was registered.
  const arr = buffer.get(runId);
  if (arr && arr.length > 0) {
    for (const event of arr) {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        /* client gone */
      }
    }
  }
}

export function unsubscribe(runId, res) {
  const set = clients.get(runId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    clients.delete(runId);
    // Free buffered events once no one is listening anymore.
    buffer.delete(runId);
  }
}

export function emit(runId, event) {
  // Always buffer (so late subscribers can catch up), including terminal
  // events — the route handler replays the authoritative current state on
  // connect anyway, but buffering keeps the feed self-consistent.
  pushBuffer(runId, event);

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