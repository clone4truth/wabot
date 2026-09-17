import { FastifyRequest, FastifyReply } from 'fastify';

export async function healthController(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ status: 'ok', uptime: process.uptime() });
}
