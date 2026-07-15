import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { salesReps } from "../api";
import { fmtDateTime } from "../format";

function mapsUrl(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

function embedUrl(lat, lng) {
  const d = 0.01;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function ageLabel(minutes) {
  if (minutes == null) return "No signal yet";
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function RepTracking() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [trail, setTrail] = useState([]);
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
      .locationTrail(selectedId, { limit: 200 })
      .then(setTrail)
      .catch(() => setTrail([]));
  }, [selectedId]);

  const selected = useMemo(
    () => rows.find((r) => r.sales_rep_id === selectedId) || null,
    [rows, selectedId]
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rep Location</h1>
          <p className="page-sub">
            Positions are saved on the rep&apos;s phone every 10 minutes, then
            uploaded when they open GenSoft or get network. History is kept for
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
                    selectedId === r.sales_rep_id ? "rep-track-row active" : "rep-track-row"
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
                        r.latitude != null ? "status-pill accepted" : "status-pill pending"
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
            <div className="empty">Select a sales rep to view map &amp; 7-day trail.</div>
          )}
          {selected && selected.latitude == null && (
            <div className="empty">
              No GPS yet for <strong>{selected.sales_rep_name}</strong>. They must
              open the GenSoft rep app and allow location while Settings tracking
              is ON.
            </div>
          )}
          {selected && selected.latitude != null && (
            <>
              <div className="rep-track-detail-head">
                <div>
                  <strong>{selected.sales_rep_name}</strong>
                  <div className="muted">
                    {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                    {selected.accuracy_m != null
                      ? ` · ±${Math.round(selected.accuracy_m)}m`
                      : ""}
                  </div>
                </div>
                <a
                  className="btn sm"
                  href={mapsUrl(selected.latitude, selected.longitude)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open map
                </a>
              </div>
              <iframe
                title="Sales rep map"
                className="rep-track-map"
                src={embedUrl(selected.latitude, selected.longitude)}
              />
              <h3 className="rep-track-trail-title">Trail (last 7 days)</h3>
              <div className="rep-track-trail">
                {trail.length === 0 && (
                  <div className="muted">No history points yet.</div>
                )}
                {trail.map((p) => (
                  <div key={p.id} className="rep-track-trail-row">
                    <span>
                      {fmtDateTime(p.recorded_at)} IST
                    </span>
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
