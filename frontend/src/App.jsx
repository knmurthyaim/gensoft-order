import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import TopNav from "./components/TopNav.jsx";
import DistAppShell, { isNativeApp } from "./components/DistAppShell.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Orders from "./pages/Orders.jsx";
import MyOrders from "./pages/MyOrders.jsx";
import Marketplace from "./pages/Marketplace.jsx";
import Products from "./pages/Products.jsx";
import Stock from "./pages/Stock.jsx";
import Parties from "./pages/Parties.jsx";
import SalesReps from "./pages/SalesReps.jsx";
import RepTracking from "./pages/RepTracking.jsx";
import Connections from "./pages/Connections.jsx";
import Settings from "./pages/Settings.jsx";
import Outstanding from "./pages/Outstanding.jsx";
import DataImport from "./pages/DataImport.jsx";
import {
  RepCustomers,
  RepOrder,
  RepOrders,
  RepOutstanding,
  RepShell,
  RepStock,
} from "./pages/RepApp.jsx";

function DistRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/my-orders" element={<MyOrders />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/products" element={<Products />} />
      <Route path="/stock" element={<Stock />} />
      <Route path="/parties" element={<Parties />} />
      <Route path="/outstanding" element={<Outstanding />} />
      <Route path="/sales-reps" element={<SalesReps />} />
      <Route path="/rep-tracking" element={<RepTracking />} />
      <Route path="/connections" element={<Connections />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/import" element={<DataImport />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="full-loader">Loading GenSoft…</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (user.role === "platform_admin") {
    return (
      <Routes>
        <Route path="/" element={<AdminUsers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Sales rep — parties (all), stock, outstanding, own orders only
  if (user.role === "rep") {
    return (
      <RepShell>
        <Routes>
          <Route path="/rep" element={<RepCustomers />} />
          <Route path="/rep/order/:partyId" element={<RepOrder />} />
          <Route path="/rep/stock" element={<RepStock />} />
          <Route path="/rep/outstanding" element={<RepOutstanding />} />
          <Route path="/rep/orders" element={<RepOrders />} />
          <Route path="*" element={<Navigate to="/rep" replace />} />
        </Routes>
      </RepShell>
    );
  }

  // Distributor / stockist / retailer — native app uses same menu style as rep
  if (isNativeApp()) {
    return (
      <DistAppShell>
        <DistRoutes />
      </DistAppShell>
    );
  }

  // Web browser — full desktop TopNav
  return (
    <div className="zennx-app">
      <TopNav />
      <main className="zennx-main">
        <DistRoutes />
      </main>
    </div>
  );
}
