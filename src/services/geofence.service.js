import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';
import geofences from '../config/geofences.json' with { type: 'json' };
import departamentosShapeISO from '../config/deptos.js';
import { findCommerceByDpi, findCommerceDocumentsByDpi } from './commerce.service.js';

function getRings(geometry) {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates;
  }

  return geometry.coordinates.flat();
}

function getDepartmentGeofence(departmentId) {
  const id = ['number', 'string'].includes(typeof departmentId)
    ? Number(departmentId)
    : NaN;
  const departamento = departamentosShapeISO.find(({ id: department }) => department === id);

  if (!departamento) {
    return null;
  }

  const geofence = geofences.features.find(({ properties }) => (
    properties.shapeISO?.toUpperCase() === departamento.shapIso.toUpperCase()
  ));

  if (!geofence) {
    return null;
  }

  return {
    departamento,
    geofence
  };
}

function findDepartmentAtLocation(lat, lot) {
  const location = point([lot, lat]);
  const geofence = geofences.features.find((feature) => (
    booleanPointInPolygon(location, feature, { ignoreBoundary: false })
  ));
  if (!geofence) {
    return null;
  }

  const departamento = departamentosShapeISO.find(({ shapIso }) => (
    shapIso.toUpperCase() === geofence.properties.shapeISO?.toUpperCase()
  ));
  return departamento ? { departamento, geofence } : null;
}

function measureLocation(geofence, lat, lot) {
  const location = point([lot, lat]);
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

export async function findGeofenceLocation(identificador, lat, lot, commerceOptions = {}) {
  const comercio = await findCommerceByDpi(identificador, commerceOptions);

  if (!comercio) {
    return null;
  }

  const department = getDepartmentGeofence(comercio.DEPNEG);
  if (!department) {
    return null;
  }
  const result = measureLocation(department.geofence, lat, lot);

  return {
    NOMNEG: comercio.NOMNEG,
    DEPNEG: department.departamento.id,
    DPI: String(comercio.DPI),
    shapeName: result.shapeName,
    shapeISO: result.shapeISO,
    inside: result.inside,
    distance: result.distance
  };
}

export async function findDocumentGeofenceLocations(identificador, lat, lot, commerceOptions = {}) {
  const documents = await findCommerceDocumentsByDpi(identificador, commerceOptions);

  if (documents.length === 0) {
    return null;
  }

  const reference = findDepartmentAtLocation(lat, lot);
  if (!reference) {
    return null;
  }

  const first = documents[0];
  const locations = documents.map((document) => {
    const latitudeIsBlank = typeof document.LATITUD === 'string' && document.LATITUD.trim() === '';
    const longitudeIsBlank = typeof document.LONGITUD === 'string' && document.LONGITUD.trim() === '';
    const lat = Number(document.LATITUD);
    const lot = Number(document.LONGITUD);
    if (
      document.LATITUD === null || document.LATITUD === undefined || document.LATITUD === ''
      || document.LONGITUD === null || document.LONGITUD === undefined || document.LONGITUD === ''
      || latitudeIsBlank || longitudeIsBlank
      || !Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lot) || lot < -180 || lot > 180
    ) {
      throw new Error('Un documento contiene coordenadas inválidas.');
    }

    const result = measureLocation(reference.geofence, lat, lot);
    return {
      LATITUD: lat,
      LONGITUD: lot,
      inside: result.inside,
      distance: result.distance
    };
  });

  return {
    NOMNEG: first.NOMNEG,
    DEPNEG: reference.departamento.id,
    DPI: String(first.DPI),
    lat,
    lot,
    shapeName: reference.geofence.properties.shapeName,
    shapeISO: reference.geofence.properties.shapeISO,
    documents: locations
  };
}
