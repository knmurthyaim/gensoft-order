import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import ExcelUploadBar from "../components/ExcelUploadBar.jsx";
import { SortTh, nextSort } from "../components/SortTh.jsx";
import { RowLimitSelect } from "../rowLimits.jsx";
import { outstanding as outstandingApi } from "../api";
import { fmtDate, inr } from "../format";

export default function Outstanding() {
  const { account } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [parties, setParties] = useState([]);
  const [partyCount, setPartyCount] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selected, setSelected] = useState(null);
  const [bills, setBills] = useState([]);
  const [billSummary, setBillSummary] = useState(null);
  const [billsLoading, setBillsLoading] = useState(false);

  const isDistributor =
    account?.account_type === "distributor" ||
    account?.account_type === "sub_distributor";

  const loadParties = (
    q = appliedSearch,
    rowLimit = limit,
    by = sortBy,
    dir = sortDir
  ) => {
    setLoading(true);
    setError("");
    return outstandingApi
      .parties({
        search: q || undefined,
        positive_only: true,
        limit: rowLimit,
        sort_by: by,
        sort_dir: dir,
      })
      .then((data) => {
        setSummary(data.summary);
        setParties(data.parties || []);
        setPartyCount(data.party_count || 0);
      })
      .catch(() => setError("Failed to load outstanding."))
      .finally(() => setLoading(false));
  };

  const onSort = (col) => {
    const next = nextSort(sortBy, sortDir, col);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    loadParties(appliedSearch, limit, next.sortBy, next.sortDir);
  };

  const openParty = (party, { fromUrl = false } = {}) => {
    setSelected(party);
    setBills([]);
    setBillSummary(null);
    setBillsLoading(true);
    setError("");
    if (!fromUrl) {
      const next = new URLSearchParams();
      if (party.party_id) next.set("party_id", party.party_id);
      if (party.party_name) next.set("party_name", party.party_name);
      setSearchParams(next, { replace: true });
    }
    outstandingApi
      .bills({
        party_id: party.party_id || "",
        party_name: party.party_name || "",
        positive_only: true,
        limit: 500,
      })
      .then((data) => {
        setBillSummary(data.summary);
        setBills(data.rows || []);
      })
      .catch(() => setError("Failed to load party bills."))
      .finally(() => setBillsLoading(false));
  };

  const closeParty = () => {
    setSelected(null);
    setBills([]);
    setBillSummary(null);
    setSearchParams({}, { replace: true });
  };

  useEffect(() => {
    loadParties("", 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open drill-down when arriving from Parties (or shared link)
  useEffect(() => {
    const partyId = (searchParams.get("party_id") || "").trim();
    const partyName = (searchParams.get("party_name") || "").trim();
    if (!partyId && !partyName) return;
    if (
      selected &&
      (selected.party_id || "") === partyId &&
      (selected.party_name || "") === partyName
    ) {
      return;
    }
    openParty(
      { party_id: partyId, party_name: partyName },
      { fromUrl: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Outstanding</h1>
          <p className="page-sub">
            {selected
              ? "Bill-wise outstanding for the selected party."
              : "Party-wise outstanding. Click a party for bills. Click headers to sort."}
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      {isDistributor && !selected && (
        <ExcelUploadBar
          label="Sync from billing system:"
          onDownloadTemplate={() => outstandingApi.downloadTemplate()}
          onUpload={(file) => outstandingApi.uploadExcel(file)}
          onSuccess={(result) => {
            setNotice(
              `Upload complete: ${result.uploaded} bills (${result.failed} failed).`
            );
            loadParties();
            setTimeout(() => setNotice(""), 5000);
          }}
        />
      )}

      {summary && !selected && (
        <div className="orders-summary-bar">
          <div className="summary-stats">
            <span>Parties: {partyCount}</span>
            <span>Outstanding Bills: {summary.bill_count}</span>
            <span>Amount: {inr(summary.total_amount)}</span>
            <span>Paid: {inr(summary.total_paid)}</span>
            <span className="summary-total">
              Balance: {inr(summary.total_balance)}
            </span>
          </div>
        </div>
      )}

      {selected ? (
        <>
          <div className="toolbar" style={{ alignItems: "center" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={closeParty}
            >
              ← All parties
            </button>
            <div style={{ flex: 1 }}>
              <strong>{selected.party_name}</strong>
              <span className="muted" style={{ marginLeft: 8 }}>
                {selected.party_id || "—"}
                {selected.place ? ` · ${selected.place}` : ""}
              </span>
            </div>
          </div>

          {billSummary && (
            <div className="orders-summary-bar" style={{ marginTop: 8 }}>
              <div className="summary-stats">
                <span>Bills: {billSummary.bill_count}</span>
                <span>Amount: {inr(billSummary.total_amount)}</span>
                <span>Paid: {inr(billSummary.total_paid)}</span>
                <span className="summary-total">
                  Balance: {inr(billSummary.total_balance)}
                </span>
              </div>
            </div>
          )}

          <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
            {billsLoading
              ? "Loading…"
              : `Showing ${bills.length} bill${bills.length === 1 ? "" : "s"}.`}
          </p>

          <div className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
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
                  {bills.map((r) => (
                    <tr key={r.id}>
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
                  {!billsLoading && bills.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty">
                        No outstanding bills for this party.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const q = search.trim();
              setAppliedSearch(q);
              loadParties(q);
            }}
          >
            <input
              className="search-input"
              placeholder="Search party, code or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn secondary" type="submit" disabled={loading}>
              Search
            </button>
            <RowLimitSelect
              value={limit}
              onChange={(next) => {
                setLimit(next);
                loadParties(appliedSearch, next);
              }}
              disabled={loading}
            />
          </form>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
            {loading
              ? "Loading…"
              : `Showing ${parties.length} of ${partyCount} parties.`}
          </p>

          <div className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <SortTh label="Code" col="code" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Party Name" col="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Place" col="place" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Bills" col="bills" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                    <SortTh label="Outstanding" col="balance" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                    <tr
                      key={`${p.party_id}|${p.party_name}`}
                      className="clickable-row"
                      onClick={() => openParty(p)}
                      title="View bills"
                    >
                      <td>{p.party_id || "—"}</td>
                      <td>
                        <strong>{p.party_name}</strong>
                      </td>
                      <td>{p.place || "—"}</td>
                      <td style={{ textAlign: "right" }}>{p.bill_count}</td>
                      <td
                        className="order-amount"
                        style={{ textAlign: "right" }}
                      >
                        {inr(p.total_balance)}
                      </td>
                    </tr>
                  ))}
                  {parties.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty">
                        No outstanding parties found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
