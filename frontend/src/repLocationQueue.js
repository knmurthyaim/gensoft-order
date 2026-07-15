/**
 * Phone-side location store (IndexedDB + localStorage fallback).
 * Service worker can upload queued points without opening the UI.
 */

const DB_NAME = "gensoft_loc_db";
const DB_VER = 1;
const QUEUE_STORE = "queue";
const META_STORE = "meta";
const LS_QUEUE = "gensoft_rep_loc_queue_v1";
const MAX_POINTS = 20160;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_MOVE_METERS = 50;
const MIN_GAP_MS = 20 * 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no_idb"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "local_id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(store, value, key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        const req = key !== undefined ? os.put(value, key) : os.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function idbClear(store) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const req = tx.objectStore(store).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function idbGet(store, key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function lsReadQueue() {
  try {
    const raw = localStorage.getItem(LS_QUEUE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function lsWriteQueue(list) {
  try {
    localStorage.setItem(LS_QUEUE, JSON.stringify(list.slice(-MAX_POINTS)));
  } catch {
    /* ignore */
  }
}

function prune(list) {
  const cutoff = Date.now() - RETENTION_MS;
  return (list || []).filter((p) => {
    const t = Date.parse(p.recorded_at || 0);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const r = 6371000;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

async function readQueue() {
  try {
    const rows = await idbGetAll(QUEUE_STORE);
    if (rows?.length) return prune(rows).sort(
      (a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at)
    );
  } catch {
    /* fall through */
  }
  return prune(lsReadQueue());
}

async function writeQueue(list) {
  const pruned = prune(list).slice(-MAX_POINTS);
  lsWriteQueue(pruned);
  try {
    await idbClear(QUEUE_STORE);
    for (const p of pruned) {
      await idbPut(QUEUE_STORE, p);
    }
  } catch {
    /* localStorage already written */
  }
}

/** Save auth + API base so service worker can sync without opening the UI. */
export async function saveLocationSyncMeta({ token, apiBase, enabled, minMoveMeters }) {
  const meta = {
    token: token || "",
    apiBase: apiBase || "/api",
    enabled: !!enabled,
    minMoveMeters: minMoveMeters || MIN_MOVE_METERS,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem("gensoft_loc_meta", JSON.stringify(meta));
  } catch {
    /* ignore */
  }
  try {
    await idbPut(META_STORE, meta, "sync");
  } catch {
    /* ignore */
  }
  return meta;
}

export async function loadLocationSyncMeta() {
  try {
    const m = await idbGet(META_STORE, "sync");
    if (m) return m;
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem("gensoft_loc_meta");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function queueCount() {
  return (await readQueue()).length;
}

export async function enqueueLocation(point, minMoveMeters = MIN_MOVE_METERS) {
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
  const next = await readQueue();
  const last = next[next.length - 1];
  if (last) {
    const gap =
      Date.parse(entry.recorded_at) - Date.parse(last.recorded_at || 0);
    if (Number.isFinite(gap) && gap < MIN_GAP_MS) {
      return { queued: false, count: next.length, reason: "too_soon" };
    }
    const dist = haversineMeters(
      last.latitude,
      last.longitude,
      entry.latitude,
      entry.longitude
    );
    if (dist < minMoveMeters) {
      return {
        queued: false,
        count: next.length,
        reason: "too_close",
        meters: Math.round(dist),
      };
    }
  }
  next.push(entry);
  await writeQueue(next);
  await requestBackgroundSync();
  return { queued: true, count: next.length, local_id: id };
}

export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.sync?.register) {
      await reg.sync.register("gensoft-loc-sync");
    }
  } catch {
    /* Background Sync not available */
  }
}

/** Upload queued points using page API helper OR SW/meta credentials. */
export async function flushLocationQueue(postBatch) {
  const pending = await readQueue();
  if (!pending.length) {
    return { synced: 0, remaining: 0, disabled: false };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await requestBackgroundSync();
    return { synced: 0, remaining: pending.length, offline: true };
  }

  let res;
  if (typeof postBatch === "function") {
    res = await postBatch({
      points: pending.map((p) => ({
        local_id: p.local_id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_m: p.accuracy_m,
        recorded_at: p.recorded_at,
      })),
    });
  } else {
    res = await flushWithStoredMeta(pending);
  }

  if (res?.reason === "tracking_disabled" || res?.accepted === false) {
    return {
      synced: 0,
      remaining: pending.length,
      disabled: true,
      reason: res?.reason,
    };
  }

  await writeQueue([]);
  return {
    synced: res?.saved ?? pending.length,
    remaining: 0,
    disabled: false,
  };
}

async function flushWithStoredMeta(pending) {
  const meta = await loadLocationSyncMeta();
  if (!meta?.token || !meta?.apiBase) {
    throw new Error("missing_sync_meta");
  }
  const url = `${String(meta.apiBase).replace(/\/$/, "")}/rep/location/batch`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${meta.token}`,
    },
    body: JSON.stringify({
      points: pending.map((p) => ({
        local_id: p.local_id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_m: p.accuracy_m,
        recorded_at: p.recorded_at,
      })),
    }),
  });
  if (!r.ok) throw new Error(`sync_http_${r.status}`);
  return r.json();
}

/** Used by service worker (same file logic inlined there for classic SW). */
export const __locInternals = {
  readQueue,
  writeQueue,
  loadLocationSyncMeta,
  flushWithStoredMeta,
};
