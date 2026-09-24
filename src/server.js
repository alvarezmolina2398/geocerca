import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = buildApp();

let closing;
function shutdown() {
  closing ??= app.close().catch((error) => {
    app.log.error(error);
    process.exitCode = 1;
  });
  return closing;
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  await app.listen({ host: env.host, port: env.port });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
