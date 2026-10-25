# NearNest — Known Limitations & Architectural Boundaries

**Document Version**: 1.0.0  
**Transparency Standard**: Explicit disclosure of architectural boundaries and pilot trade-offs  

---

## 1. Cloud Infrastructure & Hosting Limitations

### 1.1 Ephemeral Local Storage on Free Backend Tiers
- **Current Behavior**: Media uploads are written to `server/uploads/listings/` on the local filesystem.
- **Limitation**: When deployed to free cloud container hosts like Render or Railway, the local filesystem is ephemeral. Rebuilding, restarting, or waking the container from idle resets the disk, removing uploaded media files.
- **Status**: Persistent media provider integration is deferred. Local disk is suitable only for development/evaluation; production uploads are not durable until a provider is selected, configured, and tested.

### 1.2 Free Backend Cold Starts (~40 Seconds)
- **Current Behavior**: Render Free Tier puts containers to sleep after 15 minutes of zero traffic.
- **Limitation**: The first HTTP request after inactivity takes approximately 30–50 seconds while the Node.js process boots up and connects to MongoDB Atlas.
- **Mitigation**: The web frontend displays a friendly loading indicator: *"Waking up server..."* during initial cold starts.

---

## 2. Communication & Messaging Boundaries

### 2.1 Polling-Based Real-Time Messaging
- **Current Behavior**: Direct Messages utilize client-side HTTP polling every 3.5 seconds (`fetchMessages` & `fetchConversations`).
- **Limitation**: While latency is low (under 3.5s) and avoids WebSocket connection dropouts on mobile data, it increases HTTP request volume compared to bi-directional WebSocket connections (Socket.io) or WebPush notifications.
- **Status**: Highly reliable for up to 500 active pilot conversations. Socket.io / WebSockets planned for post-pilot scale.

### 2.2 Voice & WhatsApp Calling Guard
- **Current Behavior**: Phone numbers and direct calling options (`tel:...` and `wa.me/...`) are hidden and locked until the listing owner explicitly clicks `Accept Request`.
- **Limitation**: If a user enters an invalid or dummy phone number during registration, the direct dialer will dial whatever string was entered.
- **Mitigation**: Format validation enforced during signup (`/^\+?[0-9\s-]{10,15}$/`).

### 2.3 Mobile Inquiry and Messaging Scope
- **Current Behavior**: Mobile users can create inquiries and view sent/received requests, and owners can accept or decline.
- **Limitation**: Mobile does not yet provide an in-app conversation/chat screen or push notifications.

---

## 3. Trust, Verification & Fraud Prevention

### 3.1 Verification Badge Scope
- **Current Behavior**: Listings can feature a `🛡️ Verified by Admin` badge toggled in the Master Admin Console.
- **Boundary**: This badge represents manual review of photos, locality, and owner responsiveness by the platform administrator. It does NOT guarantee legal property title, building code compliance, or criminal background checks.
- **User Safety Notice**: Seekers are explicitly advised in the UI never to transfer advance token money before inspecting the room in person.

### 3.2 Absence of Online Escrow / Payment Processing
- **Current Behavior**: NearNest is purely a discovery and communication marketplace.
- **Boundary**: No financial transactions occur within NearNest. Rent and deposits are settled directly between tenant and landlord in the real world.
- **Rationale**: Eliminates regulatory licensing complexity, payment gateway fees (2–3%), and chargeback disputes during the zero-budget pilot phase.

---

## 4. Geospatial & Map Limitations

### 4.1 Missing Coordinate Fallback
- **Current Behavior**: Listings without GPS coordinates retain locality text and do not receive invented map pins or distance values.
- **Privacy**: Public API responses round valid listing coordinates to two decimal places (approximately locality-scale precision) rather than exposing the stored exact position. The exact coordinates remain stored for server-side distance calculation.
- **Legacy records**: Public responses suppress the known historical Delhi fallback. Records are not rewritten automatically and should be reviewed/migrated before production.
- **Performance boundary**: The web compatibility route currently loads matching listings and applies radius filtering in application memory; use indexed MongoDB geospatial queries as the dataset grows.

### 4.2 Alerts Feed Broadcasts
- **Current Behavior**: An administrator can publish a locality-labelled alert into the alerts feed.
- **Limitation**: This does not deliver push, SMS, or email notifications. The alert is not guaranteed to be geographically targeted when its locality cannot be resolved to coordinates.
