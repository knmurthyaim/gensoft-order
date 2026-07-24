import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../components/Modal.jsx";
import { getDirectory, parties as partiesApi, salesReps as repApi } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { inr } from "../format";
import { mapsUrl } from "../maps";

const empty = {
  code: "",
  name: "",
  party_type: "customer",
  area: "",
  city: "Hyderabad",
  mobile: "",
  dl_no: "",
  gst_no: "",
  sales_rep_id: "",
  pricing_model: "PTR",
};

export default function Parties() {
  const navigate = useNavigate();
  const { account } = useAuth();
  const canClearLocation =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor" ||
    account?.account_type === "stockist";
  const [rows, setRows] = useState([]);
  const [reps, setReps] = useState([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [linkRow, setLinkRow] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [dirSearch, setDirSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = (q = appliedSearch, rowLimit = limit) => {
    setLoading(true);
    return partiesApi
      .list(q ? { search: q, limit: rowLimit } : { limit: rowLimit })
      .then(setRows)
      .catch(() => setError("Failed to load parties."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    repApi.list().then(setReps).catch(() => {});
    load("", 25);
    // Initial page only; later loads happen on Search or row-limit changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repMap = Object.fromEntries(reps.map((r) => [r.id, r.name]));

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setError("");
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      code: p.code,
      name: p.name,
      party_type: p.party_type,
      area: p.area,
      city: p.city,
      mobile: p.mobile,
      dl_no: p.dl_no,
      gst_no: p.gst_no,
      sales_rep_id: p.sales_rep_id || "",
      pricing_model: p.pricing_model,
    });
    setError("");
    setShowModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        sales_rep_id: form.sales_rep_id ? parseInt(form.sales_rep_id, 10) : null,
      };
      if (editing) await partiesApi.update(editing.id, payload);
      else await partiesApi.create(payload);
      setShowModal(false);
      load(appliedSearch);
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed.");
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await partiesApi.remove(p.id);
    load(appliedSearch);
  };

  const clearLocation = async (p) => {
    if (
      !confirm(
        `Remove tagged location for "${p.name}"? Sales reps can tag again after this.`
      )
    )
      return;
    try {
      await partiesApi.clearLocation(p.id);
      load(appliedSearch);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not remove location.");
    }
  };

  const openLink = (p) => {
    setLinkRow(p);
    setDirSearch("");
    getDirectory().then(setDirectory).catch(() => {});
  };

  const doLink = async (accountId) => {
    await partiesApi.link(linkRow.id, accountId);
    setLinkRow(null);
    load(appliedSearch);
  };

  const dirFiltered = directory.filter(
    (d) =>
      !dirSearch ||
      d.name.toLowerCase().includes(dirSearch.toLowerCase()) ||
      d.gensoft_code.toLowerCase().includes(dirSearch.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Parties</h1>
          <p className="page-sub">
            Your own party master. Sales reps can tag shop GPS (shared for all
            reps). Only stockist/distributor can remove a tagged location.
          </p>
        </div>
        <button className="btn" onClick={openCreate}>
          + Add Party
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const q = search.trim();
          setAppliedSearch(q);
          load(q);
        }}
      >
        <input
          className="search-input"
          placeholder="Search parties by name, code, area..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setError("");
          }}
        />
        <button className="btn secondary" type="submit" disabled={loading}>
          Search
        </button>
        <select
          className="rows-select"
          aria-label="Rows to show"
          value={limit}
          onChange={(e) => {
            const next = Number(e.target.value);
            setLimit(next);
            load(appliedSearch, next);
          }}
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} rows</option>
          ))}
        </select>
      </form>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
        {loading
          ? "Loading…"
          : appliedSearch
            ? `Showing up to ${rows.length} match${rows.length === 1 ? "" : "es"}`
            : `Showing first ${rows.length} parties — search to find others`}
      </p>

      <div className="panel">
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Area</th>
              <th>DL No</th>
              <th>Rep</th>
              <th>Shop location</th>
              <th>Outstanding</th>
              <th>GenSoft Link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.code || "—"}</td>
                <td>
                  <strong>{p.name}</strong>
                  <div className="muted">{p.mobile}</div>
                </td>
                <td>{p.party_type}</td>
                <td>{p.area || "—"}</td>
                <td>{p.dl_no || "—"}</td>
                <td>{p.sales_rep_id ? repMap[p.sales_rep_id] : "—"}</td>
                <td>
                  {p.location_lat != null && p.location_lng != null ? (
                    <div style={{ display: "grid", gap: 4 }}>
                      <span className="status-pill accepted">Tagged</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        by {p.location_tagged_by_name || "rep"}
                      </span>
                      <a
                        href={mapsUrl(p.location_lat, p.location_lng)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View map
                      </a>
                      {canClearLocation && (
                        <button
                          type="button"
                          className="btn danger sm"
                          onClick={() => clearLocation(p)}
                        >
                          Remove tag
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="muted">Not tagged</span>
                  )}
                </td>
                <td className={p.outstanding_balance > 0 ? "low-stock" : ""}>
                  {p.outstanding_balance > 0 ? (
                    <button
                      type="button"
                      className="link-btn outstanding-link"
                      title="View outstanding bills"
                      onClick={() => {
                        const params = new URLSearchParams();
                        if (p.code) params.set("party_id", p.code);
                        if (p.name) params.set("party_name", p.name);
                        navigate(`/outstanding?${params.toString()}`);
                      }}
                    >
                      {inr(p.outstanding_balance)}
                    </button>
                  ) : (
                    inr(p.outstanding_balance)
                  )}
                </td>
                <td>
                  {p.linked_account ? (
                    <span className="status-pill accepted">
                      {p.linked_account.gensoft_code}
                    </span>
                  ) : (
                    <button
                      className="btn secondary sm"
                      onClick={() => openLink(p)}
                    >
                      Link
                    </button>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <button className="btn secondary sm" onClick={() => openEdit(p)}>
                    Edit
                  </button>{" "}
                  <button className="btn danger sm" onClick={() => remove(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">
                  {appliedSearch ? "No parties match your search." : "No parties found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title={editing ? "Edit Party" : "Add Party"}
          onClose={() => setShowModal(false)}
        >
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field">
                <label>Code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Type</label>
                <select
                  value={form.party_type}
                  onChange={(e) =>
                    setForm({ ...form, party_type: e.target.value })
                  }
                >
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Area</label>
                <input
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                />
              </div>
              <div className="field">
                <label>City</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Mobile</label>
                <input
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </div>
              <div className="field">
                <label>DL No.</label>
                <input
                  value={form.dl_no}
                  onChange={(e) => setForm({ ...form, dl_no: e.target.value })}
                />
              </div>
              <div className="field">
                <label>GST No.</label>
                <input
                  value={form.gst_no}
                  onChange={(e) => setForm({ ...form, gst_no: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Sales Rep</label>
                <select
                  value={form.sales_rep_id}
                  onChange={(e) =>
                    setForm({ ...form, sales_rep_id: e.target.value })
                  }
                >
                  <option value="">— none —</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Pricing</label>
                <select
                  value={form.pricing_model}
                  onChange={(e) =>
                    setForm({ ...form, pricing_model: e.target.value })
                  }
                >
                  <option value="PTR">PTR</option>
                  <option value="PTS">PTS</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {linkRow && (
        <Modal
          title={`Link "${linkRow.name}" to GenSoft account`}
          onClose={() => setLinkRow(null)}
        >
          <input
            className="search-input"
            placeholder="Search GenSoft directory..."
            value={dirSearch}
            onChange={(e) => setDirSearch(e.target.value)}
            style={{ marginBottom: 12, maxWidth: "100%" }}
          />
          <div className="link-list">
            {dirFiltered.map((d) => (
              <div className="link-item" key={d.id}>
                <div>
                  <strong>{d.name}</strong>
                  <div className="muted">
                    {d.gensoft_code} · {d.account_type} · {d.area}
                  </div>
                </div>
                <button className="btn sm" onClick={() => doLink(d.id)}>
                  Link
                </button>
              </div>
            ))}
            {dirFiltered.length === 0 && (
              <div className="empty">No matching accounts.</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
