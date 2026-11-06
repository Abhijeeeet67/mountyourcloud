-- =============================================================================
-- MountYourClouds — Production PostgreSQL Schema & Row Level Security Migration
-- Target: Supabase PostgreSQL (supabase/migrations/0001_production_schema.sql)
-- =============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1. profiles (Linked to Supabase auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile row when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, auth_provider, email_verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, 'User'), '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    (NEW.email_confirmed_at IS NOT NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    email_verified = EXCLUDED.email_verified,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 2. admin_users (Server-verified platform administrators)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'auditor')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. connected_cloud_accounts (Non-secret account metadata per user)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connected_cloud_accounts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  email TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'error', 'revoked', 'disconnected')),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  token_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connected_cloud_accounts_user_id ON public.connected_cloud_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_cloud_accounts_provider ON public.connected_cloud_accounts(user_id, provider);

DROP TRIGGER IF EXISTS trg_connected_cloud_accounts_updated_at ON public.connected_cloud_accounts;
CREATE TRIGGER trg_connected_cloud_accounts_updated_at
  BEFORE UPDATE ON public.connected_cloud_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. encrypted_provider_credentials (AES-256-GCM encrypted tokens & secrets)
--    Server-only table: RLS enabled with NO client policies (only service_role)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.encrypted_provider_credentials (
  account_id TEXT PRIMARY KEY REFERENCES public.connected_cloud_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  encrypted_extra_config TEXT,
  key_version INTEGER NOT NULL DEFAULT 1,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encrypted_provider_credentials_user_id ON public.encrypted_provider_credentials(user_id);

DROP TRIGGER IF EXISTS trg_encrypted_provider_credentials_updated_at ON public.encrypted_provider_credentials;
CREATE TRIGGER trg_encrypted_provider_credentials_updated_at
  BEFORE UPDATE ON public.encrypted_provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. oauth_state_transactions (One-time expiring OAuth CSRF state records)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_state_transactions (
  nonce TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_code_verifier TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expires_at ON public.oauth_state_transactions(expires_at);

-- -----------------------------------------------------------------------------
-- 6. cloud_mounts (Mounted storage endpoints per user)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cloud_mounts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connected_account_id TEXT REFERENCES public.connected_cloud_accounts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  endpoint TEXT,
  region TEXT,
  bucket TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'syncing', 'disconnected', 'error')),
  allocated_bytes BIGINT NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  zero_egress BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cloud_mounts_user_id ON public.cloud_mounts(user_id);

