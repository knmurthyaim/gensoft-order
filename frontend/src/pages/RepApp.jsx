import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { repApi, getApiBase, tokenStore } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { inr, fmtDate } from "../format";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import {
  enqueueLocation,
  flushLocationQueue,
  queueCount,
  saveLocationSyncMeta,
  requestBackgroundSync,
} from "../repLocationQueue";
import {
  isNativeApp,
  startNativeBackgroundTracking,
  stopNativeBackgroundTracking,
} from "../nativeBgLocation";
import {
  startPersistentRepTracking,
  stopPersistentRepTracking,
} from "../persistentRepTracking";
import { mapsUrl } from "../maps";
import { SortTh, nextSort } from "../components/SortTh.jsx";

function pickRate(batchVal, productVal) {
  const batch = Number(batchVal);
  if (Number.isFinite(batch) && batch > 0) return batch;
  const product = Number(productVal);
  return Number.isFinite(product) ? product : 0;
}

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
    mrp: pickRate(latest?.mrp, entry.product.mrp),
    ptr_rate: pickRate(latest?.ptr_rate, entry.product.ptr_rate),
    scheme: latest?.scheme_hidden ? "" : latest?.scheme || "",
  };
}

export function RepCustomers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [taggingId, setTaggingId] = useState(null);

  const reload = (search = appliedSearch, rowLimit = limit) => {
    setLoading(true);
    setError("");
    repApi
      .customers({ search: search || undefined, limit: rowLimit })
      .then(setRows)
      .catch((e) => setError(e.response?.data?.detail || "Failed to load parties"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload("", 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tagLocation = (p, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!navigator.geolocation) {
      setError("Location not supported on this device.");
      return;
    }
    setTaggingId(p.id);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        repApi
          .tagCustomerLocation(p.id, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m:
              typeof pos.coords.accuracy === "number"
                ? pos.coords.accuracy
                : null,
          })
          .then((updated) => {
            setRows((list) =>
              list.map((row) => (row.id === updated.id ? updated : row))
            );
          })
          .catch((err) =>
            setError(err.response?.data?.detail || "Could not tag location")
          )
          .finally(() => setTaggingId(null));
      },
      () => {
        setError("Allow location permission to tag this customer.");
        setTaggingId(null);
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 10000 }
    );
  };

  return (
    <div className="rep-page">
      <h1 className="page-title">Parties</h1>
      <p className="page-sub">
        Place orders and tag shop location. Tagged locations are shared with all
        sales reps of your distributor. Only stockist can delete a tag.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const search = q.trim();
          setAppliedSearch(search);
          reload(search);
        }}
      >
        <input
          className="search-input"
          placeholder="Search party name, code, area..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn secondary" type="submit" disabled={loading}>
          Search
        </button>
        <select
          className="rows-select"
          aria-label="Rows to show"
          value={limit}
          onChange={(e) => {
            const next = Number(e.target.value);
            setLimit(next);
            reload(appliedSearch, next);
          }}
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} rows</option>
          ))}
        </select>
      </form>
      <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        {loading
          ? "Loading…"
          : appliedSearch
            ? `Showing up to ${rows.length} match${rows.length === 1 ? "" : "es"}`
            : `Showing first ${rows.length} parties — search to find others`}
      </p>
      <div className="rep-customer-list">
        {rows.map((p) => {
          const tagged = p.location_lat != null && p.location_lng != null;
          return (
            <div key={p.id} className="rep-customer-card">
              <strong>{p.name}</strong>
              <span className="muted">
                {p.code ? `${p.code} · ` : ""}
                {[p.area, p.city].filter(Boolean).join(", ") || "—"}
                {p.mobile ? ` · ${p.mobile}` : ""}
              </span>
              {tagged ? (
                <div className="rep-loc-tagged">
                  <span className="status-pill accepted">Location tagged</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    by {p.location_tagged_by_name || "rep"}
                  </span>
                  <a
                    href={mapsUrl(p.location_lat, p.location_lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn secondary sm"
                  >
                    View map
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn secondary sm"
                  disabled={taggingId === p.id}
                  onClick={(e) => tagLocation(p, e)}
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                >
                  {taggingId === p.id ? "Tagging…" : "Tag location"}
                </button>
              )}
              <Link to={`/rep/order/${p.id}`} className="rep-order-cta">
                Place order →
              </Link>
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <div className="empty">
            {appliedSearch
              ? "No matching parties."
              : "No parties in distributor master yet."}
          </div>
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
      .customer(partyId)
      .then(setParty)
      .catch((e) =>
        setError(e.response?.data?.detail || "Party not found in distributor master.")
      );
  }, [partyId]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // Need 2+ characters so one letter ("d") does not scan the whole catalog
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    repApi
      .catalog({ q: debounced, limit: 20 })
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
          placeholder="Type 2+ letters to search stock..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
        {query.trim().length === 1 && !selected && (
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            Type one more letter to search…
          </p>
        )}
        {selected && (
          <div className="selected-product-chip">
            Selected: <strong>{selected.entry.product.name}</strong>
            {` · MRP ${inr(selected.aggregate.mrp)} · PTR ${inr(selected.aggregate.ptr_rate)}`}
            {selected.aggregate.available_qty != null
              ? ` · Avl ${selected.aggregate.available_qty}`
              : ""}
          </div>
        )}
        {results.length > 0 && !selected && (
          <ul className="order-suggest" style={{ position: "relative" }}>
            <li className="suggest-head suggest-row-rep">
              <span className="suggest-col-name">Product</span>
              <span className="suggest-col-stock">Stock</span>
              <span className="suggest-col-price">MRP</span>
              <span className="suggest-col-price">PTR</span>
            </li>
            {results.map((row) => (
              <li
                className="suggest-row-rep"
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
                    {row.entry.product.product_code
                      ? `${row.entry.product.product_code} · `
                      : ""}
                    {row.entry.product.manufacturer}
                    {row.entry.product.pack_size
                      ? ` · ${row.entry.product.pack_size}`
                      : ""}
                  </span>
                </div>
                <span className="suggest-col-stock">
                  {row.aggregate.available_qty == null
                    ? "—"
                    : `Avl ${row.aggregate.available_qty}`}
                </span>
                <span className="suggest-col-price">
                  {inr(row.aggregate.mrp)}
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
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>MRP</th>
                <th>PTR</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.entry.product.id}>
                  <td>{l.entry.product.name}</td>
                  <td>{inr(l.aggregate.mrp)}</td>
                  <td>{inr(l.aggregate.ptr_rate)}</td>
                  <td>{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

export function RepStock() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = (
    search = appliedSearch,
    rowLimit = limit,
    by = sortBy,
    dir = sortDir
  ) => {
    setLoading(true);
    setError("");
    return repApi
      .stock({
        search: search || undefined,
        limit: rowLimit,
        sort_by: by,
        sort_dir: dir,
      })
      .then((data) => setItems(data.items || []))
      .catch((e) =>
        setError(e.response?.data?.detail || "Failed to load stock")
      )
      .finally(() => setLoading(false));
  };

  const onSort = (col) => {
    const next = nextSort(sortBy, sortDir, col);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    load(appliedSearch, limit, next.sortBy, next.sortDir);
  };

  useEffect(() => {
    load("", 25, "name", "asc");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rep-page">
      <h1 className="page-title">Stock</h1>
      <p className="page-sub">Your distributor stock only (read only). Tap headers to sort.</p>
      {error && <div className="error-banner">{error}</div>}
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const search = q.trim();
          setAppliedSearch(search);
          load(search);
        }}
      >
        <input
          className="search-input"
          placeholder="Search product name or code..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn secondary" type="submit" disabled={loading}>
          Search
        </button>
        <select
          className="rows-select"
          aria-label="Rows to show"
          value={limit}
          onChange={(e) => {
            const next = Number(e.target.value);
            setLimit(next);
            load(appliedSearch, next);
          }}
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} rows</option>
          ))}
        </select>
      </form>
      <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        {loading ? "Loading…" : `Showing ${items.length} stock items.`}
      </p>
      <div className="panel">
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <SortTh label="Product" col="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Avail" col="qty" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Scheme" col="scheme" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="PTR" col="ptr" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortTh label="MRP" col="mrp" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.product.id}>
                <td>
                  <strong>{row.product.name}</strong>
                  <div className="muted">
                    {row.product.product_code
                      ? `${row.product.product_code} · `
                      : ""}
                    {row.product.manufacturer} · {row.product.pack_size}
                  </div>
                </td>
                <td>
                  {row.stock_hidden
                    ? "—"
                    : row.available_qty == null
                      ? "—"
                      : row.available_qty}
                </td>
                <td>{row.scheme || "—"}</td>
                <td>{inr(row.ptr_rate)}</td>
                <td>{inr(row.mrp)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No stock found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export function RepOutstanding() {
  const [summary, setSummary] = useState(null);
  const [parties, setParties] = useState([]);
  const [partyCount, setPartyCount] = useState(0);
  const [q, setQ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [bills, setBills] = useState([]);
  const [billSummary, setBillSummary] = useState(null);
  const [billsLoading, setBillsLoading] = useState(false);

  const loadParties = (
    search = appliedSearch,
    rowLimit = limit,
    by = sortBy,
    dir = sortDir
  ) => {
    setLoading(true);
    setError("");
    return repApi
      .outstandingParties({
        search: search || undefined,
        limit: rowLimit,
        sort_by: by,
        sort_dir: dir,
      })
      .then((data) => {
        setSummary(data.summary);
        setParties(data.parties || []);
        setPartyCount(data.party_count || 0);
      })
      .catch((e) =>
        setError(e.response?.data?.detail || "Failed to load outstanding")
      )
      .finally(() => setLoading(false));
  };

  const onSort = (col) => {
    const next = nextSort(sortBy, sortDir, col);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    loadParties(appliedSearch, limit, next.sortBy, next.sortDir);
  };

  const openParty = (party) => {
    setSelected(party);
    setBills([]);
    setBillSummary(null);
    setBillsLoading(true);
    setError("");
    repApi
      .outstandingBills({
        party_id: party.party_id || "",
        party_name: party.party_name || "",
        limit: 500,
      })
      .then((data) => {
        setBillSummary(data.summary);
        setBills(data.rows || []);
      })
      .catch((e) =>
        setError(e.response?.data?.detail || "Failed to load party bills")
      )
      .finally(() => setBillsLoading(false));
  };

  useEffect(() => {
    loadParties("", 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rep-page">
      <h1 className="page-title">Outstanding</h1>
      <p className="page-sub">
        {selected
          ? "Bill-wise outstanding for this party."
          : "Party outstanding — tap a party for bills. Tap headers to sort."}
      </p>
      {error && <div className="error-banner">{error}</div>}

      {selected ? (
        <>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => {
              setSelected(null);
              setBills([]);
              setBillSummary(null);
            }}
          >
            ← All parties
          </button>
          <div style={{ margin: "10px 0 8px" }}>
            <strong>{selected.party_name}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {selected.party_id || "—"}
              {selected.place ? ` · ${selected.place}` : ""}
            </div>
          </div>
          {billSummary && (
            <div className="orders-summary-bar" style={{ marginBottom: 12 }}>
              <div className="summary-stats">
                <span>Bills: {billSummary.bill_count}</span>
                <span className="summary-total">
                  Balance: {inr(billSummary.total_balance)}
                </span>
              </div>
            </div>
          )}
          <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            {billsLoading
              ? "Loading…"
              : `Showing ${bills.length} bill${bills.length === 1 ? "" : "s"}.`}
          </p>
          <div className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Balance</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((r) => (
                    <tr key={r.id}>
                      <td>{r.invoice_no}</td>
                      <td>{fmtDate(r.invoice_date)}</td>
                      <td className="order-amount">{inr(r.balance)}</td>
                      <td>{r.age}</td>
                    </tr>
                  ))}
                  {!billsLoading && bills.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty">
                        No outstanding bills.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {summary && (
            <div className="orders-summary-bar" style={{ marginBottom: 12 }}>
              <div className="summary-stats">
                <span>Parties: {partyCount}</span>
                <span>Bills: {summary.bill_count}</span>
                <span className="summary-total">
                  Balance: {inr(summary.total_balance)}
                </span>
              </div>
            </div>
          )}
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const search = q.trim();
              setAppliedSearch(search);
              loadParties(search);
            }}
          >
            <input
              className="search-input"
              placeholder="Search party / invoice..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn secondary" type="submit" disabled={loading}>
              Search
            </button>
            <select
              className="rows-select"
              aria-label="Rows to show"
              value={limit}
              onChange={(e) => {
                const next = Number(e.target.value);
                setLimit(next);
                loadParties(appliedSearch, next);
              }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} rows
                </option>
              ))}
            </select>
          </form>
          <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            {loading
              ? "Loading…"
              : `Showing ${parties.length} of ${partyCount} parties.`}
          </p>
          <div className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <SortTh label="Code" col="code" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Party" col="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Place" col="place" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Bills" col="bills" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Outstanding" col="balance" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                    <tr
                      key={`${p.party_id}|${p.party_name}`}
                      className="clickable-row"
                      onClick={() => openParty(p)}
                    >
                      <td>{p.party_id || "—"}</td>
                      <td>
                        <strong>{p.party_name}</strong>
                      </td>
                      <td>{p.place || "—"}</td>
                      <td>{p.bill_count}</td>
                      <td className="order-amount">{inr(p.total_balance)}</td>
                    </tr>
                  ))}
                  {parties.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty">
                        No outstanding parties.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function RepShell({ children }) {
  const { user, account, salesRep, logout } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  // off | sharing | pending | denied | error
  const [locStatus, setLocStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let wakeLock = null;
    let intervalMs = 30 * 1000;
    let minMoveMeters = 50;
    let lastCaptureMs = 0;
    let usingNative = false;
    const LAST_KEY = "gensoft_rep_last_loc_ms";

    const releaseWake = async () => {
      try {
        if (wakeLock) await wakeLock.release();
      } catch {
        /* ignore */
      }
      wakeLock = null;
    };

    const requestWake = async () => {
      try {
        if (navigator.wakeLock?.request) {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => {
            wakeLock = null;
          });
        }
      } catch {
        /* ignore */
      }
    };

    const persistMeta = async (enabled) => {
      await saveLocationSyncMeta({
        token: tokenStore.get(),
        apiBase: getApiBase(),
        enabled,
        minMoveMeters,
      });
    };

    const syncToCloud = async () => {
      try {
        await requestBackgroundSync();
        const result = await flushLocationQueue(repApi.postLocationBatch);
        if (cancelled) return;
        if (result.disabled) {
          setLocStatus("off");
          return;
        }
        const n = await queueCount();
        if (result.remaining > 0 || n > 0) setLocStatus("pending");
        else setLocStatus("sharing");
      } catch {
        if (!cancelled) {
          const n = await queueCount();
          setLocStatus(n > 0 ? "pending" : "error");
        }
      }
    };

    const savePoint = async (point) => {
      if (cancelled) return;
      lastCaptureMs = Date.now();
      try {
        localStorage.setItem(LAST_KEY, String(lastCaptureMs));
      } catch {
        /* ignore */
      }
      await enqueueLocation(point, minMoveMeters);
      if (!cancelled) {
        setLocStatus(navigator.onLine ? "sharing" : "pending");
      }
      await syncToCloud();
    };

    const captureLocal = () => {
      if (!navigator.geolocation) {
        setLocStatus("error");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          savePoint({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m:
              typeof pos.coords.accuracy === "number"
                ? pos.coords.accuracy
                : null,
            recorded_at: new Date(pos.timestamp || Date.now()).toISOString(),
          });
        },
        (err) => {
          if (cancelled) return;
          setLocStatus(err?.code === 1 ? "denied" : "error");
        },
        { enableHighAccuracy: true, maximumAge: 120000, timeout: 30000 }
      );
    };

    const tick = () => {
      const now = Date.now();
      if (now - lastCaptureMs < Math.min(intervalMs * 0.8, 20 * 1000)) {
        syncToCloud();
        return;
      }
      captureLocal();
    };

    const onSwMessage = (event) => {
      if (event.data?.type === "GENSOFT_CAPTURE_LOCATION") {
        captureLocal();
      }
    };

    const startTracking = async (cfg) => {
      intervalMs = Math.max(15, Number(cfg?.interval_sec) || 30) * 1000;
      minMoveMeters = Math.max(10, Number(cfg?.min_move_meters) || 50);
      setLocStatus(navigator.onLine ? "sharing" : "pending");
      await persistMeta(true);
      await requestWake();
      await syncToCloud();

      // Prefer native background GPS (works when app is minimized / screen off)
      const native = await isNativeApp();
      if (native) {
        // Request permissions via community plugin first, then hand off to the
        // persistent foreground service (survives app close).
        const res = await startNativeBackgroundTracking({
          minMoveMeters,
          onPoint: (p) => savePoint(p),
          onError: (err) => {
            if (cancelled) return;
            if (err?.code === "NOT_AUTHORIZED") setLocStatus("denied");
          },
        });
        usingNative = !!res.started;
        if (usingNative) {
          try {
            const auth = await repApi.trackingToken();
            await startPersistentRepTracking({
              token: auth.tracking_token,
              apiBase: getApiBase(),
              intervalSec: intervalMs / 1000,
              minMoveMeters,
            });
            // Avoid duplicate Android location notifications while app is open.
            await stopNativeBackgroundTracking();
          } catch {
            // Keep the community watcher as fallback while the app process lives.
          }
        }
      }

      // Always keep an in-app timer too — covers web, and acts as backup on
      // Android while the rep has the app open (persistent service covers close).
      captureLocal();
      if (timer) clearInterval(timer);
      timer = setInterval(tick, intervalMs);

      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg?.periodicSync?.register) {
          await reg.periodicSync.register("gensoft-loc-periodic", {
            minInterval: 15 * 60 * 1000,
          });
        }
      } catch {
        /* periodic sync optional */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      requestWake();
      syncToCloud();
      let last = lastCaptureMs;
      try {
        last = parseInt(localStorage.getItem(LAST_KEY) || "0", 10) || last;
      } catch {
        /* ignore */
      }
      if (Date.now() - last >= intervalMs * 0.9) tick();
    };

    const onOnline = () => {
      if (cancelled) return;
      syncToCloud();
      navigator.serviceWorker?.controller?.postMessage({
        type: "GENSOFT_FLUSH_LOCATIONS",
      });
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    repApi
      .locationConfig()
      .then((cfg) => {
        if (cancelled) return;
        if (!cfg?.enabled) {
          persistMeta(false);
          stopPersistentRepTracking();
          setLocStatus("off");
          return;
        }
        startTracking(cfg);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("online", onOnline);
      })
      .catch(async () => {
        if (cancelled) return;
        const cached = localStorage.getItem("gensoft_rep_track_enabled");
        if (cached === "1" && navigator.geolocation) {
          setLocStatus("pending");
          await persistMeta(true);
          captureLocal();
          if (timer) clearInterval(timer);
          timer = setInterval(tick, intervalMs);
          document.addEventListener("visibilitychange", onVisibility);
          window.addEventListener("online", onOnline);
        } else {
          setLocStatus("off");
        }
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      releaseWake();
      stopNativeBackgroundTracking();
    };
  }, []);

  // Remember tracking enabled flag for offline reopen
  useEffect(() => {
    if (locStatus === "off") {
      try {
        localStorage.setItem("gensoft_rep_track_enabled", "0");
      } catch {
        /* ignore */
      }
    } else if (locStatus === "sharing" || locStatus === "pending") {
      try {
        localStorage.setItem("gensoft_rep_track_enabled", "1");
      } catch {
        /* ignore */
      }
    }
  }, [locStatus]);

  const logoutRep = () => {
    // Clear auth immediately — do not await native stop (it can hang).
    logout();
    stopPersistentRepTracking();
    stopNativeBackgroundTracking();
  };

  return (
    <div className="rep-app">
      <header className="rep-header">
        <div>
          <div className="zennx-logo">GenSoft</div>
          <div className="rep-header-sub">
            {salesRep?.name || user?.name} · {account?.name}
            {locStatus === "denied" && (
              <span className="rep-loc-badge warn"> · Location blocked</span>
            )}
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
          <button type="button" className="logout-btn" onClick={logoutRep}>
            Logout
          </button>
        </div>
      </header>
      <nav className="rep-tabs">
        <Link to="/rep">Parties</Link>
        <Link to="/rep/stock">Stock</Link>
        <Link to="/rep/outstanding">Outstanding</Link>
        <Link to="/rep/orders">My Orders</Link>
      </nav>
      <main className="rep-main">{children}</main>
      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
    </div>
  );
}
