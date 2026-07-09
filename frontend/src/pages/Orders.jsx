import OrdersView from "../components/OrdersView.jsx";

export default function Orders() {
  return (
    <OrdersView
      direction="received"
      title="Orders Received"
      subtitle="Orders placed to you by connected customers"
    />
  );
}
