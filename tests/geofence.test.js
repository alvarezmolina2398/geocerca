import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const identificador = '0123456789012';
const negocio = { NOMNEG: 'Tienda de prueba', DEPNEG: 5, DPI: identificador };
const apiKey = 'test-api-key';
const headers = { 'x-api-key': apiKey, 'x-user': 'usuario-prueba' };
const audit = { record: () => true, close: async () => {} };

function createDatabase(findBusiness, findDocuments = findBusiness) {
  const pool = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) {
          parameters[name] = value;
          return this;
        },
        async query(text) {
          const result = await (text.includes('LATITUD')
            ? findDocuments(parameters.dpi)
            : findBusiness(parameters.dpi));
          return { recordset: Array.isArray(result) ? result : result ? [result] : [] };
        }
      };
    }
  };
  return { getPool: async () => pool, close: async () => {} };
}

function createTestApp(t, findBusiness, findDocuments = findBusiness) {
  const app = buildApp({ logger: false, database: createDatabase(findBusiness, findDocuments), apiKey, audit });
  t.after(() => app.close());
  return app;
}

const app = buildApp({ logger: false, database: createDatabase(async () => negocio), apiKey, audit });

test.after(async () => app.close());

test('exposes the OpenAPI specification', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/docs/json'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().openapi, '3.0.3');
  assert.ok(response.json().paths['/api/v1/geofences/check']);
  assert.ok(response.json().paths['/api/v1/geofences/check-documents']);
  const bodySchema = response.json().paths['/api/v1/geofences/check'].post.requestBody.content['application/json'].schema;
  assert.deepEqual(bodySchema.required, ['identificador', 'lat', 'lot']);
  assert.deepEqual(Object.keys(bodySchema.properties), ['identificador', 'lat', 'lot']);
  assert.equal(bodySchema.properties.identificador.type, 'string');
  assert.equal(bodySchema.properties.identificador.minLength, 13);
  assert.equal(bodySchema.properties.identificador.maxLength, 13);
  const responseSchema = response.json().paths['/api/v1/geofences/check'].post.responses['200'].content['application/json'].schema;
  for (const field of ['NOMNEG', 'DEPNEG', 'DPI']) {
    assert.ok(responseSchema.required.includes(field));
  }
  const documentsSchema = response.json().paths['/api/v1/geofences/check-documents'].post.requestBody.content['application/json'].schema;
  assert.deepEqual(documentsSchema.required, ['identificador', 'lat', 'lot']);
});

test('validates all document coordinates against the department of the submitted location', async (t) => {
  const documents = [
    { ...negocio, DEPNEG: 1, LATITUD: 14.6349, LONGITUD: -90.5069 },
    { ...negocio, DEPNEG: 1, LATITUD: 15.0, LONGITUD: -91.0 }
  ];
  const findDocuments = t.mock.fn(async () => documents);
  const testApp = createTestApp(t, async () => negocio, findDocuments);
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check-documents',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(findDocuments.mock.callCount(), 1);
  assert.deepEqual(findDocuments.mock.calls[0].arguments, [identificador]);
  const result = response.json();
  assert.deepEqual({ NOMNEG: result.NOMNEG, DEPNEG: result.DEPNEG, DPI: result.DPI }, {
    NOMNEG: negocio.NOMNEG,
    DEPNEG: 5,
    DPI: negocio.DPI
  });
  assert.equal(result.lat, 14.6349);
  assert.equal(result.lot, -90.5069);
  assert.equal(result.shapeISO, 'GT-GU');
  assert.deepEqual(result.documents.map(({ LATITUD, LONGITUD, inside }) => ({
    LATITUD, LONGITUD, inside
  })), [
    { LATITUD: 14.6349, LONGITUD: -90.5069, inside: true },
    { LATITUD: 15, LONGITUD: -91, inside: false }
  ]);
  assert.ok(result.documents.every(({ distance }) => typeof distance === 'number' && distance >= 0));
});

test('reports invalid stored document coordinates as a server error', async (t) => {
  const testApp = createTestApp(t, async () => negocio, async () => [{
    ...negocio,
    LATITUD: null,
    LONGITUD: -90.5069
  }]);
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check-documents',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: 'Internal Server Error' });
});

test('requires a valid DPI for document location checks', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check-documents',
    headers,
    payload: { identificador: 'invalid', lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'Invalid request');
});

