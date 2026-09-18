import { FastifyRequest, FastifyReply } from 'fastify';
import { getLogs } from '../observability/logger';

export async function logsController(_req: FastifyRequest, reply: FastifyReply) {
  const logs = getLogs();
  reply.type('application/json').send(logs);
}
