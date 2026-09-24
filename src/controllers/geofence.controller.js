import { locationSchema } from '../schemas/location.schema.js';
import { findGeofenceLocation } from '../services/geofence.service.js';

export async function checkLocation(request, reply) {
  const result = locationSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      error: 'Invalid request',
      details: result.error.flatten().fieldErrors
    });
  }

  const { identificador, lat, lot } = result.data;
  const location = await findGeofenceLocation(identificador, lat, lot, {
    database: request.server.database
  });

  if (!location) {
    return reply.status(404).send({
      error: 'No se encontró el negocio',
      identificador
    });
  }

  return reply.send(location);
}
