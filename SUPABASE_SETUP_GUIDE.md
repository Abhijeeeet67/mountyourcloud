# MountYourClouds — Supabase Setup Guide

This guide explains how to configure **Supabase PostgreSQL**, **Row Level Security (RLS)**, and **Supabase Authentication** (Email/Password, Google Sign-In, and Sign in with Apple) for **MountYourClouds**.

---

## 1. Create a Supabase Project & Run the Production Schema Migration

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Navigate to **SQL Editor → New Query**.
3. Copy the entire contents of [`supabase/migrations/0001_production_schema.sql`](./supabase/migrations/0001_production_schema.sql) and click **Run**.
   - This creates all 16 production tables (`profiles`, `admin_users`, `connected_cloud_accounts`, `encrypted_provider_credentials`, `oauth_state_transactions`, `cloud_mounts`, `file_metadata`, `transfer_jobs`, `transfer_events`, `subscription_plans`, `user_subscriptions`, `payment_transactions`, `invoices`, `razorpay_webhook_events`, `integration_settings`, and `audit_logs`) with strict `auth.uid()` Row Level Security policies.

---

## 2. Configure Environment Variables

In your `.env` or deployment environment secrets, set:

```env
# Frontend (Browser-safe publishable/anon key)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-or-publishable-key>

# Backend (Server-only service_role key)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SECRET_KEY=<your-service-role-secret-key>
```

---

## 3. Configure Authentication Redirect URLs

In **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL**:
  - Development: `https://ais-dev-pqidunhrnlbzaqxaqgzotq-984872346664.asia-east1.run.app`
  - Production: `https://ais-pre-pqidunhrnlbzaqxaqgzotq-984872346664.asia-east1.run.app` (or your custom domain)
- **Redirect URLs** (Add all of the following):
  - `http://localhost:3000/#/auth`
  - `https://ais-dev-pqidunhrnlbzaqxaqgzotq-984872346664.asia-east1.run.app/#/auth`
  - `https://ais-pre-pqidunhrnlbzaqxaqgzotq-984872346664.asia-east1.run.app/#/auth`

---

## 4. Enable Email, Google Sign-In & Sign in with Apple

1. **Email / Password**:
   - Go to **Authentication → Providers → Email** and ensure **Enable Email provider** is turned ON.
2. **Google Sign-In**:
   - Go to **Authentication → Providers → Google**, enable it, and paste your Google OAuth Client ID and Client Secret.
   - Add the Supabase callback URL (`https://<your-project-ref>.supabase.co/auth/v1/callback`) to your Google Cloud Console Authorized Redirect URIs.
3. **Sign in with Apple**:
   - Go to **Authentication → Providers → Apple**, enable it, and configure your Apple Services ID, Team ID, Key ID, and `.p8` private key.

---

## 5. Bootstrap Your Owner Administrator Account

1. Sign up or log in to MountYourClouds using your owner account (`abhijeet4311@gmail.com`).
2. Open **Workspace → Settings** (or visit `/#/app/admin`) to copy your User ID (`MOUNTYOURCLOUDS_ADMIN_USER_ID`).
3. Set `MOUNTYOURCLOUDS_ADMIN_USER_ID=<your-user-uuid>` in your backend environment variables, or insert your UUID into `public.admin_users` in the Supabase SQL Editor:
   ```sql
   insert into public.admin_users (user_id, email, role)
   values ('<your-user-uuid>', 'abhijeet4311@gmail.com', 'owner');
   ```
