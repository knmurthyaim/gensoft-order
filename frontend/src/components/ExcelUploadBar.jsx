import { useRef, useState } from "react";

export default function ExcelUploadBar({
  label,
  onDownloadTemplate,
  onUpload,
  onSuccess,
  accept = ".xlsx,.xls,.json",
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await onUpload(file);
      onSuccess?.(result, file.name);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {label && <span className="muted" style={{ marginRight: 4 }}>{label}</span>}
        <button type="button" className="btn secondary sm" onClick={onDownloadTemplate}>
          Download Template
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          hidden
          onChange={handleFile}
        />
        <button
          type="button"
          className="btn secondary sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload Excel"}
        </button>
      </div>
      {error && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
