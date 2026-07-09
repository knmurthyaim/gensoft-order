import { useAuth } from "../AuthContext.jsx";
import OrdersView from "../components/OrdersView.jsx";

export default function MyOrders() {
  const { account } = useAuth();
  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor";

  return (
    <OrdersView
      direction="placed"
      title={isDistributor ? "Orders Placed" : "Orders Received"}
      subtitle="Orders you placed with your suppliers"
    />
  );
}
