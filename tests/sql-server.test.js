import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { getSqlServerConfig } from '../src/config/env.js';
import { createSqlServerClient } from '../src/config/sql-server.js';

const settings = {
  SQL_SERVER: 'localhost',
  SQL_DATABASE: 'test',
  SQL_USER: 'test',
  SQL_PASSWORD: 'test-password'
};

function fakePool(t, connect) {
  const pool = new EventEmitter();
  pool.connect = t.mock.fn(connect ?? (async () => pool));
  pool.close = t.mock.fn(async () => {});
  return pool;
}

test('reads SQL Server limits, timeouts and booleans from configuration', () => {
  const config = getSqlServerConfig({
    ...settings,
    SQL_PORT: '1434',
    SQL_ENCRYPT: 'false',
    SQL_TRUST_SERVER_CERTIFICATE: 'true',
    SQL_POOL_MAX: '4',
    SQL_POOL_MIN: '1',
    SQL_POOL_IDLE_TIMEOUT_MS: '60000',
    SQL_POOL_ACQUIRE_TIMEOUT_MS: '5000',
    SQL_CONNECTION_TIMEOUT_MS: '7000',
    SQL_REQUEST_TIMEOUT_MS: '9000'
  });

  assert.equal(config.port, 1434);
  assert.deepEqual(config.options, { encrypt: false, trustServerCertificate: true });
  assert.deepEqual(config.pool, { max: 4, min: 1, idleTimeoutMillis: 60000, acquireTimeoutMillis: 5000 });
  assert.equal(config.connectionTimeout, 7000);
  assert.equal(config.requestTimeout, 9000);
});

test('rejects invalid configuration without revealing credentials', () => {
  assert.throws(() => getSqlServerConfig({}), /SQL_SERVER/);
  assert.throws(() => getSqlServerConfig({ ...settings, SQL_POOL_MIN: '11' }), /SQL_POOL_MIN/);
  assert.throws(() => getSqlServerConfig({ ...settings, SQL_POOL_MAX: '0' }), /SQL_POOL_MAX/);
  assert.throws(() => getSqlServerConfig({ ...settings, SQL_REQUEST_TIMEOUT_MS: 'invalid' }), (error) => {
    assert.match(error.message, /SQL_REQUEST_TIMEOUT_MS/);
    assert.ok(!error.message.includes(settings.SQL_PASSWORD));
    return true;
  });
});

test('shares one pending connection across simultaneous callers', async (t) => {
  const connecting = Promise.withResolvers();
  const pool = fakePool(t, () => connecting.promise);
  const createPool = t.mock.fn(() => pool);
  const database = createSqlServerClient({ getConfig: () => getSqlServerConfig(settings), createPool });
  t.after(() => database.close());

  const requests = Array.from({ length: 50 }, () => database.getPool());
  assert.equal(createPool.mock.callCount(), 1);
  assert.equal(pool.connect.mock.callCount(), 1);

  connecting.resolve(pool);
  const pools = await Promise.all(requests);
  assert.ok(pools.every((result) => result === pool));
  assert.equal(await database.getPool(), pool);
  assert.equal(pool.connect.mock.callCount(), 1);
});

test('cleans up a failed connection and allows the next request to retry', async (t) => {
  const failure = new Error('Connection failed');
  const failedPool = fakePool(t, async () => { throw failure; });
  const healthyPool = fakePool(t);
  const pools = [failedPool, healthyPool];
  const createPool = t.mock.fn(() => pools.shift());
  const database = createSqlServerClient({ getConfig: () => ({}), createPool });
  t.after(() => database.close());

  const results = await Promise.allSettled([database.getPool(), database.getPool()]);
  assert.ok(results.every((result) => result.status === 'rejected' && result.reason === failure));
  assert.equal(failedPool.close.mock.callCount(), 1);
  assert.equal(await database.getPool(), healthyPool);
  assert.equal(createPool.mock.callCount(), 2);
});

test('closes once after connection finishes and prevents reopening during shutdown', async (t) => {
  const connecting = Promise.withResolvers();
  const pool = fakePool(t, () => connecting.promise);
  const database = createSqlServerClient({ getConfig: () => ({}), createPool: () => pool });

  const opening = database.getPool();
  const closing = database.close();
  assert.equal(database.close(), closing);
  await assert.rejects(database.getPool(), /cerrado/);
  connecting.resolve(pool);
  await Promise.all([opening, closing]);
  assert.equal(pool.close.mock.callCount(), 1);
});

test('closing an unused client never opens a connection', async (t) => {
  const createPool = t.mock.fn();
  const database = createSqlServerClient({ createPool });
  await database.close();
  assert.equal(createPool.mock.callCount(), 0);
});

test('handles pool error events without discarding a shared pool', async (t) => {
  const pool = fakePool(t);
  const onError = t.mock.fn();
  const database = createSqlServerClient({ getConfig: () => ({}), createPool: () => pool, onError });
  t.after(() => database.close());

  await database.getPool();
  const failure = Object.assign(new Error('Socket lost'), { code: 'ESOCKET' });
  pool.emit('error', failure);
  assert.equal(onError.mock.calls[0].arguments[0], failure);
  assert.equal(await database.getPool(), pool);
  assert.equal(pool.connect.mock.callCount(), 1);
});
