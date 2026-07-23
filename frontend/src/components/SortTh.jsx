/** Clickable table header for ascending/descending sort. */

export function SortTh({
  label,
  col,
  sortBy,
  sortDir,
  onSort,
  align = "left",
  style,
}) {
  const active = sortBy === col;
  const arrow = !active ? "" : sortDir === "asc" ? " ↑" : " ↓";
  return (
    <th
      className={`sortable-th${active ? " active" : ""}`}
      style={{ textAlign: align, cursor: "pointer", userSelect: "none", ...style }}
      onClick={() => onSort(col)}
      title={`Sort by ${label}`}
    >
      {label}
      {arrow}
    </th>
  );
}

/** Toggle sort column/direction. Same column flips dir; new column starts asc. */
export function nextSort(prevBy, prevDir, col, defaultDir = "asc") {
  if (prevBy === col) {
    return { sortBy: col, sortDir: prevDir === "asc" ? "desc" : "asc" };
  }
  return { sortBy: col, sortDir: defaultDir };
}
