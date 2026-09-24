import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { getPostgresConfig } from '../src/config/env.js';
import { createPostgresClient } from '../src/config/postgres.js';
import { createPostgresBackgroundService } from '../src/services/postgres-background.service.js';

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const settings = { PG_HOST: 'localhost', PG_DATABASE: 'test', PG_USER: 'test', PG_PASSWORD: 'test-password' };

test('PostgreSQL config has independent limits and enforces timeouts and TLS settings', () => {
  const config = getPostgresConfig({ ...settings, PG_POOL_MAX: '3', PG_QUERY_TIMEOUT_MS: '2500', PG_SSL: 'false' });
  assert.equal(config.max, 3);
  assert.equal(config.port, 5432);
  assert.equal(config.query_timeout, 2500);
  assert.equal(config.statement_timeout, 2500);
  assert.equal(config.connectionTimeoutMillis, 5000);
  assert.equal(config.ssl, false);
  assert.deepEqual(getPostgresConfig(settings).ssl, { rejectUnauthorized: true });
  assert.throws(() => getPostgresConfig({}), /PG_HOST/);
  assert.throws(() => getPostgresConfig({ ...settings, PG_POOL_MAX: '0' }), /PG_POOL_MAX/);
});

test('PostgreSQL lazily shares a pool, passes parameters and handles idle errors', async (t) => {
  const pool = new EventEmitter();
  pool.query = t.mock.fn(async (text, values) => ({ rows: [{ value: values[0] }] }));
  pool.end = t.mock.fn(async () => {});
  const createPool = t.mock.fn(() => pool);
  const onError = t.mock.fn();
  const database = createPostgresClient({ getConfig: () => getPostgresConfig(settings), createPool, onError });
  assert.equal(createPool.mock.callCount(), 0);

  const results = await Promise.all(Array.from({ length: 10 }, (_, index) => database.query('SELECT $1', [index])));
  assert.equal(createPool.mock.callCount(), 1);
  assert.deepEqual(results.map((result) => result.rows[0].value), Array.from({ length: 10 }, (_, index) => index));
  const failure = new Error('Lost connection');
  pool.emit('error', failure);
  assert.equal(onError.mock.calls[0].arguments[0], failure);
  await Promise.all([database.close(), database.close()]);
  assert.equal(pool.end.mock.callCount(), 1);
  await assert.rejects(database.query('SELECT 1'), /cerrado/);
});

test('background send returns before querying and snapshots the parameters', async (t) => {
  const database = { query: t.mock.fn(async () => ({ rows: [] })), close: async () => {} };
  const background = createPostgresBackgroundService({ database });
  const values = [{ value: 'original' }];
  assert.equal(background.send('SELECT $1::jsonb', values), true);
  assert.equal(database.query.mock.callCount(), 0);
  values[0].value = 'changed';
  await background.close();
  assert.deepEqual(database.query.mock.calls[0].arguments, ['SELECT $1::jsonb', [{ value: 'original' }]]);
});

test('background query and logging failures are contained and later jobs still execute', async (t) => {
  const query = t.mock.fn(async () => { throw new Error('PostgreSQL unavailable'); });
  const onError = t.mock.fn(() => { throw new Error('Logger failed'); });
  const background = createPostgresBackgroundService({ database: { query, close: async () => {} }, onError });
  assert.equal(background.send('SELECT 1'), true);
  await nextTurn();
  assert.equal(background.send('SELECT 2'), true);
  await background.close();
  assert.equal(query.mock.callCount(), 2);
  assert.equal(onError.mock.callCount(), 2);
});

test('background capacity is bounded and shutdown drains accepted jobs before closing', async (t) => {
  const gate = Promise.withResolvers();
  const database = { query: t.mock.fn(() => gate.promise), close: t.mock.fn(async () => {}) };
  const onError = t.mock.fn();
  const background = createPostgresBackgroundService({ database, onError, getMaxPending: () => 2 });
  assert.equal(background.send('SELECT 1'), true);
  assert.equal(background.send('SELECT 2'), true);
  assert.equal(background.send('SELECT 3'), false);
  assert.equal(onError.mock.calls[0].arguments[0].code, 'PG_QUEUE_FULL');
  await nextTurn();
  assert.equal(database.query.mock.callCount(), 2);
  const closing = background.close();
  assert.equal(background.close(), closing);
  assert.equal(database.close.mock.callCount(), 0);
  assert.equal(background.send('SELECT 4'), false);
  gate.resolve({ rows: [] });
  await closing;
  assert.equal(database.close.mock.callCount(), 1);
});

test('missing PostgreSQL credentials cannot throw to the caller', async (t) => {
  const database = createPostgresClient({ getConfig: () => getPostgresConfig({}) });
  const onError = t.mock.fn();
  const background = createPostgresBackgroundService({ database, onError });
  assert.equal(background.send('SELECT 1'), true);
  await background.close();
  assert.equal(onError.mock.callCount(), 1);
  assert.match(onError.mock.calls[0].arguments[0].message, /PG_HOST/);
});

test('invalid tasks or queue configuration fail without throwing or opening PostgreSQL', async (t) => {
  const database = { query: t.mock.fn(), close: async () => {} };
  const onError = t.mock.fn();
  const background = createPostgresBackgroundService({ database, onError });
  assert.equal(background.send('', []), false);
  assert.equal(background.send('SELECT $1', {}), false);
  const invalidConfig = createPostgresBackgroundService({ database, onError, getMaxPending: () => { throw new Error('Invalid config'); } });
  assert.equal(invalidConfig.send('SELECT 1'), false);
  await Promise.all([background.close(), invalidConfig.close()]);
  assert.equal(database.query.mock.callCount(), 0);
});
