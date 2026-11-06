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

const commerceDocumentsQuery = `
DECLARE @remoteQuery nvarchar(max) =
  N'SELECT B.NOMNEG, B.DEPNEG, B.DPI, A.LATITUD, A.LONGITUD
    FROM GENESIS.LBALIANZAS.DOCUMENTOS A
    INNER JOIN GENESIS.LBALIANZAS.INFONEG B ON A.IDINFONEG = B.ID
    WHERE B.DPI = ''' + REPLACE(@dpi, '''', '''''') + N'''';

DECLARE @query nvarchar(max) =
  N'SELECT NOMNEG, DEPNEG, DPI, LATITUD, LONGITUD FROM OPENQUERY('
  + QUOTENAME(@linkedServer)
  + N', ''' + REPLACE(@remoteQuery, '''', '''''') + N''')';

EXEC sys.sp_executesql @query;
`;

async function queryCommerce(identificador, database, linkedServer, query) {
  const dpi = dpiSchema.parse(identificador);
  const server = linkedServerSchema.parse(linkedServer);
  const pool = await database.getPool();
  const result = await pool.request()
    .input('dpi', sql.VarChar(13), dpi)
    .input('linkedServer', sql.NVarChar(128), server)
    .query(query);

  return result.recordset;
}

export async function findCommerceByDpi(identificador, {
  database = sqlServer,
  linkedServer = env.sqlLinkedServer
} = {}) {
  const rows = await queryCommerce(identificador, database, linkedServer, commerceQuery);

  return rows[0] ?? null;
}

export async function findCommerceDocumentsByDpi(identificador, {
  database = sqlServer,
  linkedServer = env.sqlLinkedServer
} = {}) {
  return queryCommerce(identificador, database, linkedServer, commerceDocumentsQuery);
}
