import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import ChangePasswordModal from "./ChangePasswordModal.jsx";

/** Nav groups: Orders / Stock / Parties / Rep / Utility */
export default function TopNav() {
  const { account, user, logout } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);
  const location = useLocation();

  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor" ||
    account?.account_type === "stockist";

  const menus = [
    { type: "link", to: "/", label: "Dashboard", end: true },
    {
      type: "group",
      id: "orders",
      label: "Orders",
      items: [
        { to: "/orders", label: "Orders Received", show: isDistributor },
        {
          to: "/my-orders",
          label: isDistributor ? "Orders Placed" : "Orders Received",
        },
        { to: "/marketplace", label: "Place Order" },
      ],
    },
    {
      type: "group",
      id: "stock",
      label: "Stock",
      show: isDistributor,
      items: [
        { to: "/products", label: "My Products" },
        { to: "/stock", label: "Stock" },
      ],
    },
    {
      type: "group",
      id: "parties",
      label: "Parties",
      items: [
        { to: "/parties", label: "Parties" },
        { to: "/connections", label: "Connections" },
        { to: "/outstanding", label: "Outstanding" },
      ],
    },
    {
      type: "group",
      id: "rep",
      label: "Rep",
      show: isDistributor,
      items: [
        { to: "/sales-reps", label: "Sales Rep" },
        { to: "/rep-tracking", label: "Rep Location" },
      ],
    },
    {
      type: "group",
      id: "utility",
      label: "Utility",
      show: isDistributor,
      items: [
        { to: "/settings", label: "Settings" },
        { to: "/import", label: "Import" },
      ],
    },
  ]
    .filter((m) => m.show === undefined || m.show)
    .map((m) =>
      m.type === "group"
        ? {
            ...m,
            items: m.items.filter((i) => i.show === undefined || i.show),
          }
        : m
    )
    .filter((m) => m.type !== "group" || m.items.length > 0);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const pathActive = (to, end) => {
    if (end) return location.pathname === to;
    return (
      location.pathname === to || location.pathname.startsWith(`${to}/`)
    );
  };

  const groupActive = (items) => items.some((i) => pathActive(i.to));

  const initial = (account?.name || user?.name || "?").charAt(0).toUpperCase();

  const renderDesktopNav = () =>
    menus.map((m) => {
      if (m.type === "link") {
        return (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.end}
            className={({ isActive }) =>
              "zennx-tab" + (isActive ? " active" : "")
            }
          >
            {m.label}
          </NavLink>
        );
      }

      const active = groupActive(m.items);
      const open = openMenu === m.id;

      return (
        <div
          key={m.id}
          className={
            "zennx-menu" +
            (active ? " active" : "") +
            (open ? " open" : "")
          }
        >
          <button
            type="button"
            className="zennx-tab zennx-menu-trigger"
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() =>
              setOpenMenu((cur) => (cur === m.id ? null : m.id))
            }
          >
            {m.label}
            <span className="zennx-menu-caret" aria-hidden>
              ▾
            </span>
          </button>
          {open && (
            <div className="zennx-submenu" role="menu">
              {m.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={({ isActive }) =>
                    "zennx-submenu-link" + (isActive ? " active" : "")
                  }
                  onClick={() => setOpenMenu(null)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    });

  const renderMobileNav = () =>
    menus.map((m) => {
      if (m.type === "link") {
        return (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.end}
            className={({ isActive }) =>
              "zennx-drawer-link" + (isActive ? " active" : "")
            }
            onClick={() => setMobileOpen(false)}
          >
            {m.label}
          </NavLink>
        );
      }
      return (
        <div key={m.id} className="zennx-drawer-group">
          <div className="zennx-drawer-group-label">{m.label}</div>
          {m.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "zennx-drawer-link" + (isActive ? " active" : "")
              }
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      );
    });

  return (
    <header className="zennx-header">
      <div className="zennx-header-inner">
        <div className="zennx-brand">
          <div className="zennx-logo">GenSoft</div>
          <div className="zennx-tagline">PHARMA &amp; FMCG</div>
        </div>

        <nav className="zennx-tabs zennx-tabs-desktop" ref={navRef}>
          {renderDesktopNav()}
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
            type="button"
            className="logout-btn zennx-desktop-only"
            onClick={() => setShowPassword(true)}
            title="Change password"
          >
            Password
          </button>
          <button
            type="button"
            className="logout-btn zennx-desktop-only"
            onClick={logout}
            title="Logout"
          >
            Logout
          </button>
          <button
            type="button"
            className="zennx-burger"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="zennx-drawer-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="zennx-drawer" role="dialog" aria-modal="true">
            <div className="zennx-drawer-head">
              <div>
                <div className="zennx-drawer-title">{account?.name}</div>
                <div className="zennx-drawer-meta">
                  {account?.gensoft_code} · {account?.account_type}
                </div>
              </div>
              <button
                type="button"
                className="zennx-drawer-close"
                onClick={() => setMobileOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <nav className="zennx-drawer-nav">{renderMobileNav()}</nav>
            <div className="zennx-drawer-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setMobileOpen(false);
                  setShowPassword(true);
                }}
              >
                Change password
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setMobileOpen(false);
                  logout();
                }}
              >
                Logout
              </button>
            </div>
          </aside>
        </>
      )}

      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
    </header>
  );
}
