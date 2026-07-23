import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../api";

const ACCOUNT_TYPES = [
  { value: "retailer", label: "Retailer / Pharmacy" },
  { value: "distributor", label: "Distributor" },
  { value: "sub_distributor", label: "Sub-distributor" },
  { value: "stockist", label: "Stockist" },
];

const DOC_TYPES = [
  { value: "dl", label: "Drug Licence (DL)" },
  { value: "gst", label: "GST certificate" },
  { value: "address_proof", label: "Address proof" },
  { value: "other", label: "Other document" },
];

const empty = {
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
  notes: "",
};

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [files, setFiles] = useState([]); // { file, doc_type }
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const file of picked) {
        if (next.length >= 8) break;
        next.push({ file, doc_type: "other" });
      }
      return next;
    });
    e.target.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      files.forEach((item) => {
        fd.append("files", item.file);
        fd.append("doc_types", item.doc_type);
      });
      const res = await auth.register(fd);
      setDone(res);
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="login-screen">
        <div className="login-card signup-card">
          <div className="login-brand">
            <div className="login-logo">GenSoft</div>
            <div className="login-tagline">Registration submitted</div>
          </div>
          <div className="notice-banner">
            {done.message}
            <div style={{ marginTop: 8 }}>
              Your GenSoft code: <strong>{done.gensoft_code}</strong>
            </div>
          </div>
          <p className="muted">
            Super Admin will review your details and attachments. You can sign
            in only after approval.
          </p>
          <button className="btn zennx-btn login-submit" onClick={() => navigate("/")}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card signup-card">
        <div className="login-brand">
          <div className="login-logo">GenSoft</div>
          <div className="login-tagline">Create your business account</div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Account type</label>
              <select
                value={form.account_type}
                onChange={(e) => setField("account_type", e.target.value)}
                required
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Business name</label>
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Owner name</label>
              <input
                value={form.owner_name}
                onChange={(e) => setField("owner_name", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Mobile</label>
              <input
                value={form.mobile}
                onChange={(e) => setField("mobile", e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Address</label>
              <input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Area</label>
              <input
                value={form.area}
                onChange={(e) => setField("area", e.target.value)}
              />
            </div>
            <div className="field">
              <label>City</label>
              <input
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
              />
            </div>
            <div className="field">
              <label>DL No</label>
              <input
                value={form.dl_no}
                onChange={(e) => setField("dl_no", e.target.value)}
              />
            </div>
            <div className="field">
              <label>GST No</label>
              <input
                value={form.gst_no}
                onChange={(e) => setField("gst_no", e.target.value)}
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Login username</label>
              <input
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                required
                minLength={4}
                autoComplete="new-password"
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Notes for Super Admin (optional)</label>
              <input
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Anything we should know…"
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Attachments (DL / GST / address proof — max 8, 8 MB each)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls"
              multiple
              onChange={onPickFiles}
            />
            {files.length > 0 && (
              <ul className="signup-file-list">
                {files.map((item, idx) => (
                  <li key={`${item.file.name}-${idx}`}>
                    <span className="signup-file-name">{item.file.name}</span>
                    <select
                      value={item.doc_type}
                      onChange={(e) => {
                        const next = [...files];
                        next[idx] = { ...next[idx], doc_type: e.target.value };
                        setFiles(next);
                      }}
                    >
                      {DOC_TYPES.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn danger sm"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className="btn zennx-btn login-submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit for Approval"}
          </button>
        </form>

        <p className="login-note muted">
          Already registered? <Link to="/">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
