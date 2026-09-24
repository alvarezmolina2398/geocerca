import 'dotenv/config';
import { z } from 'zod';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

export const env = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number.isNaN(port) ? 3000 : port,
  sqlLinkedServer: process.env.SQL_LINKED_SERVER ?? 'GEPROD'
};

const timeout = (fallback) => z.coerce.number().int().min(1).max(2147483647).default(fallback);
const boolean = (fallback) => z.enum(['true', 'false']).default(fallback).transform((value) => value === 'true');

const sqlServerEnvSchema = z.object({
  SQL_SERVER: z.string().trim().min(1),
  SQL_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
  SQL_DATABASE: z.string().trim().min(1),
  SQL_USER: z.string().trim().min(1),
  SQL_PASSWORD: z.string().min(1),
  SQL_ENCRYPT: boolean('true'),
  SQL_TRUST_SERVER_CERTIFICATE: boolean('false'),
  SQL_CONNECTION_TIMEOUT_MS: timeout(15000),
  SQL_REQUEST_TIMEOUT_MS: timeout(30000),
  SQL_POOL_MAX: z.coerce.number().int().min(1).default(10),
  SQL_POOL_MIN: z.coerce.number().int().min(0).default(0),
  SQL_POOL_IDLE_TIMEOUT_MS: timeout(30000),
  SQL_POOL_ACQUIRE_TIMEOUT_MS: timeout(30000)
}).refine((value) => value.SQL_POOL_MIN <= value.SQL_POOL_MAX, {
  path: ['SQL_POOL_MIN'],
  message: 'SQL_POOL_MIN no puede superar SQL_POOL_MAX.'
});

// La configuracion se valida al conectar, no al iniciar la API sin usar SQL Server.
export function getSqlServerConfig(source = process.env) {
  const result = sqlServerEnvSchema.safeParse(source);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Configuracion de SQL Server invalida. Revisa: ${fields.join(', ')}.`);
  }

  const config = result.data;
  return {
    server: config.SQL_SERVER,
    port: config.SQL_PORT,
    database: config.SQL_DATABASE,
    user: config.SQL_USER,
    password: config.SQL_PASSWORD,
    connectionTimeout: config.SQL_CONNECTION_TIMEOUT_MS,
    requestTimeout: config.SQL_REQUEST_TIMEOUT_MS,
    options: {
      encrypt: config.SQL_ENCRYPT,
      trustServerCertificate: config.SQL_TRUST_SERVER_CERTIFICATE
    },
    pool: {
      max: config.SQL_POOL_MAX,
      min: config.SQL_POOL_MIN,
      idleTimeoutMillis: config.SQL_POOL_IDLE_TIMEOUT_MS,
      acquireTimeoutMillis: config.SQL_POOL_ACQUIRE_TIMEOUT_MS
    }
  };
}
