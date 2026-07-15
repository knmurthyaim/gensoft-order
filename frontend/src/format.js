export const inr = (n) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

/** GenSoft runs for India — always show times in IST. */
export const INDIA_TZ = "Asia/Kolkata";

/** Parse API datetimes; naive values are treated as UTC. */
export const parseApiDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d;
  const s = String(d).trim();
  if (!s) return null;
  // "2026-07-15T12:02:32" / without Z → UTC from server
  if (
    /^\d{4}-\d{2}-\d{2}T/.test(s) &&
    !/[zZ]$/.test(s) &&
    !/[+-]\d{2}:?\d{2}$/.test(s)
  ) {
    return new Date(s.endsWith("Z") ? s : `${s}Z`);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export const fmtDate = (d) => {
  const dt = parseApiDate(d);
  if (!dt) return "—";
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: INDIA_TZ,
  });
};

export const fmtTime = (d) => {
  const dt = parseApiDate(d);
  if (!dt) return "";
  return dt.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: INDIA_TZ,
  });
};

export const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = parseApiDate(d);
  if (!dt) return "—";
  return `${fmtDate(dt)} ${fmtTime(dt)}`;
};

const CLOSED_ORDER_STATUSES = new Set([
  "completed",
  "billed",
  "rejected",
  "cancelled",
]);

const PROGRESS_ORDER_STATUSES = new Set([
  "viewed",
  "transferred",
  "accepted",
]);

/** Three-tone order status color: new | progress | closed */
export function orderStatusTone(status) {
  if (status === "received") return "new";
  if (CLOSED_ORDER_STATUSES.has(status)) return "closed";
  if (PROGRESS_ORDER_STATUSES.has(status)) return "progress";
  return "progress";
}
