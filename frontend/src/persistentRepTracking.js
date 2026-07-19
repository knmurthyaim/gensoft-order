/** Native Android foreground service that keeps tracking after the WebView closes. */

async function plugin() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin("RepTracking");
}

export async function startPersistentRepTracking(options) {
  const p = await plugin();
  return p.start({
    token: options.token,
    apiBase: options.apiBase,
    intervalSec: Math.max(15, Number(options.intervalSec) || 30),
    minMoveMeters: Math.max(10, Number(options.minMoveMeters) || 50),
  });
}

export async function stopPersistentRepTracking() {
  try {
    const p = await plugin();
    await p.stop();
  } catch {
    /* Browser or native plugin unavailable. */
  }
}
