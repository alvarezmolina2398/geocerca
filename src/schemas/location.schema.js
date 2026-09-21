import { z } from 'zod';

export const locationSchema = z.object({
  shapeISO: z.string().trim().min(1),
  lat: z.number().finite().min(-90).max(90),
  lot: z.number().finite().min(-180).max(180)
}).strict();
