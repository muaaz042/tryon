const axios = require('axios');

// --- CONFIGURATION ---
const BASE_URL = 'http://localhost:5000'; 
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASS = 'admin123';
const USER_EMAIL = 'user@test.com';
const USER_PASS = 'user123';
// --- END CONFIGURATION ---

const api = axios.create({
  baseURL: BASE_URL,
  validateStatus: (status) => status < 500, 
});

const log = (name, data) => {
  console.log(`\n--- ${name} ---`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

const state = {
  adminToken: null,
  userToken: null,
  productApiKey: null,
  seededUserId: null, // This is the user we log in as (USER_EMAIL)
  newUserId: null,    // This is the 'newuser99' created during the test
  newPlanId: null,
  newGeminiKeyId: null,
  newUserApiKeyId: null,
};

async function main() {
  try {
    console.log("Starting API Tests against:", BASE_URL);

    // 1. Health Check
    log('TEST: GET /v1/health (Public)');
    let res = await api.get('/v1/health');
    log('RESULT: /v1/health', { status: res.status, data: res.data });

    // 2. Auth Routes
    // Try to register a NEW user for admin tests
    log('TEST: POST /auth/register (Public)');
    res = await api.post('/auth/register', {
      name: 'New User',
      username: 'newuser99',
      email: 'newuser99@test.com',
      password: 'password123',
    });
    log('RESULT: /auth/register', { status: res.status, data: res.data });
    
    if (res.status === 201) {
        state.newUserId = res.data.user.id;
    } else if (res.status === 409) {
        console.log("User 'newuser99' already exists. We will try to fetch their ID later.");
    }

    // Login as ADMIN
    log('TEST: POST /auth/login (Admin)');
    res = await api.post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (res.status === 200) {
        state.adminToken = res.data.token;
        log('RESULT: /auth/login (Admin)', { status: res.status, message: res.data.message });
    } else {
        log('RESULT: /auth/login (Admin) FAILED', { status: res.status, data: res.data });
        // If admin login fails, we can't run admin tests, but we can try user tests
    }

    // Login as USER (The one created by seed.js)
    log('TEST: POST /auth/login (User)');
    res = await api.post('/auth/login', { email: USER_EMAIL, password: USER_PASS });
    
    if (res.status === 200) {
        state.userToken = res.data.token;
        // Use optional chaining to safely access nested properties
        state.seededUserId = res.data.user?.id; 
        log('RESULT: /auth/login (User)', { status: res.status, message: res.data.message });
    } else {
        log('RESULT: /auth/login (User) FAILED', { status: res.status, data: res.data });
        // If this fails, we can't run user-specific tests
    }

    // 3. Admin Routes
    if (state.adminToken) {
        const adminAuth = { headers: { Authorization: `Bearer ${state.adminToken}` } };

        // If we failed to create the new user (409), find them now using Admin API
        if (!state.newUserId) {
            const usersRes = await api.get('/api/admin/users', adminAuth);
            if (usersRes.status === 200) {
                const foundUser = usersRes.data.find(u => u.email === 'newuser99@test.com');
                if (foundUser) {
                    state.newUserId = foundUser.id;
                    console.log(`Recovered existing 'newuser99' ID: ${state.newUserId}`);
                }
            }
        }

        log('TEST: GET /api/admin/users (Admin)');
        res = await api.get('/api/admin/users', adminAuth);
        log('RESULT: /api/admin/users', { status: res.status, count: res.data ? res.data.length : 0 });

        // Only try to get user details if we have a valid ID
        if (state.seededUserId) {
            log('TEST: GET /api/admin/users/:id (Admin)');
            res = await api.get(`/api/admin/users/${state.seededUserId}`, adminAuth);
            log('RESULT: /api/admin/users/:id', { status: res.status, email: res.data?.email });
        }

        if (state.newUserId) {
            log('TEST: PATCH /api/admin/users/:id/status (Admin)');
            res = await api.patch(`/api/admin/users/${state.newUserId}/status`, { status: 'active' }, adminAuth);
            log('RESULT: /api/admin/users/:id/status', { status: res.status, data: res.data });
        } else {
            console.log("SKIPPING: PATCH user status ('newuser99' ID not found)");
        }

        log('TEST: GET /api/admin/subscription (Admin)');
        res = await api.get('/api/admin/subscription', adminAuth);
        log('RESULT: /api/admin/subscription', { status: res.status, count: res.data ? res.data.length : 0 });

        log('TEST: POST /api/admin/subscription (Admin)');
        res = await api.post('/api/admin/subscription', {
          name: 'Pro Plan',
          planProviderId: 'pro_plan_20',
          priceCents: 2000,
          billingCycle: 'monthly',
          requestLimitMonthly: 2000,
          rateLimitPerMinute: 60,
        }, adminAuth);
        
        if (res.status === 201) {
            state.newPlanId = res.data.id;
            log('RESULT: /api/admin/subscription', { status: res.status, data: res.data });
        } else if (res.status === 409) {
            log('RESULT: /api/admin/subscription', { status: res.status, message: "Plan already exists" });
            // Attempt to find the existing plan ID
            const allPlans = await api.get('/api/admin/subscription', adminAuth);
            const foundPlan = allPlans.data.find(p => p.planProviderId === 'pro_plan_20');
            if (foundPlan) {
                state.newPlanId = foundPlan.id;
                console.log(`Recovered existing Plan ID: ${state.newPlanId}`);
            }
        } else {
            log('RESULT: /api/admin/subscription (FAILED)', { status: res.status, data: res.data });
        }

        if (state.newPlanId) {
            log('TEST: PATCH /api/admin/subscription/:id (Admin)');
            res = await api.patch(`/api/admin/subscription/${state.newPlanId}`, { isPublic: false }, adminAuth);
            log('RESULT: /api/admin/subscription/:id', { status: res.status, data: res.data });
        } else {
            console.log("SKIPPING: PATCH subscription (Plan ID not found)");
        }

        log('TEST: GET /api/admin/product-api (Admin)');
        res = await api.get('/api/admin/product-api', adminAuth);
        log('RESULT: /api/admin/product-api', { status: res.status, count: res.data ? res.data.length : 0 });

        log('TEST: POST /api/admin/product-api (Admin)');
        res = await api.post('/api/admin/product-api', { key: 'ANOTHER_DUMMY_KEY_67890' }, adminAuth);
        if (res.status === 201) {
            state.newGeminiKeyId = res.data.id;
            log('RESULT: /api/admin/product-api', { status: res.status, data: res.data });
        } else {
             log('RESULT: /api/admin/product-api', { status: res.status, message: res.data.message });
        }

        // Clean up the Gemini key if we created/found one (skipping lookup logic for simplicity)
        if (state.newGeminiKeyId) {
            log('TEST: DELETE /api/admin/product-api/:id (Admin)');
            res = await api.delete(`/api/admin/product-api/${state.newGeminiKeyId}`, adminAuth);
            log('RESULT: /api/admin/product-api/:id', { status: res.status, data: res.data });
        }
    } else {
        console.log("\nSKIPPING ADMIN TESTS (Admin Login Failed)");
    }

    // 4. User Account Routes
    if (state.userToken) {
        const userAuth = { headers: { Authorization: `Bearer ${state.userToken}` } };

        log('TEST: GET /api/account/status (User)');
        res = await api.get('/api/account/status', userAuth);
        log('RESULT: /api/account/status', { status: res.status, data: res.data });

        // 5. User API Key Routes
        log('TEST: POST /api/keys (User)');
        res = await api.post('/api/keys', { name: 'My Test Key' }, userAuth);
        
        if (res.status === 201) {
            state.productApiKey = res.data.apiKey; 
            state.newUserApiKeyId = res.data.keyDetails.id;
            log('RESULT: /api/keys', { status: res.status, message: res.data.message });
            console.log(`*** Stored Product API Key: ${state.productApiKey ? state.productApiKey.substring(0, 12) + '...' : 'undefined'} ***`);
        } else {
            log('RESULT: /api/keys (FAILED)', { status: res.status, data: res.data });
        }

        log('TEST: GET /api/keys (User)');
        res = await api.get('/api/keys', userAuth);
        log('RESULT: /api/keys', { status: res.status, count: res.data ? res.data.length : 0 });

        // 6. Product API Route
        if (state.productApiKey) {
            log('TEST: POST /v1/try-on (Product API Key)');
            const productApiAuth = { headers: { Authorization: `Bearer ${state.productApiKey}` } };
            
            res = await api.post('/v1/try-on', {
              userImageUrl: 'https://placehold.co/400x600/png?text=Person',
              productImageUrl: 'https://placehold.co/400x600/png?text=Shirt',
            }, productApiAuth);

            log('RESULT: /v1/try-on', { status: res.status, data: res.data.error || res.data.message || res.data });
        } else {
            console.log("SKIPPING: /v1/try-on test (No API Key created)");
        }

        // 7. Cleanup
        if (state.newUserApiKeyId) {
            log('TEST: DELETE /api/keys/:id (User)');
            res = await api.delete(`/api/keys/${state.newUserApiKeyId}`, userAuth);
            log('RESULT: /api/keys/:id', { status: res.status, data: res.data });
        }
    } else {
        console.log("\nSKIPPING USER TESTS (User Login Failed)");
    }

    console.log('\n--- ALL TESTS COMPLETED ---');

  } catch (error) {
    console.error('\n--- SCRIPT FAILED ---');
    console.error(error.message);
    if(error.response) {
        console.error("Status:", error.response.status);
        console.error("Data:", error.response.data);
    }
  }
}

main();
