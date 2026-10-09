export interface WAHAPayload {
  event: string;
  session: string;
  payload: WahaMessage;
}

type WahaIdentifier = string | { _serialized: string; user?: string; server?: string };

export interface WahaMessage {
  id: string;
  timestamp: number;
  body: string;
  from: string;
  to?: string;
  fromMe?: boolean;
  participant?: string;
  notifyName?: string;
  hasMedia?: boolean;
  media?: {
    url: string;
    mimetype: string;
    filename: string | null;
    error: string | null;
  };
  replyTo?: {
    id: string;
    timestamp?: number;
    body?: string;
    participant?: WahaIdentifier;
    sender?: WahaIdentifier;
    senderName?: string;
    hasMedia?: boolean;
    media?: {
      url: string;
      mimetype: string;
    };
    _data?: any;
  };
  _data?: any;
}

export interface NormalizedMessage {
  eventId: string;
  session?: string;
  messageId: string;
  /** Original message timestamp, normalized to Unix milliseconds. */
  timestamp?: number;
  chatId: string;
  senderId: string;
  senderName: string;
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
    /** Quoted message timestamp when supplied by the engine. */
    timestamp?: number;
    body?: string;
    senderId?: string;
    senderName?: string;
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
