/** Local GPS queue on the rep phone — sync to cloud when online. */

const QUEUE_KEY = "gensoft_rep_loc_queue_v1";
const MAX_POINTS = 1200; // ~7 days @ 10 min
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_POINTS)));
  } catch {
    /* quota — drop oldest half */
    try {
      const half = list.slice(Math.floor(list.length / 2));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(half));
    } catch {
      /* ignore */
    }
  }
}

function prune(list) {
  const cutoff = Date.now() - RETENTION_MS;
  return list.filter((p) => {
    const t = Date.parse(p.recorded_at || 0);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function queueCount() {
  return prune(readQueue()).length;
}

/** Save a GPS fix on the phone (works offline). */
export function enqueueLocation(point) {
  const id =
    point.local_id ||
    `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    local_id: id,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy_m: point.accuracy_m ?? null,
    recorded_at: point.recorded_at || new Date().toISOString(),
  };
  const next = prune(readQueue());
  // skip if last point was < 8 minutes ago (same cadence as server)
  const last = next[next.length - 1];
  if (last) {
    const gap =
      Date.parse(entry.recorded_at) - Date.parse(last.recorded_at || 0);
    if (Number.isFinite(gap) && gap < 8 * 60 * 1000) {
      return { queued: false, count: next.length, reason: "too_soon" };
    }
  }
  next.push(entry);
  writeQueue(next);
  return { queued: true, count: next.length, local_id: id };
}

/** Push all queued points to cloud; clear on success. */
export async function flushLocationQueue(postBatch) {
  const pending = prune(readQueue());
  writeQueue(pending);
  if (!pending.length) {
    return { synced: 0, remaining: 0, disabled: false };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, remaining: pending.length, offline: true };
  }

  const res = await postBatch({
    points: pending.map((p) => ({
      local_id: p.local_id,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy_m: p.accuracy_m,
      recorded_at: p.recorded_at,
    })),
  });

  if (res?.reason === "tracking_disabled" || res?.accepted === false) {
    return {
      synced: 0,
      remaining: pending.length,
      disabled: true,
      reason: res?.reason,
    };
  }

  // All pending were offered; clear queue (duplicates counted as skipped server-side)
  writeQueue([]);
  return {
    synced: res?.saved ?? pending.length,
    remaining: 0,
    disabled: false,
  };
}
