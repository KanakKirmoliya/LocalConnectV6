# NearNest — Data Protection & Privacy Architecture (DPDP Act, 2023 & DPDP Rules, 2025)

**Document Version:** 1.0.0  
**Effective Date:** April 2026  
**Governing Laws:** Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023) | Digital Personal Data Protection Rules, 2025 | Information Technology Act, 2000 & CERT-In Cyber Security Directions 2022.

---

## 1. Regulatory Context & Commencement Analysis

The Digital Personal Data Protection Act (DPDP Act), 2023 was enacted by the Parliament of India in August 2023. On November 13, 2025, the Ministry of Electronics and Information Technology (MeitY) notified the **Digital Personal Data Protection Rules, 2025** alongside phased commencement schedules:
- **Phase 1 (Immediate / Q4 2025):** Constitution and establishment of the Data Protection Board of India (DPBI) and procedural adjudication frameworks.
- **Phase 2 (18-Month Transition Window to May 2027):** Full operationalization of statutory compliance obligations for Data Fiduciaries (including Small & Medium Data Fiduciaries / Startups).

NearNest is classified as a **Data Fiduciary** under Section 2(i) of the DPDP Act, 2023. While the formal enforcement window extends into 2027, NearNest's engineering architecture implements "Privacy by Design" (Section 8) and operationalizes Data Principal Rights (Sections 11 & 12) from Day 1.

---

## 2. Personal Data Inventory & Lawful Basis

NearNest adheres to **Data Minimization** (Section 6). The application collects only data strictly necessary to facilitate local room rentals, vehicle sharing, and community lost/found recovery.

| Data Attribute | Classification | Purpose of Processing | Lawful Basis | Storage Location | Retention Period |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Full Name** | Personal Data | Identity verification, user profile display, chat identification | Consent (Sec. 6(1)) | MongoDB Atlas (`users.name`) | Until account deletion |
| **Email Address** | Personal Data | Account authentication, password reset, DPDP notifications | Consent (Sec. 6(1)) | MongoDB Atlas (`users.email`) | Until account deletion |
| **Hashed Password** | Security Credential | Access control (bcrypt 10-round salt) | Contractual Necessity | MongoDB Atlas (`users.password`) | Until account deletion |
| **Phone Number** | Personal Data | Direct peer-to-peer contact between matched parties | Consent & Explicit Opt-in | MongoDB Atlas (`users.phone`) | Until account deletion |
| **Live Geolocation** | Sensor / Telemetry | Discovery radius calculation (room, vehicle, lost/found) | Real-time Consent (Sec. 6) | Client-side memory only (Never persisted to DB) | Ephemeral (Discarded upon calculation) |
| **Manual City / Suburb** | Location Preference | Hyperlocal browsing without granting GPS permission | Consent | MongoDB Atlas / Local Storage | Until preference reset |
| **Listing Photographs** | User Content | Property / vehicle / lost item visual verification | Consent | Server File System (`/uploads/`) | Active lifetime of listing |
| **Peer Chat Messages** | Communication | Negotiation between renter & host | Legitimate Use (Fulfillment) | MongoDB Atlas (`messages`) | Active conversation lifecycle |

---

## 3. Data Principal Rights Implementation

Under Chapter III of the DPDP Act, 2023, NearNest provides automated, self-service mechanisms for all Data Principals:

### 3.1 Right to Information & Access (Section 11)
- **Endpoint:** `GET /api/auth/me/export` (Authenticated via JWT Bearer)
- **Payload:** Structured JSON file containing full profile, listings created, applications/requests made, and alert subscriptions.
- **Client Access:** Account Settings & Privacy Modal -> **Export My Data (JSON)** button.

### 3.2 Right to Correction & Updating (Section 12(1))
- **Endpoint:** `PATCH /api/auth/me`
- Users can update their display name, phone number, and location preference in real time without admin intervention.

### 3.3 Right to Erasure / Account Deletion (Section 12(2) & 12(3))
- **Endpoint:** `DELETE /api/auth/me` (Requires confirmation of current password)
- **Cascading Permanent Cleanup:**
  1. **User Record:** Removed from MongoDB `users` collection.
  2. **Associated Listings:** All created listings in `listings` collection permanently deleted.
  3. **Associated Media Files:** Physical image files stored under `server/uploads/` deleted via `fs.unlinkSync`.
  4. **Active Rental / Room Requests:** Deleted from `rentalrequests` collection.
  5. **Emergency Alerts & Lost/Found Items:** Cleaned from `alerts` collection.
  6. **Abuse Reports:** Reports filed by the user sanitized or archived for legal defensibility.
  7. **Tokens:** JWT invalidation via client-side token discard.

---

## 4. Grievance Redressal Mechanism (Section 13)

In accordance with Section 13 of the DPDP Act, 2023 and Rule 11 of DPDP Rules, 2025:

- **Designated Grievance Officer:** Bhupesh Singh Samant
- **Official Contact Email:** `privacy@nearnest.in` / `bhupeshsinghsamant@gmail.com`
- **Office Address:** NearNest Technologies, Khatima / Bhimtal, Uttarakhand, India
- **Response SLA:** Maximum 48 hours for acknowledgment; resolution within 7 working days.
- **Escalation Path:** If the Data Principal is unsatisfied with the resolution, they retain the statutory right to register a formal appeal before the **Data Protection Board of India (DPBI)**.

---

## 5. Security Safeguards & Breach Response Protocol

Under Section 8(5) of the DPDP Act, 2023 and the **CERT-In Cyber Security Directions (April 28, 2022)**:

### 5.1 Technical Safeguards
- **In-Transit Encryption:** TLS 1.3 / HTTPS enforced across web, REST endpoints, and WebSockets.
- **At-Rest Protection:** MongoDB Atlas automated AES-256 cluster storage encryption; bcrypt password hashing.
- **PII Sanitization:** Production structured logging middleware filters out passwords, tokens, auth headers, and message bodies.

### 5.2 Mandatory 6-Hour CERT-In Incident Notification Flow
In the event of an unauthorized personal data breach or system compromise:
1. **Immediate Containment (T + 0 to 60 min):** Rotate JWT secret keys, revoke MongoDB Atlas IP allowlist access, isolate compromised nodes.
2. **CERT-In Notification (Within 6 Hours):** Submit formal Incident Reporting Form to `incident@cert-in.org.in` as mandated by the Indian Computer Emergency Response Team under Rule 12 of the 2022 Directions.
3. **Data Protection Board of India (DPBI) Notice:** Notify the DPBI in prescribed Form B describing breach scope, affected principal count, containment actions, and remediation steps.
4. **Data Principal Notice:** Send immediate email notification to affected users providing mitigation advice (password resets, credential isolation).
