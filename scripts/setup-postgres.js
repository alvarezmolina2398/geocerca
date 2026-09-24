import { readFile } from 'node:fs/promises';
import { createPostgresClient } from '../src/config/postgres.js';

const database = createPostgresClient();
try {
  const query = await readFile(new URL('../sql/postgres-geofence-audit.sql', import.meta.url), 'utf8');
  await database.query(query);
  console.log('Tabla public.geofence_audit_logs preparada.');
} catch (error) {
  console.error('No se pudo preparar PostgreSQL:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  await database.close();
}
