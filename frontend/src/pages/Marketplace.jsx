import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDirectory, marketplace, orders as ordersApi } from "../api";
import { inr } from "../format";

const defaultSettings = {
  allow_order_no_stock: false,
  allow_order_over_stock: false,
  display_stock_to_parties: true,
  hide_scheme_from_parties: true,
};

const LOW_STOCK_QTY = 10;

function stockTone(avail, hidden) {
  if (hidden || avail === null || avail === undefined) return "unknown";
  if (avail <= 0) return "none";
  if (avail <= LOW_STOCK_QTY) return "low";
  return "ok";
}

/** Highlight query matches like Zennx search results */
function highlightMatch(text, q) {
  const value = text || "";
  const term = (q || "").trim();
  if (!term) return value;
  const lower = value.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return value;
  return (
    <>
      {value.slice(0, idx)}
      <mark className="search-mark">{value.slice(idx, idx + term.length)}</mark>
      {value.slice(idx + term.length)}
    </>
  );
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierSettings, setSupplierSettings] = useState(defaultSettings);
  const [catalogNotice, setCatalogNotice] = useState("");

  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState(null);
  const [addQty, setAddQty] = useState("1");

  const [firstWordExact, setFirstWordExact] = useState(false);
  const [schemeOnly, setSchemeOnly] = useState(false);
  const [stockMode, setStockMode] = useState("all"); // all | in_stock

  const [cart, setCart] = useState({});
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState("");

  const searchRef = useRef(null);
  const qtyRef = useRef(null);

  useEffect(() => {
    getDirectory()
      .then((dir) =>
        setSuppliers(dir.filter((d) => d.connection_status === "accepted"))
      )
      .catch(() => setError("Failed to load suppliers."));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const selectSupplier = (id) => {
    setSupplierId(id);
    setCart({});
    setNotice("");
    setQuery("");
    setDebouncedQ("");
    setResults([]);
    setSelected(null);
    setError("");
    if (!id) {
      setSupplierSettings(defaultSettings);
      setCatalogNotice("");
      return;
    }
    marketplace
      .catalog(id, { q: "", limit: 1 })
      .then((data) => {
        setSupplierSettings(data.settings || defaultSettings);
        setCatalogNotice(data.notice || "");
        setTimeout(() => searchRef.current?.focus(), 50);
      })
      .catch((err) =>
        setError(err.response?.data?.detail || "Failed to open supplier.")
      );
  };

  useEffect(() => {
    if (!supplierId || debouncedQ.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    marketplace
      .catalog(supplierId, {
        q: debouncedQ,
        limit: 40,
        in_stock_only: stockMode === "in_stock",
        first_word_exact: firstWordExact,
        scheme_only: schemeOnly,
      })
      .then((data) => {
        if (cancelled) return;
        setSupplierSettings(data.settings || defaultSettings);
        // One row per product: sum stock qty, use latest batch MRP/PTR
        const rows = (data.items || []).map((entry) => {
          const batches = entry.batches || [];
          const stockHidden = batches.some((b) => b.stock_hidden);
          const sumQty = stockHidden
            ? null
            : batches.reduce((s, b) => s + (Number(b.available_qty) || 0), 0);

          let latest = null;
          for (const b of batches) {
            if (!latest) {
              latest = b;
              continue;
            }
            const a = b.expiry_date || "";
            const c = latest.expiry_date || "";
            // Prefer furthest expiry (newest usable stock); if tie/missing, higher id
            if (a && c) {
              if (a > c) latest = b;
              else if (a === c && (b.id || 0) > (latest.id || 0)) latest = b;
            } else if (!c && a) {
              latest = b;
            } else if (!a && !c && (b.id || 0) > (latest.id || 0)) {
              latest = b;
            }
          }

          const scheme = latest?.scheme_hidden
            ? ""
            : (latest?.scheme || "").trim() ||
              batches.map((b) => b.scheme).find((s) => (s || "").trim()) ||
              "";

          return {
            entry,
            batch: null, // order by product; no batch split in UI
            aggregate: {
              available_qty: sumQty,
              stock_hidden: stockHidden,
              mrp: latest?.mrp ?? entry.product.mrp,
              ptr_rate: latest?.ptr_rate ?? entry.product.ptr_rate,
              scheme,
              batch_count: batches.length,
            },
          };
        });
        setResults(rows);
        setHighlight(0);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err.response?.data?.detail || "Search failed.");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, debouncedQ, stockMode, firstWordExact, schemeOnly]);

  const cartKey = (entry) => `p-${entry.product.id}`;

  const addToCart = (row, qtyRaw) => {
    if (!row) {
      setError("Product selection is required. Search and choose a product first.");
      searchRef.current?.focus();
      return;
    }
    const n = parseInt(qtyRaw, 10) || 0;
    if (n <= 0) {
      setError("Enter a quantity of at least 1.");
      qtyRef.current?.focus();
      return;
    }
    const { entry, aggregate } = row;
    const avail = aggregate?.stock_hidden
      ? null
      : aggregate?.available_qty ?? entry.product.total_stock;
    if (
      avail !== null &&
      avail !== undefined &&
      !supplierSettings.allow_order_over_stock &&
      n > avail &&
      avail > 0
    ) {
      setError(`Only ${avail} available for ${entry.product.name}.`);
      return;
    }
    if (avail === 0 && !supplierSettings.allow_order_no_stock) {
      setError("This product has no stock.");
      return;
    }
    const key = cartKey(entry);
    setCart((c) => {
      const prev = c[key]?.qty || 0;
      return {
        ...c,
        [key]: { qty: prev + n, entry, batch: null, aggregate },
      };
    });
    setError("");
    setSelected(null);
    setQuery("");
    setDebouncedQ("");
    setResults([]);
    setAddQty("1");
    searchRef.current?.focus();
  };

  const setLineQty = (key, qty) => {
    const n = parseInt(qty, 10) || 0;
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[key];
      else if (next[key]) next[key] = { ...next[key], qty: n };
      return next;
    });
  };

  const removeLine = (key) => {
    setCart((c) => {
      const next = { ...c };
      delete next[key];
      return next;
    });
  };

  const cartLines = Object.values(cart);
  const cartKeys = Object.keys(cart);

  const total = useMemo(
    () =>
      cartLines.reduce((sum, l) => {
        const rate =
          l.aggregate?.ptr_rate ||
          l.batch?.ptr_rate ||
          l.entry.product.ptr_rate;
        const taxable = rate * l.qty;
        return sum + taxable + (taxable * l.entry.product.gst_pct) / 100;
      }, 0),
    [cartLines]
  );

  const placeOrder = async () => {
    if (!supplierId || cartLines.length === 0) return;
    setPlacing(true);
    setError("");
    try {
      await ordersApi.create({
        supplier_account_id: parseInt(supplierId, 10),
        source: "web",
        items: cartLines.map((l) => ({
          product_id: l.entry.product.id,
          batch_id: null,
          qty: l.qty,
          rate: l.aggregate?.ptr_rate ?? undefined,
        })),
      });
      setNotice("Order placed successfully.");
      setCart({});
      setTimeout(() => navigate("/my-orders"), 800);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not place order.");
    } finally {
      setPlacing(false);
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlight]) {
        setSelected(results[highlight]);
        setQuery(results[highlight].entry.product.name);
        setResults([]);
        setTimeout(() => qtyRef.current?.focus(), 0);
      } else if (selected) {
        addToCart(selected, addQty);
      }
    } else if (e.key === "Escape") {
      setResults([]);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Place Order</h1>
          <p className="page-sub">
            Select a supplier, then search &amp; add products (no full list
            load).
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}
      {catalogNotice && (
        <div className="warning-banner">{catalogNotice}</div>
      )}

      {suppliers.length === 0 && (
        <div className="empty-cta">
          <h3>No connected suppliers yet</h3>
          <p>
            To place an order, you first need an accepted connection with a
            supplier. Request one from the GenSoft directory, then return here.
          </p>
          <button className="btn" onClick={() => navigate("/connections")}>
            Go to Connections
          </button>
        </div>
      )}

      {suppliers.length > 0 && (
        <div className="order-step-fields">
          <label className="order-field">
            <span>
              Supplier <em className="req">*</em>
            </span>
            <select
              value={supplierId}
              onChange={(e) => selectSupplier(e.target.value)}
              required
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.gensoft_code})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!supplierId && suppliers.length > 0 && (
        <p className="muted order-hint">
          Select a supplier first, then search and select a product.
        </p>
      )}

      {supplierId && (
        <div className="order-search-panel">
          <div className="stock-legend">
            <span>
              <i className="dot ok" /> In stock
            </span>
            <span>
              <i className="dot low" /> Low stock
            </span>
            <span>
              <i className="dot none" /> No stock
            </span>
          </div>

          <label className="order-field product-field">
            <span>
              Product <em className="req">*</em>
            </span>
          </label>

          <div className="order-search-row">
            <div className="order-search-main">
              <input
                ref={searchRef}
                type="search"
                className={`order-search-input${selected ? " selected" : ""}`}
                placeholder="Search & Add Products"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
                onKeyDown={onSearchKeyDown}
                autoComplete="off"
                required
              />
              {selected && (
                <div className="selected-product-chip">
                  Selected: <strong>{selected.entry.product.name}</strong>
                  {selected.aggregate?.available_qty != null
                    ? ` · Avl ${selected.aggregate.available_qty}`
                    : ""}
                </div>
              )}
              {searching && <span className="search-hint">Searching…</span>}
              {!searching && results.length > 0 && (
                <ul className="order-suggest">
                  <li className="suggest-head" aria-hidden="true">
                    <span className="suggest-col-name">Product</span>
                    <span className="suggest-col-scheme">Scheme</span>
                    <span className="suggest-col-stock">Stock</span>
                    <span className="suggest-col-price">MRP</span>
                    <span className="suggest-col-price">PTR</span>
                  </li>
                  {results.map((row, idx) => {
                    const avail = row.aggregate?.stock_hidden
                      ? null
                      : row.aggregate?.available_qty ??
                        row.entry.product.total_stock;
                    const tone = stockTone(
                      avail,
                      row.aggregate?.stock_hidden
                    );
                    const scheme = row.aggregate?.scheme || "";
                    const mrp =
                      row.aggregate?.mrp ?? row.entry.product.mrp;
                    const ptr =
                      row.aggregate?.ptr_rate ?? row.entry.product.ptr_rate;
                    return (
                      <li
                        key={cartKey(row.entry)}
                        className={idx === highlight ? "active" : ""}
                        onMouseEnter={() => setHighlight(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelected(row);
                          setQuery(row.entry.product.name);
                          setResults([]);
                          setError("");
                          qtyRef.current?.focus();
                        }}
                      >
                        <div className="suggest-col-name">
                          <strong>
                            {highlightMatch(row.entry.product.name, debouncedQ)}
                          </strong>
                          <span className="muted">
                            {row.entry.product.manufacturer}
                            {row.entry.product.pack_size
                              ? ` · ${row.entry.product.pack_size}`
                              : ""}
                            {row.aggregate?.batch_count > 1
                              ? ` · ${row.aggregate.batch_count} batches`
                              : ""}
                          </span>
                        </div>
                        <span className="suggest-col-scheme">
                          {scheme || "—"}
                        </span>
                        <span className={`suggest-col-stock stock-${tone}`}>
                          {avail === null || avail === undefined
                            ? "—"
                            : avail > 0
                              ? `Avl ${avail}`
                              : "0 Stock"}
                        </span>
                        <span className="suggest-col-price">{inr(mrp)}</span>
                        <span className="suggest-col-price">{inr(ptr)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!searching &&
                debouncedQ &&
                results.length === 0 &&
                !selected && (
                  <div className="order-suggest empty-suggest">
                    No products match “{debouncedQ}”
                  </div>
                )}
            </div>

            <div className="order-qty-wrap">
              <span className="qty-label">Qty</span>
              <input
                ref={qtyRef}
                type="number"
                min="1"
                className="order-qty-input"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!selected) {
                      setError(
                        "Product selection is required. Choose a product from the list."
                      );
                      searchRef.current?.focus();
                      return;
                    }
                    addToCart(selected, addQty);
                  }
                }}
                title="Quantity"
              />
            </div>
            <button
              type="button"
              className="btn order-add-btn"
              disabled={!selected}
              onClick={() => {
                if (!selected) {
                  setError(
                    "Product selection is required. Search and choose a product first."
                  );
                  searchRef.current?.focus();
                  return;
                }
                addToCart(selected, addQty);
              }}
            >
              +
            </button>
          </div>

          <div className="order-search-filters">
            <div className="filter-title">Product Search Options</div>
            <label>
              <input
                type="checkbox"
                checked={firstWordExact}
                onChange={(e) => setFirstWordExact(e.target.checked)}
              />{" "}
              First Word Exact Match
            </label>
            <label>
              <input
                type="checkbox"
                checked={schemeOnly}
                onChange={(e) => setSchemeOnly(e.target.checked)}
              />{" "}
              Scheme Items Only
            </label>
            <label>
              <input
                type="radio"
                name="stockMode"
                checked={stockMode === "in_stock"}
                onChange={() => setStockMode("in_stock")}
              />{" "}
              In Stock Only
            </label>
            <label>
              <input
                type="radio"
                name="stockMode"
                checked={stockMode === "all"}
                onChange={() => setStockMode("all")}
              />{" "}
              In Stock &amp; Nil Stock
            </label>
          </div>
        </div>
      )}

      {cartLines.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Avail</th>
                <th>Scheme</th>
                <th>MRP</th>
                <th>PTR</th>
                <th>Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cartKeys.map((key) => {
                const l = cart[key];
                const avail = l.aggregate?.stock_hidden
                  ? null
                  : l.aggregate?.available_qty ?? l.entry.product.total_stock;
                const tone = stockTone(avail, l.aggregate?.stock_hidden);
                return (
                  <tr
                    key={key}
                    className={tone === "none" ? "out-of-stock-row" : ""}
                  >
                    <td>
                      <strong>{l.entry.product.name}</strong>
                      <div className="muted">
                        {l.entry.product.manufacturer} ·{" "}
                        {l.entry.product.pack_size}
                      </div>
                    </td>
                    <td className={tone === "low" || tone === "none" ? "low-stock" : ""}>
                      <i className={`dot ${tone}`} />{" "}
                      {avail === null || avail === undefined ? "—" : avail}
                    </td>
                    <td>{l.aggregate?.scheme || "—"}</td>
                    <td>
                      {inr(l.aggregate?.mrp ?? l.entry.product.mrp)}
                    </td>
                    <td>
                      {inr(
                        l.aggregate?.ptr_rate ?? l.entry.product.ptr_rate
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={l.qty}
                        onChange={(e) => setLineQty(key, e.target.value)}
                        style={{ width: 72 }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => removeLine(key)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {supplierId && cartLines.length === 0 && (
        <p className="muted" style={{ marginTop: 20, textAlign: "center" }}>
          Product selection is required — search, choose a product from the
          list, enter qty, then press +.
        </p>
      )}

      {cartLines.length > 0 && (
        <div className="cart-bar">
          <div>
            <strong>{cartLines.length}</strong> item(s) · Total:{" "}
            <strong>{inr(total)}</strong>
          </div>
          <button className="btn" onClick={placeOrder} disabled={placing}>
            {placing ? "Placing..." : "Place Order"}
          </button>
        </div>
      )}
    </div>
  );
}
