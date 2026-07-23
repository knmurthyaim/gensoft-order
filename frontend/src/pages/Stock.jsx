import { useEffect, useState } from "react";
import Modal from "../components/Modal.jsx";
import { SortTh, nextSort } from "../components/SortTh.jsx";
import { RowLimitSelect } from "../rowLimits.jsx";
import { batches, products as prodApi } from "../api";
import {
  fmtExpiry,
  fromExpiryMonthInput,
  inr,
  toExpiryMonthInput,
} from "../format";

const empty = {
  product_id: "",
  batch_no: "",
  expiry_date: "",
  available_qty: 0,
  scheme: "",
  mrp: 0,
  ptr_rate: 0,
  pts_rate: 0,
  show_to_customer: true,
};

export default function Stock() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const load = (
    q = appliedSearch,
    rowLimit = limit,
    by = sortBy,
    dir = sortDir
  ) => {
    setLoading(true);
    return batches
      .list({
        search: q || undefined,
        limit: rowLimit,
        sort_by: by,
        sort_dir: dir,
      })
      .then(setRows)
      .catch(() => setError("Failed to load stock."))
      .finally(() => setLoading(false));
  };

  const onSort = (col) => {
    const next = nextSort(sortBy, sortDir, col);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    load(appliedSearch, limit, next.sortBy, next.sortDir);
  };

  const loadProducts = (q = "") =>
    prodApi.list({ search: q || undefined, limit: 25 }).then(setProducts).catch(() => {});

  useEffect(() => {
    load("", 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setProductSearch("");
    loadProducts();
    setError("");
    setShowModal(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setProducts(b.product ? [b.product] : []);
    setForm({
      ...b,
      expiry_date: toExpiryMonthInput(b.expiry_date),
    });
    setError("");
    setShowModal(true);
  };

  const onProductChange = (id) => {
    const p = pMap[id];
    setForm((f) => ({
      ...f,
      product_id: id,
      mrp: p ? p.mrp : f.mrp,
      ptr_rate: p ? p.ptr_rate : f.ptr_rate,
      pts_rate: p ? p.pts_rate : f.pts_rate,
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        product_id: parseInt(form.product_id, 10),
        batch_no: form.batch_no,
        expiry_date: fromExpiryMonthInput(form.expiry_date),
        available_qty: parseInt(form.available_qty, 10) || 0,
        scheme: form.scheme,
        mrp: parseFloat(form.mrp) || 0,
        ptr_rate: parseFloat(form.ptr_rate) || 0,
        pts_rate: parseFloat(form.pts_rate) || 0,
        show_to_customer: !!form.show_to_customer,
      };
      if (editing) {
        const { product_id, ...upd } = payload;
        await batches.update(editing.id, upd);
      } else {
        await batches.create(payload);
      }
      setShowModal(false);
      load(appliedSearch);
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed.");
    }
  };

  const remove = async (b) => {
    if (!confirm("Delete this batch?")) return;
    await batches.remove(b.id);
    load(appliedSearch);
  };

  const toggleVisible = async (b) => {
    await batches.update(b.id, { show_to_customer: !b.show_to_customer });
    load(appliedSearch);
  };

  const nearExpiry = (d) => {
    if (!d) return false;
    return (new Date(d) - new Date()) / 86400000 <= 90;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock / Batches</h1>
          <p className="page-sub">
            Batch-wise inventory. Toggle &quot;Show&quot; to share a batch with connected
            customers. Expiry is month &amp; year only. Click headers to sort.
          </p>
        </div>
        <button className="btn" onClick={openCreate}>
          + Add Batch
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
          placeholder="Search product, code or batch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn secondary" type="submit" disabled={loading}>
          Search
        </button>
        <RowLimitSelect
          value={limit}
          onChange={(next) => {
            setLimit(next);
            load(appliedSearch, next);
          }}
          disabled={loading}
        />
      </form>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
        {loading ? "Loading…" : `Showing ${rows.length} rows. Search to find other stock.`}
      </p>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <SortTh label="Product" col="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Batch" col="batch" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Expiry" col="expiry" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Qty" col="qty" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Scheme" col="scheme" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="PTR" col="ptr" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="PTS" col="pts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th>Show</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.product?.name || pMap[b.product_id]?.name}</strong>
                </td>
                <td>{b.batch_no || "—"}</td>
                <td className={nearExpiry(b.expiry_date) ? "low-stock" : ""}>
                  {fmtExpiry(b.expiry_date)}
                </td>
                <td className={b.available_qty < 10 ? "low-stock" : ""}>
                  {b.available_qty}
                </td>
                <td>{b.scheme || "—"}</td>
                <td>{inr(b.ptr_rate)}</td>
                <td>{inr(b.pts_rate)}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!b.show_to_customer}
                    onChange={() => toggleVisible(b)}
                  />
                </td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <button className="btn secondary sm" onClick={() => openEdit(b)}>
                    Edit
                  </button>{" "}
                  <button className="btn danger sm" onClick={() => remove(b)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No stock batches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title={editing ? "Edit Batch" : "Add Batch"}
          onClose={() => setShowModal(false)}
        >
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Product</label>
                {!editing && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      placeholder="Find product..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => loadProducts(productSearch.trim())}
                    >
                      Search
                    </button>
                  </div>
                )}
                <select
                  required
                  disabled={!!editing}
                  value={form.product_id}
                  onChange={(e) => onProductChange(e.target.value)}
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.pack_size})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Batch No.</label>
                <input
                  value={form.batch_no}
                  onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Expiry (Month / Year)</label>
                <input
                  type="month"
                  value={form.expiry_date}
                  onChange={(e) =>
                    setForm({ ...form, expiry_date: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Available Qty</label>
                <input
                  type="number"
                  min="0"
                  value={form.available_qty}
                  onChange={(e) =>
                    setForm({ ...form, available_qty: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Scheme (e.g. 10+1)</label>
                <input
                  value={form.scheme}
                  onChange={(e) => setForm({ ...form, scheme: e.target.value })}
                />
              </div>
              <div className="field">
                <label>MRP</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.mrp}
                  onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                />
              </div>
              <div className="field">
                <label>PTR Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.ptr_rate}
                  onChange={(e) => setForm({ ...form, ptr_rate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>PTS Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.pts_rate}
                  onChange={(e) => setForm({ ...form, pts_rate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Show to connected customers</label>
                <select
                  value={form.show_to_customer ? "yes" : "no"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      show_to_customer: e.target.value === "yes",
                    })
                  }
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
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
    </div>
  );
}
