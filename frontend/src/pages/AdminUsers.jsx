import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import Modal from "../components/Modal.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    name: "",
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = () =>
    adminApi
      .listAccounts()
      .then(setRows)
      .catch(() => setError("Failed to load accounts."));

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setError("");
    setShowCreate(true);
  };

  const openEdit = (row) => {
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
              Create and edit distributor / retailer login accounts
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

        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Business</th>
                <th>Type</th>
                <th>Username</th>
                <th>Mobile</th>
                <th>DL No</th>
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
                  <td>{r.account.dl_no || "—"}</td>
                  <td>
                    <span
                      className={`status-pill ${
                        r.user_is_active && r.account.is_active
                          ? "accepted"
                          : "rejected"
                      }`}
                    >
                      {r.user_is_active && r.account.is_active
                        ? "active"
                        : "disabled"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn secondary sm"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    No users registered yet.
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

      {editing && (
        <Modal
          title={`Edit — ${editing.account.name}`}
          onClose={() => setEditing(null)}
          wide
        >
          <form onSubmit={saveEdit}>
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
              <button type="submit" className="btn">
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
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
