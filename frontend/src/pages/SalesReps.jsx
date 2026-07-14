import CrudPage from "../components/CrudPage.jsx";
import { salesReps } from "../api";

export default function SalesReps() {
  return (
    <CrudPage
      title="Sales Reps"
      subtitle="Create field executives and give them an app login. They will only see assigned customers and your stock."
      addLabel="+ Add Sales Rep"
      resource={salesReps}
      columns={[
        { header: "Name", render: (r) => <strong>{r.name}</strong> },
        { header: "Phone", render: (r) => r.phone || "—" },
        { header: "Email", render: (r) => r.email || "—" },
        {
          header: "App login",
          render: (r) =>
            r.has_login ? (
              <span className="badge ok">{r.username}</span>
            ) : (
              <span className="muted">Not set</span>
            ),
        },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, full: true },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
        {
          name: "username",
          label: "App username",
          full: true,
        },
        {
          name: "password",
          label: "App password",
          type: "password",
          full: true,
        },
      ]}
    />
  );
}
