import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";

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
 *  - columns: [{ header, render(row) }]
 *  - fields: [{ name, label, type, default, required, options, half }]
 *  - searchable (bool)
 */
export default function CrudPage({
  title,
  subtitle,
  addLabel = "+ Add",
  resource,
  columns,
  fields,
  searchable = true,
}) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyFromFields(fields));
  const [error, setError] = useState("");

  const load = (q = "") =>
    resource
      .list(searchable && q ? { search: q } : undefined)
      .then(setRows)
      .catch(() => setError("Failed to load data."));

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
        payload[f.name] = v;
      });
      if (editing) await resource.update(editing.id, payload);
      else await resource.create(payload);
      setShowModal(false);
      load(search);
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed.");
    }
  };

  const remove = async (row) => {
    if (!confirm("Delete this record?")) return;
    try {
      await resource.remove(row.id);
      load(search);
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
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              load(e.target.value);
            }}
          />
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
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
                      type={f.type === "number" ? "number" : "text"}
                      step={f.type === "number" ? "0.01" : undefined}
                      required={f.required}
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
