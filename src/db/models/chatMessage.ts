// Импортируем тип ChatMessages из сгенерированного файла
import { ChatMessages } from "./database";

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
  receiverId?: string | null;
  metadata?: {
    username?: string;
    color?: string;
    read?: boolean;
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
