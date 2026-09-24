import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { geofenceRoutes } from './routes/geofence.routes.js';
import { sqlServer } from './config/sql-server.js';

export function buildApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const database = options.database ?? sqlServer;

  app.decorate('database', database);
  app.addHook('onClose', async () => database.close());

  app.register(swagger, {
    openapi: {
      info: {
        title: 'API de geocerca',
        description: 'Valida si una coordenada esta dentro de un departamento de Guatemala.',
        version: '1.0.0'
      },
      servers: [{ url: 'http://localhost:3000' }],
      tags: [{ name: 'System', description: 'Estado de la API' }, { name: 'Geofences', description: 'Validacion de geocercas' }]
    }
  });
  app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Comprueba el estado de la API',
      response: {
        200: {
          type: 'object',
          properties: { status: { type: 'string', example: 'ok' } }
        }
      }
    }
  }, async () => ({ status: 'ok' }));
  app.register(geofenceRoutes, { prefix: '/api/v1/geofences' });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error.validation) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: error.validation
      });
    }

    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message
    });
  });

  return app;
}
