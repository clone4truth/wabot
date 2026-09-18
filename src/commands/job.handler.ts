import { defaultJobManager } from '../stickers/jobs/job-manager';
import { hashIdentifier } from '../observability/privacy';

export function handleJobCommand(senderId: string): string {
  const ownerHash = hashIdentifier(senderId);
  const active = defaultJobManager.getActiveJobs(ownerHash);

  if (active.length === 0) {
    return 'ℹ️ Tidak ada proses stiker aktif untuk nomor kamu.';
  }

  const lines = ['⏱️ *Status Job Aktif:*', ''];
  for (const j of active) {
    lines.push(`• *${j.type.toUpperCase()}* — Status: _${j.status}_ (sejak ${j.createdAt.toLocaleTimeString()})`);
  }
  return lines.join('\n');
}
