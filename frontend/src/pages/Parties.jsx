import { useEffect, useState } from "react";
import Modal from "../components/Modal.jsx";
import { getDirectory, parties as partiesApi, salesReps as repApi } from "../api";
import { inr } from "../format";

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
  const [rows, setRows] = useState([]);
  const [reps, setReps] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [linkRow, setLinkRow] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [dirSearch, setDirSearch] = useState("");
  const [error, setError] = useState("");

  const load = (q = "") =>
    partiesApi
      .list(q ? { search: q } : undefined)
      .then(setRows)
      .catch(() => setError("Failed to load parties."));

  useEffect(() => {
    load();
    repApi.list().then(setReps).catch(() => {});
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
      load(search);
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed.");
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await partiesApi.remove(p.id);
    load(search);
  };

  const openLink = (p) => {
    setLinkRow(p);
    setDirSearch("");
    getDirectory().then(setDirectory).catch(() => {});
  };

  const doLink = async (accountId) => {
    await partiesApi.link(linkRow.id, accountId);
    setLinkRow(null);
    load(search);
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
            Your own party master. Link a party to its GenSoft account to enable
            connected ordering.
          </p>
        </div>
        <button className="btn" onClick={openCreate}>
          + Add Party
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search parties..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            load(e.target.value);
          }}
        />
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Area</th>
              <th>DL No</th>
              <th>Rep</th>
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
                <td className={p.outstanding_balance > 0 ? "low-stock" : ""}>
                  {inr(p.outstanding_balance)}
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No parties found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
