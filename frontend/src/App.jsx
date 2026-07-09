import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import TopNav from "./components/TopNav.jsx";
import Login from "./pages/Login.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Orders from "./pages/Orders.jsx";
import MyOrders from "./pages/MyOrders.jsx";
import Marketplace from "./pages/Marketplace.jsx";
import Products from "./pages/Products.jsx";
import Stock from "./pages/Stock.jsx";
import Parties from "./pages/Parties.jsx";
import SalesReps from "./pages/SalesReps.jsx";
import Connections from "./pages/Connections.jsx";
import Settings from "./pages/Settings.jsx";
import Outstanding from "./pages/Outstanding.jsx";
import DataImport from "./pages/DataImport.jsx";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="full-loader">Loading GenSoft…</div>;
  }

  if (!user) {
    return <Login />;
  }

  if (user.role === "platform_admin") {
    return (
      <Routes>
        <Route path="/" element={<AdminUsers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <div className="zennx-app">
      <TopNav />
      <main className="zennx-main">
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
          <Route path="/connections" element={<Connections />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/import" element={<DataImport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
