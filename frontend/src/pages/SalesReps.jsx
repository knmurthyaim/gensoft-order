import CrudPage from "../components/CrudPage.jsx";
import { salesReps } from "../api";

export default function SalesReps() {
  return (
    <CrudPage
      title="Sales Reps"
      subtitle="Create field executives with an App username + password. They log in on phone/web, see only assigned customers, and place orders to you (Orders Received → Sales Rep Order)."
      addLabel="+ Add Sales Rep"
      resource={salesReps}
      columns={[
        { header: "Name", render: (r) => <strong>{r.name}</strong> },
        { header: "Phone", render: (r) => r.phone || "—" },
        {
          header: "App login",
          render: (r) =>
            r.has_login ? (
              <span className="badge ok">{r.username} / set</span>
            ) : (
              <span className="muted">Edit → set username & password</span>
            ),
        },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, full: true },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
        {
          name: "username",
          label: "App username (required for login)",
          full: true,
        },
        {
          name: "password",
          label: "App password (required to create/reset login)",
          type: "password",
          full: true,
        },
      ]}
    />
  );
}
