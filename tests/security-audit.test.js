import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { createPostgresBackgroundService } from '../src/services/postgres-background.service.js';
import { createGeofenceAuditService } from '../src/services/geofence-audit.service.js';

const apiKey = 'test-api-key';
const payload = { identificador: '0123456789012', lat: 14.6349, lot: -90.5069 };
const negocio = { NOMNEG: 'Tienda', DEPNEG: 7, DPI: payload.identificador };
const headers = { 'x-api-key': apiKey, 'x-user': 'usuario-prueba' };
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function createTestApp(t, options = {}) {
  const sqlQuery = t.mock.fn(async () => {
    if (options.sqlError) throw options.sqlError;
    return { recordset: options.missingBusiness ? [] : [negocio] };
  });
  const database = {
    getPool: async () => ({ request: () => ({ input() { return this; }, query: sqlQuery }) }),
    close: t.mock.fn(async () => {})
  };
  const postgres = {
    query: t.mock.fn(options.pgQuery ?? (async () => ({ rows: [] }))),
    close: t.mock.fn(async () => {})
  };
  const onError = t.mock.fn();
  const background = createPostgresBackgroundService({ database: postgres, onError });
  const audit = createGeofenceAuditService({ background });
  const app = buildApp({ logger: false, database, audit, apiKey: options.apiKey ?? apiKey });
  t.after(() => app.close());
  return { app, postgres, sqlQuery, onError, audit };
}

function inject(app, options = {}) {
  return app.inject({ method: 'POST', url: '/api/v1/geofences/check', headers, payload, ...options });
}

test('requires the API key before querying SQL Server and audits unauthorized requests', async (t) => {
  const { app, postgres, sqlQuery } = createTestApp(t);
  for (const key of [undefined, 'incorrect', 'test-api-kex']) {
    const response = await inject(app, { headers: { 'x-user': headers['x-user'], ...(key ? { 'x-api-key': key } : {}) } });
    assert.equal(response.statusCode, 401);
  }
  await nextTurn();
  assert.equal(sqlQuery.mock.callCount(), 0);
  assert.equal(postgres.query.mock.callCount(), 3);
  assert.ok(postgres.query.mock.calls.every(({ arguments: [, values] }) => values[5] === 401));
});

test('requires a nonempty user header before querying SQL Server', async (t) => {
  const { app, sqlQuery } = createTestApp(t);
  for (const usuario of [undefined, '', '   ', 'x'.repeat(129)]) {
    const response = await inject(app, { headers: { 'x-api-key': apiKey, ...(usuario !== undefined ? { 'x-user': usuario } : {}) } });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(sqlQuery.mock.callCount(), 0);
});

test('rejects requests if the server API key is not configured', async (t) => {
  const { app, sqlQuery } = createTestApp(t, { apiKey: '' });
  const response = await inject(app);
  assert.equal(response.statusCode, 503);
  assert.equal(sqlQuery.mock.callCount(), 0);
});

test('audits the exact received payload and response with user and timestamp, without the API key', async (t) => {
  const { app, postgres } = createTestApp(t);
  const received = { ...payload, extra: 'original value' };
  const response = await inject(app, { payload: received });
  assert.equal(response.statusCode, 200);
  await nextTurn();
  const [query, values] = postgres.query.mock.calls[0].arguments;
  assert.match(query, /INSERT INTO public\.geofence_audit_logs/);
  assert.match(query, /\$7::jsonb/);
  assert.equal(typeof values[0], 'string');
  assert.ok(!Number.isNaN(Date.parse(values[1])));
  assert.equal(values[2], 'usuario-prueba');
  assert.equal(values[3], 'POST');
  assert.equal(values[4], '/api/v1/geofences/check');
  assert.equal(values[5], 200);
  assert.deepEqual(JSON.parse(values[6]), received);
  assert.deepEqual(JSON.parse(values[7]), response.json());
  assert.ok(!JSON.stringify(values).includes(apiKey));
});

test('returns the HTTP response while PostgreSQL is still pending', async (t) => {
  const gate = Promise.withResolvers();
  let completed = false;
  const { app, postgres } = createTestApp(t, {
    pgQuery: async () => { await gate.promise; completed = true; return { rows: [] }; }
  });
  let timer;
  try {
    const response = await Promise.race([
      inject(app),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('HTTP waited for PostgreSQL')), 2000); })
    ]);
    assert.equal(response.statusCode, 200);
    await nextTurn();
    assert.equal(postgres.query.mock.callCount(), 1);
    assert.equal(completed, false);
  } finally {
    clearTimeout(timer);
    gate.resolve();
  }
});

test('PostgreSQL failures do not change a successful response or prevent the next request', async (t) => {
  const { app, onError } = createTestApp(t, { pgQuery: async () => { throw new Error('PostgreSQL offline'); } });
  for (let i = 0; i < 2; i++) {
    const response = await inject(app);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().DPI, payload.identificador);
    await nextTurn();
  }
  assert.equal(onError.mock.callCount(), 2);
});

test('audits missing businesses, invalid coordinates and SQL Server errors', async (t) => {
  for (const scenario of [
    { options: { missingBusiness: true }, status: 404 },
    { options: {}, status: 400, payload: { ...payload, lat: 95 } },
    { options: { sqlError: new Error('SQL failed') }, status: 500 }
  ]) {
    await t.test(String(scenario.status), async (t) => {
      const { app, postgres } = createTestApp(t, scenario.options);
      const response = await inject(app, { payload: scenario.payload ?? payload });
      assert.equal(response.statusCode, scenario.status);
      await nextTurn();
      const [, values] = postgres.query.mock.calls[0].arguments;
      assert.equal(values[5], scenario.status);
      assert.deepEqual(JSON.parse(values[7]), response.json());
    });
  }
});

test('Swagger documents the API key and required user header', async (t) => {
  const { app } = createTestApp(t);
  const response = await app.inject({ method: 'GET', url: '/docs/json' });
  const spec = response.json();
  assert.deepEqual(spec.components.securitySchemes.ApiKeyAuth, { type: 'apiKey', in: 'header', name: 'x-api-key' });
  const endpoint = spec.paths['/api/v1/geofences/check'].post;
  assert.deepEqual(endpoint.security, [{ ApiKeyAuth: [] }]);
  assert.ok(endpoint.parameters.some((parameter) => parameter.in === 'header' && parameter.name === 'x-user' && parameter.required));
});
