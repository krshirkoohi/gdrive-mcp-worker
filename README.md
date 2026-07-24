# Multi-Account Google Drive MCP Server (`gdrive-mcp-worker`)

An open-source, serverless **Model Context Protocol (MCP)** server built for **Cloudflare Workers**. Connects multiple Google Drive accounts (e.g. Personal, Work, Projects) to AI platforms like **Notion AI**, Claude, or custom MCP clients.

Each file search result is automatically annotated with its corresponding **Notion Area / Account name** (e.g. `Personal`, `Work`, `Lady K`, `Double Doppler`), giving AI agents full domain context when synthesizing knowledge across multiple drives.

---

## Features

- 🌐 **Cloudflare Workers Native**: Deploy 24/7 on Cloudflare's global edge network (Free tier includes 100,000 requests/day).
- 🗂️ **Multi-Account Combined Search**: Search across multiple Google Drive accounts simultaneously in parallel.
- 🏷️ **Area Metadata Tagging**: Maps search results directly to your designated Notion Areas or domain categories.
- ⚡ **Dual MCP Transport**: Supports both **SSE (Server-Sent Events)** streaming (`/sse`) and HTTP JSON-RPC (`/mcp`).
- 📄 **Doc & Sheet Export**: Exports Google Docs as plain text and Google Sheets as CSV for instant AI document ingestion.

---

## MCP Tools Provided

| Tool Name | Description |
| :--- | :--- |
| `gdrive_search` | Searches files across all connected Google Drive accounts, returning tagged Area metadata. |
| `gdrive_read_file` | Fetches the full text content of a Google Drive file by ID. |
| `gdrive_list_accounts` | Lists all connected Google accounts and their assigned Area names. |

---

## Configuration & Environment Setup

### 1. Create Google OAuth 2.0 Credentials
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Drive API**.
3. Create an **OAuth 2.0 Client ID** (Web application or Desktop application type).
4. Obtain your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 2. Generate Refresh Tokens
For each Google account you wish to connect, generate a refresh token with scope:
`https://www.googleapis.com/auth/drive.readonly`

### 3. Set Worker Secrets via Wrangler

You can pass configuration via `GOOGLE_ACCOUNTS_JSON` or environment variables:

```bash
wrangler secret put GOOGLE_ACCOUNTS_JSON
```

Format of `GOOGLE_ACCOUNTS_JSON`:
```json
[
  {
    "name": "Personal",
    "email": "kavia.shirkoohi@gmail.com",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "refreshToken": "YOUR_REFRESH_TOKEN"
  },
  {
    "name": "Work",
    "email": "krshirkoohi@gmail.com",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }
]
```

---

## Local Development & Deployment

### Install Dependencies
```bash
npm install
```

### Run Locally
```bash
npm run dev
```

### Deploy to Cloudflare Workers
```bash
npm run deploy
```

Once deployed, your MCP server will be live at:
`https://gdrive-mcp-worker.<your-subdomain>.workers.dev/sse`

---

## Connecting to Notion AI

1. Open **Notion** $\rightarrow$ **Settings & Members** $\rightarrow$ **Connections**.
2. Click **Add Custom MCP Server** (Beta).
3. Paste your deployed SSE URL:
   `https://gdrive-mcp-worker.<your-subdomain>.workers.dev/sse`
4. Click **Connect**. Notion AI can now query all your Google Drive accounts natively!

---

## License
MIT License
