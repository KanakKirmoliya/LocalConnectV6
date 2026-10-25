# NearNest — Test Plan

**Updated:** October 23, 2026  
**Backend test database:** Ephemeral `mongodb-memory-server`

## Automated checks

Run from the project root:

```powershell
npm.cmd test --prefix server
npm.cmd run build --prefix client
npm.cmd run typecheck --prefix mobile
```

The backend test runner starts its own in-memory MongoDB instance, starts the API on a test port, and tears both down afterward. It does not use the configured Atlas database.

### Backend integration coverage

The current suite passes **31/31 checks**, including:

- Health, registration, login, and invalid credentials.
- Listing creation for the marketplace categories and category isolation.
- Room type, amenity, and rent filtering.
- Public coordinate rounding and room-field persistence.
- Owner availability confirmation and non-owner authorization denial.
- Mobile inquiry creation, contact concealment while pending, owner acceptance, and contact reveal after acceptance.
- Owner-only listing edits and deletes.
- Protected mobile upload route and auth rate-limit headers.
- Admin-only emergency broadcast authorization and publication.

### Web build

`vite build` should complete successfully. Vite currently reports that the minified JavaScript chunk exceeds its configured 500 kB warning threshold; the gzip output remains below the project’s 500 kB gzip requirement.

### Mobile type check

`tsc --noEmit` must pass. This runs in the CI workflow as `npm run typecheck --prefix mobile`.

## Manual smoke-test checklist

- [ ] Browse rooms while signed out; apply budget, room type, amenity, and available-by filters.
- [ ] Verify that public maps show coarse locations only and listings without coordinates do not get fake map pins.
- [ ] Create and edit a room with deposit, monthly maintenance, room type, available date, and media.
- [ ] Confirm availability as the owner; verify non-owners cannot do so.
- [ ] Send a mobile inquiry; verify pending requests do not expose seller contact details.
- [ ] Accept/decline an inquiry from the owner account and check the buyer’s request screen.
- [ ] Publish an admin safety notice and verify it appears in the alerts feed; do not expect a push notification.
- [ ] On a deployed environment, verify `CORS_ORIGIN`, production JWT secret configuration, and media persistence.

## Not covered yet

- Successful authenticated multipart media upload and hosted-storage persistence.
- Mobile in-app chat and push notification delivery.
- Automated browser/UI tests and linting.
- Production-scale geospatial performance.