test('returns not found when no documents match the DPI', async (t) => {
  const testApp = createTestApp(t, async () => negocio, async () => []);
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check-documents',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: 'No se encontraron documentos o las coordenadas enviadas no pertenecen a un departamento de Guatemala.',
    identificador
  });
});

test('returns not found when reference coordinates are outside Guatemala', async (t) => {
  const testApp = createTestApp(t, async () => negocio, async () => [{
    ...negocio,
    LATITUD: 14.6349,
    LONGITUD: -90.5069
  }]);
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check-documents',
    headers,
    payload: { identificador, lat: 19.43, lot: -99.13 }
  });

  assert.equal(response.statusCode, 404);
});

test('queries the requested DPI and returns the business with its geofence result', async (t) => {
  const findBusiness = t.mock.fn(async () => negocio);
  const testApp = createTestApp(t, findBusiness);
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(findBusiness.mock.callCount(), 1);
  assert.deepEqual(findBusiness.mock.calls[0].arguments, [identificador]);
  assert.deepEqual(response.json(), {
    ...negocio,
    shapeName: 'Guatemala',
    shapeISO: 'GT-GU',
    inside: true,
    distance: response.json().distance
  });
  assert.equal(typeof response.json().distance, 'number');
  assert.ok(response.json().distance >= 0);
});

test('uses DEPNEG instead of a fixed department and accepts padded numeric text', async (t) => {
  const testApp = createTestApp(t, async () => ({ ...negocio, DEPNEG: ' 01 ' }));
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().DEPNEG, 1);
  assert.equal(response.json().shapeISO, 'GT-AV');
  assert.equal(response.json().shapeName, 'Alta Verapaz');
  assert.equal(response.json().inside, false);
});

test('returns business not found when the SQL query has no rows', async (t) => {
  const testApp = createTestApp(t, async () => null);
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: 'No se encontró el negocio', identificador });
});

test('returns business not found for missing or unknown DEPNEG', async (t) => {
  for (const DEPNEG of [undefined, null, '', 999, 'unknown', true]) {
    await t.test(`DEPNEG: ${String(DEPNEG)}`, async (t) => {
      const testApp = createTestApp(t, async () => ({ ...negocio, DEPNEG }));
      const response = await testApp.inject({
        method: 'POST',
        url: '/api/v1/geofences/check',
        headers,
        payload: { identificador, lat: 14.6349, lot: -90.5069 }
      });

      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json(), { error: 'No se encontró el negocio', identificador });
    });
  }
});

test('keeps simultaneous business lookups and department results separate', async (t) => {
  const businesses = new Map([
    [identificador, negocio],
    ['0123456789013', { NOMNEG: 'Otro negocio', DEPNEG: 22, DPI: '0123456789013' }]
  ]);
  const testApp = createTestApp(t, async (dpi) => {
    await new Promise((resolve) => setImmediate(resolve));
    return businesses.get(dpi);
  });
  const responses = await Promise.all([...businesses.keys()].map((dpi) => testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador: dpi, lat: 14.6349, lot: -90.5069 }
  })));

  assert.ok(responses.every((response) => response.statusCode === 200));
  assert.deepEqual(responses.map((response) => {
    const { NOMNEG, DEPNEG, DPI, shapeISO } = response.json();
    return { NOMNEG, DEPNEG, DPI, shapeISO };
  }), [
    { ...negocio, shapeISO: 'GT-GU' },
    { NOMNEG: 'Otro negocio', DEPNEG: 22, DPI: '0123456789013', shapeISO: 'GT-ZA' }
  ]);
});

test('returns a server error when SQL fails instead of reporting a missing business', async (t) => {
  const testApp = createTestApp(t, async () => { throw new Error('SQL connection failed'); });
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador, lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: 'Internal Server Error' });
});

test('reports a location outside the geofence', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador, lat: 19.43, lot: -99.13 }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().inside, false);
});

test('rejects invalid coordinates', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { identificador, lat: 95, lot: -90.5 }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'Invalid request');
});

test('requires the commerce DPI', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/geofences/check',
    headers,
    payload: { lat: 14.6349, lot: -90.5069 }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'Invalid request');
});

test('rejects a DPI without exactly 13 digits', async (t) => {
  for (const invalidDpi of ['', '123456789012', '12345678901234', '123456789012A', ' 1234567890123', null]) {
    await t.test(`DPI: ${JSON.stringify(invalidDpi)}`, async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/geofences/check',
        headers,
        payload: { identificador: invalidDpi, lat: 14.6349, lot: -90.5069 }
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error, 'Invalid request');
    });
  }
});
