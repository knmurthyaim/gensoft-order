import { useState } from "react";
import Modal from "./Modal.jsx";
import { auth } from "../api";

export default function ChangePasswordModal({ onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      onSuccess?.("Password changed successfully.");
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Change Password" onClose={onClose} wide={false}>
      <form onSubmit={submit}>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Current Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>New Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Confirm New Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Saving…" : "Change Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
