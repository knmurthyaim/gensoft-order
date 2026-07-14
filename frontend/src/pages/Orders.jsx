import OrdersView from "../components/OrdersView.jsx";

export default function Orders() {
  return (
    <OrdersView
      direction="received"
      title="Orders Received"
      subtitle="Customer orders to you — including orders taken by your sales reps (customer name + which rep took the order)"
    />
  );
}
