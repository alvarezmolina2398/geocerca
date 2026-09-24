import { checkLocation } from '../controllers/geofence.controller.js';

export async function geofenceRoutes(app) {
  app.post('/check', {
    schema: {
      tags: ['Geofences'],
      summary: 'Consulta el negocio por DPI y valida sus coordenadas contra su departamento',
      body: {
        type: 'object',
        required: ['identificador', 'lat', 'lot'],
        additionalProperties: false,
        properties: {
          identificador: {
            type: 'string',
            minLength: 13,
            maxLength: 13,
            pattern: '^[0-9]{13}$',
            description: 'DPI del comercio, como una cadena de 13 digitos.',
            examples: ['0123456789012']
          },
          lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitud en grados decimales.' },
          lot: { type: 'number', minimum: -180, maximum: 180, description: 'Longitud en grados decimales.' }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['NOMNEG', 'DEPNEG', 'DPI', 'shapeName', 'shapeISO', 'inside', 'distance'],
          properties: {
            NOMNEG: { type: 'string', nullable: true, description: 'Nombre del negocio registrado.' },
            DEPNEG: { type: 'integer', description: 'Identificador del departamento del negocio.' },
            DPI: { type: 'string', description: 'DPI del negocio consultado.' },
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
          description: 'No se encontró el negocio o su DEPNEG no tiene un departamento asociado.',
          required: ['error', 'identificador'],
          properties: {
            error: { type: 'string' },
            identificador: { type: 'string' }
          }
        }
      }
    }
  }, checkLocation);
}
