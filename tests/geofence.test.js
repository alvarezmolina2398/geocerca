import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const app = buildApp({ logger: false });

test.after(async () => app.close());

test('exposes the OpenAPI specification', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/docs/json'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().openapi, '3.0.3');
  assert.ok(response.json().paths['/api/v1/geofences/check']);
});

test('reports a location inside the requested department', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    payload: { shapeISO: 'GT-GU', lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    shapeName: 'Guatemala',
    shapeISO: 'GT-GU',
    inside: true,
    distance: response.json().distance
  });
  assert.equal(typeof response.json().distance, 'number');
  assert.ok(response.json().distance >= 0);
});

test('reports a location outside the geofence', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    payload: { shapeISO: 'GT-GU', lat: 19.43, lot: -99.13 }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().inside, false);
});

test('rejects invalid coordinates', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    payload: { shapeISO: 'GT-GU', lat: 95, lot: -90.5 }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'Invalid request');
});

test('returns not found for an unknown department', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    payload: { shapeISO: 'GT-XX', lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'Geofence not found');
});
