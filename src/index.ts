import { handleMCPCall, MCPRequest } from './mcp-server';
import { GoogleAccountConfig } from './google-drive';

export interface Env {
  GOOGLE_ACCOUNTS_JSON?: string;
  // Fallback environment variables if JSON config isn't used
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN_PERSONAL?: string;
  GOOGLE_REFRESH_TOKEN_WORK?: string;
  GOOGLE_REFRESH_TOKEN_LADYK?: string;
  GOOGLE_REFRESH_TOKEN_DOUBLEDOPPLER?: string;
}

function parseAccounts(env: Env): GoogleAccountConfig[] {
  if (env.GOOGLE_ACCOUNTS_JSON) {
    try {
      return JSON.parse(env.GOOGLE_ACCOUNTS_JSON);
    } catch (e) {
      console.error('Failed to parse GOOGLE_ACCOUNTS_JSON:', e);
    }
  }

  // Fallback: Construct accounts from individual env vars if present
  const clientId = env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || '';

  const accounts: GoogleAccountConfig[] = [];

  if (env.GOOGLE_REFRESH_TOKEN_PERSONAL) {
    accounts.push({
      name: 'Personal',
      email: 'kavia.shirkoohi@gmail.com',
      clientId,
      clientSecret,
      refreshToken: env.GOOGLE_REFRESH_TOKEN_PERSONAL,
    });
  }

  if (env.GOOGLE_REFRESH_TOKEN_WORK) {
    accounts.push({
      name: 'Work',
      email: 'krshirkoohi@gmail.com',
      clientId,
      clientSecret,
      refreshToken: env.GOOGLE_REFRESH_TOKEN_WORK,
    });
  }

  if (env.GOOGLE_REFRESH_TOKEN_DOUBLEDOPPLER) {
    accounts.push({
      name: 'Double Doppler',
      email: 'doubledoppleryt@gmail.com',
      clientId,
      clientSecret,
      refreshToken: env.GOOGLE_REFRESH_TOKEN_DOUBLEDOPPLER,
    });
  }

  if (env.GOOGLE_REFRESH_TOKEN_LADYK) {
    accounts.push({
      name: 'Lady K',
      email: 'ladythedoll@gmail.com',
      clientId,
      clientSecret,
      refreshToken: env.GOOGLE_REFRESH_TOKEN_LADYK,
    });
  }

  return accounts;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for browser/Notion clients
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const accounts = parseAccounts(env);

    // GET /status or GET / - Health & Info
    if ((url.pathname === '/' || url.pathname === '/status') && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          name: 'gdrive-multi-account-mcp',
          connectedAccounts: accounts.map((a) => ({ name: a.name, email: a.email })),
          sseEndpoint: `${url.origin}/sse`,
          mcpPostEndpoint: `${url.origin}/mcp`,
        }, null, 2),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // POST /mcp or POST / - MCP JSON-RPC protocol endpoint
    if (request.method === 'POST' && (url.pathname === '/mcp' || url.pathname === '/')) {
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

    // GET /sse - Server-Sent Events endpoint for MCP stream transport
    if (request.method === 'GET' && url.pathname === '/sse') {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          // Send initial endpoint event as per MCP SSE spec
          const postEndpoint = `${url.origin}/mcp`;
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${postEndpoint}\n\n`));

          // Keep-alive heartbeat ping every 15 seconds
          const interval = setInterval(() => {
            controller.enqueue(encoder.encode(`: ping\n\n`));
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
