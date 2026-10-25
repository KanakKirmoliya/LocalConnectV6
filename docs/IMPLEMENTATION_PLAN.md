# NearNest — Implementation Status & Remaining Work

**Updated:** October 23, 2026

## Completed in the current pilot implementation

- Database seeding is blocked in production and requires explicit opt-in outside production.
- Production JWT configuration fails closed unless `JWT_SECRET` is at least 32 characters.
- Auth and media upload routes have rate limits.
- Mobile upload calls the supported `/api/v1/upload/media` route, with the compatibility route retained.
- Missing listing coordinates no longer default to Delhi. Public APIs round coordinates and suppress the known legacy fallback.
- Room listings support deposit, maintenance, type, available-from date, filters, and owner availability reconfirmation.
- Mobile room inquiries create real requests; users can view requests and owners can accept or decline them.
- Pending requests do not disclose the seller's phone or email.
- Admins can publish locality-labelled alerts through the alerts feed.
- Production browser CORS is configurable through `CORS_ORIGIN`.
- CI runs backend tests, web production build, and mobile TypeScript checking.

## Remaining before a public production pilot

1. **Persistent media storage — deferred by product decision.** Select a provider, configure deployment secrets, and test upload/read/delete behavior before relying on hosted uploads.
2. **Push notifications — not implemented.** Admin broadcasts currently publish entries in the alerts feed only.
3. **Mobile chat — not implemented.** Mobile users can create and manage requests, but do not yet have an in-app chat screen.
4. **Legacy data cleanup — requires review.** Public APIs suppress the known Delhi fallback, but stored documents are not automatically migrated.
5. **Geospatial scale — follow-up.** The web compatibility endpoint computes distance and radius filtering in application memory.
6. **Quality automation — follow-up.** There is no dedicated lint rule set or automated UI/browser test suite.

## Definition of done for production

- Set a strong production `JWT_SECRET` and exact trusted `CORS_ORIGIN` values.
- Configure and validate persistent media storage.
- Run `npm test --prefix server`, `npm run build --prefix client`, and `npm run typecheck --prefix mobile` in CI.
- Complete a browser/device smoke test for room discovery, owner reconfirmation, inquiries, and alerts.
- Review backup/restore, account recovery, and operational monitoring procedures.
