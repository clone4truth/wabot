import { ParsedCommand } from './parser';
import { StickerService } from '../stickers/sticker.service';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export function createToimgHandler(stickerService: StickerService) {
  return async function handleToimg(command: ParsedCommand, message: any): Promise<any> {
    const result = await stickerService.process({
      command: '!toimg',
      args: '',
      reply: message.reply,
      media: message.media,
      chatId: message.chatId,
      senderId: message.senderId,
      isGroup: message.isGroup,
    });

    if (!result) {
      throw new AppError(ErrorCode.UNSUPPORTED_STICKER_TYPE, 'Animated sticker tidak bisa dikonversi ke gambar. Gunakan !togif');
    }

    return result;
  };
}
