import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { repApi } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { inr } from "../format";

function aggregate(entry) {
  const batches = entry.batches || [];
  const stockHidden = batches.some((b) => b.stock_hidden);
  const sumQty = stockHidden
    ? null
    : batches.reduce((s, b) => s + (Number(b.available_qty) || 0), 0);
  let latest = batches[0] || null;
  for (const b of batches) {
    if (!latest) latest = b;
    else if ((b.id || 0) > (latest.id || 0)) latest = b;
  }
  return {
    available_qty: sumQty,
    stock_hidden: stockHidden,
    mrp: latest?.mrp ?? entry.product.mrp,
    ptr_rate: latest?.ptr_rate ?? entry.product.ptr_rate,
    scheme: latest?.scheme_hidden ? "" : latest?.scheme || "",
  };
}

export function RepCustomers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    repApi
      .customers(q ? { search: q } : undefined)
      .then(setRows)
      .catch((e) => setError(e.response?.data?.detail || "Failed to load customers"));
  }, [q]);

  return (
    <div className="rep-page">
      <h1 className="page-title">My Customers</h1>
      <p className="page-sub">Only customers assigned to you by your distributor.</p>
      {error && <div className="error-banner">{error}</div>}
      <input
        className="search-input"
        placeholder="Search customer..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12, width: "100%", maxWidth: 420 }}
      />
      <div className="rep-customer-list">
        {rows.map((p) => (
          <Link key={p.id} to={`/rep/order/${p.id}`} className="rep-customer-card">
            <strong>{p.name}</strong>
            <span className="muted">
              {[p.area, p.city].filter(Boolean).join(", ") || "—"}
              {p.mobile ? ` · ${p.mobile}` : ""}
            </span>
            <span className="rep-order-cta">Place order →</span>
          </Link>
        ))}
        {rows.length === 0 && (
          <div className="empty">No customers assigned yet.</div>
        )}
      </div>
    </div>
  );
}

export function RepOrder() {
  const { partyId } = useParams();
  const navigate = useNavigate();
  const { account } = useAuth();
  const [party, setParty] = useState(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("1");
  const [cart, setCart] = useState({});
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    repApi
      .customers()
      .then((list) => {
        const p = list.find((x) => String(x.id) === String(partyId));
        if (!p) setError("Customer not found or not assigned to you.");
        else setParty(p);
      })
      .catch(() => setError("Failed to load customer."));
  }, [partyId]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      return;
    }
    let cancelled = false;
    repApi
      .catalog({ q: debounced, limit: 30 })
      .then((data) => {
        if (cancelled) return;
        setResults(
          (data.items || []).map((entry) => ({
            entry,
            aggregate: aggregate(entry),
          }))
        );
      })
      .catch((e) => {
        if (!cancelled)
          setError(e.response?.data?.detail || "Search failed");
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const lines = Object.values(cart);
  const total = useMemo(
    () =>
      lines.reduce((s, l) => {
        const rate = l.aggregate.ptr_rate;
        const tax = rate * l.qty;
        return s + tax + (tax * l.entry.product.gst_pct) / 100;
      }, 0),
    [lines]
  );

  const add = () => {
    if (!selected) {
      setError("Select a product from search results.");
      return;
    }
    const n = parseInt(qty, 10) || 0;
    if (n <= 0) return;
    const id = selected.entry.product.id;
    setCart((c) => ({
      ...c,
      [id]: {
        qty: (c[id]?.qty || 0) + n,
        entry: selected.entry,
        aggregate: selected.aggregate,
      },
    }));
    setSelected(null);
    setQuery("");
    setResults([]);
    setQty("1");
    setError("");
    searchRef.current?.focus();
  };

  const place = async () => {
    if (!party || lines.length === 0) return;
    setPlacing(true);
    setError("");
    try {
      await repApi.createOrder({
        party_id: party.id,
        items: lines.map((l) => ({
          product_id: l.entry.product.id,
          qty: l.qty,
          rate: l.aggregate.ptr_rate,
        })),
      });
      navigate("/rep/orders", { replace: true, state: { refresh: Date.now() } });
    } catch (e) {
      setError(e.response?.data?.detail || "Could not place order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="rep-page">
      <button type="button" className="btn secondary sm" onClick={() => navigate("/rep")}>
        ← Customers
      </button>
      <h1 className="page-title" style={{ marginTop: 12 }}>
        Order for {party?.name || "…"}
      </h1>
      <p className="page-sub">
        Order is placed to {account?.name || "your distributor"} as an order
        from this customer. Your name is saved as the sales rep who took it.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="order-search-panel">
        <input
          ref={searchRef}
          className="order-search-input"
          placeholder="Search products..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
        {selected && (
          <div className="selected-product-chip">
            Selected: <strong>{selected.entry.product.name}</strong>
            {selected.aggregate.available_qty != null
              ? ` · Avl ${selected.aggregate.available_qty}`
              : ""}
          </div>
        )}
        {results.length > 0 && !selected && (
          <ul className="order-suggest" style={{ position: "relative" }}>
            {results.map((row) => (
              <li
                key={row.entry.product.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelected(row);
                  setQuery(row.entry.product.name);
                  setResults([]);
                }}
              >
                <div className="suggest-col-name">
                  <strong>{row.entry.product.name}</strong>
                  <span className="muted">
                    {row.entry.product.manufacturer} ·{" "}
                    {row.entry.product.pack_size}
                  </span>
                </div>
                <span className="suggest-col-stock">
                  {row.aggregate.available_qty == null
                    ? "—"
                    : `Avl ${row.aggregate.available_qty}`}
                </span>
                <span className="suggest-col-price">
                  {inr(row.aggregate.ptr_rate)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="order-search-row" style={{ marginTop: 10 }}>
          <input
            type="number"
            min="1"
            className="order-qty-input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <button type="button" className="btn" onClick={add} disabled={!selected}>
            Add
          </button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>PTR</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.entry.product.id}>
                  <td>{l.entry.product.name}</td>
                  <td>{inr(l.aggregate.ptr_rate)}</td>
                  <td>{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cart-bar">
            <strong>Total {inr(total)}</strong>
            <button className="btn" disabled={placing} onClick={place}>
              {placing ? "Placing…" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RepOrders() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    repApi
      .orders()
      .then(setRows)
      .catch((e) => setError(e.response?.data?.detail || "Failed to load orders"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rep-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Orders</h1>
          <p className="page-sub">Orders you sent to your distributor</p>
        </div>
        <button type="button" className="btn secondary sm" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">Loading…</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.order_no}</strong>
                  <div className="muted">
                    Customer: {o.party?.name || "—"} · {o.item_count} items
                  </div>
                  <div className="muted">
                    To distributor: {o.supplier?.name || "—"}
                  </div>
                </td>
                <td>
                  <span className="rep-order-tag">Sent to distributor</span>
                  <div>{o.status}</div>
                </td>
                <td>{inr(o.total_amount)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RepShell({ children }) {
  const { user, account, salesRep, logout } = useAuth();
  return (
    <div className="rep-app">
      <header className="rep-header">
        <div>
          <div className="zennx-logo">GenSoft</div>
          <div className="rep-header-sub">
            {salesRep?.name || user?.name} · {account?.name}
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </header>
      <nav className="rep-tabs">
        <Link to="/rep">Customers</Link>
        <Link to="/rep/orders">Orders</Link>
      </nav>
      <main className="rep-main">{children}</main>
    </div>
  );
}
