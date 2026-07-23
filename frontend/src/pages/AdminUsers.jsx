import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import Modal from "../components/Modal.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import AdminDataManage from "../components/AdminDataManage.jsx";
import { admin as adminApi } from "../api";

const emptyForm = {
  account_type: "retailer",
  name: "",
  owner_name: "",
  address: "",
  area: "",
  city: "Hyderabad",
  mobile: "",
  dl_no: "",
  gst_no: "",
  email: "",
  username: "",
  password: "",
};

export default function AdminUsers() {
  const { logout } = useAuth();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    name: "",
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [managingData, setManagingData] = useState(null);
  const [actingId, setActingId] = useState(null);
  const fileInputRef = useRef(null);
  const searchTimer = useRef(null);

  const load = (q = search, status = statusFilter) =>
    adminApi
      .listAccounts(
        (q || "").trim() || undefined,
        status === "all" ? undefined : status
      )
      .then(setRows)
      .catch(() => setError("Failed to load accounts."));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const onSearchChange = (value) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(value, statusFilter), 280);
  };

  const approve = async (row) => {
    setActingId(row.account.id);
    setError("");
    try {
      await adminApi.approveAccount(row.account.id);
      setNotice(`${row.account.name} approved — they can sign in now.`);
      setViewing(null);
      load();
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Approve failed.");
    } finally {
      setActingId(null);
    }
  };

  const reject = async (row) => {
    const reason = window.prompt(
      "Optional rejection reason (shown if they try to sign in):",
      ""
    );
    if (reason === null) return;
    setActingId(row.account.id);
    setError("");
    try {
      await adminApi.rejectAccount(row.account.id, reason || "");
      setNotice(`${row.account.name} rejected.`);
      setViewing(null);
      load();
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Reject failed.");
    } finally {
      setActingId(null);
    }
  };

  const statusLabel = (r) => {
    const s = r.account.approval_status || "approved";
    if (s === "pending") return "pending approval";
    if (s === "rejected") return "rejected";
    if (r.user_is_active && r.account.is_active) return "active";
    return "disabled";
  };

  const statusClass = (r) => {
    const s = r.account.approval_status || "approved";
    if (s === "pending") return "pending";
    if (s === "rejected") return "rejected";
    if (r.user_is_active && r.account.is_active) return "accepted";
    return "rejected";
  };

  const openCreate = () => {
    setForm(emptyForm);
    setError("");
    setShowCreate(true);
  };

  const openEdit = (row) => {
    setViewing(null);
    setEditing(row);
    setForm({
      account_type: row.account.account_type,
      name: row.account.name,
      owner_name: row.account.owner_name,
      address: row.account.address,
      area: row.account.area,
      city: row.account.city,
      mobile: row.account.mobile,
      dl_no: row.account.dl_no,
      gst_no: row.account.gst_no,
      email: row.account.email,
      username: row.username,
      password: "",
    });
    setUserForm({
      username: row.username,
      password: "",
      name: row.user_name,
      is_active: row.user_is_active,
    });
    setError("");
  };

  const openView = async (row) => {
    setError("");
    try {
      const fresh = await adminApi.getAccount(row.account.id);
      setViewing(fresh);
    } catch {
      setViewing(row);
    }
  };

  const saveCreate = async (e) => {
    e.preventDefault();
    try {
      await adminApi.createAccount(form);
      setShowCreate(false);
      setNotice("User registered successfully.");
      load();
      setTimeout(() => setNotice(""), 2500);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not create user.");
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await adminApi.updateAccount(editing.account.id, {
        account_type: form.account_type,
        name: form.name,
        owner_name: form.owner_name,
        address: form.address,
        area: form.area,
        city: form.city,
        mobile: form.mobile,
        dl_no: form.dl_no,
        gst_no: form.gst_no,
        email: form.email,
        is_active: userForm.is_active,
      });
      const userPayload = {
        username: userForm.username,
        name: userForm.name,
        is_active: userForm.is_active,
      };
      if (userForm.password) userPayload.password = userForm.password;
      await adminApi.updateUser(editing.user_id, userPayload);
      setEditing(null);
      setNotice("User updated successfully.");
      load();
      setTimeout(() => setNotice(""), 2500);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not update user.");
    }
  };

  const confirmDelete = async (row) => {
    const code = row.account.gensoft_code;
    const name = row.account.name;
    const ok = window.confirm(
      `Delete customer "${name}" (${code})?\n\n` +
        "This permanently removes the account, login, products, parties, orders and related data. This cannot be undone."
    );
    if (!ok) return;
    setDeletingId(row.account.id);
    setError("");
    try {
      await adminApi.deleteAccount(row.account.id);
      setViewing(null);
      setEditing(null);
      setNotice(`Deleted ${name} (${code}).`);
      load();
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not delete account.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await adminApi.uploadExcel(file);
      const msg = `Upload complete: ${result.created} created, ${result.failed} failed.`;
      if (result.errors?.length) {
        setError(result.errors.join(" "));
      }
      setNotice(msg);
      load();
      setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || "Excel upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <div className="login-logo">GenSoft</div>
          <div className="muted">Super Admin Panel</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="logout-btn" onClick={() => setShowPassword(true)}>
            Change Password
          </button>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="page-header">
          <div>
            <h1 className="page-title">User Registration &amp; Management</h1>
            <p className="page-sub">
              Review pending signups (with attachments), approve or reject, and
              manage all accounts
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => adminApi.downloadTemplate()}
            >
              Download Excel Template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={handleUpload}
            />
            <button
              type="button"
              className="btn secondary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload from Excel"}
            </button>
            <button className="btn" onClick={openCreate}>
              + Register New User
            </button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="notice-banner">{notice}</div>}

        <div className="panel" style={{ marginBottom: 12, padding: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            {[
              { id: "pending", label: "Pending approval" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
              { id: "all", label: "All" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn sm ${statusFilter === t.id ? "" : "secondary"}`}
                onClick={() => setStatusFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Search customers</label>
            <input
              placeholder="GenSoft code, business name, username, mobile, GST, DL…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Showing {rows.length} account{rows.length === 1 ? "" : "s"}
            {search.trim() ? ` matching “${search.trim()}”` : ""}
          </div>
        </div>

        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Business</th>
                <th>Type</th>
                <th>Username</th>
                <th>Mobile</th>
                <th>Docs</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account.id}>
                  <td>{r.account.gensoft_code}</td>
                  <td>
                    <strong>{r.account.name}</strong>
                    <div className="muted">{r.account.owner_name}</div>
                  </td>
                  <td>{r.account.account_type}</td>
                  <td>{r.username}</td>
                  <td>{r.account.mobile || "—"}</td>
                  <td>{r.attachment_count || 0}</td>
                  <td>
                    <span className={`status-pill ${statusClass(r)}`}>
                      {statusLabel(r)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="btn secondary sm"
                      onClick={() => openView(r)}
                    >
                      View
                    </button>{" "}
                    {(r.account.approval_status || "") === "pending" && (
                      <>
                        <button
                          className="btn sm"
                          disabled={actingId === r.account.id}
                          onClick={() => approve(r)}
                        >
                          Approve
                        </button>{" "}
                        <button
                          className="btn secondary sm"
                          disabled={actingId === r.account.id}
                          onClick={() => reject(r)}
                          style={{ color: "#b91c1c" }}
                        >
                          Reject
                        </button>{" "}
                      </>
                    )}
                    <button
                      className="btn secondary sm"
                      onClick={() => setManagingData(r)}
                    >
                      Data
                    </button>{" "}
                    <button
                      className="btn secondary sm"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </button>{" "}
                    <button
                      className="btn secondary sm"
                      disabled={deletingId === r.account.id}
                      onClick={() => confirmDelete(r)}
                      style={{ color: "#b91c1c" }}
                    >
                      {deletingId === r.account.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    {statusFilter === "pending"
                      ? "No pending registrations."
                      : search.trim()
                        ? "No customers match this search."
                        : "No users registered yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showCreate && (
        <Modal title="Register New User" onClose={() => setShowCreate(false)} wide>
          <form onSubmit={saveCreate}>
            <AccountForm form={form} setForm={setForm} includeLogin />
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn">
                Register
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal
          title={`Customer — ${viewing.account.name}`}
          onClose={() => setViewing(null)}
          wide
        >
          <AccountDetail row={viewing} />
          <div className="modal-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setViewing(null)}
            >
              Close
            </button>
            {(viewing.account.approval_status || "") === "pending" && (
              <>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ color: "#b91c1c" }}
                  disabled={actingId === viewing.account.id}
                  onClick={() => reject(viewing)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={actingId === viewing.account.id}
                  onClick={() => approve(viewing)}
                >
                  Approve
                </button>
              </>
            )}
            <button
              type="button"
              className="btn secondary"
              style={{ color: "#b91c1c" }}
              onClick={() => confirmDelete(viewing)}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => openEdit(viewing)}
            >
              Modify
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Edit — ${editing.account.name}`}
          onClose={() => setEditing(null)}
          wide
        >
          <form onSubmit={saveEdit}>
            <div className="muted" style={{ marginBottom: 10 }}>
              GenSoft code: <strong>{editing.account.gensoft_code}</strong>
            </div>
            <AccountForm form={form} setForm={setForm} />
            <h3 style={{ fontSize: 15, marginTop: 16 }}>Login Details</h3>
            <div className="form-grid">
              <div className="field">
                <label>Username</label>
                <input
                  required
                  value={userForm.username}
                  onChange={(e) =>
                    setUserForm({ ...userForm, username: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>New Password (leave blank to keep)</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) =>
                    setUserForm({ ...userForm, password: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Contact Name</label>
                <input
                  value={userForm.name}
                  onChange={(e) =>
                    setUserForm({ ...userForm, name: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Active</label>
                <select
                  value={userForm.is_active ? "yes" : "no"}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      is_active: e.target.value === "yes",
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
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn secondary"
                style={{ color: "#b91c1c" }}
                onClick={() => confirmDelete(editing)}
              >
                Delete
              </button>
              <button type="submit" className="btn">
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {managingData && (
        <AdminDataManage
          row={managingData}
          onClose={() => setManagingData(null)}
          onNotice={(msg) => {
            setNotice(msg);
            setTimeout(() => setNotice(""), 4000);
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {showPassword && (
        <ChangePasswordModal
          onClose={() => setShowPassword(false)}
          onSuccess={(msg) => {
            setNotice(msg);
            setTimeout(() => setNotice(""), 2500);
          }}
        />
      )}
    </div>
  );
}

function AccountDetail({ row }) {
  const a = row.account;
  const fields = [
    ["GenSoft Code", a.gensoft_code],
    ["Business Name", a.name],
    ["Account Type", a.account_type],
    ["Owner Name", a.owner_name || "—"],
    ["Username", row.username],
    ["Contact Name", row.user_name || "—"],
    ["Mobile", a.mobile || "—"],
    ["Email", a.email || "—"],
    ["DL No", a.dl_no || "—"],
    ["GST No", a.gst_no || "—"],
    ["Area", a.area || "—"],
    ["City", a.city || "—"],
    ["Address", a.address || "—"],
    ["Approval", a.approval_status || "approved"],
    ["Signup notes", a.signup_notes || "—"],
    ["Rejection reason", a.rejection_reason || "—"],
    ["Account Status", a.is_active ? "Active" : "Disabled"],
    ["Login Status", row.user_is_active ? "Active" : "Disabled"],
  ];
  const attachments = row.attachments || [];
  return (
    <div>
      <div className="form-grid">
        {fields.map(([label, value]) => (
          <div
            key={label}
            className="field"
            style={
              ["Address", "Business Name", "Signup notes", "Rejection reason"].includes(
                label
              )
                ? { gridColumn: "1 / -1" }
                : undefined
            }
          >
            <label>{label}</label>
            <div
              style={{
                padding: "8px 10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                minHeight: 38,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 15, marginTop: 16 }}>Attachments</h3>
      {attachments.length === 0 ? (
        <p className="muted">No documents uploaded.</p>
      ) : (
        <ul className="signup-file-list">
          {attachments.map((att) => (
            <li key={att.id}>
              <span className="signup-file-name">
                [{att.doc_type}] {att.original_filename}
              </span>
              <button
                type="button"
                className="btn secondary sm"
                onClick={() =>
                  adminApi.downloadAttachment(att.id, att.original_filename)
                }
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountForm({ form, setForm, includeLogin = false }) {
  return (
    <div className="form-grid">
      <div className="field">
        <label>Account Type</label>
        <select
          value={form.account_type}
          onChange={(e) => setForm({ ...form, account_type: e.target.value })}
        >
          <option value="retailer">Retailer</option>
          <option value="stockist">Stockist</option>
          <option value="distributor">Distributor</option>
          <option value="sub_distributor">Sub-Distributor</option>
        </select>
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>Business Name</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Owner Name</label>
        <input
          value={form.owner_name}
          onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
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
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>Address</label>
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Email</label>
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      {includeLogin && (
        <>
          <div className="field">
            <label>Username</label>
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
