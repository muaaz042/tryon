<!-- STEP 1 -->
- npm install

<!-- STEP 2 -->
- npx prisma migrate dev --name "initial-migration"


<!-- Test -->

npm run db:reset
npm run prisma:seed
    *You should see the "Seeding finished." message.*

npm start
    *You should see `🚀 Server is running...`*

npm run test:api *endpoint test


Note on Webhooks: The /webhooks/rapidapi and /webhooks/stripe endpoints are not tested in this script. They are nearly impossible to test automatically without a live internet connection and complex signature generation. These should be tested manually using tools like the Stripe CLI (stripe listen --forward-to localhost:5000/webhooks/stripe) or the RapidAPI webhook dashboard.