import { checkLocation } from '../controllers/geofence.controller.js';

export async function geofenceRoutes(app) {
  app.post('/check', {
    schema: {
      tags: ['Geofences'],
      summary: 'Valida una coordenada contra las geocercas',
      body: {
        type: 'object',
        required: ['shapeISO', 'lat', 'lot'],
        additionalProperties: false,
        properties: {
          shapeISO: { type: 'string', minLength: 1, description: 'Codigo ISO del departamento, por ejemplo GT-GU.' },
          lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitud en grados decimales.' },
          lot: { type: 'number', minimum: -180, maximum: 180, description: 'Longitud en grados decimales.' }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['shapeName', 'shapeISO', 'inside', 'distance'],
          properties: {
            shapeName: { type: 'string' },
            shapeISO: { type: 'string' },
            inside: { type: 'boolean' },
            distance: { type: 'number', minimum: 0, description: 'Distancia minima al limite en kilometros.' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            shapeISO: { type: 'string' }
          }
        }
      }
    }
  }, checkLocation);
}
