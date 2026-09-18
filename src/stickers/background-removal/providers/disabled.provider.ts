import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';
import { AppError } from '../../../errors/app-error';
import { ErrorCode } from '../../../errors/error-codes';

export class DisabledBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'disabled';

  async removeBackground(_input: Buffer, _options?: BackgroundRemovalOptions): Promise<Buffer> {
    throw new AppError(
      ErrorCode.FEATURE_DISABLED,
      'Fitur remove background belum tersedia.'
    );
  }
}
