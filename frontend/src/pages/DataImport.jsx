import { useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import ExcelUploadBar from "../components/ExcelUploadBar.jsx";
import { outstanding, parties, products } from "../api";

function UploadSection({ title, description, api, resultLabel }) {
  const [notice, setNotice] = useState("");

  const onSuccess = (result) => {
    const ok = result.uploaded ?? result.created ?? 0;
    const fail = result.failed ?? 0;
    setNotice(
      `${resultLabel}: ${ok} uploaded${fail ? `, ${fail} failed` : ""}.` +
        (result.errors?.length ? ` ${result.errors.join(" ")}` : "")
    );
    setTimeout(() => setNotice(""), 6000);
  };

  return (
    <div className="panel" style={{ marginBottom: 20, padding: 20 }}>
      <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>{title}</h2>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        {description}
      </p>
      {notice && <div className="notice-banner" style={{ marginBottom: 12 }}>{notice}</div>}
      <ExcelUploadBar
        onDownloadTemplate={() => api.downloadTemplate()}
        onUpload={(file) => api.uploadExcel(file)}
        onSuccess={onSuccess}
      />
    </div>
  );
}

export default function DataImport() {
  const { account } = useAuth();
  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor";

  if (!isDistributor) {
    return (
      <div>
        <h1 className="page-title">Data Import</h1>
        <p className="page-sub">Only distributors can import master data.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Data Import</h1>
          <p className="page-sub">
            Upload products, customers, and outstanding bills from Excel. Sample
            files are in the project <code>samples/</code> folder.
          </p>
        </div>
      </div>

      <UploadSection
        title="Products with stock"
        description="One Excel row per batch. Repeat product_code for multiple batches of the same product."
        api={products}
        resultLabel="Products"
      />
      <UploadSection
        title="Customers / parties"
        description="Upload your party master — code, name, area, DL, GST, sales rep, etc."
        api={parties}
        resultLabel="Customers"
      />
      <UploadSection
        title="Outstanding bills"
        description="Invoice-wise outstanding: party id, invoice no, date, amount, paid, balance, age, discount."
        api={outstanding}
        resultLabel="Bills"
      />
    </div>
  );
}
