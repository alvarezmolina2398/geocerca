import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';
import geofences from '../config/geofences.json' with { type: 'json' };
import departamentosShapeISO from '../config/deptos.js';
import { findCommerceByDpi } from './commerce.service.js';

function getRings(geometry) {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates;
  }

  return geometry.coordinates.flat();
}

export async function findGeofenceLocation(identificador, lat, lot, commerceOptions = {}) {
  const comercio = await findCommerceByDpi(identificador, commerceOptions);

  if (!comercio) {
    return null;
  }

  // El driver puede devolver DEPNEG como numero o texto con ceros/espacios.
  const departmentId = ['number', 'string'].includes(typeof comercio.DEPNEG)
    ? Number(comercio.DEPNEG)
    : NaN;
  const departamento = departamentosShapeISO.find(({ id }) => id === departmentId);

  if (!departamento) {
    return null;
  }

  const shapeISO = departamento.shapIso;

  const geofence = geofences.features.find(({ properties }) => (
    properties.shapeISO?.toUpperCase() === shapeISO.toUpperCase()
  ));

  if (!geofence) {
    return null;
  }
  const location = point([lot, lat]);
  const inside = booleanPointInPolygon(location, geofence, { ignoreBoundary: false });
  const nearestPoint = getRings(geofence.geometry)
    .map((ring) => nearestPointOnLine(lineString(ring), location, { units: 'kilometers' }))
    .sort((first, second) => first.properties.dist - second.properties.dist)[0];

  return {
    NOMNEG: comercio.NOMNEG,
    DEPNEG: departamento.id,
    DPI: String(comercio.DPI),
    shapeName: geofence.properties.shapeName,
    shapeISO: geofence.properties.shapeISO,
    inside,
    distance: Number(nearestPoint.properties.dist.toFixed(3))
  };
}
