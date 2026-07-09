import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDirectory, marketplace, orders as ordersApi } from "../api";
import { fmtDate, inr } from "../format";

const defaultSettings = {
  allow_order_no_stock: false,
  allow_order_over_stock: false,
  display_stock_to_parties: true,
  hide_scheme_from_parties: true,
};

export default function Marketplace() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [supplierSettings, setSupplierSettings] = useState(defaultSettings);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [cart, setCart] = useState({});
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getDirectory()
      .then((dir) =>
        setSuppliers(dir.filter((d) => d.connection_status === "accepted"))
      )
      .catch(() => setError("Failed to load suppliers."));
  }, []);

  const loadCatalog = (id) => {
    setSupplierId(id);
    setCart({});
    setNotice("");
    if (!id) {
      setCatalog([]);
      setSupplierSettings(defaultSettings);
      return;
    }
    marketplace
      .catalog(id)
      .then((data) => {
        setCatalog(data.items || []);
        setSupplierSettings(data.settings || defaultSettings);
        setCatalogNotice(data.notice || "");
      })
      .catch((err) =>
        setError(err.response?.data?.detail || "Failed to load catalog.")
      );
  };

  const cartKey = (entry, batch) =>
    batch ? `b-${batch.id}` : `p-${entry.product.id}`;

  const setQty = (entry, batch, qty) => {
    const n = parseInt(qty, 10) || 0;
    const key = cartKey(entry, batch);
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[key];
      else next[key] = { qty: n, entry, batch };
      return next;
    });
  };

  const cartLines = Object.values(cart);

  const total = useMemo(
    () =>
      cartLines.reduce((sum, l) => {
        const rate =
          l.batch?.ptr_rate || l.entry.product.ptr_rate;
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
          batch_id: l.batch?.id || null,
          qty: l.qty,
        })),
      });
      setNotice("Order placed successfully.");
      setCart({});
      loadCatalog(supplierId);
      setTimeout(() => navigate("/my-orders"), 800);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not place order.");
    } finally {
      setPlacing(false);
    }
  };

  const rows = catalog.flatMap((entry) => {
    if (entry.batches.length > 0) {
      return entry.batches.map((b) => ({ entry, batch: b }));
    }
    if (supplierSettings.allow_order_no_stock) {
      return [{ entry, batch: null }];
    }
    return [];
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Place Order</h1>
          <p className="page-sub">
            Browse shared stock from connected suppliers and place an order.
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}
      {catalogNotice && (
        <div className="warning-banner">{catalogNotice}</div>
      )}

      <div className="toolbar">
        <select
          value={supplierId}
          onChange={(e) => loadCatalog(e.target.value)}
          style={{ maxWidth: 360 }}
        >
          <option value="">Select a connected supplier...</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.gensoft_code})
            </option>
          ))}
        </select>
      </div>

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

      {supplierId && (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Avail</th>
                <th>Scheme</th>
                <th>PTR</th>
                <th>MRP</th>
                <th>Order Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, batch }) => {
                const key = cartKey(entry, batch);
                const avail = batch
                  ? batch.stock_hidden
                    ? null
                    : batch.available_qty
                  : entry.product.total_stock;
                const low = avail !== null && avail <= 0;
                return (
                  <tr key={key} className={low ? "out-of-stock-row" : ""}>
                    <td>
                      <strong>{entry.product.name}</strong>
                      <div className="muted">
                        {entry.product.manufacturer} · {entry.product.pack_size}
                      </div>
                    </td>
                    <td>{batch?.batch_no || "—"}</td>
                    <td>{batch ? fmtDate(batch.expiry_date) : "—"}</td>
                    <td className={low ? "low-stock" : ""}>
                      {avail === null ? "—" : avail}
                    </td>
                    <td>{batch?.scheme_hidden ? "—" : batch?.scheme || "—"}</td>
                    <td>{inr(batch?.ptr_rate || entry.product.ptr_rate)}</td>
                    <td>{inr(batch?.mrp || entry.product.mrp)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={
                          supplierSettings.allow_order_over_stock || avail === null
                            ? undefined
                            : avail || undefined
                        }
                        value={cart[key]?.qty || ""}
                        onChange={(e) => setQty(entry, batch, e.target.value)}
                        style={{ width: 80 }}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    No shared stock available from this supplier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
