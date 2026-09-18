export interface BackgroundRemovalOptions {
  timeoutMs?: number;
  /** AbortSignal untuk cancellation dari caller. */
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface BackgroundRemovalProvider {
  readonly name: string;
  removeBackground(input: Buffer, options?: BackgroundRemovalOptions): Promise<Buffer>;
}
