import { ChatMessage, ChatMessageType } from "../../db/models/chatMessage";
import { addChatMessage, getChatMessages, getPlayerById } from "../../db";

// Максимальное количество хранимых сообщений
const MAX_CHAT_HISTORY = 100;

// Регулярные выражения для фильтрации сообщений
const PROHIBITED_PATTERNS = [
  /^\s*$/, // Пустые сообщения
  /(.)\1{10,}/, // Повторяющиеся символы (спам)
];

// Обработка сообщения чата
export function processChatMessage(senderId: string, message: string): ChatMessage | null {
  console.log(message);
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

  // Создаем сообщение
  const chatMsg: ChatMessage = {
    senderId,
    message: trimmedMessage,
    timestamp: Date.now(),
    type: ChatMessageType.REGULAR,
  };

  // Добавляем в хранилище
  addChatMessage(chatMsg);

  // Ограничиваем размер истории чата
  pruneOldMessages();

  return chatMsg;
}

// Получение истории чата с пагинацией
export function getChatHistory(limit: number = 50, before?: number): ChatMessage[] {
  const messages = getChatMessages();

  // Фильтрация по времени, если указано
  const filteredMessages = before ? messages.filter((msg) => msg.timestamp < before) : messages;

  // Получаем последние сообщения с ограничением
  const recentMessages = filteredMessages.slice(-limit).sort((a, b) => a.timestamp - b.timestamp);

  // Обогащаем сообщения данными пользователей
  return recentMessages.map((msg) => {
    // Находим пользователя по ID
    const player = getPlayerById(msg.senderId);

    // Добавляем имя пользователя в метаданные сообщения
    return {
      ...msg,
      metadata: {
        ...(msg.metadata || {}),
        username: player ? player.username : "Неизвестный пользователь",
      },
    };
  });
}

// Удаление старых сообщений для экономии памяти
function pruneOldMessages(): void {
  const messages = getChatMessages();
  if (messages.length > MAX_CHAT_HISTORY) {
    // Оставляем только последние MAX_CHAT_HISTORY сообщений
    const messagesToKeep = messages.slice(-MAX_CHAT_HISTORY);
    // Очищаем массив и добавляем сообщения, которые хотим сохранить
    messages.length = 0;
    messages.push(...messagesToKeep);
  }
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
