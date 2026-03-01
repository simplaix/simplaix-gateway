/**
 * Fake External Issuer for Testing Agent Consumer Authentication
 * 
 * This script simulates an external auth system (like your downstream app's auth)
 * that issues JWTs for agent consumers.
 * 
 * Usage:
 *   # Start the fake issuer server
 *   node scripts/fake-external-issuer.js server
 * 
 *   # Or just generate a token
 *   node scripts/fake-external-issuer.js token
 * 
 *   # Test calling an agent with the token
 *   node scripts/fake-external-issuer.js test-agent <agent-id>
 * 
 * Configuration:
 *   Add this to your gateway's .env file:
 *   JWT_EXTERNAL_ISSUERS='[{"issuer":"https://fake-auth.example.com","secret":"fake-external-secret-12345","audience":"simplaix-gateway"}]'
 */

import * as jose from 'jose';
import { createServer } from 'http';

// ============================================
// Configuration - MUST MATCH GATEWAY CONFIG
// ============================================
const EXTERNAL_ISSUER = 'https://fake-auth.example.com';
const EXTERNAL_SECRET = 'fake-external-secret-12345';
const AUDIENCE = 'simplaix-gateway';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

// ============================================
// Token Generation
// ============================================

/**
 * Issue a JWT for an agent consumer
 */
async function issueConsumerToken(userId, email, customClaims = {}) {
  const secret = new TextEncoder().encode(EXTERNAL_SECRET);
  
  const payload = {
    sub: userId,
    email: email,
    // You can add any custom claims your app needs
    ...customClaims,
  };

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(EXTERNAL_ISSUER)
    .setAudience(AUDIENCE)
    .sign(secret);

  return token;
}

/**
 * Generate sample tokens for different user types
 */
async function generateSampleTokens() {
  console.log('\n=== Sample Consumer Tokens ===\n');
  
  // Regular user
  const userToken = await issueConsumerToken(
    'user-123',
    'john.doe@company.com',
    { name: 'John Doe', department: 'Engineering' }
  );
  console.log('Regular User Token:');
  console.log(userToken);
  console.log('\nDecoded payload:', jose.decodeJwt(userToken));
  
  console.log('\n---\n');
  
  // Service account
  const serviceToken = await issueConsumerToken(
    'service-api-backend',
    'api@internal.company.com',
    { type: 'service_account', permissions: ['agent:invoke'] }
  );
  console.log('Service Account Token:');
  console.log(serviceToken);
  console.log('\nDecoded payload:', jose.decodeJwt(serviceToken));
  
  return { userToken, serviceToken };
}

// ============================================
// Fake Auth Server
// ============================================

function startServer(port = 9000) {
  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    // Token endpoint - simulates login
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { user_id, email, ...claims } = JSON.parse(body);
          
          if (!user_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'user_id is required' }));
            return;
          }

          const token = await issueConsumerToken(user_id, email || `${user_id}@example.com`, claims);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: token,
            token_type: 'Bearer',
            expires_in: 3600,
            issuer: EXTERNAL_ISSUER,
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Well-known endpoint (for OIDC discovery)
    if (url.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        issuer: EXTERNAL_ISSUER,
        token_endpoint: `http://localhost:${port}/token`,
        // Note: This fake issuer uses shared secret, not JWKS
      }));
      return;
    }

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', issuer: EXTERNAL_ISSUER }));
      return;
    }

    // Default: show usage
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Fake External Auth Server',
      issuer: EXTERNAL_ISSUER,
      endpoints: {
        token: 'POST /token - Get a token (body: { user_id, email?, ...claims })',
        health: 'GET /health',
        discovery: 'GET /.well-known/openid-configuration',
      },
      gateway_config: `Add to gateway .env:\nJWT_EXTERNAL_ISSUERS='[{"issuer":"${EXTERNAL_ISSUER}","secret":"${EXTERNAL_SECRET}","audience":"${AUDIENCE}"}]'`,
    }));
  });

  server.listen(port, () => {
    console.log(`\n🔐 Fake External Auth Server running at http://localhost:${port}`);
    console.log(`   Issuer: ${EXTERNAL_ISSUER}`);
    console.log(`\nEndpoints:`);
    console.log(`   POST /token - Get a consumer token`);
    console.log(`   GET /health - Health check`);
    console.log(`\nExample:`);
    console.log(`   curl -X POST http://localhost:${port}/token \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"user_id":"user-123","email":"user@example.com"}'`);
    console.log(`\n⚠️  Make sure your gateway .env has:`);
    console.log(`   JWT_EXTERNAL_ISSUERS='[{"issuer":"${EXTERNAL_ISSUER}","secret":"${EXTERNAL_SECRET}","audience":"${AUDIENCE}"}]'`);
  });

  return server;
}

