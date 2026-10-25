import { useState } from "react";
import { Flag, AlertTriangle, ShieldCheck, CheckCircle2, ShieldAlert } from "lucide-react";
import { Modal, Field } from "./ui.jsx";
import { post } from "../api.js";
import { useStore } from "../store.jsx";

const LISTING_REASONS = [
  { value: "scam", label: "Fraud / Advance Payment Scam", desc: "Demanding token or money before physical visit" },
  { value: "fake", label: "Fake Listing", desc: "Property/item does not exist or photos belong to someone else" },
  { value: "misleading", label: "Misleading Information", desc: "Incorrect price, deceptive amenities, or wrong locality" },
  { value: "expired", label: "Already Rented / Sold", desc: "Item is unavailable but still kept active" },
  { value: "duplicate", label: "Duplicate / Spam Listing", desc: "Repeatedly posted by the same seller" },
  { value: "inappropriate", label: "Inappropriate Content", desc: "Abusive photos, offensive wording, or harassment" },
  { value: "other", label: "Other Concern", desc: "Any other violation of neighborhood safety" },
];

const USER_REASONS = [
  { value: "scam", label: "Fraudulent Activity / Scam", desc: "Attempted advance payment fraud, phishing, or financial deceit" },
  { value: "misuse", label: "System Misuse / Non-intended usage", desc: "Misusing platform services, illegal listings, or fraudulent booking" },
  { value: "fake", label: "Fake Account / Impersonation", desc: "Posing as a different individual or organization" },
  { value: "harassment", label: "Harassment / Abusive Behavior", desc: "Threatening, insulting, or inappropriate chat communication" },
  { value: "commercial_spam", label: "Commercial Spamming", desc: "Mass messaging or unsolicited promotion" },
  { value: "other", label: "Other Safety Violation", desc: "Breach of community trust or neighborhood policies" },
];

export default function ReportModal({ target, targetType = "listing", onClose }) {
  const { notify } = useStore();
  const [reason, setReason] = useState("scam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const isUserTarget = targetType === "user";
  const reasons = isUserTarget ? USER_REASONS : LISTING_REASONS;
  const targetName = target?.title || target?.name || (isUserTarget ? "User Account" : "Listing");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      setError("Please select a reason for reporting.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await post("reports", {
        targetType,
        targetId: target.id || target._id,
        reason,
        details: details.trim(),
      });
      setResult(res);
      notify(res.message || "Report filed with moderation team.");
    } catch (err) {
      setError(err.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isUserTarget ? "Report Account for Fraud / Misuse" : "Report Listing to Safety Team"}
      onClose={onClose}
    >
      {result ? (
        <div style={{ textAlign: "center", padding: "20px 10px" }}>
          {result.autoSuspended ? (
            <ShieldAlert size={48} color="#DC2626" style={{ margin: "0 auto 12px" }} />
          ) : (
            <CheckCircle2 size={46} color="#10B981" style={{ margin: "0 auto 12px" }} />
          )}
          <h3 style={{ fontSize: "1.15rem", marginBottom: 6, color: result.autoSuspended ? "#DC2626" : "var(--ink)" }}>
            {result.autoSuspended ? "Immediate Safety Action Triggered" : "Report Received"}
          </h3>
          <p style={{ color: "var(--mute)", fontSize: "0.88rem", maxWidth: 440, margin: "0 auto 18px", lineHeight: 1.5 }}>
            {result.message}
          </p>
          <div
            style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: "0.8rem",
              color: "#475569",
              maxWidth: 440,
              margin: "0 auto 20px",
              textAlign: "left",
            }}
          >
            <strong>NearNest Safety Policy:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>3 verified reports: 48-hour temporary suspension & listings hidden.</li>
              <li>5 verified reports: Permanent account termination.</li>
            </ul>
          </div>
          <button className="btn primary" onClick={onClose} style={{ minWidth: 120 }}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Target Banner */}
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: "0.85rem",
              color: "#991B1B",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Reporting {isUserTarget ? "User Account" : "Listing"}:</strong> "{targetName}"
              <div style={{ fontSize: "0.78rem", marginTop: 3, color: "#7F1D1D" }}>
                🛡️ Accounts accumulating repeated community fraud or misuse reports are automatically suspended
                temporarily (at 3 reports) or permanently (at 5 reports).
              </div>
            </div>
          </div>

          <Field label={isUserTarget ? "Reason for Reporting this Account" : "Reason for Reporting this Listing"}>
            <div style={{ display: "grid", gap: 6, maxHeight: "260px", overflowY: "auto", paddingRight: 4 }}>
              {reasons.map((r) => {
                const isSelected = reason === r.value;
                return (
                  <label
                    key={r.value}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: isSelected ? "1.5px solid #DC2626" : "1px solid var(--line)",
                      background: isSelected ? "#FEF2F2" : "#FFFFFF",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={r.value}
                      checked={isSelected}
                      onChange={() => setReason(r.value)}
                      style={{ marginTop: 3, width: "auto" }}
                    />
                    <div>
                      <strong style={{ color: isSelected ? "#991B1B" : "var(--ink)" }}>{r.label}</strong>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--mute)" }}>{r.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </Field>

          <Field label="Evidence or Details">
            <textarea
              rows={3}
              placeholder={
                isUserTarget
                  ? "Describe the fraud, demanding advance payment offline, harassment, or misuse..."
                  : "Provide details (e.g., 'Owner demanded Rs 2000 token before showing room', 'Fake vehicle model')..."
              }
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            />
          </Field>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" className="btn" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              style={{ flex: 1, background: "#DC2626", borderColor: "#DC2626" }}
              disabled={submitting}
            >
              <Flag size={14} style={{ marginRight: 4 }} />
              {submitting ? "Submitting..." : "Submit Abuse Report"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
