export interface BackgroundRemovalOptions {
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface BackgroundRemovalProvider {
  readonly name: string;
  removeBackground(input: Buffer, options?: BackgroundRemovalOptions): Promise<Buffer>;
}
