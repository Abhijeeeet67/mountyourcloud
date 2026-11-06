# MountYourClouds — Environment Variable Wiring, OAuth Client IDs & Razorpay Checkout Plan

This plan connects your newly added Supabase, Google OAuth, OneDrive, Razorpay, and Encryption environment variables across both the Vite frontend (`import.meta.env`) and the Node backend (`process.env`), resolves the preview runtime error, and enables iframe-safe Google/OneDrive authentication and Razorpay Plan/Order checkout.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions incorporate your confirmed preferences from our clarification step and address the constraints of running inside the AI Studio preview environment.

- **Confirmed Decision 1 — Automatic Environment Variable Alias Resolution**: Both frontend (`import.meta.env`) and backend (`process.env`) will automatically resolve standard `.env.example` names (`GOOGLE_CLIENT_ID`, `ONEDRIVE_CLIENT_ID`, `RAZORPAY_KEY_ID`, `SUPABASE_URL`), provider-prefixed names (`GOOGLE_DRIVE_CLIENT_ID`, `MICROSOFT_ONEDRIVE_CLIENT_ID`), and `VITE_*` prefixed names (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID`, `VITE_RAZORPAY_PLAN_*`, `VITE_GOOGLE_CLIENT_ID`, `VITE_ONEDRIVE_CLIENT_ID`). All secrets (`*_SECRET`, `*_ENCRYPTION_KEY`) remain strictly server-side.
- **Confirmed Decision 2 — Razorpay Recurring Plan IDs with Order Fallback**: Upgrading to `PRO` or `ULTRA` will automatically check for your configured Razorpay Plan IDs (`RAZORPAY_PLAN_PRO_MONTHLY`, `RAZORPAY_PLAN_PRO_ANNUAL`, `RAZORPAY_PLAN_ULTRA_MONTHLY`, `RAZORPAY_PLAN_ULTRA_ANNUAL` and their `VITE_*` equivalents) to initialize recurring Razorpay Subscription checkout (`subscription_id`), and automatically fall back to a verified Razorpay Order (`order_id`) if a Plan ID is not set or if recurring subscriptions are not active on the merchant account.
- **Confirmed Decision 3 — Auto-Detection & Fix for the Preview Runtime Error**: We identified three root causes behind preview runtime errors:
  1. **Vite `process.env` Hydration**: `vite.config.ts` did not call `loadEnv(mode, process.cwd(), '')` to populate `process.env` for the backend API middleware or bridge non-secret public variables to `import.meta.env`.
  2. **Iframe-Safe OAuth Popups**: Redirecting the preview iframe directly to Google or Microsoft OAuth triggers an `X-Frame-Options: DENY` crash. All Google and OneDrive sign-in and drive-mounting flows will open the provider authorization URL in a popup window (`skipBrowserRedirect: true` for Supabase social login + `/api/oauth/:provider/authorize` fallback) and communicate back via cross-origin-safe `postMessage`.
  3. **Stale Gateway Cache Override**: If `.data/gateway.json` was initialized before environment variables were applied, the server store now automatically merges newly added `RAZORPAY_*` environment variables and Plan IDs so checkout is immediately active.

---

## 1. Overview & Core Concept

- **What It Does**: Unifies all cloud storage mounts (Google Drive, Microsoft OneDrive, Dropbox, Box, pCloud, S3/R2, WebDAV), user authentication (Supabase Email/Password, Google, Apple), and subscription billing (Razorpay Plans & Orders) in a single encrypted multi-cloud workspace.
- **Target Audience / Persona**: Multi-cloud power users, teams, and administrators managing files and transfer quotas across personal and infrastructure cloud providers.
- **Key Value**: Zero-configuration friction once environment variables are set—OAuth popups, Supabase sessions, encrypted token storage, and Razorpay checkout work immediately in preview and production.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Startup & Health Sync**: On load, the app initializes `import.meta.env` public keys and queries `/api/health` + `/api/oauth/providers` to reflect live Supabase, Google OAuth, OneDrive, and Razorpay readiness.
  2. **Google & OneDrive Authentication**:
     - On `/auth`, clicking **Continue with Google** opens an iframe-safe popup window using Supabase OAuth (`skipBrowserRedirect: true`) or falls back to the direct Google OAuth 2.0 PKCE popup flow if Supabase Google provider is not enabled, completing session login without breaking the preview iframe.
     - On `/app/providers`, clicking **Connect with OAuth** for **Google Drive** or **Microsoft OneDrive** uses the server-side PKCE flow with your `GOOGLE_CLIENT_ID` and `ONEDRIVE_CLIENT_ID`, stores AES-256-GCM encrypted tokens, and mounts the drive.
  3. **Razorpay Subscription & Order Checkout**:
     - On `/app/pricing` (or the upgrade modal), selecting **PRO** or **ULTRA** (`monthly` or `annual`) calls `/api/billing/create-order`, which uses your `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_PLAN_*` variables, loads `https://checkout.razorpay.com/v1/checkout.js`, opens the Razorpay modal with `key`, `subscription_id` (or `order_id`), and verifies the HMAC-SHA256 payment signature on completion.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft Apple-inspired SaaS workspace with dual Light (`#F5F5F7` canvas, `#FFFFFF` cards) and Dark (`#090A0F` canvas, `#131620` cards) themes.
  - *Color Palette & Mood*: 60% neutral canvas, 30% structural hairline-bordered surfaces (`.apple-card` utility defined in global CSS), 10% `#0071E3` primary interactive accent and semantic status indicators (`#10B981` nominal, `#F59E0B` warning, `#E11D48` error).
  - *Typography & Hierarchy*: Crisp geometric sans-serif headings and body paired with `JetBrains Mono` (`tabular-nums`) for byte quotas, latencies, INR pricing, and cryptographic identifiers.
- **Interactive Feedback & Motion**: Smooth 160ms transitions, clear popup-blocked or missing-scope recovery messages, and a top-level React Error Boundary to prevent unhandled runtime crashes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Unified Environment Variable Resolver**:
  - *Chosen Approach*: Centralize environment variable resolution in `vite.config.ts` (via `loadEnv`), `src/lib/env.ts` (for `import.meta.env`), and `server/providers.ts` / `server/store.ts` (for `process.env`).
  - *Why*: Guarantees that whether a variable is named `GOOGLE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_ID`, or `VITE_GOOGLE_CLIENT_ID` (and similarly for OneDrive, Supabase, and Razorpay), both client and server resolve it cleanly without exposing secrets.
- **Decision 2 — Popup-Based OAuth for Both Social Login and Cloud Drive Mounting**:
  - *Chosen Approach*: Use popup windows with `window.opener.postMessage(..., '*')` and origin validation (`.run.app` / `window.location.origin`) for both `/auth` social sign-in and `/app/providers` cloud account linking.
  - *Why*: The AI Studio preview runs inside a sandboxed cross-origin iframe where full-page redirects to `accounts.google.com` or `login.microsoftonline.com` are blocked by browser security headers.
- **Decision 3 — Automatic Recurring Plan ID Detection with Order Fallback**:
  - *Chosen Approach*: When a user clicks Upgrade on `PRO` or `ULTRA`, the backend checks if the corresponding `RAZORPAY_PLAN_*` ID is configured. If present, it creates a Razorpay Subscription (`subscription_id`); if absent or if the merchant account rejects subscription creation, it automatically creates a standard Razorpay Order (`order_id`) for the exact INR amount.
  - *Why*: Ensures checkout always succeeds whether the Razorpay account has Recurring Subscriptions enabled or standard Order checkout.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Vite Dev / Build Layer (Port 3000)                    │
│  • loadEnv(mode, cwd, '') populates process.env for server middleware       │
│  • Bridges public keys (VITE_SUPABASE_*, VITE_RAZORPAY_*, VITE_*_CLIENT_ID) │
└───────────────────┬─────────────────────────────────────────┬───────────────┘
                    │ import.meta.env                         │ process.env
                    ▼                                         ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────┐
│        Frontend SPA (React 19)        │ │     Backend API (/api/*)          │
│                                       │ │                                   │
│  ┌─────────────────────────────────┐  │ │  ┌─────────────────────────────┐  │
│  │ Centralized Env Reader          │  │ │  │ OAuth Provider Resolver     │  │
│  │ • Supabase URL & Publishable Key│  │ │  │ • GOOGLE_CLIENT_ID / DRIVE  │  │
│  │ • Razorpay Key ID & Plan IDs    │  │ │  │ • ONEDRIVE / MICROSOFT_ID   │  │
│  │ • Google & OneDrive Client IDs  │  │ │  │ • PKCE + State Verification │  │
│  └──────────────┬──────────────────┘  │ │  └──────────────┬──────────────┘  │
│                 │                     │ │                 │                 │
│  ┌──────────────▼──────────────────┐  │ │  ┌──────────────▼──────────────┐  │
│  │ Iframe-Safe Auth & Drive Mounts │◄─┼─┼─►│ Encrypted Vault & Store     │  │
│  │ • Google / Apple Social Popup   │  │ │  │ • AES-256-GCM Token Crypto  │  │
│  │ • Google Drive & OneDrive OAuth │  │ │  │ • Env + Admin Gateway Merge │  │
│  └──────────────┬──────────────────┘  │ │  └──────────────┬──────────────┘  │
│                 │                     │ │                 │                 │
│  ┌──────────────▼──────────────────┐  │ │  ┌──────────────▼──────────────┐  │
│  │ Razorpay Checkout Initializer   │◄─┼─┼─►│ Billing & Webhook Engine    │  │
│  │ • Preloads checkout.js SDK      │  │ │  │ • Recurring Plan ID Sub     │  │
│  │ • Passes Key ID + Sub/Order ID  │  │ │  │ • Fallback Order Creation   │  │
│  │ • HMAC Verification Callback    │  │ │  │ • HMAC-SHA256 Verification  │  │
│  └─────────────────────────────────┘  │ │  └─────────────────────────────┘  │
└───────────────────────────────────────┘ └───────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Environment Config & Vite Bridge**:
   - Load all `.env` variables into `process.env` in `vite.config.ts` and expose safe public fallbacks (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_RAZORPAY_KEY_ID`, `VITE_RAZORPAY_PLAN_*`, `VITE_GOOGLE_CLIENT_ID`, `VITE_ONEDRIVE_CLIENT_ID`) to `import.meta.env`.
2. **Google & OneDrive OAuth Flows**:
   - Backend `OAUTH_PROVIDERS` checks `GOOGLE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` and `ONEDRIVE_CLIENT_ID` / `MICROSOFT_ONEDRIVE_CLIENT_ID` / `VITE_ONEDRIVE_CLIENT_ID`.
   - Callback HTML posts completion events via `window.opener.postMessage(..., '*')` so cross-origin preview URLs (`ais-dev` and `ais-pre`) receive the OAuth completion event reliably.
   - `AuthPage` supports popup-based Google OAuth sign-in via Supabase (`skipBrowserRedirect: true`) and falls back to server-side `/api/oauth/gdrive/authorize` when signing in with Google OAuth credentials directly.
3. **Razorpay Checkout & Plan Initialization**:
   - `serverAccountStore` dynamically merges `process.env.RAZORPAY_KEY_ID` (or `VITE_RAZORPAY_KEY_ID`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `RAZORPAY_PLAN_*` (or `VITE_RAZORPAY_PLAN_*`) into the active gateway configuration even if `.data/gateway.json` already exists on disk.
   - `/api/billing/create-order` attempts recurring subscription creation when a matching Plan ID is configured for `pro`/`ultra` (`monthly`/`annual`), and falls back to creating a standard Razorpay Order if no Plan ID is set or if the subscription endpoint returns an error.
   - `useVaultStore.switchSubscriptionPlan` preloads `https://checkout.razorpay.com/v1/checkout.js`, initializes `new window.Razorpay(...)` with the resolved `keyId` and `subscription_id` or `order_id`, and verifies the resulting signature via `/api/billing/verify-payment`.
