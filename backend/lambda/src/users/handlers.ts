import { getPool } from "../db";

type UserEvent = { id?: number; name?: string; email?: string };

export const initDb = async () => {
  const pool = await getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  return { ok: true };
};

export const createUser = async (e: UserEvent) => {
  if (!e.name || !e.email) throw new Error("name and email are required");
  const pool = await getPool();
  const r = await pool.query(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
    [e.name, e.email]
  );
  return r.rows[0];
};

export const getUser = async (e: UserEvent) => {
  const pool = await getPool();
  const r = await pool.query("SELECT * FROM users WHERE id = $1", [e.id]);
  return r.rows[0] ?? null;
};

export const listUsers = async () => {
  const pool = await getPool();
  const r = await pool.query("SELECT * FROM users ORDER BY id");
  return r.rows;
};

export const updateUser = async (e: UserEvent) => {
  const pool = await getPool();
  const r = await pool.query(
    "UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email) WHERE id = $1 RETURNING *",
    [e.id, e.name ?? null, e.email ?? null]
  );
  return r.rows[0] ?? null;
};

export const deleteUser = async (e: UserEvent) => {
  const pool = await getPool();
  const r = await pool.query("DELETE FROM users WHERE id = $1", [e.id]);
  return { deleted: (r.rowCount ?? 0) > 0 };
};