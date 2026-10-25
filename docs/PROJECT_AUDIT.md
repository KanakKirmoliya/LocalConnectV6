# NearNest — Current Project Audit

**Audit date:** October 23, 2026  
**Scope:** Web, API, mobile, deployment, and project documentation

## Summary

NearNest is a working React/Vite web application, Express/Mongoose API, and Expo React Native client. The backend integration suite currently passes **31/31 tests**, the web production bundle builds, and the mobile TypeScript check passes.

Recent changes add coarse public map coordinates, room pricing/availability fields and filters, owner availability confirmation, real mobile room inquiries with accept/decline handling, an admin safety-alert publisher, configured CORS, and a mobile type-check CI step.

## Current status

| Area | Status | Evidence / remaining concern |
|---|---|---|
| Authentication and listing authorization | Implemented | JWT auth and ownership checks are covered by backend tests. Production now requires a 32-character `JWT_SECRET`. |
| Abuse protection | Partially implemented | Auth and media upload have process-local IP rate limits. Limits are not shared across multiple server instances, and there is no general API limiter. |
| Room discovery | Implemented for pilot scope | Rent, type, amenity, and available-by filters; deposit and maintenance; availability freshness; owner reconfirmation are available. |
| Location privacy | Improved; migration still needed | New listings do not get fabricated Delhi coordinates. Public APIs round listing coordinates to two decimal places and omit known legacy Delhi fallback coordinates. Existing stored coordinates are not rewritten. |
| Mobile inquiry flow | Implemented | The room detail action creates a backend request. A mobile requests screen displays sent/received inquiries and supports accept/decline. Mobile chat UI is still absent. |
| Admin safety broadcast | Implemented as an alert feed entry | Admins can publish a locality-labelled alert. This creates a feed entry; it does not send push notifications, SMS, or email. |
| Upload persistence | Not implemented; explicitly deferred | Uploads still use `server/uploads/listings/`. Hosted ephemeral disks can lose these files after restart or redeployment. Choose and configure a persistent media provider before production launch. |
| Geospatial performance | Partially implemented | Distance calculations and radius filtering are performed in application code after loading matching listings. Large datasets should use indexed MongoDB geospatial queries. |
| CI and validation | Implemented | CI runs backend tests, the web production build, and the mobile TypeScript check. No dedicated lint or automated UI test suite is configured. |
| Documentation | Updated with current status | Keep deployment settings and remaining storage work synchronized with implementation. |

## Deployment gates

1. Configure `CORS_ORIGIN` with every trusted production web origin.
2. Set a unique, random `JWT_SECRET` of at least 32 characters.
3. Configure persistent media storage; local uploads are not production durable.
4. Review legacy records with fallback coordinates and decide whether to migrate or remove those coordinate fields. Public endpoints suppress the known Delhi default but do not rewrite stored records.
5. Add push/email/SMS delivery only if required; the current admin broadcast is visible in the alerts feed only.

## Verification run

- `npm.cmd test --prefix server` — **31/31 passed**
- `npm.cmd run build --prefix client` — **passed**; Vite warns the minified JS chunk exceeds 500 kB, while gzip size is about 151 kB.
- `mobile/node_modules/.bin/tsc.cmd --noEmit` — **passed**
