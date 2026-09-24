import { timingSafeEqual } from 'node:crypto';

export async function validateApiKey(request, reply) {
  const expected = request.server.apiKey;
  if (!expected) {
    return reply.status(503).send({ error: 'La API key no esta configurada.' });
  }

  const supplied = request.headers['x-api-key'];
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(typeof supplied === 'string' ? supplied : '');
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return reply.status(401).send({ error: 'API key invalida o ausente.' });
  }

  const usuario = request.headers['x-user'];
  if (typeof usuario !== 'string' || !usuario.trim() || usuario.trim().length > 128) {
    return reply.status(400).send({ error: 'El header x-user es obligatorio y debe tener entre 1 y 128 caracteres.' });
  }
}
