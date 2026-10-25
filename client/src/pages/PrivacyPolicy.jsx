import React from "react";
import { ShieldCheck, Lock, FileText, Trash2, Download, AlertCircle, ArrowLeft } from "lucide-react";
import { PageHead } from "../components/ui.jsx";

export default function PrivacyPolicy({ onBack }) {
  return (
    <div style={{ maxWidth: 840, margin: "0 auto", paddingBottom: 60 }}>
      {onBack && (
        <button
          onClick={onBack}
          className="btn"
          style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      )}

      <PageHead
        title="Privacy Notice & Data Rights"
        sub="Notice of Personal Data Collection, Purpose, Processing & Rights under the Digital Personal Data Protection (DPDP) Act, 2023."
      />

      {/* Hero Notice Card */}
      <div
        className="card"
        style={{
          borderLeft: "5px solid #2563EB",
          background: "#EFF6FF",
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <ShieldCheck size={28} color="#2563EB" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ fontSize: "1.05rem", color: "#1E40AF" }}>
              NearNest Data Protection Declaration
            </strong>
            <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "#1E3A8A", lineHeight: 1.5 }}>
              NearNest operates as a Data Fiduciary under the Indian Digital Personal Data Protection Act, 2023
              and Digital Personal Data Protection Rules, 2025. We collect and process personal data solely
              for specified, lawful purposes to power hyperlocal community connections.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 24 }}>
        {/* Section 1: Itemized Data Collection */}
        <section className="card" style={{ padding: 22 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", marginBottom: 12 }}>
            <FileText size={20} color="#2563EB" /> 1. Categories of Personal Data Collected
          </h3>
          <p style={{ fontSize: "0.92rem", color: "var(--mute)", margin: "0 0 12px" }}>
            In adherence to the principle of <strong>Data Minimization</strong>, NearNest collects only data essential for
            hyperlocal operations:
          </p>
          <ul style={{ fontSize: "0.9rem", lineHeight: 1.6, paddingLeft: 20, margin: 0, color: "var(--ink)" }}>
            <li><strong>Account Identifiers:</strong> Your full name and email address for account authentication and security.</li>
            <li><strong>Contact Details (Optional):</strong> Mobile phone number. Your phone number is kept private and only shared with a buyer or seller once a mutual contact request is explicitly accepted.</li>
            <li><strong>Location Data:</strong> Your selected locality or town name. Precise device GPS coordinates are collected <em>only if you explicitly click the "GPS" button</em> to center your map.</li>
            <li><strong>User-Generated Content:</strong> Photographs, room details, vehicle descriptions, lost & found notices, and in-app chat messages submitted while using the platform.</li>
          </ul>
        </section>

        {/* Section 2: Purpose of Processing */}
        <section className="card" style={{ padding: 22 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", marginBottom: 12 }}>
            <Lock size={20} color="#059669" /> 2. Lawful Purpose & Processing
          </h3>
          <p style={{ fontSize: "0.92rem", color: "var(--mute)", margin: "0 0 12px" }}>
            Personal data is processed strictly for the following purposes:
          </p>
          <ul style={{ fontSize: "0.9rem", lineHeight: 1.6, paddingLeft: 20, margin: 0, color: "var(--ink)" }}>
            <li>Displaying relevant community listings (Rooms, Rentals, Services, Lost & Found) within your selected distance radius.</li>
            <li>Facilitating secure peer-to-peer contact between room seekers, tenants, and vehicle owners.</li>
            <li>Broadcasting high-priority emergency alerts for urgent lost items to neighboring community members.</li>
            <li>Preventing platform abuse, scams, duplicate spam listings, and unauthorized intrusions.</li>
          </ul>
          <p style={{ marginTop: 12, fontSize: "0.85rem", color: "#047857", fontWeight: 600 }}>
            🛡️ NearNest does NOT sell, rent, monetize, or transfer your personal data or behavioral profiles to third-party data brokers or advertising networks.
          </p>
        </section>

        {/* Section 3: Data Principal Rights */}
        <section className="card" style={{ padding: 22 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", marginBottom: 12 }}>
            <Trash2 size={20} color="#DC2626" /> 3. Your Rights as a Data Principal
          </h3>
          <p style={{ fontSize: "0.92rem", color: "var(--mute)", margin: "0 0 14px" }}>
            Under Sections 11, 12, and 13 of the DPDP Act 2023, you hold the following statutory rights:
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#FEF2F2", padding: 14, borderRadius: 8, border: "1px solid #FEE2E2" }}>
              <strong style={{ color: "#991B1B", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
                <Trash2 size={16} /> Right to Erasure / Account Deletion (Section 12)
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#7F1D1D" }}>
                You have the immediate right to permanently delete your account at any time. When deleted, your user document,
                all active listings, disk-stored photos/videos, chat inquiries, and emergency alerts are irreversibly purged.
              </p>
            </div>

            <div style={{ background: "#F0FDF4", padding: 14, borderRadius: 8, border: "1px solid #DCFCE7" }}>
              <strong style={{ color: "#166534", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
                <Download size={16} /> Right to Access & Data Portability (Section 11)
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#14532D" }}>
                You can download a complete machine-readable copy of your personal data profile and listing history by clicking
                "Export My Data" in the Settings panel.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Data Retention & Security */}
        <section className="card" style={{ padding: 22 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", marginBottom: 12 }}>
            <AlertCircle size={20} color="#D97706" /> 4. Retention Policy & Security Safeguards
          </h3>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink)", margin: 0 }}>
            Personal data is retained only for as long as your account remains active or as required by Indian law.
            Password hashes are salted using industry-standard bcrypt. Auth tokens utilize cryptographically signed JWTs
            stored in browser localStorage or hardware-backed mobile keystores (SecureStore). Administrative operations
            are logged and access-restricted.
          </p>
        </section>

        {/* Section 5: Grievance Redressal & Legal Disclaimer */}
        <section className="card" style={{ padding: 22, background: "#F8FAFC" }}>
          <h3 style={{ color: "var(--ink)", marginBottom: 8 }}>5. Grievance Redressal Officer</h3>
          <p style={{ fontSize: "0.88rem", color: "var(--mute)", margin: "0 0 12px" }}>
            In accordance with Rule 14 of the DPDP Rules 2025, any concerns, withdrawal of consent, or privacy grievances
            may be addressed to our designated officer:
          </p>
          <div style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "var(--ink)" }}>
            <div><strong>Designation:</strong> Data Protection & Grievance Redressal Officer</div>
            <div><strong>Jurisdiction:</strong> Uttarakhand, India</div>
            <div><strong>Email:</strong> <a href="mailto:grievance@nearnest.local" style={{ color: "#2563EB" }}>grievance@nearnest.local</a></div>
            <div><strong>Response Window:</strong> Acknowledgement within 48 hours; resolution within 30 days.</div>
          </div>

          <div style={{ marginTop: 16, padding: 12, background: "#FEF3C7", borderRadius: 8, border: "1px solid #FDE68A" }}>
            <strong style={{ fontSize: "0.82rem", color: "#92400E" }}>Legal Notice & Advisory:</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#78350F" }}>
              NearNest provides this platform for community convenience. The existence of this privacy policy does not constitute
              an absolute warranty against bad-faith actors or internet vulnerabilities. Users are advised to review terms
              and report suspicious activities immediately.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
