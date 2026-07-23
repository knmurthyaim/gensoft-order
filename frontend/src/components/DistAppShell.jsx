import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import ChangePasswordModal from "./ChangePasswordModal.jsx";

/**
 * Native-app-only shell for distributor / retailer — same look as sales-rep app
 * (simple header + horizontal tabs). Web browser keeps TopNav.
 */
export default function DistAppShell({ children }) {
  const { account, user, logout } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const location = useLocation();

  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor" ||
    account?.account_type === "stockist";

  const tabs = [
    { to: "/", label: "Home", end: true },
    {
      to: isDistributor ? "/orders" : "/my-orders",
      label: isDistributor ? "Orders" : "My Orders",
    },
    { to: "/marketplace", label: "Place Order" },
    ...(isDistributor
      ? [
          { to: "/products", label: "Products" },
          { to: "/stock", label: "Stock" },
        ]
      : []),
    { to: "/parties", label: "Parties" },
    { to: "/outstanding", label: "Outstanding" },
    { to: "/connections", label: "Connections" },
    ...(isDistributor
      ? [
          { to: "/sales-reps", label: "Sales Rep" },
          { to: "/rep-tracking", label: "Rep Location" },
          { to: "/import", label: "Import" },
        ]
      : []),
    { to: "/settings", label: "Settings" },
  ];

  const isActive = (to, end) => {
    if (end) return location.pathname === to;
    return (
      location.pathname === to || location.pathname.startsWith(`${to}/`)
    );
  };

  return (
    <div className="rep-app dist-app">
      <header className="rep-header">
        <div>
          <div className="zennx-logo">GenSoft</div>
          <div className="rep-header-sub">
            {account?.name || user?.name}
            {account?.gensoft_code ? ` · ${account.gensoft_code}` : ""}
            {account?.account_type ? ` · ${account.account_type}` : ""}
          </div>
        </div>
        <div className="rep-header-actions">
          <button
            type="button"
            className="logout-btn"
            onClick={() => setShowPassword(true)}
            title="Change password"
          >
            Password
          </button>
          <button type="button" className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <nav className="rep-tabs">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={isActive(t.to, t.end) ? "active" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <main className="rep-main">{children}</main>
      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
    </div>
  );
}

export function isNativeApp() {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}
