import { checkDocumentLocations, checkLocation } from '../controllers/geofence.controller.js';
import { validateApiKey } from '../hooks/api-key.js';
import { registerGeofenceAuditHooks } from '../hooks/geofence-audit.js';

export async function geofenceRoutes(app) {
  registerGeofenceAuditHooks(app);

  app.post('/check-documents', {
    preValidation: validateApiKey,
    schema: {
      tags: ['Geofences'],
      security: [{ ApiKeyAuth: [] }],
      summary: 'Valida las coordenadas de los documentos contra el departamento de las coordenadas recibidas',
      headers: {
        type: 'object',
        required: ['x-user'],
        properties: {
          'x-user': { type: 'string', minLength: 1, maxLength: 128, description: 'Usuario que realiza la consulta.' }
        }
      },
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
          lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitud de referencia en grados decimales.' },
          lot: { type: 'number', minimum: -180, maximum: 180, description: 'Longitud de referencia en grados decimales.' }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['NOMNEG', 'DEPNEG', 'DPI', 'lat', 'lot', 'shapeName', 'shapeISO', 'documents'],
          properties: {
            NOMNEG: { type: 'string', nullable: true },
            DEPNEG: { type: 'integer', description: 'Departamento donde caen las coordenadas recibidas.' },
            DPI: { type: 'string' },
            lat: { type: 'number' },
            lot: { type: 'number' },
            shapeName: { type: 'string' },
            shapeISO: { type: 'string' },
            documents: {
              type: 'array',
              items: {
                type: 'object',
                required: ['LATITUD', 'LONGITUD', 'inside', 'distance'],
                properties: {
                  LATITUD: { type: 'number', minimum: -90, maximum: 90 },
                  LONGITUD: { type: 'number', minimum: -180, maximum: 180 },
                  inside: { type: 'boolean' },
                  distance: { type: 'number', minimum: 0 }
                }
              }
            }
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
          description: 'No se encontraron documentos o las coordenadas de referencia estan fuera de los departamentos de Guatemala.',
          required: ['error', 'identificador'],
          properties: {
            error: { type: 'string' },
            identificador: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: { error: { type: 'string' } }
        },
        503: {
          type: 'object',
          properties: { error: { type: 'string' } }
        }
      }
    }
  }, checkDocumentLocations);

  app.post('/check', {
    preValidation: validateApiKey,
    schema: {
      tags: ['Geofences'],
      security: [{ ApiKeyAuth: [] }],
      summary: 'Consulta el negocio por DPI y valida sus coordenadas contra su departamento',
      headers: {
        type: 'object',
        required: ['x-user'],
        properties: {
          'x-user': { type: 'string', minLength: 1, maxLength: 128, description: 'Usuario que realiza la consulta.' }
        }
      },
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
        },
        401: {
          type: 'object',
          properties: { error: { type: 'string' } }
        },
        503: {
          type: 'object',
          properties: { error: { type: 'string' } }
        }
      }
    }
  }, checkLocation);
}
