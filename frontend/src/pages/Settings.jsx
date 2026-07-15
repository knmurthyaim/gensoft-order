import { useEffect, useState } from "react";
import { settings as settingsApi } from "../api";

function toLocalDatetime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SECTIONS = [
  {
    title: "STOCK",
    rows: [
      {
        key: "display_stock_to_parties",
        label: "DISPLAY STOCK TO PARTIES",
        yesHelp:
          "Yes: Current stock position will be displayed to Parties.",
        noHelp:
          "No: Stock position will not be displayed to Parties.",
      },
      {
        key: "display_stock_to_salesrep",
        label: "DISPLAY STOCK TO SALESREP",
        yesHelp:
          "Yes: Current stock position will be displayed to SalesReps.",
        noHelp:
          "No: Stock position will not be displayed to SalesReps.",
      },
    ],
  },
  {
    title: "SCHEME",
    rows: [
      {
        key: "hide_scheme_from_parties",
        label: "DON'T DISPLAY SCHEME TO PARTIES",
        yesHelp:
          "Yes: Schemes will not be displayed to the Parties. No: Schemes will be displayed to all Parties. Note: Pay attention as it is in reverse order.",
        noHelp:
          "No: Schemes will be displayed to all Parties.",
        reverse: true,
      },
      {
        key: "hide_scheme_from_salesrep",
        label: "DON'T DISPLAY SCHEME TO SALESREP",
        yesHelp:
          "Yes: Schemes will not be displayed to the SalesReps. No: Schemes will be displayed to all SalesReps. Note: Pay attention as it is in reverse order.",
        noHelp:
          "No: Schemes will be displayed to all SalesReps.",
        reverse: true,
      },
    ],
  },
  {
    title: "PRODUCT",
    rows: [
      {
        key: "hide_hold_products_from_salesrep",
        label: "DISTRIBUTOR HOLD PRODUCTS HIDE TO SALESREP",
        yesHelp:
          "Yes: Don't show hold products to salesrep.",
        noHelp:
          "No: Show hold products to salesrep.",
      },
    ],
  },
  {
    title: "SALES REP TRACKING",
    rows: [
      {
        key: "track_salesrep_location",
        label: "TRACK SALES REP LOCATION",
        yesHelp:
          "Yes: Rep phone saves GPS every 10 min (even offline). Points upload to cloud when the app opens or network returns. Visible only to you for 7 days.",
        noHelp:
          "No: Location is not collected from sales reps.",
      },
    ],
  },
  {
    title: "ORDER SETTINGS",
    rows: [
      {
        key: "allow_order_no_stock",
        label: "ALLOW ORDER FOR NO STOCK PRODUCTS",
        yesHelp:
          "Yes: Customers can place orders even when product stock is zero.",
        noHelp:
          "No: Customers can only order products that have available stock.",
      },
      {
        key: "allow_order_over_stock",
        label: "ALLOW ORDER MORE THAN AVAILABLE QTY",
        yesHelp:
          "Yes: Customers can order a quantity greater than current available stock.",
        noHelp:
          "No: Order quantity cannot exceed available stock.",
      },
    ],
  },
];

const emptyValues = {
  allow_order_no_stock: false,
  allow_order_over_stock: false,
  display_stock_to_parties: true,
  display_stock_to_salesrep: true,
  hide_scheme_from_parties: true,
  hide_scheme_from_salesrep: true,
  hide_hold_products_from_salesrep: false,
  track_salesrep_location: false,
  minimum_order_value: 0,
  no_order_from: null,
  no_order_to: null,
  no_order_full_day: false,
};

export default function Settings() {
  const [values, setValues] = useState(emptyValues);
  const [minOrder, setMinOrder] = useState("0");
  const [noOrderFrom, setNoOrderFrom] = useState("");
  const [noOrderTo, setNoOrderTo] = useState("");
  const [fullDayClosed, setFullDayClosed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((data) => {
        setValues(data);
        setMinOrder(String(data.minimum_order_value ?? 0));
        setNoOrderFrom(toLocalDatetime(data.no_order_from));
        setNoOrderTo(toLocalDatetime(data.no_order_to));
        setFullDayClosed(!!data.no_order_full_day);
      })
      .catch(() => setError("Failed to load settings."));
  }, []);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2000);
  };

  const toggle = async (key) => {
    const next = { ...values, [key]: !values[key] };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await settingsApi.update({ [key]: next[key] });
      setValues(saved);
      flash("Setting saved.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save setting.");
    } finally {
      setBusy(false);
    }
  };

  const saveMinOrder = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await settingsApi.update({
        minimum_order_value: parseFloat(minOrder) || 0,
      });
      setValues(saved);
      flash("Minimum order value saved.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const saveNoBilling = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await settingsApi.update({
        no_order_from: noOrderFrom ? new Date(noOrderFrom).toISOString() : null,
        no_order_to: noOrderTo ? new Date(noOrderTo).toISOString() : null,
        no_order_full_day: fullDayClosed,
      });
      setValues(saved);
      flash("No billing period saved.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Distributor Settings</h1>
          <p className="page-sub">GenSoft · configure stock, schemes and ordering rules</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      {SECTIONS.map((section) => (
        <div className="settings-section" key={section.title}>
          <div className="settings-section-title">{section.title}</div>
          {section.rows.map((row) => {
            const on = values[row.key];
            return (
              <div className="settings-row" key={row.key}>
                <div className="settings-label">{row.label}</div>
                <button
                  type="button"
                  className={"settings-toggle" + (on ? " on" : "")}
                  onClick={() => toggle(row.key)}
                  disabled={busy}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-text">{on ? "YES" : "NO"}</span>
                </button>
                <div className="settings-help">
                  {on ? row.yesHelp : row.noHelp}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="settings-section">
        <div className="settings-section-title">MINIMUM ORDER VALUE SETTINGS</div>
        <div className="settings-row settings-row-form">
          <div className="settings-label">MINIMUM ORDER VALUE</div>
          <div className="settings-control">
            <input
              type="number"
              min="0"
              step="1"
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <button
              type="button"
              className="btn sm settings-save-btn"
              onClick={saveMinOrder}
              disabled={busy}
            >
              Save
            </button>
          </div>
          <div className="settings-help">
            When set to Zero, all parties can order without any minimum total amount.
            If set with any value, the retailer has to place the order at least with
            that minimum total amount. Exempt individual parties from the Parties page.
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">NO BILLING SETTINGS</div>
        <div className="settings-row settings-row-form">
          <div className="settings-label">DON'T ACCEPT ORDERS FROM</div>
          <div className="settings-control settings-dates">
            <input
              type="datetime-local"
              value={noOrderFrom}
              onChange={(e) => setNoOrderFrom(e.target.value)}
            />
            <span className="muted">to</span>
            <input
              type="datetime-local"
              value={noOrderTo}
              onChange={(e) => setNoOrderTo(e.target.value)}
            />
            <label className="settings-check">
              <input
                type="checkbox"
                checked={fullDayClosed}
                onChange={(e) => setFullDayClosed(e.target.checked)}
              />
              Full Day Closed
            </label>
            <button
              type="button"
              className="btn sm settings-save-btn"
              onClick={saveNoBilling}
              disabled={busy}
            >
              Save
            </button>
          </div>
          <div className="settings-help">
            Enter date range to show a message to your parties that you are not
            accepting orders. However, it won't stop them placing the order.
          </div>
        </div>
      </div>
    </div>
  );
}
