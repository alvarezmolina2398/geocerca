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
  "identificador": "0123456789012",
  "lat": 14.6349,
  "lot": -90.5069
}
```

Respuesta:

```json
{
  "NOMNEG": "Tienda de ejemplo",
  "DEPNEG": 7,
  "DPI": "0123456789012",
  "shapeName": "Guatemala",
  "shapeISO": "GT-GU",
  "inside": true,
  "distance": 12.345
}
```

`distance` representa la distancia minima en kilometros hasta el limite del departamento seleccionado. `lot` representa la longitud.

`identificador` es obligatorio y representa el DPI del comercio. Se envia como una cadena de exactamente 13 digitos para conservar los ceros iniciales. El cuerpo de la solicitud solo recibe `identificador`, `lat` y `lot`.

El servicio consulta el negocio con el DPI recibido. Usa `DEPNEG` para buscar el departamento en `src/config/deptos.js` y obtiene su `shapeISO` para comprobar las coordenadas. La respuesta incluye `NOMNEG`, `DEPNEG` (como entero) y `DPI` (como texto), junto con el resultado geografico. `DEPNEG` admite valores numericos o texto numerico, incluyendo ceros iniciales y espacios.

Si la consulta no devuelve datos o `DEPNEG` esta ausente o no corresponde a un departamento, responde HTTP `404`:

```json
{
  "error": "No se encontró el negocio",
  "identificador": "0123456789012"
}
```

Una falla de conexion o de consulta devuelve HTTP `500`. Un negocio existente con coordenadas fuera de su departamento recibe HTTP `200` con `inside: false`.

Las coordenadas se validan con latitud entre `-90` y `90`, y longitud entre `-180` y `180`. El listado de los 22 departamentos de Guatemala se encuentra en `src/config/geofences.json` como un `FeatureCollection` GeoJSON. Cada `Feature` contiene el nombre del departamento y una geometria `Polygon` o `MultiPolygon`.

Los limites provienen de [geoBoundaries](https://www.geoboundaries.org/), con datos de OpenStreetMap y licencia Open Data Commons Open Database License 1.0.

## Consulta de comercios en SQL Server

Configura en `.env` los valores `SQL_SERVER`, `SQL_PORT`, `SQL_DATABASE`, `SQL_USER` y `SQL_PASSWORD`. Si un valor contiene `#` o espacios, escribelo entre comillas. `.env` esta excluido de Git; `.env.example` contiene la plantilla sin credenciales.

La conexion usa autenticacion de SQL Server. `SQL_SERVER` es el host de SQL Server donde ya esta configurado el linked server `GEPROD`; `SQL_DATABASE` es la base de datos de esa conexion. La consulta remota sigue usando `GENESIS.LBALIANZAS.INFONEG`. El usuario debe poder consultar ese linked server, cuyo nombre se configura con `SQL_LINKED_SERVER`.

Metodo disponible en `src/services/commerce.service.js`:

```js
import { findCommerceByDpi } from './src/services/commerce.service.js';

const comercio = await findCommerceByDpi('0123456789012');
// { NOMNEG, DEPNEG, DPI } o null si no existe.
```

El DPI debe ser una cadena de 13 digitos. Se envia como parametro; SQL Server construye el literal que necesita `OPENQUERY`, escapando las comillas y el nombre del linked server. Se conserva `FETCH FIRST 1 ROWS ONLY` de la consulta original.

El endpoint `POST /api/v1/geofences/check` usa este metodo en cada solicitud valida y requiere la conexion configurada en `.env`.

La primera consulta abre un pool compartido. Las solicitudes simultaneas esperan la misma conexion inicial y cada consulta tiene un `Request` independiente. Si falla la conexion inicial, la siguiente solicitud puede reintentar. La configuracion se valida al usar la base de datos.

| Variable | Valor inicial | Funcion |
| --- | --- | --- |
| `SQL_POOL_MAX` | `10` | Maximo de conexiones por proceso de Node.js. |
| `SQL_POOL_MIN` | `0` | Minimo de conexiones conservadas por el pool. |
| `SQL_POOL_IDLE_TIMEOUT_MS` | `30000` | Tiempo de inactividad antes de liberar conexiones. |
| `SQL_POOL_ACQUIRE_TIMEOUT_MS` | `30000` | Espera maxima para obtener una conexion del pool. |
| `SQL_CONNECTION_TIMEOUT_MS` | `15000` | Tiempo limite para establecer una conexion. |
| `SQL_REQUEST_TIMEOUT_MS` | `30000` | Tiempo limite de una consulta. |
| `SQL_ENCRYPT` | `true` | Cifra la conexion a SQL Server. |
| `SQL_TRUST_SERVER_CERTIFICATE` | `false` | Valida el certificado; `true` permite certificados autofirmados cuando corresponda. |

Si ejecutas varios procesos o replicas, cada uno tendra su propio limite `SQL_POOL_MAX`. El pool no se cierra despues de cada consulta: la API lo cierra con `app.close()`, tambien al recibir `SIGINT` o `SIGTERM`. En un script independiente, llama a `await sqlServer.close()` al terminar, importando `sqlServer` desde `src/config/sql-server.js`.

Las pruebas de concurrencia usan conexiones simuladas y no requieren una base de datos real. La consulta contra `GEPROD` debe verificarse en el entorno con sus credenciales y permisos.

## Estructura

- `src/config`: configuracion, variables de entorno y listado GeoJSON de geocercas.
- `src/controllers`: entrada HTTP y respuestas.
- `src/routes`: registro de endpoints.
- `src/schemas`: validacion de payloads.
- `src/services`: logica de negocio geoespacial.
- `tests`: pruebas de integracion usando `fastify.inject`.
