import { z } from 'zod';

export const dpiSchema = z.string().length(13).regex(/^[0-9]{13}$/, 'El DPI debe contener exactamente 13 digitos.');

export const locationSchema = z.object({
  identificador: dpiSchema,
  lat: z.number().finite().min(-90).max(90),
  lot: z.number().finite().min(-180).max(180)
}).strict();
