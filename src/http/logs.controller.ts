import { FastifyRequest, FastifyReply } from 'fastify';
import { getLogs } from '../observability/logger';

export async function logsController(_req: FastifyRequest, reply: FastifyReply) {
  reply.type('application/json').send(getLogs());
}
