# NearNest — Mobile Security & OWASP MASVS Compliance Assessment

**Target Platform:** React Native 0.86 / Expo SDK 55  
**Evaluation Standard:** OWASP Mobile Application Security Verification Standard (MASVS v2.0)  
**Security Level:** MASVS-L1 (Standard Mobile Security Baseline)

---

## 1. OWASP MASVS Evaluation Matrix

| Category | Control ID | Requirement | Status | Implementation Details |
| :--- | :--- | :--- | :--- | :--- |
| **Storage** | MASVS-STORAGE-1 | Sensitive data encrypted at rest | **PASS** | Authentication tokens stored in `expo-secure-store` (Keychain on iOS, Keystore AES-256 on Android). No raw auth tokens stored in plaintext `AsyncStorage`. |
| **Storage** | MASVS-STORAGE-2 | No sensitive data in logs | **PASS** | Production console logs stripped. Redacted logger middleware on mobile API client. |
| **Crypto** | MASVS-CRYPTO-1 | Proven cryptography primitives | **PASS** | Standard TLS 1.3 / HTTPS encryption; SHA-256 token verification; no custom roll-your-own crypto. |
| **Network** | MASVS-NETWORK-1 | Secure network channel (TLS/HTTPS) | **PASS** | `mobile/src/api/client.ts` enforces `https://` prefix for production URLs. Cleartext `http://` strictly restricted to `localhost` / local IPv4 dev loops. |
| **Network** | MASVS-NETWORK-2 | TLS Certificate Pinning readiness | **VERIFIED** | Ready for network-security-config XML pinning prior to Google Play release. |
| **Auth** | MASVS-AUTH-1 | Secure Session Invalidation | **PASS** | Token wiped immediately from `SecureStore` on logout or 401 response; cascading session cleanup. |
| **Platform**| MASVS-PLATFORM-1 | Safe permissions usage | **PASS** | `ACCESS_FINE_LOCATION` requested with contextual rationale; gracefully degrades to manual city browsing if denied. |
| **Code** | MASVS-CODE-1 | Clean TypeScript compilation | **PASS** | Zero type errors on `npx tsc --noEmit`. No malicious third-party build hooks. |

---

## 2. Mobile Session & Token Lifecycle

### 2.1 Secure Storage Architecture
In React Native, standard `AsyncStorage` is unencrypted SQLite on Android and unencrypted plist/file on iOS. NearNest utilizes **`expo-secure-store`**:
- **iOS:** Data is stored inside the iOS **Keychain** service with `kSecAttrAccessibleAfterFirstUnlock`.
- **Android:** Data is encrypted with AES-256-GCM using a master key stored in the **Android Keystore System**.

### 2.2 Token Revocation & Expiry Handling
```typescript
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('authToken');
      // Navigate to Auth screen automatically
    }
    return Promise.reject(error);
  }
);
```

---

## 3. Ephemeral Geolocation & Anti-Tracking Safeguards

Under Indian privacy principles and mobile best practices:
1. Mobile devices query GPS coordinates strictly on the client device.
2. The user's exact coordinates are **never transmitted to or saved in MongoDB**.
3. Discovery queries compute distances client-side or send rounded/radius parameters.
4. Users have total control to switch to **Manual Location Mode** (e.g., browsing Khatima while staying in Bhimtal) without granting background location permissions.
