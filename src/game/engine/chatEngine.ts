import { ChatMessage, ChatMessageType } from "../../db/models/chatMessage";
import { addChatMessage, getRecentChatMessages, getPlayerById } from "../../db";

// Максимальное количество хранимых сообщений
const MAX_CHAT_HISTORY = 100;

// Регулярные выражения для фильтрации сообщений
const PROHIBITED_PATTERNS = [
  /^\s*$/, // Пустые сообщения
  /(.)\1{10,}/, // Повторяющиеся символы (спам)
];

// Обработка сообщения чата
export async function processChatMessage(senderId: string, message: string, username: string = "Пользователь"): Promise<ChatMessage | null> {
  // Проверка на пустое сообщение
  if (!message || message.trim() === "") {
    return null;
  }

  // Фильтрация спама и недопустимого содержимого
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(message)) {
      return null;
    }
  }

  // Ограничение длины сообщения
  const trimmedMessage = message.length > 500 ? message.substring(0, 500) + "..." : message;

  try {
    // Создаем сообщение
    const chatMsg: ChatMessage = {
      senderId: senderId,
      message: trimmedMessage,
      timestamp: Date.now(),
      type: ChatMessageType.REGULAR,
      metadata: {
        username: username,
      },
    };

    // Добавляем в хранилище
    const savedMessage = await addChatMessage(chatMsg);

    return savedMessage || null;
  } catch (error) {
    console.error("Ошибка при обработке сообщения чата:", error);
    return null;
  }
}

// Получение истории чата с пагинацией
export async function getChatHistory(limit: number = 50, before?: number): Promise<ChatMessage[]> {
  // Получаем сообщения из базы данных
  const messages = await getRecentChatMessages(limit);

  // Фильтрация по времени, если указано
  const filteredMessages = before ? messages.filter((msg) => msg.timestamp < before) : messages;

  return filteredMessages;
}

// Проверка на спам (можно использовать для ограничения частоты сообщений)
const userLastMessageTime: Record<string, number> = {};
const SPAM_THRESHOLD = 1000; // 1 секунда между сообщениями

export function isSpamming(userId: string): boolean {
  const now = Date.now();
  const lastTime = userLastMessageTime[userId] || 0;

  // Если прошло меньше порогового значения, считаем это спамом
  if (now - lastTime < SPAM_THRESHOLD) {
    return true;
  }

  // Обновляем время последнего сообщения
  userLastMessageTime[userId] = now;
  return false;
}
