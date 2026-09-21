import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';
import geofences from '../config/geofences.json' with { type: 'json' };

function getRings(geometry) {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates;
  }

  return geometry.coordinates.flat();
}

export function findGeofenceLocation(shapeISO, lat, lot) {
  const geofence = geofences.features.find(({ properties }) => (
    properties.shapeISO?.toUpperCase() === shapeISO.toUpperCase()
  ));

  if (!geofence) {
    return null;
  }
  console.log('Geofence found:', geofence.properties.shapeName, geofence.properties.shapeISO);
  const location = point([lot, lat]);
  console.log('Location point:', location.geometry.coordinates[1], location.geometry.coordinates[0]);
  const inside = booleanPointInPolygon(location, geofence, { ignoreBoundary: false });
  const nearestPoint = getRings(geofence.geometry)
    .map((ring) => nearestPointOnLine(lineString(ring), location, { units: 'kilometers' }))
    .sort((first, second) => first.properties.dist - second.properties.dist)[0];

  return {
    shapeName: geofence.properties.shapeName,
    shapeISO: geofence.properties.shapeISO,
    inside,
    distance: Number(nearestPoint.properties.dist.toFixed(3))
  };
}
