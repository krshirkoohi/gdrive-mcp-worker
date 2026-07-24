import { handleMCPCall, MCPRequest } from './mcp-server';
import { GoogleAccountConfig } from './google-drive';

export interface Env {
  GOOGLE_ACCOUNTS_JSON?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

function parseAccounts(env: Env): GoogleAccountConfig[] {
  if (env.GOOGLE_ACCOUNTS_JSON) {
    try {
      return JSON.parse(env.GOOGLE_ACCOUNTS_JSON);
    } catch (e) {
      console.error('Failed to parse GOOGLE_ACCOUNTS_JSON:', e);
    }
  }

  return [];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for browser/Notion clients
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, x-mcp-session-id',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const accounts = parseAccounts(env);

    // Handle ANY POST request (Notion may POST to /sse, /mcp, or /)
    if (request.method === 'POST') {
      try {
        const body = (await request.json()) as MCPRequest;
        const response = await handleMCPCall(body, accounts);
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error: Invalid JSON' },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle GET /status or GET /info
    if (url.pathname === '/status' || url.pathname === '/info') {
      return new Response(
        JSON.stringify(
          {
            status: 'ok',
            name: 'gdrive-multi-account-mcp',
            connectedAccounts: accounts.map((a) => ({ name: a.name, email: a.email })),
            sseEndpoint: `${url.origin}/sse`,
            mcpPostEndpoint: `${url.origin}/mcp`,
          },
          null,
          2
        ),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle GET (SSE streaming for /sse, /, or any endpoint)
    if (request.method === 'GET') {
      const sessionId = crypto.randomUUID();
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const postEndpoint = `${url.origin}/mcp?sessionId=${sessionId}`;
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${postEndpoint}\n\n`));

          const interval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch (e) {
              clearInterval(interval);
            }
          }, 15000);

          request.signal.addEventListener('abort', () => {
            clearInterval(interval);
          });
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
