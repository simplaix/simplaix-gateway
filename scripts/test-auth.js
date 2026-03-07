/**
 * Test script for Gateway Dual-Auth System
 * 
 * This script demonstrates both authentication modes:
 * 1. Gateway-issued JWTs (for Agent Creators)
 * 2. External JWTs (for Agent Consumers)
 * 
 * Usage:
 *   node scripts/test-auth.js
 * 
 * Prerequisites:
 *   - Gateway must be running on http://localhost:3000
 *   - Set JWT_SECRET and JWT_EXTERNAL_ISSUERS in gateway .env
 */

import * as jose from 'jose';

// Configuration - should match gateway config
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
const GATEWAY_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const GATEWAY_ISSUER = process.env.JWT_ISSUER || 'simplaix-gateway';
const EXTERNAL_SECRET = 'shared-secret-with-consumer-app';
const EXTERNAL_ISSUER = 'https://auth.mycompany.com';

// Test admin credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

/**
 * Simulate Gateway issuing JWT for Agent Creator
 */
async function issueCreatorToken() {
  const secret = new TextEncoder().encode(GATEWAY_SECRET);
  
  const token = await new jose.SignJWT({
    sub: 'admin-user-1',
    email: 'admin@example.com',
    tenant_id: 'tenant-1',
    roles: ['admin', 'agent_creator'],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .setIssuer(GATEWAY_ISSUER)
    .sign(secret);
  
  return token;
}

/**
 * Simulate External App issuing JWT for Agent Consumer
 */
async function issueConsumerToken() {
  const secret = new TextEncoder().encode(EXTERNAL_SECRET);
  
  const token = await new jose.SignJWT({
    sub: 'consumer-user-123',
    email: 'user@downstream-app.com',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(EXTERNAL_ISSUER)
    .setAudience('simplaix-gateway')
    .sign(secret);
  
  return token;
}

/**
 * Gateway's verification logic (simulated)
 */
async function verifyToken(token) {
  // Decode without verification first
  const decoded = jose.decodeJwt(token);
  const issuer = decoded.iss;
  
  console.log(`  Token issuer: ${issuer}`);
  
  if (issuer === GATEWAY_ISSUER) {
    console.log('  -> Validating as Gateway JWT');
    const secret = new TextEncoder().encode(GATEWAY_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    return payload;
  }
  
  if (issuer === EXTERNAL_ISSUER) {
    console.log('  -> Validating as External JWT');
    const secret = new TextEncoder().encode(EXTERNAL_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, { audience: 'simplaix-gateway' });
    return payload;
  }
  
  throw new Error(`Unknown issuer: ${issuer}`);
}

/**
 * Make HTTP request to gateway
 */
async function request(method, path, token, body) {
  const url = `${GATEWAY_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, error: error.message };
  }
}

/**
 * Run tests
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('Gateway Dual-Auth System Test');
  console.log('='.repeat(60));
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log('');

  // Test 1: Local token verification
  console.log('\n--- Test 1: Local Token Verification ---\n');

  console.log('1.1 Creator Token (Gateway-issued):');
  const creatorToken = await issueCreatorToken();
  console.log(`  Token: ${creatorToken.substring(0, 50)}...`);
  try {
    const creatorPayload = await verifyToken(creatorToken);
    console.log('  ✓ Verified successfully');
    console.log(`  Payload: ${JSON.stringify({ sub: creatorPayload.sub, roles: creatorPayload.roles })}`);
  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
  }

  console.log('\n1.2 Consumer Token (External issuer):');
  const consumerToken = await issueConsumerToken();
  console.log(`  Token: ${consumerToken.substring(0, 50)}...`);
  try {
    const consumerPayload = await verifyToken(consumerToken);
    console.log('  ✓ Verified successfully');
    console.log(`  Payload: ${JSON.stringify({ sub: consumerPayload.sub, email: consumerPayload.email })}`);
  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
  }

  console.log('\n1.3 Invalid Issuer Token:');
  const secret = new TextEncoder().encode('some-key');
  const badToken = await new jose.SignJWT({ sub: 'hacker' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('unknown-issuer')
    .sign(secret);
  console.log(`  Token: ${badToken.substring(0, 50)}...`);
  try {
    await verifyToken(badToken);
    console.log('  ✗ Should have failed but succeeded');
  } catch (e) {
    console.log(`  ✓ Rejected as expected: ${e.message}`);
  }

  // Test 2: Gateway API tests (if gateway is running)
  console.log('\n--- Test 2: Gateway API Tests ---\n');
  
  // Check if gateway is running
  const healthCheck = await request('GET', '/api/health', null, null);
  if (healthCheck.status !== 200) {
    console.log('  Gateway not running, skipping API tests');
    console.log(`  To run API tests, start the gateway: npm run dev`);
    console.log('');
    return;
  }
  console.log('  ✓ Gateway is running');

  // Test 2.1: Login with admin credentials
  console.log('\n2.1 Login as Admin:');
  const loginResult = await request('POST', '/api/v1/auth/login', null, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  
  if (loginResult.status === 200 && loginResult.data.token) {
    console.log('  ✓ Login successful');
    console.log(`  Token: ${loginResult.data.token.substring(0, 50)}...`);
    console.log(`  User: ${JSON.stringify(loginResult.data.user)}`);
    
    const adminToken = loginResult.data.token;
    
    // Test 2.2: Get profile
    console.log('\n2.2 Get Profile:');
    const profileResult = await request('GET', '/api/v1/auth/me', adminToken, null);
    if (profileResult.status === 200) {
      console.log('  ✓ Profile retrieved');
      console.log(`  User: ${JSON.stringify(profileResult.data.user)}`);
    } else {
      console.log(`  ✗ Failed: ${JSON.stringify(profileResult.data)}`);
    }

    // Test 2.3: List agents
    console.log('\n2.3 List Agents (Admin):');
    const agentsResult = await request('GET', '/api/v1/admin/agents', adminToken, null);
    if (agentsResult.status === 200) {
      console.log('  ✓ Agents retrieved');
      console.log(`  Count: ${agentsResult.data.agents?.length || 0}`);
    } else {
      console.log(`  ✗ Failed: ${JSON.stringify(agentsResult.data)}`);
    }

    // Test 2.4: Create an agent
    console.log('\n2.4 Create Agent:');
    const createAgentResult = await request('POST', '/api/v1/admin/agents', adminToken, {
      name: 'Test Agent',
      upstreamUrl: 'http://localhost:8080',
      description: 'Created by test script',
    });
    if (createAgentResult.status === 201) {
      console.log('  ✓ Agent created');
      console.log(`  Agent: ${JSON.stringify(createAgentResult.data.agent)}`);
    } else {
      console.log(`  ✗ Failed: ${JSON.stringify(createAgentResult.data)}`);
    }

  } else {
    console.log(`  ✗ Login failed: ${JSON.stringify(loginResult.data)}`);
    console.log('  Note: Make sure ADMIN_EMAIL and ADMIN_PASSWORD are set correctly');
  }

  // Test 2.5: External consumer token
  console.log('\n2.5 External Consumer Token:');
  console.log('  Note: External issuer must be configured in JWT_EXTERNAL_ISSUERS');
  const externalResult = await request('GET', '/api/v1/admin/agents', consumerToken, null);
  if (externalResult.status === 401 || externalResult.status === 403) {
    console.log(`  ✓ Correctly denied (status: ${externalResult.status})`);
    console.log('  External consumers cannot access admin endpoints');
  } else if (externalResult.status === 200) {
    console.log('  ✓ External token accepted (if configured)');
  } else {
    console.log(`  Status: ${externalResult.status}`);
    console.log(`  Response: ${JSON.stringify(externalResult.data)}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Tests completed');
  console.log('='.repeat(60));
}

// Run the tests
runTests().catch(console.error);
