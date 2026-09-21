# API de geocerca

API pequeña con Node.js, Fastify y ES Modules para comprobar si una coordenada esta dentro de un poligono.

## Instalacion

```bash
pnpm install
pnpm test
pnpm dev
```

La API inicia en `http://localhost:3000`.

La documentacion interactiva de Swagger esta disponible en `http://localhost:3000/docs` y la especificacion OpenAPI en `http://localhost:3000/docs/json`.

## Endpoint

`POST /api/v1/geofences/check`

```json
{
  "shapeISO": "GT-GU",
  "lat": 14.6349,
  "lot": -90.5069
}
```

Respuesta:

```json
{
  "shapeName": "Guatemala",
  "shapeISO": "GT-GU",
  "inside": true,
  "distance": 12.345
}
```

`distance` representa la distancia minima en kilometros hasta el limite del departamento seleccionado. `lot` representa la longitud.

Las coordenadas se validan con latitud entre `-90` y `90`, y longitud entre `-180` y `180`. El listado de los 22 departamentos de Guatemala se encuentra en `src/config/geofences.json` como un `FeatureCollection` GeoJSON. Cada `Feature` contiene el nombre del departamento y una geometria `Polygon` o `MultiPolygon`.

Los limites provienen de [geoBoundaries](https://www.geoboundaries.org/), con datos de OpenStreetMap y licencia Open Data Commons Open Database License 1.0.

## Estructura

- `src/config`: configuracion, variables de entorno y listado GeoJSON de geocercas.
- `src/controllers`: entrada HTTP y respuestas.
- `src/routes`: registro de endpoints.
- `src/schemas`: validacion de payloads.
- `src/services`: logica de negocio geoespacial.
- `tests`: pruebas de integracion usando `fastify.inject`.
