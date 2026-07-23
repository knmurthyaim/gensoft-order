import CrudPage from "../components/CrudPage.jsx";
import { salesReps } from "../api";

export default function SalesReps() {
  return (
    <CrudPage
      title="Sales Reps"
      subtitle="Phone number is the app login ID and must be unique for every sales rep. Set a password so they can sign in on phone/web."
      addLabel="+ Add Sales Rep"
      resource={salesReps}
      columns={[
        { header: "Name", render: (r) => <strong>{r.name}</strong> },
        {
          header: "Phone (login ID)",
          render: (r) => r.phone || "—",
        },
        {
          header: "App login",
          render: (r) =>
            r.has_login ? (
              <span className="badge ok">{r.phone || r.username} / set</span>
            ) : (
              <span className="muted">Edit → set password to enable login</span>
            ),
        },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, full: true },
        {
          name: "phone",
          label: "Phone (unique — used as app login ID)",
          required: true,
          full: true,
        },
        { name: "email", label: "Email" },
        {
          name: "password",
          label: "App password (required on create; leave blank to keep)",
          type: "password",
          required: true,
          full: true,
        },
      ]}
    />
  );
}
