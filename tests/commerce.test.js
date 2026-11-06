import test from 'node:test';
import assert from 'node:assert/strict';
import { findCommerceByDpi, findCommerceDocumentsByDpi } from '../src/services/commerce.service.js';

test('concurrent commerce lookups keep their DPI parameters in separate requests', async (t) => {
  const queries = [];
  const pool = {
    request: t.mock.fn(() => {
      const parameters = {};
      return {
        input(name, type, value) {
          parameters[name] = { type, value };
          return this;
        },
        async query(text) {
          queries.push({ text, parameters });
          await Promise.resolve();
          return { recordset: [{ NOMNEG: 'Comercio de prueba', DEPNEG: 7, DPI: parameters.dpi.value }] };
        }
      };
    })
  };
  const database = { getPool: async () => pool };
  const identifiers = Array.from({ length: 30 }, (_, index) => String(index).padStart(13, '0'));

  const results = await Promise.all(identifiers.map((dpi) => findCommerceByDpi(dpi, { database, linkedServer: 'GEPROD' })));

  assert.deepEqual(results.map((row) => row.DPI), identifiers);
  assert.ok(results.every((row) => row.DEPNEG === 7 && row.NOMNEG === 'Comercio de prueba'));
  assert.equal(pool.request.mock.callCount(), identifiers.length);
  for (const { text, parameters } of queries) {
    assert.equal(parameters.dpi.type.length, 13);
    assert.equal(parameters.linkedServer.value, 'GEPROD');
    assert.ok(!text.includes(parameters.dpi.value));
    assert.match(text, /FROM GENESIS\.LBALIANZAS\.INFONEG/);
    assert.match(text, /FETCH FIRST 1 ROWS ONLY/);
    assert.match(text, /QUOTENAME\(@linkedServer\)/);
  }
});

test('returns null when the commerce is not found', async () => {
  const request = {
    input() { return this; },
    query: async () => ({ recordset: [] })
  };
  const database = { getPool: async () => ({ request: () => request }) };
  assert.equal(await findCommerceByDpi('0123456789012', { database }), null);
});

test('queries every document and its commerce department using the requested DPI', async (t) => {
  const rows = [
    { NOMNEG: 'Comercio', DEPNEG: 7, DPI: '0123456789012', LATITUD: 14.6, LONGITUD: -90.5 },
    { NOMNEG: 'Comercio', DEPNEG: 7, DPI: '0123456789012', LATITUD: 14.7, LONGITUD: -90.6 }
  ];
  let queryText;
  const request = {
    input() { return this; },
    async query(text) {
      queryText = text;
      return { recordset: rows };
    }
  };
  const database = { getPool: async () => ({ request: () => request }) };

  assert.deepEqual(await findCommerceDocumentsByDpi('0123456789012', { database, linkedServer: 'GEPROD' }), rows);
  assert.match(queryText, /FROM GENESIS\.LBALIANZAS\.DOCUMENTOS A/);
  assert.match(queryText, /INNER JOIN GENESIS\.LBALIANZAS\.INFONEG B ON A\.IDINFONEG = B\.ID/);
  assert.match(queryText, /A\.LATITUD, A\.LONGITUD/);
  assert.ok(!queryText.includes('FETCH FIRST'));
});

test('rejects invalid DPI values before accessing SQL Server', async (t) => {
  const database = { getPool: t.mock.fn() };
  for (const dpi of [null, 1589489550316, '123', "123456789012'", '0123456789012\n', "' OR 1=1 --"]) {
    await assert.rejects(findCommerceByDpi(dpi, { database }));
  }
  assert.equal(database.getPool.mock.callCount(), 0);
});

test('rejects an invalid linked server before connecting', async (t) => {
  const database = { getPool: t.mock.fn() };
  for (const linkedServer of ['', 'x'.repeat(129)]) {
    await assert.rejects(findCommerceByDpi('0123456789012', { database, linkedServer }));
  }
  assert.equal(database.getPool.mock.callCount(), 0);
});

test('propagates query failures without closing the shared pool', async (t) => {
  const failure = new Error('Query timed out');
  const request = {
    input() { return this; },
    query: async () => { throw failure; }
  };
  const pool = { request: () => request, close: t.mock.fn() };
  const database = { getPool: async () => pool };
  await assert.rejects(findCommerceByDpi('0123456789012', { database }), (error) => error === failure);
  assert.equal(pool.close.mock.callCount(), 0);
});
