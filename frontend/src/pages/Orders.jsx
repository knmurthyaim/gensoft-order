import OrdersView from "../components/OrdersView.jsx";

export default function Orders() {
  return (
    <OrdersView
      direction="received"
      title="Orders Received"
      subtitle="Orders from retailers and from your sales reps (customer orders via rep)"
    />
  );
}
