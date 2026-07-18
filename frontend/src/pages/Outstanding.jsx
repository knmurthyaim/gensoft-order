import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import ExcelUploadBar from "../components/ExcelUploadBar.jsx";
import { outstanding as outstandingApi } from "../api";
import { fmtDate, inr } from "../format";

export default function Outstanding() {
  const { account } = useAuth();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor";

  const load = (q = search) =>
    outstandingApi
      .list({ search: q || undefined, positive_only: true })
      .then((data) => {
        setSummary(data.summary);
        setRows(data.rows);
      })
      .catch(() => setError("Failed to load outstanding bills."));

  useEffect(() => {
    load();
  }, []);

  const onSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    load(q);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Outstanding</h1>
          <p className="page-sub">
            Invoice-wise outstanding bills synced from your billing system.
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      {isDistributor && (
        <ExcelUploadBar
          label="Sync from billing system:"
          onDownloadTemplate={() => outstandingApi.downloadTemplate()}
          onUpload={(file) => outstandingApi.uploadExcel(file)}
          onSuccess={(result) => {
            setNotice(
              `Upload complete: ${result.uploaded} bills (${result.failed} failed).`
            );
            load();
            setTimeout(() => setNotice(""), 5000);
          }}
        />
      )}

      {summary && (
        <div className="orders-summary-bar">
          <div className="summary-stats">
            <span>Outstanding Bills: {summary.bill_count}</span>
            <span>Amount: {inr(summary.total_amount)}</span>
            <span>Paid: {inr(summary.total_paid)}</span>
            <span className="summary-total">
              Balance: {inr(summary.total_balance)}
            </span>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search party name..."
          value={search}
          onChange={onSearch}
        />
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Party ID</th>
              <th>Party Name</th>
              <th>Invoice No</th>
              <th>Invoice Date</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th style={{ textAlign: "right" }}>Paid</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th style={{ textAlign: "right" }}>Age</th>
              <th style={{ textAlign: "right" }}>Disc %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.party_id || "—"}</td>
                <td>
                  <strong>{r.party_name}</strong>
                </td>
                <td>{r.invoice_no}</td>
                <td>{fmtDate(r.invoice_date)}</td>
                <td style={{ textAlign: "right" }}>{inr(r.amount)}</td>
                <td style={{ textAlign: "right" }}>{inr(r.paid)}</td>
                <td className="order-amount" style={{ textAlign: "right" }}>
                  {inr(r.balance)}
                </td>
                <td style={{ textAlign: "right" }}>{r.age} days</td>
                <td style={{ textAlign: "right" }}>
                  {r.discount != null && Number(r.discount) !== 0
                    ? `${Number(r.discount)}%`
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No outstanding bills found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
