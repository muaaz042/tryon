const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Database connection (Aiven MySQL)
require('./db/db');

// ✅ Table creation
const createUserTable = require('./tables/userTable');
const createAdminTable = require('./tables/adminTable');

(async () => {
  try {
    await createUserTable();
    await createAdminTable();
    console.log('✅ All tables are ready');
  } catch (err) {
    console.error('❌ Error creating tables:', err);
  }
})();

// ✅ Routes
const usersRoute = require('./routes/userRoutes');
const adminRoute = require('./routes/adminRoutes');

app.use('/api/user', usersRoute);
app.use('/api/admin', adminRoute);

app.use("/", (req, res) => {
  res.send("Server is running.");
});


// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port: ${PORT}`);
});
