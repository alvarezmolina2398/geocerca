import sql from 'mssql';
import { getSqlServerConfig } from './env.js';

export function createSqlServerClient({
  getConfig = getSqlServerConfig,
  createPool = (config) => new sql.ConnectionPool(config),
  onError = (error) => console.error('SQL Server pool error:', error.code ?? error.name)
} = {}) {
  let poolPromise;
  let closePromise;
  let closed = false;

  async function getPool() {
    if (closed) {
      throw new Error('El pool de SQL Server esta cerrado.');
    }

    if (!poolPromise) {
      const pool = createPool(getConfig());
      pool.on('error', onError);

      // Las solicitudes simultaneas esperan la misma conexion inicial.
      poolPromise = (async () => {
        try {
          return await pool.connect();
        } catch (error) {
          try {
            await pool.close();
          } catch (closeError) {
            onError(closeError);
          }
          poolPromise = undefined;
          throw error;
        }
      })();
    }

    return poolPromise;
  }

  function close() {
    if (!closePromise) {
      closed = true;
      closePromise = (async () => {
        // Si falla la conexion inicial, getPool ya libera sus recursos.
        const pool = await poolPromise?.catch(() => undefined);
        if (pool) {
          await pool.close();
        }
      })();
    }

    return closePromise;
  }

  return { getPool, close };
}

// Un pool compartido por proceso; cada consulta crea su propio Request.
export const sqlServer = createSqlServerClient();
