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

Headers obligatorios:

```http
x-api-key: valor_de_API_KEY_en_el_env
x-user: usuario-que-realiza-la-consulta
Content-Type: application/json
```

La clave se configura con `API_KEY` en `.env`. Una clave ausente o incorrecta devuelve HTTP `401`. `x-user` debe contener entre 1 y 128 caracteres; si falta, devuelve HTTP `400`. Si el servidor no tiene `API_KEY` configurada, devuelve HTTP `503`. Swagger permite ingresar la clave mediante **Authorize** y el usuario en los parametros del endpoint. `/health` y `/docs` siguen disponibles sin clave.

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

## Validar coordenadas guardadas en documentos

`POST /api/v1/geofences/check-documents` recibe el DPI del comercio y una coordenada de referencia. Consulta los documentos enlazados con `INFONEG` y usa el departamento donde cae la coordenada enviada para validar cada ubicación guardada:

```json
{
  "identificador": "0123456789012",
  "lat": 14.6349,
  "lot": -90.5069
}
```

Usa los mismos headers, API key y auditoria que `/check`. Para cada fila de `DOCUMENTOS`, compara `LATITUD` y `LONGITUD` contra el poligono del departamento donde caen `lat` y `lot`. La respuesta incluye el departamento de referencia y todos los documentos encontrados; cada uno informa sus coordenadas, `inside` y distancia minima al limite de ese departamento en kilometros:

```json
{
  "NOMNEG": "Tienda de ejemplo",
  "DEPNEG": 7,
  "DPI": "0123456789012",
  "lat": 14.6349,
  "lot": -90.5069,
  "shapeName": "Guatemala",
  "shapeISO": "GT-GU",
  "documents": [
    {
      "LATITUD": 14.6349,
      "LONGITUD": -90.5069,
      "inside": true,
      "distance": 1.234
    }
  ]
}
```

Si no hay documentos para el DPI o la coordenada de referencia cae fuera de Guatemala, devuelve HTTP `404`. Coordenadas faltantes o fuera de rango en los datos almacenados generan HTTP `500` y quedan registradas por el manejador de errores.

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

## Auditoria en PostgreSQL

Cada solicitud al endpoint de geocerca registra en `public.geofence_audit_logs`:

- Identificador de solicitud, fecha, metodo y ruta.
- Usuario recibido en `x-user`.
- Cuerpo recibido antes de las transformaciones de validacion.
- Cuerpo de la respuesta enviada y codigo HTTP.

Incluye respuestas correctas, negocios no encontrados, rechazos de autenticacion, errores de validacion y fallas de SQL Server. El header `x-api-key` no se guarda. Si la solicitud no contiene un cuerpo JSON valido, el cuerpo recibido queda como `null`.

Configura `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER` y `PG_PASSWORD` en `.env`. Usa `PG_SSL=true` para TLS; `PG_SSL_REJECT_UNAUTHORIZED=true` verifica el certificado. Para un servidor que no ofrece TLS, configura `PG_SSL=false`.

Prepara la tabla una vez, con la configuracion de PostgreSQL completa:

```bash
pnpm db:setup:postgres
```

El comando ejecuta `sql/postgres-geofence-audit.sql`. La API no crea tablas al iniciar. La cuenta que ejecuta este comando necesita permiso para crearlas; la cuenta usada por la API necesita permiso de insercion en la tabla y uso de su secuencia de identidad.

La auditoria se encola en `onResponse`, despues de enviar la respuesta HTTP. PostgreSQL usa un pool independiente de SQL Server. Los errores de conexion, consulta, configuracion o auditoria se registran y no cambian la respuesta de geocerca.

| Variable | Valor inicial | Funcion |
| --- | --- | --- |
| `PG_POOL_MAX` | `5` | Maximo de conexiones PostgreSQL por proceso. |
| `PG_CONNECTION_TIMEOUT_MS` | `5000` | Limite para conectar u obtener una conexion disponible. |
| `PG_QUERY_TIMEOUT_MS` | `10000` | Tiempo limite de consulta en el cliente y en PostgreSQL. |
| `PG_POOL_IDLE_TIMEOUT_MS` | `30000` | Tiempo de inactividad antes de liberar conexiones. |
| `PG_MAX_PENDING` | `100` | Maximo de trabajos pendientes, incluyendo consultas en ejecucion. |

Si se alcanza `PG_MAX_PENDING`, el trabajo nuevo se descarta y se registra `PG_QUEUE_FULL`; la peticion HTTP sigue su curso. La cola esta en memoria: no garantiza conservar registros ante un cierre abrupto del proceso y no reintenta escrituras fallidas. Durante un cierre normal, la API espera los trabajos aceptados y cierra ambos pools.

La funcion reutilizable `sendPostgresQuery(text, values)` esta en `src/services/postgres-background.service.js`. Se llama sin `await` y usa parametros PostgreSQL (`$1`, `$2`, etc.). Devuelve `true` si acepto el trabajo o `false` si no pudo encolarlo; ese valor no confirma que se haya guardado en la base de datos.

## Estructura

- `src/config`: configuracion, variables de entorno y listado GeoJSON de geocercas.
- `src/controllers`: entrada HTTP y respuestas.
- `src/hooks`: validacion de API key y captura de auditoria.
- `src/routes`: registro de endpoints.
- `src/schemas`: validacion de payloads.
- `src/services`: logica de negocio geoespacial.
- `tests`: pruebas de integracion usando `fastify.inject`.
- `sql`: definicion de la tabla de auditoria PostgreSQL.
- `scripts`: preparacion de la base de datos.
