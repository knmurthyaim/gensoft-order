import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import ChangePasswordModal from "./ChangePasswordModal.jsx";

export default function TopNav() {
  const { account, user, logout } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor" ||
    account?.account_type === "stockist";

  const tabs = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/orders", label: "Orders Received", show: isDistributor },
    {
      to: "/my-orders",
      label: isDistributor ? "Orders Placed" : "Orders Received",
    },
    { to: "/marketplace", label: "Place Order" },
    { to: "/products", label: "My Products", show: isDistributor },
    { to: "/stock", label: "Stock", show: isDistributor },
    { to: "/parties", label: "Parties" },
    { to: "/outstanding", label: "Outstanding" },
    { to: "/sales-reps", label: "Sales Reps", show: isDistributor },
    { to: "/rep-tracking", label: "Rep Location", show: isDistributor },
    { to: "/connections", label: "Connections" },
    { to: "/import", label: "Import", show: isDistributor },
    { to: "/settings", label: "Settings", show: isDistributor },
  ].filter((t) => t.show === undefined || t.show);

  const initial = (account?.name || user?.name || "?").charAt(0).toUpperCase();

  return (
    <header className="zennx-header">
      <div className="zennx-header-inner">
        <div className="zennx-brand">
          <div className="zennx-logo">GenSoft</div>
          <div className="zennx-tagline">PHARMA &amp; FMCG</div>
        </div>
        <nav className="zennx-tabs">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                "zennx-tab" + (isActive ? " active" : "")
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="zennx-header-actions">
          <div className="account-chip">
            <div className="account-name">{account?.name}</div>
            <div className="account-meta">
              {account?.gensoft_code} · {account?.account_type}
            </div>
          </div>
          <span className="zennx-avatar">{initial}</span>
          <button
            className="logout-btn"
            onClick={() => setShowPassword(true)}
            title="Change password"
          >
            Password
          </button>
          <button className="logout-btn" onClick={logout} title="Logout">
            Logout
          </button>
        </div>
      </div>
      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
    </header>
  );
}
