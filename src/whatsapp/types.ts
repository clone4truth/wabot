export interface WAHAPayload {
  event: string;
  session: string;
  payload: WahaMessage;
}

export interface WahaMessage {
  id: string;
  timestamp: number;
  body: string;
  from: string;
  hasMedia?: boolean;
  media?: {
    url: string;
    mimetype: string;
    filename: string | null;
    error: string | null;
  };
  replyTo?: {
    id: string;
    body?: string;
    hasMedia?: boolean;
    media?: {
      url: string;
      mimetype: string;
    };
  };
}

export interface NormalizedMessage {
  eventId: string;
  messageId: string;
  chatId: string;
  senderId: string;
  participantId?: string;
  isGroup: boolean;
  fromMe: boolean;
  body: string;
  media?: {
    url: string;
    mimetype: string;
  };
  reply?: {
    messageId: string;
    body?: string;
    media?: {
      url: string;
      mimetype: string;
    };
  };
}

export interface StickerResult {
  buffer: Buffer;
  mimetype: 'image/webp';
  width: number;
  height: number;
  animated: boolean;
  size: number;
}
