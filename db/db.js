const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  connectionLimit: 10
});

// ✅ Check connection once at startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error connecting to MySQL:', err);
  } else {
    console.log('Connected to Aiven MySQL database');
    connection.release();
  }
});

// ✅ Export promise-based pool
module.exports = pool.promise();
