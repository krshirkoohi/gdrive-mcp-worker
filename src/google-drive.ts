export interface GoogleAccountConfig {
  name: string; // e.g. "Personal", "Work", "Lady K", "Double Doppler"
  email: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface DriveFileResult {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  accountName: string;
  accountEmail: string;
  snippet?: string;
}

export interface DriveFileContent {
  id: string;
  name: string;
  mimeType: string;
  accountName: string;
  accountEmail: string;
  content: string;
}

/**
 * Gets a fresh access token for a given Google Account using its OAuth refresh token.
 */
async function getAccessToken(config: GoogleAccountConfig): Promise<string> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh access token for ${config.email}: ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Searches files across a single Google Drive account.
 */
async function searchSingleAccount(
  config: GoogleAccountConfig,
  query: string,
  pageSize: number = 10
): Promise<DriveFileResult[]> {
  try {
    const accessToken = await getAccessToken(config);

    const trimmed = query.trim();
    const safeQuery = trimmed.replace(/'/g, "\\'");
    const qParam = trimmed
      ? `(name contains '${safeQuery}' or fullText contains '${safeQuery}') and trashed = false`
      : `trashed = false`;

    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.set('q', qParam);
    searchUrl.searchParams.set('pageSize', pageSize.toString());
    searchUrl.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, webViewLink, description)');
    searchUrl.searchParams.set('orderBy', 'modifiedTime desc');

    const response = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`Error searching Drive for ${config.email}:`, await response.text());
      return [];
    }

    const data = (await response.json()) as { files?: any[] };
    const files = data.files || [];

    return files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
      accountName: config.name,
      accountEmail: config.email,
      snippet: file.description || '',
    }));
  } catch (err) {
    console.error(`Failed searching account ${config.email}:`, err);
    return [];
  }
}

/**
 * Searches across ALL configured Google Drive accounts concurrently.
 */
export async function searchAllAccounts(
  accounts: GoogleAccountConfig[],
  query: string,
  pageSize: number = 10
): Promise<DriveFileResult[]> {
  const promises = accounts.map((acc) => searchSingleAccount(acc, query, pageSize));
  const resultsArray = await Promise.all(promises);

  const combined = resultsArray.flat();
  combined.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
  return combined;
}

/**
 * Lists recently modified files across connected accounts, optionally filtered by account.
 */
export async function listRecentFiles(
  accounts: GoogleAccountConfig[],
  accountFilter?: string,
  pageSize: number = 15
): Promise<DriveFileResult[]> {
  const targetAccounts = accountFilter
    ? accounts.filter(
        (a) =>
          a.email.toLowerCase().includes(accountFilter.toLowerCase()) ||
          a.name.toLowerCase().includes(accountFilter.toLowerCase())
      )
    : accounts;

  const promises = targetAccounts.map((acc) => searchSingleAccount(acc, '', pageSize));
  const resultsArray = await Promise.all(promises);

  const combined = resultsArray.flat();
  combined.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
  return combined.slice(0, pageSize);
}

/**
 * Reads and extracts content from a specific Google Drive file.
 */
export async function readFileContent(
  accounts: GoogleAccountConfig[],
  fileId: string,
  accountEmail?: string
): Promise<DriveFileContent> {
  const targetAccounts = accountEmail
    ? accounts.filter((a) => a.email.toLowerCase() === accountEmail.toLowerCase())
    : accounts;

  if (targetAccounts.length === 0) {
    throw new Error(`Account email '${accountEmail}' not found in configuration.`);
  }

  let lastError: Error | null = null;

  for (const acc of targetAccounts) {
    try {
      const accessToken = await getAccessToken(acc);

      const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`;
      const metaRes = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!metaRes.ok) {
        continue;
      }

      const meta = (await metaRes.json()) as { id: string; name: string; mimeType: string };

      let contentText = '';

      if (meta.mimeType === 'application/vnd.google-apps.document') {
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        const exportRes = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (exportRes.ok) {
          contentText = await exportRes.text();
        }
      } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
        const exportRes = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (exportRes.ok) {
          contentText = await exportRes.text();
        }
      } else {
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const downloadRes = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (downloadRes.ok) {
          contentText = await downloadRes.text();
        }
      }

      return {
        id: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        accountName: acc.name,
        accountEmail: acc.email,
        content: contentText || '(Empty or binary file)',
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error(`File ID '${fileId}' could not be read from any configured Google account.`);
}
