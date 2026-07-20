/** Native Android foreground service that keeps tracking after the WebView closes. */

async function plugin() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin("RepTracking");
}

async function isNative() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

export async function startPersistentRepTracking(options) {
  if (!(await isNative())) return { started: false };
  const p = await plugin();
  return withTimeout(
    p.start({
      token: options.token,
      apiBase: options.apiBase,
      intervalSec: Math.max(15, Number(options.intervalSec) || 30),
      minMoveMeters: Math.max(10, Number(options.minMoveMeters) || 50),
    }),
    8000
  );
}

export async function stopPersistentRepTracking() {
  try {
    if (!(await isNative())) return;
    const p = await plugin();
    // Never hang logout / UI on a native bridge call.
    await withTimeout(p.stop(), 2500);
  } catch {
    /* Browser or native plugin unavailable. */
  }
}
