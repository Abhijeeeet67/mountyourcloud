# MountYourClouds — Multi-Provider OAuth 2.0 PKCE Setup & Architecture Guide

MountYourClouds implements an enterprise-grade, secure cloud storage aggregation platform. This guide provides comprehensive instructions for configuring, deploying, and maintaining OAuth 2.0 authorization code integrations with PKCE and server-side encryption for Google Drive, Microsoft OneDrive, Dropbox, Box, and pCloud.

---

## 1. Security & OAuth Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                  BROWSER (MountYourClouds Client)                                 |
|                                                                                                   |
|  1. User clicks "Connect Google Drive"                                                            |
|  2. Fetches authorization URL from backend (/api/oauth/:provider/authorize)                       |
|  3. Opens centered popup to Provider OAuth consent screen                                         |
+---------------------------------------------------------------------------------------------------+
                                            |               ^
                   Redirect after consent   |               | 7. window.opener.postMessage()
                   (?code=...&state=...)    v               |    with connected account info
+---------------------------------------------------------------------------------------------------+
|                                     MOUNTYOURCLOUDS BACKEND                                       |
|                                                                                                   |
|  4. Validates state parameter HMAC-SHA256 signature (CSRF Defense) & unwraps PKCE code verifier   |
|  5. Performs server-side POST to provider token endpoint using Client ID, Secret & Code Verifier  |
|  6. Encrypts sensitive refresh token at rest using AES-256-GCM (96-bit random IV, 128-bit tag)    |
|  7. Returns auto-closing HTML with window.opener.postMessage()                                    |
|                                                                                                   |
|  Automatic Token Refresh: /api/oauth/accounts/:id/token automatically decrypts refresh token      |
|  and refreshes access tokens when nearing expiration (< 60s remaining).                           |
+---------------------------------------------------------------------------------------------------+
```

### Architectural Guarantees:
- **No Client Secrets in Browser**: Frontend code never sees `GOOGLE_DRIVE_CLIENT_SECRET`, `DROPBOX_CLIENT_SECRET`, or `MICROSOFT_ONEDRIVE_CLIENT_SECRET`.
- **Encrypted Refresh Tokens**: Stored using AES-256-GCM authenticated encryption with a dedicated 256-bit symmetric key (`OAUTH_ENCRYPTION_KEY`).
- **CSRF & Tamper Protection**: State parameter is cryptographically signed using HMAC-SHA256 (`SESSION_SECRET`) with a 10-minute expiry and embedded PKCE code verifier.
- **Least-Privilege Scopes**: Requests only scoped file permissions (`drive.file`, `Files.ReadWrite`, `files.content.write`) rather than unrestricted account access.

---

## 2. Global Callback Configuration

Regardless of the provider, configure the callback URL as:

| Environment | Redirect / Callback URI |
| :--- | :--- |
| **Local Development** | `http://localhost:3000/api/oauth/callback` |
| **Production Deployment** | `https://your-domain.com/api/oauth/callback` |

---

## 3. Provider App Registration Steps

### A. Google Drive
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one (e.g., `MountYourClouds`).
3. Navigate to **APIs & Services** > **Library** and search for **Google Drive API**. Click **Enable**.
4. Go to **APIs & Services** > **OAuth consent screen**:
   - User Type: **External** (for personal/general users) or **Internal** (for Google Workspace organizations).
   - App name: `MountYourClouds`
   - User support email & developer contact email: Your email.
5. In **Scopes**, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/drive.file` (Per-file access for files created or opened by MountYourClouds)
   - `https://www.googleapis.com/auth/drive.readonly` (Read file metadata and list directories)
   - `https://www.googleapis.com/auth/userinfo.email` & `https://www.googleapis.com/auth/userinfo.profile`
6. Navigate to **Credentials** > **Create Credentials** > **OAuth client ID**:
   - Application type: **Web application**
   - Name: `MountYourClouds Web Client`
   - Authorized JavaScript origins: `http://localhost:3000` (and your production domain)
   - Authorized redirect URIs: `http://localhost:3000/api/oauth/callback`
7. Copy the generated **Client ID** and **Client Secret** into your `.env`:
   ```bash
   GOOGLE_DRIVE_CLIENT_ID="xxxx.apps.googleusercontent.com"
   GOOGLE_DRIVE_CLIENT_SECRET="GOCSPX-xxxx"
   ```
8. **Publishing Status**: In testing mode, add test users under the OAuth consent screen. For public production usage, submit for Google OAuth verification for restricted/sensitive scopes.

---

