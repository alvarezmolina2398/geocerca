import { createPostgresClient } from '../config/postgres.js';
import { getPostgresMaxPending } from '../config/env.js';

export function createPostgresBackgroundService({
  onError = (error) => console.error('PostgreSQL background error:', error.code ?? error.name),
  database,
  getMaxPending = getPostgresMaxPending
} = {}) {
  const pending = new Set();
  let accepting = true;
  let closePromise;

  function report(error) {
    // Un fallo del registro de errores tampoco debe afectar las solicitudes.
    try {
      Promise.resolve(onError(error)).catch(() => {});
    } catch {}
  }

  const postgres = database ?? createPostgresClient({ onError: report });

  // Devuelve inmediatamente si acepto el trabajo; no confirma una escritura.
  function send(text, values = []) {
    try {
      if (!accepting) {
        throw Object.assign(new Error('El servicio de PostgreSQL esta cerrado.'), { code: 'PG_CLOSED' });
      }
      if (pending.size >= getMaxPending()) {
        throw Object.assign(new Error('La cola de PostgreSQL esta llena.'), { code: 'PG_QUEUE_FULL' });
      }
      if (typeof text !== 'string' || !text.trim() || !Array.isArray(values)) {
        throw Object.assign(new Error('Consulta o parametros de PostgreSQL invalidos.'), { code: 'PG_INVALID_QUERY' });
      }

      const parameters = structuredClone(values);
      const task = new Promise((resolve) => setImmediate(resolve))
        .then(() => postgres.query(text, parameters))
        .catch(report)
        .finally(() => pending.delete(task));
      pending.add(task);
      return true;
    } catch (error) {
      report(error);
      return false;
    }
  }

  function close() {
    accepting = false;
    closePromise ??= (async () => {
      await Promise.all(pending);
      try {
        await postgres.close();
      } catch (error) {
        report(error);
      }
    })();
    return closePromise;
  }

  return { send, close };
}

export const postgresBackground = createPostgresBackgroundService();
export const sendPostgresQuery = postgresBackground.send;
