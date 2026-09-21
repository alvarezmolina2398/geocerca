import 'dotenv/config';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

export const env = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number.isNaN(port) ? 3000 : port
};
