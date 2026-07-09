import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { getDashboard, orders as ordersApi } from "../api";
import { inr, orderStatusTone } from "../format";

export default function Dashboard() {
  const { account } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor";

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch(() => setError("Could not load dashboard."));
    ordersApi
      .list({ direction: isDistributor ? "received" : "placed" })
      .then((o) => setRecent(o.slice(0, 6)))
      .catch(() => {});
  }, [isDistributor]);

  const cards = stats
    ? [
        isDistributor
          ? { label: "Orders Received", value: stats.orders_received }
          : { label: "Orders Placed", value: stats.orders_placed },
        { label: "Revenue", value: inr(stats.revenue), show: isDistributor },
        { label: "Pending", value: stats.pending_orders, show: isDistributor },
        { label: "Products", value: stats.total_products, show: isDistributor },
        { label: "Parties", value: stats.total_parties },
        { label: "Connections", value: stats.connections },
        {
          label: "Low Stock",
          value: stats.low_stock_products,
          warn: true,
          show: isDistributor,
        },
        {
          label: "Near Expiry",
          value: stats.near_expiry_batches,
          warn: true,
          show: isDistributor,
        },
      ].filter((c) => c.show === undefined || c.show)
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            {account?.name} · {account?.account_type}
          </p>
        </div>
        <Link to="/marketplace" className="btn">
          Place Order
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="stat-label">{c.label}</div>
            <div className={"stat-value" + (c.warn ? " low-stock" : "")}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18 }}>
        {isDistributor ? "Recent Orders Received" : "Recent Orders Received"}
      </h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{isDistributor ? "Buyer" : "Supplier"}</th>
              <th>Items</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.id}>
                <td>{o.order_no}</td>
                <td>
                  {isDistributor
                    ? o.buyer?.name || "—"
                    : o.supplier?.name || "—"}
                </td>
                <td>{o.item_count}</td>
                <td>
                  <span className={`status-pill order-${orderStatusTone(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td>{inr(o.total_amount)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
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
