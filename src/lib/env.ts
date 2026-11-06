/**
 * Centralized frontend environment variable reader using Vite's `import.meta.env`.
 * Never accesses or exposes backend secrets (Client Secrets, Webhook Secrets, or Encryption Keys).
 */

interface ImportMetaEnvMap {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DRIVE_CLIENT_ID?: string;
  readonly VITE_ONEDRIVE_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_ONEDRIVE_CLIENT_ID?: string;
  readonly VITE_DROPBOX_CLIENT_ID?: string;
  readonly VITE_BOX_CLIENT_ID?: string;
  readonly VITE_PCLOUD_CLIENT_ID?: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
  readonly VITE_RAZORPAY_MODE?: string;
  readonly VITE_RAZORPAY_PLAN_PRO_MONTHLY?: string;
  readonly VITE_RAZORPAY_PLAN_PRO_ANNUAL?: string;
  readonly VITE_RAZORPAY_PLAN_ULTRA_MONTHLY?: string;
  readonly VITE_RAZORPAY_PLAN_ULTRA_ANNUAL?: string;
  readonly VITE_LEGAL_BUSINESS_NAME?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_PRIVACY_EMAIL?: string;
  readonly VITE_REGISTERED_COUNTRY?: string;
  readonly [key: string]: string | undefined;
}

function getRawImportMetaEnv(): ImportMetaEnvMap {
  try {
    return ((import.meta as unknown as { env?: ImportMetaEnvMap }).env ?? {}) as ImportMetaEnvMap;
  } catch {
    return {};
  }
}

function readEnv(...keys: string[]): string {
  const env = getRawImportMetaEnv();
  for (const key of keys) {
    const val = env[key];
    if (typeof val === 'string' && val.trim().length > 0 && val.trim() !== 'undefined') {
      return val.trim();
    }
  }
  return '';
}

export const clientEnv = {
  get supabaseUrl(): string {
    return readEnv('VITE_SUPABASE_URL');
  },
  get supabasePublishableKey(): string {
    return readEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY');
  },
  get apiBaseUrl(): string {
    return readEnv('VITE_API_BASE_URL');
  },
  get googleClientId(): string {
    return readEnv('VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_DRIVE_CLIENT_ID');
  },
  get onedriveClientId(): string {
    return readEnv('VITE_ONEDRIVE_CLIENT_ID', 'VITE_MICROSOFT_ONEDRIVE_CLIENT_ID');
  },
  get dropboxClientId(): string {
    return readEnv('VITE_DROPBOX_CLIENT_ID');
  },
  get boxClientId(): string {
    return readEnv('VITE_BOX_CLIENT_ID');
  },
  get pcloudClientId(): string {
    return readEnv('VITE_PCLOUD_CLIENT_ID');
  },
  get razorpayKeyId(): string {
    return readEnv('VITE_RAZORPAY_KEY_ID');
  },
  get razorpayMode(): 'test' | 'live' {
    const m = readEnv('VITE_RAZORPAY_MODE').toLowerCase();
    if (m === 'live' || this.razorpayKeyId.startsWith('rzp_live_')) {
      return 'live';
    }
    return 'test';
  },
  get razorpayPlanIds(): {
    proMonthly: string;
    proAnnual: string;
    ultraMonthly: string;
    ultraAnnual: string;
  } {
    return {
      proMonthly: readEnv('VITE_RAZORPAY_PLAN_PRO_MONTHLY'),
      proAnnual: readEnv('VITE_RAZORPAY_PLAN_PRO_ANNUAL'),
      ultraMonthly: readEnv('VITE_RAZORPAY_PLAN_ULTRA_MONTHLY'),
      ultraAnnual: readEnv('VITE_RAZORPAY_PLAN_ULTRA_ANNUAL'),
    };
  },
  get legalBusinessName(): string {
    return readEnv('VITE_LEGAL_BUSINESS_NAME') || 'MountYourClouds Software';
  },
  get supportEmail(): string {
    return readEnv('VITE_SUPPORT_EMAIL') || 'support@mountyourclouds.com';
  },
  get privacyEmail(): string {
    return readEnv('VITE_PRIVACY_EMAIL') || 'privacy@mountyourclouds.com';
  },
  get registeredCountry(): string {
    return readEnv('VITE_REGISTERED_COUNTRY') || 'India';
  },
};
