import CrudPage from "../components/CrudPage.jsx";
import { products } from "../api";
import { inr } from "../format";

export default function Products() {
  return (
    <CrudPage
      title="My Products"
      subtitle="Your product master with MRP, PTR, PTS, special rate and GST"
      addLabel="+ Add Product"
      resource={products}
      columns={[
        { header: "Code", render: (r) => r.product_code || "—" },
        {
          header: "Product",
          render: (r) => (
            <>
              <strong>{r.name}</strong>
              <div className="muted">
                {r.manufacturer} · {r.pack_size}
              </div>
            </>
          ),
        },
        { header: "Sch.", render: (r) => r.schedule || "—" },
        { header: "MRP", render: (r) => inr(r.mrp) },
        { header: "PTR", render: (r) => inr(r.ptr_rate) },
        { header: "PTS", render: (r) => inr(r.pts_rate) },
        { header: "Special", render: (r) => inr(r.special_rate) },
        { header: "GST%", render: (r) => `${r.gst_pct}%` },
        {
          header: "Hold",
          render: (r) => (r.is_on_hold ? "Yes" : "—"),
        },
        {
          header: "Stock",
          render: (r) => (
            <span className={r.total_stock < 10 ? "low-stock" : ""}>
              {r.total_stock}
            </span>
          ),
        },
      ]}
      fields={[
        { name: "product_code", label: "Product Code" },
        { name: "name", label: "Name", required: true, full: true },
        { name: "manufacturer", label: "Manufacturer" },
        { name: "pack_size", label: "Pack Size (e.g. 10x10)" },
        { name: "category", label: "Category", default: "General" },
        { name: "schedule", label: "Schedule (H/H1/OTC)" },
        { name: "hsn_code", label: "HSN Code" },
        { name: "mrp", label: "MRP", type: "number", default: 0 },
        { name: "ptr_rate", label: "PTR Rate", type: "number", default: 0 },
        { name: "pts_rate", label: "PTS Rate", type: "number", default: 0 },
        { name: "special_rate", label: "Special Rate", type: "number", default: 0 },
        { name: "gst_pct", label: "GST %", type: "number", default: 12 },
        {
          name: "is_on_hold",
          label: "On Hold",
          type: "boolean",
          default: false,
        },
      ]}
    />
  );
}
