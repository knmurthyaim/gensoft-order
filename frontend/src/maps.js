/** Google Maps helpers for location links and embeds. */

export function mapsUrl(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return "https://www.google.com/maps";
  return `https://www.google.com/maps?q=${la},${ln}`;
}

/** Open a day route in Google Maps (start → waypoints → end). */
export function mapsRouteUrl(points) {
  const list = (points || []).filter(
    (p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
  );
  if (!list.length) return "https://www.google.com/maps";
  if (list.length === 1) return mapsUrl(list[0].latitude, list[0].longitude);

  const coords = list.map((p) => `${p.latitude},${p.longitude}`);
  // Keep URL reasonable — Google handles ~10 path segments well
  let path = coords;
  if (coords.length > 10) {
    path = [coords[0]];
    const mid = coords.length - 2;
    for (let i = 1; i <= 8; i++) {
      path.push(coords[Math.round((i * mid) / 9)]);
    }
    path.push(coords[coords.length - 1]);
  }
  return `https://www.google.com/maps/dir/${path.join("/")}`;
}

/** Embeddable Google Maps view centered on a point (no API key required). */
export function mapsEmbedUrl(lat, lng, zoom = 15) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    return "https://maps.google.com/maps?q=Hyderabad&z=12&output=embed";
  }
  return `https://maps.google.com/maps?q=${la},${ln}&z=${zoom}&output=embed`;
}
