import { Generated } from "kysely";

export enum ChatMessageType {
  REGULAR = "REGULAR",
  SYSTEM = "SYSTEM",
  PRIVATE = "PRIVATE",
}

export interface ChatMessage {
  senderId: string;
  message: string;
  timestamp: number;
  type: ChatMessageType;
  receiverId?: string | null; // Изменим тип на string | null | undefined для совместимости с БД
  metadata?: {
    username?: string;
    color?: string;
    read?: boolean;
    [key: string]: any; // Добавим индексную сигнатуру для других полей
  };
}

// DTO для отправки сообщений клиенту
export interface ChatMessageDTO {
  id?: string;
  senderId: string;
  message: string;
  timestamp: number;
  type: ChatMessageType;
  metadata?: {
    username?: string;
    color?: string;
  };
}

// Функция для создания системного сообщения
export function createSystemMessage(message: string): ChatMessage {
  return {
    senderId: "system",
    message,
    timestamp: Date.now(),
    type: ChatMessageType.SYSTEM,
    metadata: {
      username: "Система",
      color: "#ff0000",
    },
  };
}

// Добавляем интерфейс для таблицы chat_messages в БД (для Kysely)
export interface ChatMessageTable {
  id: Generated<string>;
  sender_id: string;
  message: string;
  timestamp: bigint;
  type: string;
  receiver_id: string | null;
  metadata: Record<string, unknown>;
}
