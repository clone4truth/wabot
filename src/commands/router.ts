import { ParsedCommand } from './parser';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export type CommandHandler = (command: ParsedCommand, message: any) => Promise<any>;

export class CommandRouter {
  private handlers = new Map<string, CommandHandler>();

  register(name: string, handler: CommandHandler): void {
    this.handlers.set(name.toLowerCase(), handler);
  }

  async dispatch(command: ParsedCommand, message: any): Promise<any> {
    const handler = this.handlers.get(command.name.toLowerCase());
    if (!handler) {
      throw new AppError(ErrorCode.INVALID_COMMAND, 'Unknown command');
    }
    return handler(command, message);
  }

  has(name: string): boolean {
    return this.handlers.has(name.toLowerCase());
  }
}
