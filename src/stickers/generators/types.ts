import { ProcessingResult } from '../result';
import { WAHAClient } from '../../whatsapp/waha.client';

export interface GeneratorContext {
  chatId: string;
  senderId: string;
  senderName?: string;
  session?: string;
  isGroup?: boolean;
  wahaClient?: WAHAClient;
}

export interface GeneratorInput {
  type: string;
  modifier?: string;
  text?: string;
  mediaUrl?: string;
  mimetype?: string;
  options?: Record<string, unknown>;
  content?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface StickerGenerator {
  readonly name: string;
  supports(input: GeneratorInput): boolean;
  validate(input: GeneratorInput, context: GeneratorContext): Promise<void> | void;
  process(input: GeneratorInput, context: GeneratorContext): Promise<ProcessingResult>;
}
