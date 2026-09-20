import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export default function QRPosterGenerator() {
  const defaultHost = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  const [mode, setMode] = useState("table"); // table | wall
  const [tableNumber, setTableNumber] = useState("1");
  const [title, setTitle] = useState("Scan to Order");
  const [subtitle, setSubtitle] = useState("Skip the counter queue — order from your seat");
  const [wifi, setWifi] = useState("Campus Wi-Fi: Canteen-Guest");
  const [baseUrl, setBaseUrl] = useState(defaultHost);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const targetUrl = useMemo(() => {
    const origin = (baseUrl || defaultHost).replace(/\/$/, "");
    if (mode === "table") {
      return `${origin}/menu?table=${encodeURIComponent(tableNumber || "1")}`;
    }
    return `${origin}/menu`;
  }, [baseUrl, defaultHost, mode, tableNumber]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(targetUrl, {
      width: 720,
      margin: 1,
      color: { dark: "#1f3864", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  function downloadPng() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    const name =
      mode === "table" ? `canteen-table-${tableNumber}-qr.png` : "canteen-wall-poster-qr.png";
    link.download = name;
    link.href = qrDataUrl;
    link.click();
  }

  return (
    <div className="qr-generator">
      <div className="qr-controls no-print">
        <h2>Printable QR Posters</h2>
        <p className="muted">
          Generate branded table tent cards or a wall poster. Print hides the admin chrome.
        </p>

        <div className="qr-mode-toggle">
          <button
            type="button"
            className={`btn small ${mode === "table" ? "" : "secondary"}`}
            onClick={() => {
              setMode("table");
              setTitle("Table Order");
              setSubtitle("Scan to dine-in from this table");
            }}
          >
            Table Standee (#1–20)
          </button>
          <button
            type="button"
            className={`btn small ${mode === "wall" ? "" : "secondary"}`}
            onClick={() => {
              setMode("wall");
              setTitle("Scan to Order");
              setSubtitle("Skip the counter queue — order from your phone");
            }}
          >
            Canteen Wall Poster
          </button>
        </div>

        {mode === "table" && (
          <label className="floating-field">
            <span>Table number</span>
            <select
              className="input"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
            >
              {Array.from({ length: 20 }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>
                  Table #{n}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="floating-field">
          <span>Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="floating-field">
          <span>Subtitle</span>
          <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <label className="floating-field">
          <span>Wi-Fi guide</span>
          <input className="input" value={wifi} onChange={(e) => setWifi(e.target.value)} />
        </label>
        <label className="floating-field">
          <span>App URL (auto-detected host)</span>
          <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Encodes: <code>{targetUrl}</code>
        </p>

        <div className="qr-actions">
          <button type="button" className="btn" onClick={() => window.print()}>
            Print standee
          </button>
          <button type="button" className="btn secondary" onClick={downloadPng} disabled={!qrDataUrl}>
            Download PNG
          </button>
        </div>
      </div>

      <article className={`qr-print-sheet ${mode === "table" ? "qr-tent" : "qr-poster"}`}>
        <div className="qr-brand">🍽 Campus Canteen</div>
        <h1>{title}</h1>
        {mode === "table" && <div className="qr-table-num">Table #{tableNumber}</div>}
        <p className="qr-subtitle">{subtitle}</p>
        {qrDataUrl ? (
          <img className="qr-image" src={qrDataUrl} alt="Order QR code" />
        ) : (
          <div className="muted">Generating QR…</div>
        )}
        <p className="qr-wifi">{wifi}</p>
        <p className="qr-url">{targetUrl}</p>
      </article>
    </div>
  );
}
