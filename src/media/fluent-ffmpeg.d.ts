declare const _ffmpeg: any;
export default _ffmpeg;

export function ffmpeg(input?: string): any;
export function probe(path: string, callback: (err: any, metadata: any) => void): void;
