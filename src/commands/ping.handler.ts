export function handlePing(): { pong: boolean; latency: number } {
  const start = Date.now();
  return { pong: true, latency: Date.now() - start };
}
