import { searchAllAccounts, listRecentFiles, readFileContent, GoogleAccountConfig } from './google-drive';

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

const TOOLS_MANIFEST = [
  {
    name: 'gdrive_search',
    description: 'Searches across all connected Google Drive accounts for files matching a query. Results are annotated with their corresponding Area / Account.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords or file title fragments to search for.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return per account (default 5).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'gdrive_list_recent_files',
    description: 'Lists recently modified files across connected Google Drive accounts. Can filter by account name or email (e.g. "Double Doppler", "Personal", "Work", "Lady K").',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Optional account name or email to filter by (e.g. "Double Doppler", "Personal", "Work", "Lady K").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of recent files to return (default 15).',
        },
      },
    },
  },
  {
    name: 'gdrive_read_file',
    description: 'Reads the text content of a specific file from Google Drive using its file ID.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The Google Drive file ID to read.',
        },
        accountEmail: {
          type: 'string',
          description: 'Optional email of the account owning the file to speed up retrieval.',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'gdrive_list_accounts',
    description: 'Lists all connected Google Drive accounts and their associated Notion Area names.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Optional keyword to filter accounts by name or email.',
        },
      },
    },
  },
];

export async function handleMCPCall(
  request: MCPRequest,
  accounts: GoogleAccountConfig[]
): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        const clientVersion = params?.protocolVersion || '2024-11-05';
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: clientVersion,
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'gdrive-multi-account-mcp',
              version: '1.0.0',
            },
          },
        };
      }

      case 'notifications/initialized': {
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };
      }

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS_MANIFEST,
          },
        };

      case 'tools/call': {
        const name = params?.name;
        const args = params?.arguments || params?.toolArguments || {};

        if (name === 'gdrive_search') {
          const query = args.query || '';
          const limit = args.limit || 5;
          const files = await searchAllAccounts(accounts, query, limit);

          const formattedText = files.length > 0
            ? files
                .map(
                  (f) =>
                    `• **${f.name}** [Area: ${f.accountName} (${f.accountEmail})]\n  - ID: \`${f.id}\`\n  - Modified: ${f.modifiedTime}\n  - Type: ${f.mimeType}\n  - Link: ${f.webViewLink || 'N/A'}`
                )
                .join('\n\n')
            : `No files found matching query '${query}' across ${accounts.length} connected Google accounts.`;

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: formattedText }],
            },
          };
        }

        if (name === 'gdrive_list_recent_files') {
          const accountFilter = args.account;
          const limit = args.limit || 15;
          const files = await listRecentFiles(accounts, accountFilter, limit);

          const formattedText = files.length > 0
            ? files
                .map(
                  (f) =>
                    `• **${f.name}** [Area: ${f.accountName} (${f.accountEmail})]\n  - ID: \`${f.id}\`\n  - Modified: ${f.modifiedTime}\n  - Type: ${f.mimeType}\n  - Link: ${f.webViewLink || 'N/A'}`
                )
                .join('\n\n')
            : `No recent files found ${accountFilter ? `for account '${accountFilter}'` : ''}.`;

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: formattedText }],
            },
          };
        }

        if (name === 'gdrive_read_file') {
          const fileId = args.fileId;
          const accountEmail = args.accountEmail;
          const fileData = await readFileContent(accounts, fileId, accountEmail);

          const header = `# ${fileData.name}\n**Area**: ${fileData.accountName} (${fileData.accountEmail})\n**Type**: ${fileData.mimeType}\n\n---\n\n`;

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: header + fileData.content }],
            },
          };
        }

        if (name === 'gdrive_list_accounts') {
          const filterStr = (args.filter || '').toLowerCase();
          const filteredAccounts = filterStr
            ? accounts.filter(
                (a) =>
                  a.name.toLowerCase().includes(filterStr) ||
                  a.email.toLowerCase().includes(filterStr)
              )
            : accounts;

          const accList = filteredAccounts.length > 0
            ? filteredAccounts.map((a) => `• **${a.name}**: ${a.email}`).join('\n')
            : 'No connected accounts matched the filter.';

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Connected Google Accounts (${filteredAccounts.length}):\n${accList}`,
                },
              ],
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool '${name}' not found.` },
        };
      }

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method '${method}' not supported.` },
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: err.message || 'Internal MCP server error' },
    };
  }
}
