# MountYourClouds — Production Deployment Guide

## 1. Required Production Environment Variables

Configure the following environment variables on your hosting platform (Cloud Run, Docker, Render, Railway, or Node.js VM):

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `APP_URL` | Server | Exact public HTTPS origin of your deployment (used for OAuth callbacks & webhooks). |
| `VITE_SUPABASE_URL` | Client/Build | Your Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client/Build | Your Supabase anon/publishable key. |
| `SUPABASE_URL` | Server | Your Supabase project URL. |
| `SUPABASE_SECRET_KEY` | Server | Your Supabase `service_role` secret key. |
| `MOUNTYOURCLOUDS_ADMIN_USER_ID` | Server | UUID of the owner administrator user. |
| `APP_SECRETS_ENCRYPTION_KEY` | Server | 64-char hex key (`openssl rand -hex 32`) for encrypting admin secrets (AES-256-GCM). |
| `TOKEN_ENCRYPTION_KEY` | Server | 64-char hex key (`openssl rand -hex 32`) for encrypting OAuth tokens (AES-256-GCM). |
| `SESSION_SECRET` | Server | Secret key for signing server session tokens and OAuth state payloads. |

---

## 2. Build & Start Commands

1. **Install dependencies**:
   ```bash
   npm ci
   ```
2. **Run automated test suite**:
   ```bash
   npm test
   ```
3. **Build production frontend & server bundle**:
   ```bash
   npm run build
   ```
4. **Start production server**:
   ```bash
   NODE_ENV=production PORT=3000 npx tsx server/index.ts
   ```

---

## 3. Pre-Launch Security Checklist

- [x] `NODE_ENV=production` is set so missing encryption keys fail closed at startup.
- [x] `APP_URL` matches your HTTPS domain and is registered as `${APP_URL}/api/oauth/callback` in Google, Microsoft, Dropbox, Box, and pCloud developer consoles.
- [x] `supabase/migrations/0001_production_schema.sql` has been executed in Supabase SQL Editor.
- [x] `MOUNTYOURCLOUDS_ADMIN_USER_ID` is set to the owner's user UUID.
- [x] Razorpay Webhook (`${APP_URL}/api/billing/webhook`) is configured with a matching Webhook Secret.
