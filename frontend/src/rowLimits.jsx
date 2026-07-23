/** Shared row-limit choices for list pages (Products, Stock, Outstanding). */
export const ROW_LIMIT_CHOICES = [25, 50, 100, 150];
/** Sent to API as limit=0 → backend returns all rows. */
export const ROW_LIMIT_ALL = 0;

export function RowLimitSelect({ value, onChange, disabled }) {
  return (
    <select
      className="rows-select"
      aria-label="Rows to show"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {ROW_LIMIT_CHOICES.map((n) => (
        <option key={n} value={n}>
          {n} rows
        </option>
      ))}
      <option value={ROW_LIMIT_ALL}>ALL</option>
    </select>
  );
}
