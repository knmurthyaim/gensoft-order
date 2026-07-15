self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

const DB_NAME = "gensoft_loc_db";
const DB_VER = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "local_id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
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

async function syncQueuedLocations() {
  const pending = await idbGetAll("queue");
  if (!pending.length) return;
  const meta = await idbGet("meta", "sync");
  if (!meta?.token || !meta?.apiBase || meta.enabled === false) return;

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
  if (!r.ok) throw new Error("sync_failed");
  const data = await r.json();
  if (data?.accepted === false) return;
  await idbClear("queue");
}

self.addEventListener("sync", (event) => {
  if (event.tag === "gensoft-loc-sync") {
    event.waitUntil(syncQueuedLocations());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "gensoft-loc-periodic") {
    event.waitUntil(
      (async () => {
        // Ask any open/minimized GenSoft client to capture GPS (browsers
        // cannot read GPS from the service worker itself).
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const c of clients) {
          c.postMessage({ type: "GENSOFT_CAPTURE_LOCATION" });
        }
        await syncQueuedLocations();
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "GENSOFT_FLUSH_LOCATIONS") {
    event.waitUntil(syncQueuedLocations());
  }
});