// ============================================
// Test Agent Call
// ============================================

/**
 * Generate a unique ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Build an AG-UI compatible request payload for Strands agents
 * 
 * AG-UI RunAgentInput format:
 * - threadId: ID of the conversation thread
 * - runId: ID of the current run
 * - state: Current state of the agent
 * - messages: Array of messages in the conversation
 * - tools: Array of tools available to the agent
 * - context: Array of context objects
 * - forwardedProps: Additional properties
 */
function buildAgUiPayload(userMessage, state = {}) {
  return {
    threadId: `thread-${generateId()}`,
    runId: `run-${generateId()}`,
    state: state,
    messages: [
      {
        id: `msg-${generateId()}`,
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString(),
      }
    ],
    tools: [], // Empty - agent provides its own tools
    context: [],
    forwardedProps: {},
  };
}

async function testAgentCall(agentId, skToken) {
  console.log('\n=== Testing Agent Call (AG-UI/Strands Format) ===\n');

  if (!agentId) {
    console.log('Usage: node scripts/fake-external-issuer.js test-agent <agent-id> [sk_token]');
    console.log('\nYou need:');
    console.log('  1. An agent ID from the gateway');
    console.log('  2. (Optional) An sk_ token for the agent');
    console.log('\nThis test will use an external consumer JWT to call the agent.');
    return;
  }

  // Generate a consumer token
  const consumerToken = await issueConsumerToken(
    'test-consumer-user',
    'consumer@downstream-app.com',
    { app: 'test-client' }
  );

  console.log('Consumer Token:');
  console.log(consumerToken.substring(0, 60) + '...');
  console.log('\nDecoded:', jose.decodeJwt(consumerToken));

  // Build AG-UI payload
  const payload = buildAgUiPayload('list all agents');
  console.log('\nAG-UI Payload:');
  console.log(JSON.stringify(payload, null, 2));

  // Test 1: Try to invoke agent with consumer JWT
  console.log('\n--- Test 1: Invoke agent with consumer JWT ---');
  
  try {
    const response = await fetch(`${GATEWAY_URL}/api/v1/agents/${agentId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${consumerToken}`,
      },
      body: JSON.stringify(payload),
    });

    // AG-UI responses are streamed as SSE, but we might get JSON error
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/event-stream')) {
      console.log(`Status: ${response.status} (Streaming response)`);
      console.log('Reading stream...\n');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('\n[Stream Complete]');
            } else {
              try {
                const event = JSON.parse(data);
                console.log('Event:', JSON.stringify(event, null, 2));
              } catch {
                console.log('Data:', data);
              }
            }
          } else if (line.startsWith('event: ')) {
            console.log(`\n[${line.slice(7)}]`);
          }
        }
      }
    } else {
      const data = await response.json();
      console.log(`Status: ${response.status}`);
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Test 2: If sk_token provided, test with that
  // if (skToken) {
  //   console.log('\n--- Test 2: Invoke agent with sk_ token ---');
    
  //   const payload2 = buildAgUiPayload('What agents are available?');
    
  //   try {
  //     const response = await fetch(`${GATEWAY_URL}/api/v1/agents/${agentId}/invoke`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': `Bearer ${skToken}`,
  //         // Pass end-user context via headers
  //         'X-End-User-ID': 'consumer-user-456',
  //         'X-End-User-Roles': 'user,premium',
  //       },
  //       body: JSON.stringify(payload2),
  //     });

  //     const contentType = response.headers.get('content-type') || '';
      
  //     if (contentType.includes('text/event-stream')) {
  //       console.log(`Status: ${response.status} (Streaming)`);
  //       // Just read first few events for demo
  //       const reader = response.body.getReader();
  //       const decoder = new TextDecoder();
  //       let count = 0;
        
  //       while (count < 5) {
  //         const { done, value } = await reader.read();
  //         if (done) break;
  //         console.log(decoder.decode(value));
  //         count++;
  //       }
  //       reader.cancel();
  //       console.log('...(truncated)');
  //     } else {
  //       const data = await response.json();
  //       console.log(`Status: ${response.status}`);
  //       console.log('Response:', JSON.stringify(data, null, 2));
  //     }
  //   } catch (e) {
  //     console.log('Error:', e.message);
  //   }
  // }

  // Test 3: Try admin endpoint (should fail for consumer)
  console.log('\n--- Test 3: Try admin endpoint with consumer JWT (should fail) ---');
  
  try {
    const response = await fetch(`${GATEWAY_URL}/api/v1/admin/agents`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${consumerToken}`,
      },
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.status === 403) {
      console.log('✓ Correctly denied - consumers cannot access admin endpoints');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

// ============================================
// CLI
// ============================================

async function main() {
  const command = process.argv[2] || 'help';

  switch (command) {
    case 'server':
      const port = parseInt(process.argv[3] || '9000');
      startServer(port);
      break;

    case 'token':
      const userId = process.argv[3] || 'test-user';
      const email = process.argv[4] || `${userId}@example.com`;
      const token = await issueConsumerToken(userId, email);
      console.log('\nGenerated Consumer Token:');
      console.log(token);
      console.log('\nDecoded payload:', jose.decodeJwt(token));
      console.log('\nUse this token to call agents:');
      console.log(`curl -X POST ${GATEWAY_URL}/api/v1/agents/<agent-id>/invoke \\`);
      console.log(`  -H "Authorization: Bearer ${token.substring(0, 30)}..." \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"method":"tools/list"}'`);
      break;

    case 'tokens':
      await generateSampleTokens();
      break;

    case 'test-agent':
      const agentId = process.argv[3];
      const skToken = process.argv[4];
      await testAgentCall(agentId, skToken);
      break;

    case 'config':
      console.log('\n=== Gateway Configuration ===\n');
      console.log('Add this to your gateway .env file:\n');
      console.log(`JWT_EXTERNAL_ISSUERS='[{"issuer":"${EXTERNAL_ISSUER}","secret":"${EXTERNAL_SECRET}","audience":"${AUDIENCE}"}]'`);
      console.log('\nThis allows the gateway to validate tokens issued by this fake auth server.');
      break;

    default:
      console.log(`
Fake External Issuer - Test Agent Consumer Authentication

Commands:
  server [port]              Start the fake auth server (default: 9000)
  token [user_id] [email]    Generate a single consumer token
  tokens                     Generate sample tokens
  test-agent <id> [sk]       Test calling an agent
  config                     Show gateway configuration

Setup:
  1. Run: node scripts/fake-external-issuer.js config
  2. Add the config to your gateway .env file
  3. Restart the gateway
  4. Generate a token: node scripts/fake-external-issuer.js token
  5. Use the token to call an agent

Example Flow:
  # Terminal 1: Start gateway
  pnpm dev

  # Terminal 2: Generate token and test
  node scripts/fake-external-issuer.js token my-user
  # Copy the token, then:
  curl -X POST http://localhost:3000/api/v1/agents/<agent-id>/invoke \\
    -H "Authorization: Bearer <token>" \\
    -H "Content-Type: application/json" \\
    -d '{"method":"tools/list"}'
`);
  }
}

main().catch(console.error);
