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

  const { shapeISO, lat, lot } = result.data;
  const location = findGeofenceLocation(shapeISO, lat, lot);

  if (!location) {
    return reply.status(404).send({
      error: 'Geofence not found',
      shapeISO
    });
  }

  return reply.send(location);
}
