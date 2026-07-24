import { searchAllAccounts, readFileContent, GoogleAccountConfig } from './google-drive';

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
      properties: {},
    },
  },
];

export async function handleMCPCall(
  request: MCPRequest,
  accounts: GoogleAccountConfig[]
): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    // MCP Protocol Handler
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'gdrive-multi-account-mcp',
              version: '1.0.0',
            },
          },
        };

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
        const args = params?.arguments || {};

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
          const accList = accounts
            .map((a) => `• **${a.name}**: ${a.email}`)
            .join('\n');
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Connected Google Accounts (${accounts.length}):\n${accList}`,
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
