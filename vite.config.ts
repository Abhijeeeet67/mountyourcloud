import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { oauthServerPlugin } from './server/vitePlugin.ts';

export default defineConfig(({ mode }) => {
  // Load all environment variables from .env files and merge into process.env
  // so backend middleware (/api/oauth, /api/billing, /api/auth, /api/admin) can read them via process.env
  const loadedEnv = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(loadedEnv)) {
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }

  const pickPublic = (...keys: string[]): string => {
    for (const k of keys) {
      const val = process.env[k] ?? loadedEnv[k];
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
      }
    }
    return '';
  };

  return {
    plugins: [react(), tailwindcss(), oauthServerPlugin()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        pickPublic('VITE_SUPABASE_URL', 'SUPABASE_URL')
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        pickPublic('VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY')
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        pickPublic('VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY')
      ),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        pickPublic('VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_ID')
      ),
      'import.meta.env.VITE_ONEDRIVE_CLIENT_ID': JSON.stringify(
        pickPublic('VITE_ONEDRIVE_CLIENT_ID', 'VITE_MICROSOFT_ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_ID', 'MICROSOFT_ONEDRIVE_CLIENT_ID')
      ),
      'import.meta.env.VITE_DROPBOX_CLIENT_ID': JSON.stringify(
        pickPublic('VITE_DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_ID')
      ),
      'import.meta.env.VITE_BOX_CLIENT_ID': JSON.stringify(
        pickPublic('VITE_BOX_CLIENT_ID', 'BOX_CLIENT_ID')
      ),
      'import.meta.env.VITE_PCLOUD_CLIENT_ID': JSON.stringify(
        pickPublic('VITE_PCLOUD_CLIENT_ID', 'PCLOUD_CLIENT_ID')
      ),
      'import.meta.env.VITE_RAZORPAY_KEY_ID': JSON.stringify(
        pickPublic('VITE_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID')
      ),
      'import.meta.env.VITE_RAZORPAY_MODE': JSON.stringify(
        pickPublic('VITE_RAZORPAY_MODE', 'RAZORPAY_MODE')
      ),
      'import.meta.env.VITE_RAZORPAY_PLAN_PRO_MONTHLY': JSON.stringify(
        pickPublic('VITE_RAZORPAY_PLAN_PRO_MONTHLY', 'RAZORPAY_PLAN_PRO_MONTHLY')
      ),
      'import.meta.env.VITE_RAZORPAY_PLAN_PRO_ANNUAL': JSON.stringify(
        pickPublic('VITE_RAZORPAY_PLAN_PRO_ANNUAL', 'RAZORPAY_PLAN_PRO_ANNUAL')
      ),
      'import.meta.env.VITE_RAZORPAY_PLAN_ULTRA_MONTHLY': JSON.stringify(
        pickPublic('VITE_RAZORPAY_PLAN_ULTRA_MONTHLY', 'RAZORPAY_PLAN_ULTRA_MONTHLY')
      ),
      'import.meta.env.VITE_RAZORPAY_PLAN_ULTRA_ANNUAL': JSON.stringify(
        pickPublic('VITE_RAZORPAY_PLAN_ULTRA_ANNUAL', 'RAZORPAY_PLAN_ULTRA_ANNUAL')
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/react-is') || id.includes('node_modules/d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
