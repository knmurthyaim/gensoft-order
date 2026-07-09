import CrudPage from "../components/CrudPage.jsx";
import { salesReps } from "../api";

export default function SalesReps() {
  return (
    <CrudPage
      title="Sales Reps"
      subtitle="Your field executives"
      addLabel="+ Add Sales Rep"
      resource={salesReps}
      columns={[
        { header: "Name", render: (r) => <strong>{r.name}</strong> },
        { header: "Phone", render: (r) => r.phone || "—" },
        { header: "Email", render: (r) => r.email || "—" },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, full: true },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
      ]}
    />
  );
}
