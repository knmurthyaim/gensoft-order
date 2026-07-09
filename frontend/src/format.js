export const inr = (n) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
};

export const fmtTime = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export const fmtDateTime = (d) => {
  if (!d) return "—";
  return `${fmtDate(d)} ${fmtTime(d)}`;
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
