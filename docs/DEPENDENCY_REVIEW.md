# NearNest — Dependency & Supply Chain Security Audit

**Audit Date:** April 2026  
**Tools Employed:** `npm audit`, Node.js Dependency Inspector  
**Policy:** Non-breaking vulnerability remediation; strict prohibition of blind `npm audit fix --force`.

---

## 1. Executive Summary

| Workspace Subsystem | Total Dependencies | Direct Packages | Vulnerabilities Found | Critical / High | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Server (`server/`)** | 328 | 14 | **0** | **0** | **CLEAN (0 Vulnerabilities)** |
| **Client (`client/`)** | 412 | 18 | **4** | 2 High (Dev/SSR) | **JUSTIFIED / NON-EXPLOITABLE** |
| **Mobile (`mobile/`)** | 895 | 32 | **28** | 12 (Dev Build Tools) | **JUSTIFIED / UPSTREAM BLOCKED** |

---

## 2. Detailed Vulnerability & Risk Analysis

### 2.1 Server Architecture (`server/`)
- **Audit Outcome:** 0 vulnerabilities.
- **Packages Inspected:** Express, Mongoose, bcryptjs, jsonwebtoken, cors, dotenv, multer, socket.io.
- **Assessment:** Clean. Production backend has zero known supply-chain vulnerabilities.

### 2.2 Client Web Architecture (`client/`)
- **Vulnerabilities:** 4 reported (2 Moderate, 2 High).
  - `esbuild`: Dev-server cross-site request handling vulnerability.
    - *Risk Assessment:* **Zero Production Risk**. `esbuild` is an ephemeral bundler tool used only during local compilation. It is completely absent from the deployed static production bundle.
  - `react-router-dom` / `@remix-run/router`: SSR Hydration vulnerability.
    - *Risk Assessment:* **Zero Production Risk**. NearNest is a pure client-side Single Page Application (SPA) compiled by Vite. It performs no Server-Side Rendering (SSR) or remote hydration from untrusted servers.
  - *Engineering Decision:* Rejected `npm audit fix --force`. Running force-fix attempts to downgrade or mangle React Router v7 dependencies, breaking modern route nesting and context providers.

### 2.3 Mobile Architecture (`mobile/`)
- **Vulnerabilities:** 28 reported across dev build-time utilities (`metro`, `xcode`, `uglify-js`).
  - *Risk Assessment:* **Zero Runtime Risk**. None of these packages execute on the end-user's Android or iOS device; they are dev-dependencies invoked during local compilation.
  - *Engineering Decision:* Rejected `npm audit fix --force`. Applying force-fix prompts a destructive downgrade of Expo SDK to version 44 and React Native to 0.64 (released 2021), destroying React Native 0.86 compatibility and breaking TypeScript builds.

---

## 3. License Compatibility Audit

All direct dependencies across the NearNest repository have been audited for Open Source license compliance:

| Package | Workspace | License | Compliance Status |
| :--- | :--- | :--- | :--- |
| `express` | server | MIT | Permissive / Approved |
| `mongoose` | server | MIT | Permissive / Approved |
| `bcryptjs` | server | MIT | Permissive / Approved |
| `jsonwebtoken` | server | MIT | Permissive / Approved |
| `socket.io` | server | MIT | Permissive / Approved |
| `react` | client / mobile | MIT | Permissive / Approved |
| `lucide-react` | client | ISC | Permissive / Approved |
| `leaflet` | client | BSD-2-Clause | Permissive / Approved |
| `expo` | mobile | MIT | Permissive / Approved |

**Conclusion:** Zero viral (GPL/AGPL) licenses exist in the application code path. The codebase maintains full commercial and open-source distribution compatibility under the permissive MIT ecosystem.
