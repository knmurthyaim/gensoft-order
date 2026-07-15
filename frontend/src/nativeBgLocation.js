/**
 * Native background GPS (Capacitor Android/iOS).
 * Continues while the app is minimized / screen off.
 * Points are saved on the phone and synced to cloud when online.
 */

let watcherId = null;

export async function isNativeApp() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Start native background geolocation.
 * @param {{ minMoveMeters?: number, onPoint: (p: object) => void, onError?: (e: object) => void }} opts
 */
export async function startNativeBackgroundTracking(opts) {
  const native = await isNativeApp();
  if (!native) return { started: false, reason: "web" };

  const { BackgroundGeolocation } = await import(
    "@capacitor-community/background-geolocation"
  );
  if (watcherId) {
    try {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
    } catch {
      /* ignore */
    }
    watcherId = null;
  }

  const minMove = Math.max(10, Number(opts.minMoveMeters) || 50);
  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage:
        "GenSoft is saving your location for your distributor.",
      backgroundTitle: "GenSoft location",
      requestPermissions: true,
      stale: false,
      distanceFilter: minMove,
    },
    (location, error) => {
      if (error) {
        opts.onError?.(error);
        return;
      }
      if (!location) return;
      opts.onPoint({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m:
          typeof location.accuracy === "number" ? location.accuracy : null,
        recorded_at: new Date(
          location.time || Date.now()
        ).toISOString(),
      });
    }
  );
  return { started: true, watcherId };
}

export async function stopNativeBackgroundTracking() {
  if (!watcherId) return;
  try {
    const { BackgroundGeolocation } = await import(
      "@capacitor-community/background-geolocation"
    );
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  } catch {
    /* ignore */
  }
  watcherId = null;
}
