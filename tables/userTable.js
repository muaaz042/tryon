const db = require('../db/db');

const createUserTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      authorized BOOLEAN DEFAULT FALSE,
      role VARCHAR(50) NOT NULL
      blocked BOOLEAN DEFAULT FALSE
    );
  `;
  try {
    await db.query(sql);
    console.log('Users table Created');
  } catch (err) {
    console.error('❌ Error creating Users table:', err);
    throw err;
  }
};

module.exports = createUserTable;
