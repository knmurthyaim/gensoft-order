import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { SortTh, nextSort } from "./SortTh.jsx";
import { RowLimitSelect } from "../rowLimits.jsx";

function emptyFromFields(fields) {
  const obj = {};
  fields.forEach((f) => {
    obj[f.name] = f.default !== undefined ? f.default : "";
  });
  return obj;
}

/**
 * Generic CRUD page.
 * props:
 *  - title, subtitle, addLabel
 *  - resource: { list, create, update, remove } from api.js
 *  - columns: [{ header, render(row), sort? }]  // sort = API sort_by key
 *  - fields: [{ name, label, type, default, required, options, half }]
 *  - searchable (bool)
 *  - defaultSortBy / defaultSortDir (when any column has sort)
 */
export default function CrudPage({
  title,
  subtitle,
  addLabel = "+ Add",
  resource,
  columns,
  fields,
  searchable = true,
  serverLimited = false,
  defaultSortBy = "name",
  defaultSortDir = "asc",
}) {
  const sortable = columns.some((c) => c.sort);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [sortDir, setSortDir] = useState(defaultSortDir);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyFromFields(fields));
  const [error, setError] = useState("");

  const load = (
    q = appliedSearch,
    rowLimit = limit,
    by = sortBy,
    dir = sortDir
  ) => {
    setLoading(true);
    const params = {};
    if (searchable && q) params.search = q;
    if (serverLimited) params.limit = rowLimit;
    if (sortable) {
      params.sort_by = by;
      params.sort_dir = dir;
    }
    return resource
      .list(Object.keys(params).length ? params : undefined)
      .then(setRows)
      .catch(() => setError("Failed to load data."))
      .finally(() => setLoading(false));
  };

  const onSort = (col) => {
    const next = nextSort(sortBy, sortDir, col);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    load(appliedSearch, limit, next.sortBy, next.sortDir);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyFromFields(fields));
    setError("");
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    const f = {};
    fields.forEach((fl) => {
      let val = row[fl.name] ?? (fl.default !== undefined ? fl.default : "");
      if (fl.type === "boolean") val = !!val;
      f[fl.name] = val;
    });
    setForm(f);
    setError("");
    setShowModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {};
      fields.forEach((f) => {
        let v = form[f.name];
        if (f.type === "number") v = v === "" ? 0 : parseFloat(v);
        if (f.type === "fk")
          v = v === "" ? null : parseInt(v, 10);
        if (f.type === "boolean") v = v === true || v === "true" || v === "yes";
        if (f.type === "password" && editing && !v) return;
        payload[f.name] = v;
      });
      if (editing) await resource.update(editing.id, payload);
      else await resource.create(payload);
      setShowModal(false);
      load(appliedSearch);
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed.");
    }
  };

  const remove = async (row) => {
    if (!confirm("Delete this record?")) return;
    try {
      await resource.remove(row.id);
      load(appliedSearch);
    } catch (err) {
      alert(err.response?.data?.detail || "Delete failed.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        <button className="btn" onClick={openCreate}>
          {addLabel}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {searchable && (
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
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn secondary" type="submit" disabled={loading}>
            Search
          </button>
          {serverLimited && (
            <RowLimitSelect
              value={limit}
              onChange={(next) => {
                setLimit(next);
                load(appliedSearch, next);
              }}
              disabled={loading}
            />
          )}
        </form>
      )}

      {serverLimited && (
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          {loading
            ? "Loading…"
            : `Showing ${rows.length} rows. Search to find other records.${
                sortable ? " Click headers to sort." : ""
              }`}
        </p>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              {columns.map((c) =>
                c.sort ? (
                  <SortTh
                    key={c.header}
                    label={c.header}
                    col={c.sort}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                ) : (
                  <th key={c.header}>{c.header}</th>
                )
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.header}>{c.render(row)}</td>
                ))}
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <button
                    className="btn secondary sm"
                    onClick={() => openEdit(row)}
                  >
                    Edit
                  </button>{" "}
                  <button className="btn danger sm" onClick={() => remove(row)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="empty">
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title={`${editing ? "Edit" : "Add"} ${title.replace(/s$/, "")}`}
          onClose={() => setShowModal(false)}
        >
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={save}>
            <div className="form-grid">
              {fields.map((f) => (
                <div
                  className="field"
                  key={f.name}
                  style={{ gridColumn: f.full ? "1 / -1" : "auto" }}
                >
                  <label>{f.label}</label>
                  {f.type === "fk" ? (
                    <select
                      value={form[f.name] ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, [f.name]: e.target.value })
                      }
                    >
                      <option value="">— none —</option>
                      {(f.options || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "boolean" ? (
                    <select
                      value={form[f.name] ? "yes" : "no"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [f.name]: e.target.value === "yes",
                        })
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  ) : (
                    <input
                      type={
                        f.type === "number"
                          ? "number"
                          : f.type === "password"
                            ? "password"
                            : "text"
                      }
                      step={f.type === "number" ? "0.01" : undefined}
                      required={f.required && !editing}
                      autoComplete={
                        f.type === "password" ? "new-password" : undefined
                      }
                      placeholder={
                        f.type === "password" && editing
                          ? "Leave blank to keep current"
                          : undefined
                      }
                      value={form[f.name] ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, [f.name]: e.target.value })
                      }
                    />
                  )}
                </div>
              ))}
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
