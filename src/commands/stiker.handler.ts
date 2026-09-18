import { ParsedCommand } from './parser';
import { StickerService } from '../stickers/sticker.service';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { logger } from '../observability/logger';

export function createStikerHandler(stickerService: StickerService) {
  return async function handleStiker(command: ParsedCommand, message: any): Promise<any> {
    try {
      const result = await stickerService.process({
        command: `!${command.name}`,
        args: command.args,
        reply: message.reply,
        media: message.media,
        chatId: message.chatId,
        senderId: message.senderId,
        senderName: message.senderName,
        isGroup: message.isGroup,
      });

      if (!result) {
        throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Unsupported input');
      }

      return result;
    } catch (err) {
      logger.error('Stiker handler error', { error: String(err), command: command.name });
      throw err;
    }
  };
}
