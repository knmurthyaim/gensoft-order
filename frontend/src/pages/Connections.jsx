import { useEffect, useState } from "react";
import { connections, getDirectory } from "../api";

export default function Connections() {
  const [directory, setDirectory] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [error, setError] = useState("");

  const load = () => {
    getDirectory({
      search: search || undefined,
      account_type: typeFilter,
    })
      .then(setDirectory)
      .catch(() => setError("Failed to load directory."));
    connections.incoming().then(setIncoming).catch(() => {});
    connections.outgoing().then(setOutgoing).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const request = async (accountId) => {
    await connections.request(accountId);
    load();
  };

  const respond = async (id, status) => {
    await connections.respond(id, status);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-sub">
            Connect with suppliers to view their shared stock and place orders.
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {incoming.filter((c) => c.status === "pending").length > 0 && (
        <>
          <h2 style={{ fontSize: 17 }}>Pending Requests (incoming)</h2>
          <div className="panel" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Requester</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {incoming
                  .filter((c) => c.status === "pending")
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.requester?.name}</strong>
                      </td>
                      <td>{c.requester?.gensoft_code}</td>
                      <td>{c.requester?.account_type}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          className="btn sm"
                          onClick={() => respond(c.id, "accepted")}
                        >
                          Accept
                        </button>{" "}
                        <button
                          className="btn danger sm"
                          onClick={() => respond(c.id, "rejected")}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 17 }}>GenSoft Directory</h2>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by name / code / area..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="all">All types</option>
          <option value="distributor">Distributors</option>
          <option value="sub_distributor">Sub-Distributors</option>
          <option value="retailer">Retailers</option>
        </select>
        <button className="btn zennx-btn" onClick={load}>
          Search
        </button>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Type</th>
              <th>Area</th>
              <th>DL No</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {directory.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.name}</strong>
                </td>
                <td>{d.gensoft_code}</td>
                <td>{d.account_type}</td>
                <td>{d.area || "—"}</td>
                <td>{d.dl_no || "—"}</td>
                <td>
                  {d.connection_status !== "none" ? (
                    <span className={`status-pill ${d.connection_status}`}>
                      {d.connection_status}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {d.account_type !== "retailer" &&
                    (d.connection_status === "none" ||
                    d.connection_status === "rejected" ? (
                      <button className="btn sm" onClick={() => request(d.id)}>
                        Connect
                      </button>
                    ) : d.connection_status === "pending" ? (
                      <span className="muted">Requested</span>
                    ) : (
                      <span className="muted">Connected</span>
                    ))}
                </td>
              </tr>
            ))}
            {directory.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
