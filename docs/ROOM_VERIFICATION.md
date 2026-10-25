# Room Verification, Availability & Tenancy

Backend-enforced rules for listing rooms. Every check below runs on the server; nothing the
client sends (flags, IDs, ownership claims) is trusted.

**All the code for this feature is in one file: `server/src/roomVerification.js`** (models, services, routes,
helpers). `index.js` mounts it with `mountRoomVerification(app)`; the listing controller, auth controller and
admin routes import the guards they need from it.

## Flow

1. **Owner identity** – upload an ID document → admin approves → `identity.status = verified`.
2. **Property** – register the address (gets a `PRP-` ID) → upload ownership documents → admin approves.
3. **List rooms** – `POST /api/rooms` (web) or `POST /api/v1/listings` (mobile) with
   `propertyId` (the `PRP-` code) and `unitNumber`. The room gets a `ROM-` ID.
4. **Someone else listing?** The verified owner authorises them by their `USR-` ID.
5. **Renting** – tenant requests → owner accepts (room is claimed atomically) → early termination needs both.

## IDs

| Entity   | Format         | Assigned                                         |
|----------|----------------|--------------------------------------------------|
| User     | `USR-XXXXXXXX` | automatically at signup (existing users: on first login or `npm run backfill:ids`) |
| Property | `PRP-XXXXXXXX` | when a property is registered                    |
| Room     | `ROM-XXXXXXXX` | when a room listing is created                   |

Random (not sequential) so they reveal nothing about volume; uniqueness is enforced by a unique index.

