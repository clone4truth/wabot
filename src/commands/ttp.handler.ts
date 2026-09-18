import { ParsedCommand } from './parser';
import { StickerService } from '../stickers/sticker.service';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export function createTtpHandler(stickerService: StickerService) {
  return async function handleTtp(command: ParsedCommand, message: any): Promise<any> {
    const result = await stickerService.process({
      command: '!ttp',
      args: command.args,
      reply: message.reply,
      media: message.media,
      chatId: message.chatId,
      senderId: message.senderId,
      senderName: message.senderName,
      isGroup: message.isGroup,
    });

    if (!result) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Kirim !ttp diikuti teks');
    }

    return result;
  };
}
