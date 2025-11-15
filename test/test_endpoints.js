const axios = require('axios');

// --- CONFIGURATION ---
const BASE_URL = 'http://localhost:5000'; // Your server's URL
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASS = 'admin123';
const USER_EMAIL = 'user@test.com';
const USER_PASS = 'user123';
// --- END CONFIGURATION ---

// Helper to create a configured axios instance
const api = axios.create({
  baseURL: BASE_URL,
  validateStatus: (status) => status < 500, // Don't throw errors on 4xx
});

// Helper to log test results
const log = (name, data) => {
  console.log(`\n--- ${name} ---`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// This object will store tokens and IDs as we get them
const state = {
  adminToken: null,
  userToken: null,
  productApiKey: null, // The key for the /v1/try-on endpoint
  seededUserId: null,
  newPlanId: null,
  newGeminiKeyId: null,
  newUserApiKeyId: null,
};

async function main() {
  try {
    // --- 1. Health Check (Public) ---
    log('TEST: GET /v1/health (Public)');
    let res = await api.get('/v1/health');
    log('RESULT: /v1/health', { status: res.status, data: res.data });

    // --- 2. Auth Routes (Public) ---
    log('TEST: POST /auth/register (Public)');
    res = await api.post('/auth/register', {
      name: 'New User',
      username: 'newuser99',
      email: 'newuser99@test.com',
      password: 'password123',
    });
    log('RESULT: /auth/register', { status: res.status, data: res.data });
    const newUserId = res.data.user?.id;

    log('TEST: POST /auth/login (Admin)');
    res = await api.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    state.adminToken = res.data.token;
    log('RESULT: /auth/login (Admin)', { status: res.status, data: res.data.message });

    log('TEST: POST /auth/login (User)');
    res = await api.post('/auth/login', { email: USER_EMAIL, password: USER_PASS });
    state.userToken = res.data.token;
    state.seededUserId = res.data.user.id;
    log('RESULT: /auth/login (User)', { status: res.status, data: res.data.message });

    // --- 3. Admin Routes (Admin Auth) ---
    const adminAuth = { headers: { Authorization: `Bearer ${state.adminToken}` } };

    log('TEST: GET /api/admin/users (Admin)');
    res = await api.get('/api/admin/users', adminAuth);
    log('RESULT: /api/admin/users', { status: res.status, count: res.data.length });

    log('TEST: GET /api/admin/users/:id (Admin)');
    res = await api.get(`/api/admin/users/${state.seededUserId}`, adminAuth);
    log('RESULT: /api/admin/users/:id', { status: res.status, email: res.data.email });

    log('TEST: PATCH /api/admin/users/:id/status (Admin)');
    res = await api.patch(`/api/admin/users/${newUserId}/status`, { status: 'active' }, adminAuth);
    log('RESULT: /api/admin/users/:id/status', { status: res.status, data: res.data });

    log('TEST: GET /api/admin/subscription (Admin)');
    res = await api.get('/api/admin/subscription', adminAuth);
    log('RESULT: /api/admin/subscription', { status: res.status, count: res.data.length });

    log('TEST: POST /api/admin/subscription (Admin)');
    res = await api.post('/api/admin/subscription', {
      name: 'Pro Plan',
      planProviderId: 'pro_plan_20',
      priceCents: 2000,
      billingCycle: 'monthly',
      requestLimitMonthly: 2000,
      rateLimitPerMinute: 60,
    }, adminAuth);
    state.newPlanId = res.data.id;
    log('RESULT: /api/admin/subscription', { status: res.status, data: res.data });

    log('TEST: PATCH /api/admin/subscription/:id (Admin)');
    res = await api.patch(`/api/admin/subscription/${state.newPlanId}`, { isPublic: false }, adminAuth);
    log('RESULT: /api/admin/subscription/:id', { status: res.status, data: res.data });

    log('TEST: GET /api/admin/product-api (Admin)');
    res = await api.get('/api/admin/product-api', adminAuth);
    log('RESULT: /api/admin/product-api', { status: res.status, count: res.data.length });

    log('TEST: POST /api/admin/product-api (Admin)');
    res = await api.post('/api/admin/product-api', { key: 'ANOTHER_DUMMY_KEY_67890' }, adminAuth);
    state.newGeminiKeyId = res.data.id;
    log('RESULT: /api/admin/product-api', { status: res.status, data: res.data });

    log('TEST: DELETE /api/admin/product-api/:id (Admin)');
    res = await api.delete(`/api/admin/product-api/${state.newGeminiKeyId}`, adminAuth);
    log('RESULT: /api/admin/product-api/:id', { status: res.status, data: res.data });

    // --- 4. User Account Routes (User Auth) ---
    const userAuth = { headers: { Authorization: `Bearer ${state.userToken}` } };

    log('TEST: GET /api/account/status (User)');
    res = await api.get('/api/account/status', userAuth);
    log('RESULT: /api/account/status', { status: res.status, data: res.data });

    // --- 5. User API Key Routes (User Auth) ---
    log('TEST: POST /api/keys (User)');
    res = await api.post('/api/keys', { name: 'My Test Key' }, userAuth);
    state.productApiKey = res.data.apiKey; // This is the *un-hashed* key
    state.newUserApiKeyId = res.data.keyDetails.id;
    log('RESULT: /api/keys', { status: res.status, data: res.data.message });
    console.log(`*** Stored Product API Key: ${state.productApiKey.substring(0, 12)}... ***`);

    log('TEST: GET /api/keys (User)');
    res = await api.get('/api/keys', userAuth);
    log('RESULT: /api/keys', { status: res.status, count: res.data.length });

    // --- 6. Product API Route (Product API Key Auth) ---
    // NOTE: This test will fail if your DUMMY_GEMINI_API_KEY_12345 is not a real,
    // valid Google AI key. The middleware will work, but the final axios call
    // to Google will fail with a 400 or 403. This is expected.
    // We are testing that our middleware lets the request *through*.
    log('TEST: POST /v1/try-on (Product API Key)');
    const productApiAuth = { headers: { Authorization: `Bearer ${state.productApiKey}` } };
    res = await api.post('/v1/try-on', {
      // Use placeholder URLs as supported by your endpoint
      userImageUrl: 'https://placehold.co/400x600?text=Person',
      productImageUrl: 'https://placehold.co/400x600?text=Shirt',
    }, productApiAuth);
    // A 400 status is a "success" here, it means our API auth worked
    // but the (dummy) Google API key failed, which is correct.
    log('RESULT: /v1/try-on', { status: res.status, data: res.data.error || res.data.message });

    // --- 7. Cleanup (User Auth) ---
    log('TEST: DELETE /api/keys/:id (User)');
    res = await api.delete(`/api/keys/${state.newUserApiKeyId}`, userAuth);
    log('RESULT: /api/keys/:id', { status: res.status, data: res.data });

    console.log('\n--- ALL TESTS COMPLETED ---');

  } catch (error) {
    console.error('\n--- SCRIPT FAILED ---');
    console.error(error.message);
  }
}

main();