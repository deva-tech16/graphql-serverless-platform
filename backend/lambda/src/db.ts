import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { Pool } from "pg";

const sm = new SecretsManagerClient({});
let pool: Pool | undefined;

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN! }));
  const s = JSON.parse(res.SecretString!);
  pool = new Pool({
    host: s.host,
    port: s.port,
    user: s.username,
    password: s.password,
    database: s.database,
    ssl: { rejectUnauthorized: false }, // TLS to RDS Proxy; see security.md for CA pinning
    max: 1,
  });
  return pool;
}