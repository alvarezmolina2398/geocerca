import sql from 'mssql';
import { z } from 'zod';
import { env } from '../config/env.js';
import { sqlServer } from '../config/sql-server.js';
import { dpiSchema } from '../schemas/location.schema.js';

const linkedServerSchema = z.string().trim().min(1).max(128);

// OPENQUERY requiere un literal: los parametros se escapan dentro de SQL Server.
const commerceQuery = `
DECLARE @remoteQuery nvarchar(max) =
  N'SELECT NOMNEG, DEPNEG, DPI
    FROM GENESIS.LBALIANZAS.INFONEG
    WHERE DPI = ''' + REPLACE(@dpi, '''', '''''') + N'''
    FETCH FIRST 1 ROWS ONLY';

DECLARE @query nvarchar(max) =
  N'SELECT NOMNEG, DEPNEG, DPI FROM OPENQUERY('
  + QUOTENAME(@linkedServer)
  + N', ''' + REPLACE(@remoteQuery, '''', '''''') + N''')';

EXEC sys.sp_executesql @query;
`;

export async function findCommerceByDpi(identificador, {
  database = sqlServer,
  linkedServer = env.sqlLinkedServer
} = {}) {
  const dpi = dpiSchema.parse(identificador);
  const server = linkedServerSchema.parse(linkedServer);
  const pool = await database.getPool();
  const result = await pool.request()
    .input('dpi', sql.VarChar(13), dpi)
    .input('linkedServer', sql.NVarChar(128), server)
    .query(commerceQuery);

  return result.recordset[0] ?? null;
}
