import { useEffect, useRef, useState } from "react";
import { admin as adminApi } from "../api";
import { fmtDateTime, inr } from "../format";
import Modal from "./Modal.jsx";

/**
 * Super Admin — view / clear products, parties, outstanding, orders for one account.
 */
export default function AdminDataManage({ row, onClose, onNotice, onError }) {
  const accountId = row.account.id;
  const [tab, setTab] = useState("products"); // products | parties | outstanding | orders
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const searchTimer = useRef(null);

  const loadSummary = () =>
    adminApi
      .dataSummary(accountId)
      .then(setSummary)
      .catch(() => onError?.("Could not load data summary."));

  const loadRows = (t = tab, q = search) => {
    setLoading(true);
    const term = (q || "").trim() || undefined;
    const req =
      t === "products"
        ? adminApi.listProducts(accountId, term)
        : t === "parties"
          ? adminApi.listParties(accountId, term)
          : t === "orders"
            ? adminApi.listOrders(accountId, term)
            : adminApi.listOutstanding(accountId, term);
    req
      .then(setRows)
      .catch(() => onError?.("Could not load data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSummary();
    loadRows("products", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const switchTab = (t) => {
    setTab(t);
    setSearch("");
    loadRows(t, "");
  };

  const onSearchChange = (value) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadRows(tab, value), 280);
  };

  const clearAll = async (kind) => {
    if (kind === "parties" && summary?.outstanding_count > 0) {
      onError?.(
        `Cannot delete customers — ${summary.outstanding_count} outstanding bill(s) still exist. Delete outstanding first.`
      );
      return;
    }
    const labels = {
      products: "ALL products and stock batches",
      parties: "ALL parties / customers",
      outstanding: "ALL outstanding bills",
      orders: "ALL orders received and placed",
    };
    const ok = window.confirm(
      `Delete ${labels[kind]} for "${row.account.name}" (${row.account.gensoft_code})?\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setBusy(kind);
    try {
      const result =
        kind === "products"
          ? await adminApi.clearProducts(accountId)
          : kind === "parties"
            ? await adminApi.clearParties(accountId)
            : kind === "orders"
              ? await adminApi.clearOrders(accountId)
              : await adminApi.clearOutstanding(accountId);
      onNotice?.(result.message || "Cleared.");
      await loadSummary();
      loadRows(tab, search);
    } catch (err) {
      onError?.(err.response?.data?.detail || "Clear failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Modal
      title={`Manage data — ${row.account.name} (${row.account.gensoft_code})`}
      onClose={onClose}
      wide
    >
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <DataCard
            label="Products / Stock"
            active={tab === "products"}
            count={summary.product_count}
            sub={`${summary.stock_batch_count} batches · qty ${summary.stock_qty_total}`}
            synced={summary.products_last_synced}
            sizeMb={summary.products_size_mb}
            onClick={() => switchTab("products")}
          />
          <DataCard
            label="Customers / Parties"
            active={tab === "parties"}
            count={summary.party_count}
            sub={`${summary.customer_count} customers`}
            synced={summary.parties_last_synced}
            sizeMb={summary.parties_size_mb}
            onClick={() => switchTab("parties")}
          />
          <DataCard
            label="Outstanding"
            active={tab === "outstanding"}
            count={summary.outstanding_count}
            sub={`balance ₹${inr(summary.outstanding_balance_total)}`}
            synced={summary.outstanding_last_synced}
            sizeMb={summary.outstanding_size_mb}
            onClick={() => switchTab("outstanding")}
          />
          <DataCard
            label="Orders"
            active={tab === "orders"}
            count={summary.orders_count}
            sub={`${summary.orders_received_count || 0} received · ${summary.orders_placed_count || 0} placed`}
            synced={summary.orders_last_synced}
            sizeMb={summary.orders_size_mb}
            onClick={() => switchTab("orders")}
          />
        </div>
      )}

      <div
        className="muted"
        style={{
          marginBottom: 12,
          padding: "8px 10px",
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        Customers are linked to outstanding bills. Delete outstanding first —
        then customers. You cannot delete a customer while outstanding remains.
        Delete all orders removes both received and placed orders for this
        account.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          className="btn secondary sm"
          disabled={!!busy}
          style={{ color: "#b91c1c" }}
          onClick={() => clearAll("products")}
        >
          {busy === "products" ? "Deleting…" : "Delete all products & stock"}
        </button>
        <button
          type="button"
          className="btn secondary sm"
          disabled={!!busy || summary?.outstanding_count > 0}
          title={
            summary?.outstanding_count > 0
              ? "Delete outstanding first"
              : "Delete all customers"
          }
          style={{
            color: summary?.outstanding_count > 0 ? "#94a3b8" : "#b91c1c",
          }}
          onClick={() => clearAll("parties")}
        >
          {busy === "parties"
            ? "Deleting…"
            : summary?.outstanding_count > 0
              ? "Delete customers (blocked — clear outstanding first)"
              : "Delete all customers"}
        </button>
        <button
          type="button"
          className="btn secondary sm"
          disabled={!!busy}
          style={{ color: "#b91c1c" }}
          onClick={() => clearAll("outstanding")}
        >
          {busy === "outstanding" ? "Deleting…" : "Delete all outstanding"}
        </button>
        <button
          type="button"
          className="btn secondary sm"
          disabled={!!busy}
          style={{ color: "#b91c1c" }}
          onClick={() => clearAll("orders")}
        >
          {busy === "orders"
            ? "Deleting…"
            : "Delete all orders (received & placed)"}
        </button>
      </div>

      <div className="zennx-tabs" style={{ marginBottom: 10 }}>
        {[
          ["products", "Products / Stock"],
          ["parties", "Customers / Parties"],
          ["outstanding", "Outstanding"],
          ["orders", "Orders"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={"zennx-tab" + (tab === key ? " active" : "")}
            onClick={() => switchTab(key)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <input
          placeholder={
            tab === "products"
              ? "Search product code / name…"
              : tab === "parties"
                ? "Search party code / name…"
                : tab === "orders"
                  ? "Search order no / status…"
                  : "Search invoice / party…"
          }
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div
        className="panel"
        style={{ maxHeight: 360, overflow: "auto", padding: 0 }}
      >
        {loading ? (
          <div className="empty" style={{ padding: 20 }}>
            Loading…
          </div>
        ) : tab === "products" ? (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>MRP</th>
                <th>PTR</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.product_code || "—"}</td>
                  <td>{p.name}</td>
                  <td>{p.mrp}</td>
                  <td>{p.ptr_rate}</td>
                  <td>{p.total_stock ?? 0}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No products.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : tab === "parties" ? (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Area</th>
                <th>Mobile</th>
                <th>Outstanding bills</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.code || "—"}</td>
                  <td>{p.name}</td>
                  <td>{p.party_type}</td>
                  <td>{p.area || "—"}</td>
                  <td>{p.mobile || "—"}</td>
                  <td>
                    {(p.outstanding_bill_count ?? 0) > 0 ? (
                      <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                        {p.outstanding_bill_count} linked
                      </span>
                    ) : (
                      "0"
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No parties.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : tab === "orders" ? (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Direction</th>
                <th>Party / Counterparty</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.order_no}</strong>
                    <div className="muted">{fmtDateTime(o.created_at)}</div>
                  </td>
                  <td>{o.direction}</td>
                  <td>
                    {o.party_name || o.counterparty_name || "—"}
                    {o.party_name &&
                    o.counterparty_name &&
                    o.party_name !== o.counterparty_name ? (
                      <div className="muted">{o.counterparty_name}</div>
                    ) : null}
                  </td>
                  <td>{o.status}</td>
                  <td>{o.item_count}</td>
                  <td>{inr(o.total_amount)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Party</th>
                <th>Invoice</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.party_name}
                    <div className="muted">{b.party_id}</div>
                  </td>
                  <td>{b.invoice_no}</td>
                  <td>{b.invoice_date || "—"}</td>
                  <td>{b.amount}</td>
                  <td>{b.balance}</td>
                  <td>{b.age}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No outstanding bills.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function DataCard({ label, active, count, sub, synced, sizeMb, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: active ? "#eff6ff" : "#f8fafc",
        border: active ? "2px solid #3b82f6" : "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "10px 12px",
        font: "inherit",
      }}
    >
      <div
        className="muted"
        style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{count}</div>
      {sub && (
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {sub}
        </div>
      )}
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        {synced ? `Last: ${fmtDateTime(synced)}` : "No data yet"}
        {typeof sizeMb === "number" ? ` · ~${sizeMb} MB` : ""}
      </div>
    </button>
  );
}
