import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { orders as ordersApi } from "../api";
import { fmtDateTime, inr, orderStatusTone } from "../format";

const STATUSES = [
  "received",
  "viewed",
  "transferred",
  "billed",
  "accepted",
  "completed",
  "rejected",
  "cancelled",
];

const FINAL_STATUSES = ["completed", "rejected", "cancelled"];

const statusLabel = (s) => (s === "viewed" ? "viewed (seen)" : s);

function allowedStatuses(current) {
  if (FINAL_STATUSES.includes(current)) return [current];
  return STATUSES.filter((s) => s === "received" ? current === "received" : true);
}

function isStatusLocked(current) {
  return FINAL_STATUSES.includes(current);
}

export default function OrdersView({ direction, title, subtitle }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailOpenedAsReceived, setDetailOpenedAsReceived] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [error, setError] = useState("");

  const isReceived = direction === "received";

  const load = (status = "") => {
    const params = { direction };
    if (status) params.statuses = status;
    Promise.all([ordersApi.list(params), ordersApi.summary({ direction })])
      .then(([list, sum]) => {
        setOrders(list);
        setSummary(sum);
      })
      .catch(() => setError("Failed to load orders."));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const changeStatus = async (orderId, status, remarks = null, refreshDetail = false) => {
    try {
      const updated = await ordersApi.updateStatus(orderId, status, remarks);
      load(filter);
      if (refreshDetail) setDetail(updated);
      return updated;
    } catch (err) {
      alert(err.response?.data?.detail || "Could not update status.");
      return null;
    }
  };

  const requestStatusChange = (orderId, newStatus, currentStatus, refreshDetail = false) => {
    if (newStatus === "rejected") {
      setRejectDialog({ orderId, refreshDetail, previousStatus: currentStatus });
      setRejectRemarks("");
      return;
    }
    changeStatus(orderId, newStatus, null, refreshDetail);
  };

  const confirmReject = async () => {
    if (!rejectRemarks.trim()) {
      alert("Please enter rejection remarks.");
      return;
    }
    const ok = await changeStatus(
      rejectDialog.orderId,
      "rejected",
      rejectRemarks.trim(),
      rejectDialog.refreshDetail
    );
    if (ok) {
      setRejectDialog(null);
      setRejectRemarks("");
    }
  };

  const cancel = async (order) => {
    if (!confirm(`Cancel order ${order.order_no}?`)) return;
    await changeStatus(order.id, "cancelled");
  };

  const openDetail = async (order) => {
    try {
      const full = await ordersApi.get(order.id);
      setDetail(full);
      setDetailOpenedAsReceived(full.status === "received");
    } catch {
      setDetail(order);
      setDetailOpenedAsReceived(order.status === "received");
    }
  };

  const closeDetail = async () => {
    if (
      isReceived &&
      detail &&
      detailOpenedAsReceived &&
      detail.status === "received"
    ) {
      await changeStatus(detail.id, "viewed");
    }
    setDetail(null);
    setDetailOpenedAsReceived(false);
    setRejectDialog(null);
  };

  const productCode = (it) =>
    it.product?.product_code || `P${String(it.product_id).padStart(4, "0")}`;

  const statusControl = (order, inModal = false) => {
    if (!isReceived || isStatusLocked(order.status)) {
      return (
        <span className={`status-pill order-${orderStatusTone(order.status)}`}>
          {statusLabel(order.status)}
        </span>
      );
    }
    return (
      <select
        value={order.status}
        onChange={(e) =>
          requestStatusChange(order.id, e.target.value, order.status, inModal)
        }
        style={{ maxWidth: inModal ? 180 : 130, display: "inline-block" }}
      >
        {allowedStatuses(order.status).map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{subtitle}</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {summary && (
        <div className="orders-summary-bar">
          <div className="summary-stats">
            <span>Today, {summary.date_label}</span>
            <span>Orders: {summary.order_count}</span>
            <span>Items: {summary.item_count}</span>
            <span className="summary-total">
              Total: {inr(summary.total_amount)}
            </span>
          </div>
        </div>
      )}

      <div className="toolbar">
        <select
          style={{ maxWidth: 200 }}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            load(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{isReceived ? "Customer" : "Supplier"}</th>
              <th>Sales Rep</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const counterparty = isReceived ? o.buyer : o.supplier;
              const customerName =
                o.party?.name || counterparty?.name || "—";
              const isRepOrder = Boolean(o.sales_rep_id) || o.source === "app";
              return (
                <tr key={o.id}>
                  <td>
                    {o.order_no}
                    <div className="muted">{fmtDateTime(o.created_at)}</div>
                    {isRepOrder && (
                      <div className="rep-order-tag">From Sales Rep</div>
                    )}
                  </td>
                  <td>
                    <strong>{customerName}</strong>
                    {isReceived && (
                      <div className="muted">
                        {isRepOrder
                          ? "Customer order (via field force)"
                          : counterparty?.gensoft_code || ""}
                      </div>
                    )}
                    {!isReceived && (
                      <div className="muted">{counterparty?.gensoft_code}</div>
                    )}
                  </td>
                  <td>
                    {isReceived ? (
                      o.sales_rep?.name ? (
                        <>
                          <strong>{o.sales_rep.name}</strong>
                          <div className="muted">took this order</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )
                    ) : (
                      o.sales_rep?.name || "—"
                    )}
                  </td>
                  <td>{o.item_count}</td>
                  <td className="order-amount">{inr(o.total_amount)}</td>
                  <td>
                    <span className={`status-pill order-${orderStatusTone(o.status)}`}>
                      {statusLabel(o.status)}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <button
                      className="btn secondary sm"
                      onClick={() => openDetail(o)}
                    >
                      Details
                    </button>{" "}
                    {isReceived ? (
                      statusControl(o, false)
                    ) : (
                      o.status !== "cancelled" &&
                      o.status !== "completed" && (
                        <button
                          className="btn danger sm"
                          onClick={() => cancel(o)}
                        >
                          Cancel
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rejectDialog && !detail && (
        <Modal
          title="Reject Order — Remarks Required"
          onClose={() => setRejectDialog(null)}
        >
          <div className="field">
            <label>Rejection Remarks</label>
            <textarea
              rows={4}
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              placeholder="Enter reason for rejection..."
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button
              className="btn secondary"
              onClick={() => setRejectDialog(null)}
            >
              Cancel
            </button>
            <button className="btn danger" onClick={confirmReject}>
              Confirm Reject
            </button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`Order ${detail.order_no}`} onClose={closeDetail} wide>
          <div className="detail-grid">
            <div>
              <div className="muted">Customer (who ordered)</div>
              <strong>{detail.party?.name || detail.buyer?.name || "—"}</strong>
            </div>
            <div>
              <div className="muted">Distributor (order to)</div>
              <strong>{detail.supplier?.name}</strong>
            </div>
            <div>
              <div className="muted">Sales Rep (who took order)</div>
              <strong>{detail.sales_rep?.name || "—"}</strong>
              {detail.source === "app" && (
                <div className="muted">Placed from sales rep app</div>
              )}
            </div>
            <div>
              <div className="muted">Status</div>
              {statusControl(detail, true)}
            </div>
            <div>
              <div className="muted">Placed</div>
              {fmtDateTime(detail.created_at)}
            </div>
          </div>

          {detail.notes && (
            <div className="remarks-box" style={{ marginTop: 12 }}>
              <div className="muted">Notes</div>
              <div>{detail.notes}</div>
            </div>
          )}

          {detail.remarks && (
            <div className="remarks-box">
              <div className="muted">Remarks</div>
              <div>{detail.remarks}</div>
            </div>
          )}

          {rejectDialog?.refreshDetail && (
            <div className="reject-box">
              <div className="field">
                <label>Rejection Remarks (required)</label>
                <textarea
                  rows={3}
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  autoFocus
                />
              </div>
              <div className="modal-actions" style={{ marginTop: 8 }}>
                <button
                  className="btn secondary sm"
                  onClick={() => setRejectDialog(null)}
                >
                  Cancel
                </button>
                <button className="btn danger sm" onClick={confirmReject}>
                  Confirm Reject
                </button>
              </div>
            </div>
          )}

          <table className="order-detail-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Free</th>
                <th>Rate</th>
                <th>GST</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.id}>
                  <td>{productCode(it)}</td>
                  <td>{it.product?.name}</td>
                  <td>{it.qty}</td>
                  <td>{it.free_qty}</td>
                  <td>{inr(it.rate)}</td>
                  <td>{inr(it.gst_amount)}</td>
                  <td className="order-amount">{inr(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals-box" style={{ marginTop: 16 }}>
            <div className="grand">
              <span>Grand Total</span>
              <span>{inr(detail.total_amount)}</span>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn secondary" onClick={closeDetail}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
