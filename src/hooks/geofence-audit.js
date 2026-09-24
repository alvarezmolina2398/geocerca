export function registerGeofenceAuditHooks(app) {
  app.decorateRequest('auditContext', null);

  app.addHook('onRequest', async (request) => {
    const usuario = request.headers['x-user'];
    request.auditContext = {
      requestId: request.id,
      requestedAt: new Date().toISOString(),
      usuario: typeof usuario === 'string' ? usuario.trim() || null : null,
      method: request.method,
      path: request.routeOptions.url,
      received: null,
      responded: null
    };
  });

  app.addHook('preValidation', async (request) => {
    // Conserva lo recibido antes de que la validacion transforme el cuerpo.
    request.auditContext.received = JSON.stringify(request.body ?? null);
  });

  app.addHook('onSend', async (request, reply, payload) => {
    request.auditContext.responded = typeof payload === 'string'
      ? payload
      : Buffer.isBuffer(payload) ? payload.toString('utf8') : null;
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    // La respuesta ya se envio. No se espera a PostgreSQL.
    try {
      const result = app.audit.record({ ...request.auditContext, statusCode: reply.statusCode });
      // Protege tambien una implementacion inyectada que devuelva una promesa.
      Promise.resolve(result).catch((error) => {
        request.log.error({ code: error?.code ?? 'AUDIT_ERROR' }, 'No se pudo registrar la auditoria.');
      });
    } catch (error) {
      request.log.error({ code: error?.code ?? 'AUDIT_ERROR' }, 'No se pudo registrar la auditoria.');
    }
  });
}
