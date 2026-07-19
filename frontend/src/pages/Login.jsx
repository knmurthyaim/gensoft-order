import { useState } from "react";
import { useAuth } from "../AuthContext.jsx";

const DEMO = [
  { u: "vajra", label: "Vajra Pharma (Distributor)" },
  { u: "balaji", label: "Balaji Agencies (Distributor)" },
  { u: "dattha", label: "Sri Dattha Pharmacy (Retailer)" },
  { u: "vasavi", label: "Vasavi Medical (Retailer)" },
  { u: "naresh", label: "M Naresh (Sales Rep app)" },
];

function isNativeApp() {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isNative = isNativeApp();

  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed.");
      setBusy(false);
    }
  };

  const quickFill = (u, p = "demo1234") => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">GenSoft</div>
          <div className="login-tagline">Connecting Pharma &amp; FMCG Distribution</div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={submitLogin}>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn zennx-btn login-submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign In"}
          </button>

          <div className="demo-box">
            <div className="muted">Demo accounts (password: demo1234)</div>
            <div className="demo-chips">
              {DEMO.map((d) => (
                <button
                  type="button"
                  key={d.u}
                  className="demo-chip"
                  onClick={() => quickFill(d.u)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 12 }}>
              Super Admin: superadmin / admin1234
            </div>
            <button
              type="button"
              className="demo-chip"
              style={{ marginTop: 8 }}
              onClick={() => quickFill("superadmin", "admin1234")}
            >
              Super Admin Login
            </button>
          </div>
        </form>

        <p className="login-note muted">
          New user registration is managed by the Super Admin only.
        </p>

        {!isNative && (
          <a
            className="login-apk-link"
            href="/gensoft.apk"
            download="GenSoft.apk"
          >
            Download Android app (sales reps)
          </a>
        )}
      </div>
    </div>
  );
}
