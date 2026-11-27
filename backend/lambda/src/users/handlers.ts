import { getPool } from "../db";

type UserEvent = { id?: number; name?: string; email?: string };

export const initDb = async () => {
  const pool = await getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE OR REPLACE FUNCTION public.notify_user_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_notify('graphql_users', json_build_object(
        'event', CASE WHEN TG_OP = 'INSERT' THEN 'userCreated' ELSE 'userUpdated' END,
        'user', row_to_json(NEW)
      )::text);
      RETURN NEW;
    END;
    $$;
    CREATE OR REPLACE TRIGGER graphql_user_change
      AFTER INSERT OR UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.notify_user_change();
  `);
  return { ok: true };
};

export const createUser = async (e: UserEvent) => {
  if (!e.name || !e.email) throw new Error("name and email are required");
  const pool = await getPool();
  const r = await pool.query(
    "INSERT INTO public.users (name, email) VALUES ($1, $2) RETURNING *",
    [e.name, e.email]
  );
  return r.rows[0];
};

export const getUser = async (e: UserEvent) => {
  const pool = await getPool();
  const r = await pool.query("SELECT * FROM public.users WHERE id = $1", [e.id]);
  return r.rows[0] ?? null;
};

export const listUsers = async () => {
  const pool = await getPool();
  const r = await pool.query("SELECT * FROM public.users ORDER BY id");
  return r.rows;
};

export const updateUser = async (e: UserEvent) => {
  const pool = await getPool();
  const r = await pool.query(
    "UPDATE public.users SET name = COALESCE($2, name), email = COALESCE($3, email) WHERE id = $1 RETURNING *",
    [e.id, e.name ?? null, e.email ?? null]
  );
  return r.rows[0] ?? null;
};

export const deleteUser = async (e: UserEvent) => {
  const pool = await getPool();
  const r = await pool.query("DELETE FROM public.users WHERE id = $1", [e.id]);
  return { deleted: (r.rowCount ?? 0) > 0 };
};

export const subscriptionReady = async () => {
  const pool = await getPool();
  const result = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'graphql_user_change' AND tgrelid = 'public.users'::regclass AND tgenabled IN ('O', 'A')) AS ready"
  );
  return { ready: result.rows[0].ready };
};