### B. Microsoft OneDrive (Microsoft Graph)
1. Go to the [Microsoft Entra Admin Center](https://entra.microsoft.com/) or [Azure Portal](https://portal.azure.com/).
2. Navigate to **Identity** > **Applications** > **App registrations** > **New registration**:
   - Name: `MountYourClouds`
   - Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**.
   - Redirect URI: Select **Web** and enter `http://localhost:3000/api/oauth/callback`.
3. Under **API permissions**, verify that Microsoft Graph permissions include:
   - `Files.ReadWrite` (Delegated)
   - `User.Read` (Delegated)
   - `offline_access` (Delegated — enables refresh tokens)
4. Go to **Certificates & secrets** > **Client secrets** > **New client secret**:
   - Description: `MountYourClouds Backend Secret`
   - Expires: 180 days or 365 days.
   - Copy the secret **Value** immediately.
5. In `.env`:
   ```bash
   MICROSOFT_ONEDRIVE_CLIENT_ID="00000000-0000-0000-0000-000000000000"
   MICROSOFT_ONEDRIVE_CLIENT_SECRET="your_client_secret_value"
   ```

---

### C. Dropbox
1. Visit the [Dropbox App Console](https://www.dropbox.com/developers/apps).
2. Click **Create app**:
   - Type of API: **Scoped access**
   - Type of access: **Full Dropbox** (or App folder if restricting to a single subfolder)
   - Name your app: `MountYourClouds-Storage`
3. In the **Settings** tab:
   - Under **OAuth 2**, add redirect URI: `http://localhost:3000/api/oauth/callback`.
4. In the **Permissions** tab, enable the following scopes:
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
   - `account_info.read`
5. Click **Submit** at the bottom of the Permissions tab to apply changes.
6. Copy the **App key** (Client ID) and **App secret** (Client Secret) into `.env`:
   ```bash
   DROPBOX_CLIENT_ID="your_dropbox_app_key"
   DROPBOX_CLIENT_SECRET="your_dropbox_app_secret"
   ```

---

### D. Box Content Cloud
1. Go to the [Box Developer Console](https://app.box.com/developers/console).
2. Click **Create New App** > **Custom App** > **User Authentication (OAuth 2.0)**.
3. In **Configuration**:
   - Set Redirect URI: `http://localhost:3000/api/oauth/callback`.
   - Set Scopes: Check **Read and write all files and folders stored in Box** (`root_readwrite`).
4. Copy the **Client ID** and **Client Secret** into `.env`:
   ```bash
   BOX_CLIENT_ID="your_box_client_id"
   BOX_CLIENT_SECRET="your_box_client_secret"
   ```

---

### E. pCloud
1. Go to the [pCloud Developer Console](https://docs.pcloud.com/my_apps/).
2. Create an application and specify Redirect URL: `http://localhost:3000/api/oauth/callback`.
3. Copy the **App Key** and **App Secret** into `.env`:
   ```bash
   PCLOUD_CLIENT_ID="your_pcloud_client_id"
   PCLOUD_CLIENT_SECRET="your_pcloud_client_secret"
   ```

---

## 4. Provider Authentication Matrix

MountYourClouds strictly distinguishes between true OAuth 2.0 platforms and credentials-based protocols:

| Provider | Authentication Standard | Implementation in MountYourClouds |
| :--- | :--- | :--- |
| **Google Drive** | OAuth 2.0 PKCE | Authorization Code flow, encrypted refresh tokens |
| **OneDrive** | OAuth 2.0 PKCE | Microsoft Graph API v1.0, delegated scopes |
| **Dropbox** | OAuth 2.0 PKCE | Dropbox API v2, `token_access_type=offline` |
| **Box** | OAuth 2.0 | Box Content Cloud OAuth 2.0 |
| **pCloud** | OAuth 2.0 | pCloud Public OAuth API |
| **AWS S3 / R2 / B2** | AWS Signature Version 4 | Access Key ID & Secret Access Key |
| **Nextcloud / WebDAV** | HTTP Basic / App Passwords | RFC 4918 WebDAV standard authentication |
| **MEGA / Proton / TeraBox** | Client-side proprietary / simulated | Local sandboxed encryption; not falsely labeled as OAuth |

---

## 5. Deployment Checklist

- [x] Generate 256-bit AES-256-GCM encryption key (`openssl rand -hex 32`) and assign to `OAUTH_ENCRYPTION_KEY`.
- [x] Generate HMAC signing key (`openssl rand -base64 32`) and assign to `SESSION_SECRET`.
- [x] Configure production `APP_URL` matching your HTTPS domain.
- [x] Register OAuth redirect URLs in Google, Microsoft, and Dropbox dashboards.
- [x] Ensure server data directory (`.data/`) has write permissions and is included in backup rotations.
- [x] Run full test suite: `npm test`.
- [x] Run typecheck and production build: `npm run build`.
