# NearNest — Product Requirements Document (PRD)

**Version**: 1.0.0 (MVP Room Discovery Pilot)  
**Author**: Product Management & Senior Engineering Team  
**Focus Category**: Hyperlocal Student & Working Professional Room Discovery  
**Target Pilot Scope**: Single Urban Sector / College Campus Vicinity (Initial Pilot: 30 Qualified Listings)  
**Budgetary Model**: Zero-Cost Development and Free-Tier Infrastructure  

---

## 1. Product Vision & Value Proposition

NearNest connects residents and newcomers with verified local opportunities in their immediate vicinity. Unlike generic classifieds overrun with stale broker listings and spam, NearNest optimizes for:
1. **Freshness & Availability Truth**: Ensuring rooms shown are actually vacant and available now.
2. **Direct, Verified Connections**: Secure in-app messaging and post-acceptance voice calling between authentic room owners and seekers.
3. **Hyperlocal Precision**: Transparent distance, locality context, and verified owner identity without exposing private tenant residences unnecessarily.

While NearNest maintains long-term modular support for Vehicle Rentals, Lost & Found, and Civil Services, the initial pilot concentrates **100% of launch effort on Room Discovery**.

---

## 2. Target User Personas & Problems

### Persona A: College Student / Young Professional (The Seeker)
- **Profile**: 18–26 years old, relocating for university or first job, operating on a strict monthly budget (₹6,000–₹15,000).
- **Core Friction**:
  - Hidden broker commissions and unexpected "maintenance" charges.
  - Phony photos that do not match the real room.
  - Owners who never reply or listings that were rented weeks ago.
  - Pressure to pay advance deposits before visiting the property.

### Persona B: Independent Room / PG Owner (The Provider)
- **Profile**: Homeowners, floor landlords, or local PG managers managing 1–6 units.
- **Core Friction**:
  - Constant spam calls at odd hours from unqualified inquiries.
  - Time wasted answering the same questions about rent, deposit, and amenities.
  - Forgetting to take down listings once rented, leading to endless calls.

### Persona C: Platform Administrator (The Guardian)
- **Profile**: Platform owner / local student entrepreneur maintaining safety and trust.
- **Core Needs**:
  - Full visibility into user activity, suspicious listings, and ban capabilities.
  - Zero consumer clutter (no buying/selling) to remain an impartial moderator.

---

## 3. Functional Requirements

### 3.1 Room Seeker Experience
- **FR-S01 (Frictionless Discovery)**: Browse active room listings without forced signup.
- **FR-S02 (Filter Precision)**: Filter listings by:
  - Budget (Min Rent / Max Rent).
  - Room Type (Single Room, 1RK, 1BHK, 2BHK, Shared/PG).
  - Amenities (WiFi, Attached Washroom, RO Water, AC, Geyser, Power Backup).
  - Availability Date.
- **FR-S03 (Transparent Pricing)**: Display full pricing breakdown: monthly rent, security deposit amount, and mandatory maintenance fees.
- **FR-S04 (Availability Status)**: Show explicit freshness label:
  - `🟢 Confirmed Available` (updated within last 7 days).
  - `🟡 Awaiting Confirmation` (older than 7 days).
  - `⚪ Unavailable / Occupied` (deactivated by owner).
- **FR-S05 (Protected Contact)**:
  - Initiate contact via in-app request.
  - Chat in real time with the listing owner.
  - Direct Phone & WhatsApp calling unlocked **exclusively after request is accepted**.

### 3.2 Room Provider Experience
- **FR-P01 (Streamlined Listing Creation)**: Post a room in under 2 minutes with:
  - Room title, locality/neighborhood, rent, deposit, and amenities.
  - Up to 10 photos (max 10MB each) and up to 2 video tours (max 50MB each).
- **FR-P02 (Inquiry Management)**:
  - Real-time inbox showing buyer name, listing title, and initial inquiry note.
  - One-click `Accept Request` (reveals contact details & unlocks direct calling) or `Decline`.
- **FR-P03 (One-Tap Availability Toggle)**:
  - Instantly mark listing as `Available Now` or `Rented Out / Inactive`.
  - Monthly reconfirmation prompt to maintain `Verified Fresh` status.

### 3.3 Master Admin Governance
- **FR-A01 (Isolated Guardian Console)**: Dedicated operations rail (`/admin`) with consumer marketplace tools removed.
- **FR-A02 (Platform Oversight)**: Live KPI metrics: Total Users, Total Listings, Community Inquiries, and Chat Messages.
- **FR-A03 (Content Moderation)**:
  - One-click `🛡️ Verified by Admin` badge toggle on legitimate listings.
  - Instant removal/deletion of fraudulent or duplicate posts.
- **FR-A04 (Account Protection)**:
  - Immediate user suspension (`isBanned: true`) locking user out of all authenticated routes.
  - Permanent account deletion with automatic cleanup of uploaded media.
- **FR-A05 (Emergency Broadcast)**: Ability to broadcast urgent safety or locality notices to all local users.

### 3.4 Preservation of Existing Categories
- **FR-C01 (Vehicle Rentals)**: Scooty, bike, and car rental discovery with hourly pricing.
- **FR-C02 (Lost & Found)**: Lost and found item posting with incident location and claim verification notes.
- **FR-C03 (Civil Services)**: Local electrician, plumber, mechanic, and tutor directory.
- **FR-C04 (Community Alerts)**: Neighborhood emergency alerts with response counters.

---

## 4. User Research & Validation Plan (15 Initial Interviews)

### Evidence Capture Structure
To validate problem hypotheses without fabricating data, use the following spreadsheet-compatible format:

| Field | Description |
|---|---|
| `Participant ID` | Anonymous identifier (e.g. `SEEK-01` to `SEEK-08`, `PROV-01` to `PROV-05`, `INT-01` to `INT-02`) |
| `User Segment` | Student Seeker, Professional Seeker, Family, Owner, Broker |
| `Recent Experience` | Date/locality of last search or tenant placement |
| `Problem Encountered` | Specific friction experienced during search |
| `Frequency (1-5)` | 1 = Rare, 5 = Daily occurrence |
| `Severity (1-5)` | 1 = Minor annoyance, 5 = Dealbreaker / Financial loss |
| `Relevance to Rooms (1-5)` | Impact on room discovery flow |
| `Actual Behavior` | What did the participant actually do (workaround)? |
| `Cost Incurred` | Hours spent, money lost, unnecessary travel km |
| `Counter-Evidence` | When did the problem NOT happen? |
| `Confidence Level` | Low, Medium, High based on direct proof |

### Interview Protocols
- **Seeker Question**: *"Think back to the last room you rented. Walk me through the exact steps from the day you started searching to the day you moved in. Where did you encounter surprises?"*
- **Provider Question**: *"When was the last time you had a vacancy? How did you advertise it, and how many inquiries did you receive before finding a tenant?"*

---

## 5. Non-Functional & Safety Requirements
- **NFR-01 (Zero Budget Compliance)**: 100% free-tier stack; no paid APIs, no paid SMS gateways, no paid object storage.
- **NFR-02 (Data Privacy)**: Never display exact house/flat numbers publicly on maps; show locality radius only.
- **NFR-03 (Security)**: Passwords hashed with bcrypt; JWT signed with strong environment secrets; strict authorization on all mutations.
- **NFR-04 (Performance)**: Page load under 1.5s on 4G networks; bundle size under 500kB gzipped.
