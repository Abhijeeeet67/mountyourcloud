export interface OAuthProviderDefinition {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  userinfoUrl: string;
  defaultScopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  usePkce: boolean;
  extraAuthParams?: Record<string, string>;
  extractProfile: (data: any) => { id: string; email?: string; displayName: string; avatarUrl?: string };
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderDefinition> = {
  gdrive: {
    id: 'gdrive',
    name: 'Google Drive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userinfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    defaultScopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    clientIdEnv: 'GOOGLE_DRIVE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_DRIVE_CLIENT_SECRET',
    usePkce: true,
    extraAuthParams: {
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
    },
    extractProfile: (data) => ({
      id: data.sub || data.id,
      email: data.email,
      displayName: data.name || data.email || 'Google User',
      avatarUrl: data.picture,
    }),
  },

  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoUrl: 'https://graph.microsoft.com/v1.0/me',
    defaultScopes: ['Files.ReadWrite', 'offline_access', 'User.Read'],
    clientIdEnv: 'MICROSOFT_ONEDRIVE_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_ONEDRIVE_CLIENT_SECRET',
    usePkce: true,
    extraAuthParams: {
      prompt: 'select_account',
    },
    extractProfile: (data) => ({
      id: data.id,
      email: data.mail || data.userPrincipalName,
      displayName: data.displayName || data.userPrincipalName || 'Microsoft User',
    }),
  },

  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    revokeUrl: 'https://api.dropboxapi.com/2/auth/token/revoke',
    userinfoUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
    defaultScopes: [
      'files.metadata.read',
      'files.content.read',
      'files.content.write',
      'account_info.read',
    ],
    clientIdEnv: 'DROPBOX_CLIENT_ID',
    clientSecretEnv: 'DROPBOX_CLIENT_SECRET',
    usePkce: true,
    extraAuthParams: {
      token_access_type: 'offline',
    },
    extractProfile: (data) => ({
      id: data.account_id,
      email: data.email,
      displayName: data.name?.display_name || data.email || 'Dropbox User',
      avatarUrl: data.profile_photo_url,
    }),
  },

  box: {
    id: 'box',
    name: 'Box',
    authUrl: 'https://account.box.com/api/oauth2/authorize',
    tokenUrl: 'https://api.box.com/oauth2/token',
    revokeUrl: 'https://api.box.com/oauth2/revoke',
    userinfoUrl: 'https://api.box.com/2.0/users/me',
    defaultScopes: ['root_readwrite'],
    clientIdEnv: 'BOX_CLIENT_ID',
    clientSecretEnv: 'BOX_CLIENT_SECRET',
    usePkce: true,
    extractProfile: (data) => ({
      id: data.id,
      email: data.login,
      displayName: data.name || data.login || 'Box User',
      avatarUrl: data.avatar_url,
    }),
  },

  pcloud: {
    id: 'pcloud',
    name: 'pCloud',
    authUrl: 'https://my.pcloud.com/oauth2/authorize',
    tokenUrl: 'https://api.pcloud.com/oauth2_token',
    userinfoUrl: 'https://api.pcloud.com/userinfo',
    defaultScopes: [],
    clientIdEnv: 'PCLOUD_CLIENT_ID',
    clientSecretEnv: 'PCLOUD_CLIENT_SECRET',
    usePkce: false,
    extractProfile: (data) => ({
      id: String(data.userid),
      email: data.email,
      displayName: data.email || 'pCloud User',
    }),
  },
};

export function getOAuthProvider(providerId: string): OAuthProviderDefinition | null {
  return OAUTH_PROVIDERS[providerId] || null;
}
