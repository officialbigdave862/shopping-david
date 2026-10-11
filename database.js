const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Configure it in Render Environment.");
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

async function initializeDatabase() {
  // Confirm that Supabase is reachable.
  await db.query("SELECT 1");

  // Create the administrator account using Render environment variables.
  const email = String(process.env.ADMIN_EMAIL || "admin@shoppingdavid.com")
    .trim()
    .toLowerCase();

  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error("ADMIN_PASSWORD is missing from Render Environment.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.query(
    `INSERT INTO public.admins (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, passwordHash]
  );

  console.log("Supabase PostgreSQL connected.");
  console.log("Administrator account initialized.");
}

module.exports = { db, initializeDatabase };