DROP TRIGGER IF EXISTS trg_cloud_mounts_updated_at ON public.cloud_mounts;
CREATE TRIGGER trg_cloud_mounts_updated_at
  BEFORE UPDATE ON public.cloud_mounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. file_metadata (Unified virtual filesystem & remote cloud file index)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.file_metadata (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id TEXT,
  mount_id TEXT REFERENCES public.cloud_mounts(id) ON DELETE CASCADE,
  remote_object_id TEXT,
  name TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('file', 'folder')),
  mime_type TEXT,
  extension TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  trashed_at TIMESTAMPTZ,
  trashed_from_parent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_user_parent ON public.file_metadata(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_user_mount ON public.file_metadata(user_id, mount_id);

DROP TRIGGER IF EXISTS trg_file_metadata_updated_at ON public.file_metadata;
CREATE TRIGGER trg_file_metadata_updated_at
  BEFORE UPDATE ON public.file_metadata
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. transfer_jobs (Scheduled & active cross-cloud transfer jobs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfer_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_mount_id TEXT NOT NULL,
  target_mount_id TEXT NOT NULL,
  schedule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('manual', 'hourly', 'daily', 'weekly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'running', 'completed', 'failed')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_jobs_user_id ON public.transfer_jobs(user_id);

-- -----------------------------------------------------------------------------
-- 9. transfer_events (Ingress / Egress bandwidth ledger for quota enforcement)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mount_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ingress', 'egress')),
  bytes BIGINT NOT NULL CHECK (bytes >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_events_user_time ON public.transfer_events(user_id, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- 10. subscription_plans (Platform subscription tiers & quota rules)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id TEXT PRIMARY KEY CHECK (id IN ('free', 'pro', 'ultra')),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  audience TEXT NOT NULL,
  base_monthly_inr INTEGER NOT NULL CHECK (base_monthly_inr >= 0),
  annual_discount_percent INTEGER NOT NULL DEFAULT 20 CHECK (annual_discount_percent BETWEEN 0 AND 80),
  max_mounts INTEGER NOT NULL CHECK (max_mounts >= 1),
  daily_transfer_limit_gb INTEGER NOT NULL CHECK (daily_transfer_limit_gb >= 1),
  monthly_transfer_limit_gb INTEGER NOT NULL CHECK (monthly_transfer_limit_gb >= 1),
  max_bulk_files INTEGER NOT NULL DEFAULT 10,
  priority_label TEXT NOT NULL DEFAULT 'Standard',
  allow_bulk_operations BOOLEAN NOT NULL DEFAULT FALSE,
  allow_advanced_search BOOLEAN NOT NULL DEFAULT FALSE,
  allow_auto_organize BOOLEAN NOT NULL DEFAULT FALSE,
  allow_scheduled_transfers BOOLEAN NOT NULL DEFAULT FALSE,
  allow_cross_cloud_sync BOOLEAN NOT NULL DEFAULT FALSE,
  razorpay_plan_id_monthly TEXT,
  razorpay_plan_id_annual TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.subscription_plans (
  id, name, tagline, audience, base_monthly_inr, annual_discount_percent,
  max_mounts, daily_transfer_limit_gb, monthly_transfer_limit_gb, max_bulk_files,
  priority_label, allow_bulk_operations, allow_advanced_search, allow_auto_organize,
  allow_scheduled_transfers, allow_cross_cloud_sync, features
) VALUES
  (
    'free', 'FREE', 'Essential multi-cloud explorer for personal drives', 'Individuals getting started',
    0, 20, 2, 2, 15, 5, 'Standard Queue',
    FALSE, FALSE, FALSE, FALSE, FALSE,
    '["Connect up to 2 external cloud accounts", "2 GB/day & 15 GB/month transfer quota", "Unified file explorer & preview", "Standard multipart uploads"]'::jsonb
  ),
  (
    'pro', 'PRO', 'High-throughput orchestration & automation for power users', 'Creators, developers & professionals',
    199, 20, 7, 25, 350, 50, 'Priority Queue',
    TRUE, TRUE, TRUE, TRUE, FALSE,
    '["Connect up to 7 external cloud accounts", "25 GB/day & 350 GB/month transfer quota", "Daily scheduled cross-cloud backups", "Automated file organization & bulk actions"]'::jsonb
  ),
  (
    'ultra', 'ULTRA', 'Maximum cloud slots, recurring sync & enterprise throughput', 'Teams, studios & heavy multi-cloud workflows',
    499, 20, 20, 100, 1500, 250, 'Dedicated High-Priority',
    TRUE, TRUE, TRUE, TRUE, TRUE,
    '["Connect up to 20 external cloud accounts", "100 GB/day & 1,500 GB/month transfer quota", "Hourly, daily & weekly cross-cloud sync", "Priority multipart concurrency & audit logs"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. user_subscriptions (Active user subscription state)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free' REFERENCES public.subscription_plans(id),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'halted', 'pending')),
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 12. payment_transactions (Verified Razorpay payment transactions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_subscription_id TEXT,
  razorpay_signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 13. invoices (Verified customer invoices)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_inr INTEGER NOT NULL CHECK (amount_inr >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'void')),
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id, issued_at DESC);

-- -----------------------------------------------------------------------------
-- 14. razorpay_webhook_events (Idempotent webhook event ledger)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 15. integration_settings (Admin-managed encrypted gateway & provider settings)
--     Server-only table: encrypted with APP_SECRETS_ENCRYPTION_KEY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_settings (
  setting_key TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  public_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 16. audit_logs (Immutable security & administrative audit trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_cloud_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_state_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_mounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read and update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Admin users: Users can check if they themselves are an admin
CREATE POLICY "admin_users_select_self" ON public.admin_users
  FOR SELECT USING (auth.uid() = user_id);

-- Connected cloud accounts: Users can read and delete only their own accounts
CREATE POLICY "connected_accounts_select_own" ON public.connected_cloud_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "connected_accounts_delete_own" ON public.connected_cloud_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Cloud mounts: Users can CRUD only their own cloud mounts
CREATE POLICY "cloud_mounts_all_own" ON public.cloud_mounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- File metadata: Users can CRUD only their own file metadata
CREATE POLICY "file_metadata_all_own" ON public.file_metadata
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transfer jobs: Users can CRUD only their own transfer jobs
CREATE POLICY "transfer_jobs_all_own" ON public.transfer_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transfer events: Users can read and insert their own transfer events
CREATE POLICY "transfer_events_select_own" ON public.transfer_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transfer_events_insert_own" ON public.transfer_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Subscription plans: Publicly readable by all authenticated & anonymous users
CREATE POLICY "subscription_plans_select_all" ON public.subscription_plans
  FOR SELECT USING (TRUE);

-- User subscriptions: Users can read only their own subscription
CREATE POLICY "user_subscriptions_select_own" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Payment transactions: Users can read only their own payment transactions
CREATE POLICY "payment_transactions_select_own" ON public.payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Invoices: Users can read only their own invoices
CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

-- Note: encrypted_provider_credentials, oauth_state_transactions,
-- razorpay_webhook_events, integration_settings, and audit_logs have NO
-- client-side policies; they are exclusively accessed by the backend server
-- using SUPABASE_SECRET_KEY / service_role.
