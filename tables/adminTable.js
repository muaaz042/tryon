const db = require('../db/db');

const createAdminTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL
    );
  `;
  try {
    await db.query(sql);
    console.log('Admins table created');
  } catch (err) {
    console.error('❌ Error creating Admins table:', err);
    throw err;
  }
};

module.exports = createAdminTable;
