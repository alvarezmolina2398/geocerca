import pg from 'pg';
import { getPostgresConfig } from './env.js';

export function createPostgresClient({
  getConfig = getPostgresConfig,
  createPool = (config) => new pg.Pool(config),
  onError = (error) => console.error('PostgreSQL pool error:', error.code ?? error.name)
} = {}) {
  let pool;
  let closed = false;
  let closePromise;

  async function query(text, values = []) {
    if (closed) {
      throw new Error('El pool de PostgreSQL esta cerrado.');
    }

    if (!pool) {
      const newPool = createPool(getConfig());
      newPool.on('error', onError);
      pool = newPool;
    }

    // pool.query obtiene y libera la conexion incluso cuando la consulta falla.
    return pool.query(text, values);
  }

  function close() {
    closed = true;
    closePromise ??= Promise.resolve().then(() => pool?.end());
    return closePromise;
  }

  return { query, close };
}