## Endpoints (also available under `/api/v1/...`)

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/verification/me` | user | own User ID, identity status, documents |
| `POST /api/verification/identity/documents` | user | multipart `document` + `docType` (`aadhaar`, `pan`, `voter_id`, `passport`, `driving_license`) |
| `GET /api/verification/documents/:id/file` | uploader / admin | decrypted file (audit-logged) |
| `DELETE /api/verification/documents/:id` | uploader | remove a non-approved document |
| `POST /api/properties` | user | `addressLine1`, `addressLine2?`, `locality`, `city`, `state`, `pincode`, `landmark?`, `latitude?`, `longitude?` |
| `GET /api/properties`, `GET /api/properties/:id` | owner / authorised user / admin | private property details |
| `POST /api/properties/:id/documents` | owner | multipart `document` + `docType` (`sale_deed`, `property_tax_receipt`, `electricity_bill`, `water_bill`, `khata_certificate`, `mutation_certificate`) |
| `DELETE /api/properties/:id` | owner | only when no live rooms |
| `POST /api/owner-permissions` | verified owner | `{ propertyId, delegateUserCode, note?, expiresAt? }` |
| `GET /api/owner-permissions` | user | granted / received |
| `PATCH /api/owner-permissions/:id/revoke` | owner or delegate | also hides rooms listed under it |
| `GET /api/room-availability/:listingId` | public | `available` / `occupied` / `unavailable` |
| `POST /api/tenancies` | tenant | `{ listingId, startDate, durationMonths, message? }` |
| `GET /api/tenancies`, `GET /api/tenancies/:id` | parties | own tenancies |
| `PATCH /api/tenancies/:id/accept` · `/decline` · `/cancel` | owner · owner · tenant | decide a request |
| `POST /api/tenancies/:id/termination` | either party | `{ reason, effectiveDate? }` opens a request |
| `POST /api/tenancies/:id/termination/respond` | the OTHER party | `{ agree: true \| false }` |
| `POST /api/tenancies/:id/termination/withdraw` | requester | withdraw own request |
| `GET /api/admin/verifications?status=` | admin | review queues |
| `GET /api/admin/verifications/documents/:id/file` | admin | view document (audit-logged) |
| `PATCH /api/admin/verifications/identity/:userId` | admin | `{ decision: "approve"\|"reject", note }` |
| `PATCH /api/admin/verifications/property/:propertyId` | admin | `{ decision, note }` (owner identity must be verified first) |

(Tenancies use `/api/tenancies` because `/api/rentals` is the existing vehicle resource.)

Errors are `{ success: false, error, code }`. Useful codes for the UI: `PROPERTY_REQUIRED`,
`PROPERTY_NOT_VERIFIED`, `OWNER_NOT_VERIFIED`, `NOT_AUTHORIZED_FOR_PROPERTY`, `UNIT_REQUIRED`,
`INVALID_PHOTO_SOURCE`, `DUPLICATE_ROOM`, `DUPLICATE_PHOTOS`, `ROOM_NOT_AVAILABLE`, `ROOM_OCCUPIED`,
`ROOM_HAS_ACTIVE_TENANCY`, `ACTIVE_TENANCY`.

## Rules enforced

* **Listing gate** – a room needs a property whose ownership is verified *and* whose owner's identity is verified; the lister must be that owner or hold an active permission granted by them. Re-checked when a hidden room is re-activated.
* **Tenants / non-owners** – refused unless the verified owner granted permission. Revoking permission hides that person's rooms.
* **Duplicates** – (a) same normalised address cannot be registered twice (word order, case, punctuation and abbreviations are ignored; different flat numbers stay distinct); (b) same unit in a property is refused; same photos + type + rent (±10%) under another label is refused; (c) photos already used in another property are refused. Also re-checked when photos are edited. Race-safe via unique indexes.
* **Availability / double booking** – accepting a request claims the room with one atomic conditional update; a unique partial index allows only one holding tenancy per room. Occupied rooms leave the public list and re-open automatically when the tenancy ends; elapsed tenancies are released lazily.
* **Early termination** – either party may request; only the *other* party can agree. The tenancy ends early only when both consents are recorded. A room with an active tenancy cannot be deleted (owner or admin) and an account with one cannot be deleted, so consent cannot be bypassed.
* **Revocation** – rejecting a verified identity/property hides the affected rooms; existing tenancies are not touched.

## Privacy & security

* Documents are stored **outside** `/uploads` in `server/private_uploads/verification/`, encrypted with AES-256-GCM, named with random IDs, never served statically, and only readable by the uploader or an admin (each view audit-logged). File type is verified from the file's bytes, not the declared MIME type. Max 8 MB; PDF/JPG/PNG/WEBP.
* API responses never contain storage keys, hashes or fraud flags (admin-only flag: same file uploaded by another account).
* Full property addresses are only visible to the owner, authorised users, admins, and a tenant with an *active* tenancy. Public listings only show the locality. Counterpart phone/email appear only while a tenancy is active.
* A property that exists but is not yours returns the same answer as one that doesn't, and the "already registered" message never reveals the existing owner.
* Account deletion erases the user's documents (files + records), properties, permissions and tenancy history.
* No ID-number is extracted or stored. For Aadhaar, ask users to upload a **masked** copy.

## Configuration

* `DOCUMENT_ENCRYPTION_KEY` (64 hex chars) – **required in production**; document endpoints return 503 without it. Back it up separately: documents cannot be decrypted without it.
* `PRIVATE_UPLOAD_DIR` – optional storage path.
* Optional: `npm install sharp --prefix server` enables perceptual photo matching (catches resized / re-compressed copies). Without it only byte-identical photos are detected.
* Run `npm run backfill:ids --prefix server` once to give existing users/rooms their IDs.

## Known limitations

* Verification is manual (admin reviews documents); there is no automated KYC / government API check.
* `private_uploads/` is not covered by `scripts/backup.mjs`; back it up (with the key) alongside the database.
* Legacy rooms (listed before this feature) stay visible but are not "verified"; owners re-list them under a verified property.
* A property registered first by a wrong party blocks the rightful owner until support resolves it (an admin tool for disputes is not included).
* Perceptual photo matching scans up to 5,000 live rooms; add an indexed approach if the catalogue grows far beyond that.
* The web and mobile room forms must send `propertyId` and `unitNumber`, and need screens for the verification steps (the backend is complete; UI is not part of this change).
