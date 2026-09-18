import { ParsedCommand } from './parser';
import { StickerService } from '../stickers/sticker.service';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export function createAttpHandler(stickerService: StickerService) {
  return async function handleAttp(command: ParsedCommand, message: any): Promise<any> {
    const result = await stickerService.process({
      command: '!attp',
      args: command.args,
      options: command.options,
      reply: message.reply,
      media: message.media,
      chatId: message.chatId,
      senderId: message.senderId,
      senderName: message.senderName,
      isGroup: message.isGroup,
      session: message.session,
    });

    if (!result) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Kirim !attp diikuti teks');
    }

    return result;
  };
}
