import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { salesReps } from "../api";
import { fmtDateTime, parseApiDate, INDIA_TZ } from "../format";
import { mapsUrl, mapsRouteUrl, mapsEmbedUrl } from "../maps";

function ageLabel(minutes) {
  if (minutes == null) return "No signal yet";
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Calendar day key in IST (YYYY-MM-DD). */
function dayKeyIST(iso) {
  const d = parseApiDate(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatDayLabel(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 30)); // midday-ish IST
  return dt.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: INDIA_TZ,
  });
}

function todayKeyIST() {
  return dayKeyIST(new Date().toISOString());
}

function DayRouteMap({ points }) {
  const ordered = useMemo(() => {
    return [...(points || [])].sort(
      (a, b) =>
        (parseApiDate(a.recorded_at)?.getTime() || 0) -
        (parseApiDate(b.recorded_at)?.getTime() || 0)
    );
  }, [points]);

  if (!ordered.length) {
    return <div className="rep-track-map empty-map">No points to show.</div>;
  }

  const last = ordered[ordered.length - 1];
  const first = ordered[0];
  const routeHref = mapsRouteUrl(ordered);

  return (
    <div className="rep-track-map-wrap">
      <iframe
        title="Google Maps location"
        className="rep-track-map"
        src={mapsEmbedUrl(last.latitude, last.longitude, ordered.length > 1 ? 13 : 15)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="rep-track-map-actions">
        <a className="btn sm" href={routeHref} target="_blank" rel="noreferrer">
          {ordered.length > 1 ? "Open day route in Google Maps" : "Open in Google Maps"}
        </a>
        {ordered.length > 1 && (
          <span className="muted" style={{ fontSize: 12 }}>
            Start {fmtDateTime(first.recorded_at)} → Latest{" "}
            {fmtDateTime(last.recorded_at)} IST · {ordered.length} points
          </span>
        )}
      </div>
    </div>
  );
}

export default function RepTracking() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [trail, setTrail] = useState([]);
  const [selectedDay, setSelectedDay] = useState(todayKeyIST());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    salesReps
      .locationsLatest()
      .then((data) => {
        setRows(data || []);
        setError("");
      })
      .catch((e) =>
        setError(e.response?.data?.detail || "Failed to load locations")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTrail([]);
      return;
    }
    salesReps
      .locationTrail(selectedId, { limit: 500 })
      .then((data) => {
        const points = data || [];
        setTrail(points);
        const days = [
          ...new Set(points.map((p) => dayKeyIST(p.recorded_at)).filter(Boolean)),
        ].sort();
        const today = todayKeyIST();
        if (days.includes(today)) setSelectedDay(today);
        else if (days.length) setSelectedDay(days[days.length - 1]);
        else setSelectedDay(today);
      })
      .catch(() => setTrail([]));
  }, [selectedId]);

  const selected = useMemo(
    () => rows.find((r) => r.sales_rep_id === selectedId) || null,
    [rows, selectedId]
  );

  const dayOptions = useMemo(() => {
    const fromTrail = trail
      .map((p) => dayKeyIST(p.recorded_at))
      .filter(Boolean);
    const set = new Set(fromTrail);
    // Always include today + last 6 days so user can browse empty days too
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      set.add(dayKeyIST(d.toISOString()));
    }
    return [...set].sort().reverse();
  }, [trail]);

  const dayPoints = useMemo(() => {
    return trail
      .filter((p) => dayKeyIST(p.recorded_at) === selectedDay)
      .sort(
        (a, b) =>
          (parseApiDate(a.recorded_at)?.getTime() || 0) -
          (parseApiDate(b.recorded_at)?.getTime() || 0)
      );
  }, [trail, selectedDay]);

  const hasAnyGps =
    (selected && selected.latitude != null) || trail.length > 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rep Location</h1>
          <p className="page-sub">
            Select a day to view that day&apos;s locations on Google Maps (IST).
            Phone checks every 30 seconds and saves only moves of 50m+. History
            7 days. Enable in{" "}
            <Link to="/settings">Settings → Sales Rep Tracking</Link>.
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="rep-track-layout">
        <div className="panel rep-track-list">
          <table>
            <thead>
              <tr>
                <th>Sales Rep</th>
                <th>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.sales_rep_id}
                  className={
                    selectedId === r.sales_rep_id
                      ? "rep-track-row active"
                      : "rep-track-row"
                  }
                  onClick={() => setSelectedId(r.sales_rep_id)}
                >
                  <td>
                    <strong>{r.sales_rep_name}</strong>
                    <div className="muted">{r.phone || "—"}</div>
                  </td>
                  <td>
                    <span
                      className={
                        r.latitude != null
                          ? "status-pill accepted"
                          : "status-pill pending"
                      }
                    >
                      {ageLabel(r.age_minutes)}
                    </span>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {fmtDateTime(r.recorded_at)}
                      {r.recorded_at ? " IST" : ""}
                    </div>
                  </td>
                  <td>
                    {r.latitude != null && (
                      <a
                        className="btn secondary sm"
                        href={mapsUrl(r.latitude, r.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Map
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    No sales reps yet. Add them under Sales Reps.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel rep-track-detail">
          {!selected && (
            <div className="empty">
              Select a sales rep to view day route on the map.
            </div>
          )}
          {selected && !hasAnyGps && (
            <div className="empty">
              No GPS yet for <strong>{selected.sales_rep_name}</strong>. They must
              open the GenSoft rep app and allow location while Settings tracking
              is ON.
            </div>
          )}
          {selected && hasAnyGps && (
            <>
              <div className="rep-track-detail-head">
                <div>
                  <strong>{selected.sales_rep_name}</strong>
                  <div className="muted">
                    {dayPoints.length} point
                    {dayPoints.length === 1 ? "" : "s"} on{" "}
                    {formatDayLabel(selectedDay)}
                  </div>
                </div>
                {dayPoints.length > 0 && (
                  <a
                    className="btn sm"
                    href={mapsRouteUrl(dayPoints)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps
                  </a>
                )}
              </div>

              <div className="rep-track-daybar">
                <label className="muted" htmlFor="rep-track-day">
                  Day (IST)
                </label>
                <select
                  id="rep-track-day"
                  className="rep-track-day-select"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                >
                  {dayOptions.map((d) => {
                    const count = trail.filter(
                      (p) => dayKeyIST(p.recorded_at) === d
                    ).length;
                    return (
                      <option key={d} value={d}>
                        {formatDayLabel(d)}
                        {count ? ` · ${count} pts` : " · no data"}
                      </option>
                    );
                  })}
                </select>
              </div>

              {dayPoints.length === 0 ? (
                <div className="empty" style={{ marginTop: 12 }}>
                  No location points for this day.
                </div>
              ) : (
                <DayRouteMap points={dayPoints} />
              )}

              <h3 className="rep-track-trail-title">
                Points on {formatDayLabel(selectedDay)}
              </h3>
              <div className="rep-track-trail">
                {dayPoints.length === 0 && (
                  <div className="muted">No history for this day.</div>
                )}
                {[...dayPoints].reverse().map((p) => (
                  <div key={p.id} className="rep-track-trail-row">
                    <span>{fmtDateTime(p.recorded_at)} IST</span>
                    <a
                      href={mapsUrl(p.latitude, p.longitude)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
