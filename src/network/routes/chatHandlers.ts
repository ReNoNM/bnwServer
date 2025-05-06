import { WebSocket } from "ws";
import { processChatMessage, getChatHistory, isSpamming } from "../../game/engine/chatEngine";
import { broadcast } from "../socketHandler";
import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError, sendMessage } from "../../utils/websocketUtils";
import { validateMessage, chatHistoryPayloadSchema, privateMessagePayloadSchema } from "../middleware/validation";
import { type ChatHistoryPayload, type PrivateMessagePayload } from "../middleware/validation";

// Простое экранирование HTML для предотвращения XSS
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Обработчик отправки сообщения - только для авторизованных пользователей
async function handleSendMessage(ws: WebSocket, data: any): Promise<void> {
  try {
    // Получаем данные пользователя из соединения
    const playerData = (ws as any).playerData;

    // Проверка авторизации
    if (!playerData || !playerData.id) {
      sendError(ws, "chat/send", "Для отправки сообщений необходимо авторизоваться");
      return;
    }

    const chatText = data.message || "";

    if (!chatText.trim()) {
      sendError(ws, "chat/send", "Сообщение не может быть пустым");
      return;
    }

    // Проверка на спам
    if (isSpamming(playerData.id)) {
      sendError(ws, "chat/send", "Слишком частая отправка сообщений. Пожалуйста, подождите");
      return;
    }

    // Экранируем сообщение для предотвращения XSS
    const sanitizedText = escapeHtml(chatText);

    // Обрабатываем сообщение
    const chatMsg = await processChatMessage(playerData.id, sanitizedText, playerData.username);

    if (!chatMsg) {
      sendError(ws, "chat/send", "Сообщение не может быть отправлено");
      return;
    }

    // Логируем сообщение
    log(`Чат: ${playerData.username}: ${chatText}`);

    // Отправляем сообщение всем подключенным клиентам
    broadcast({
      action: "chat/newMessage",
      data: {
        message: {
          ...chatMsg,
          username: playerData.username,
        },
      },
    });

    // Отправляем подтверждение отправителю
    sendSuccess(ws, "chat/send", {
      messageId: chatMsg.timestamp,
    });
  } catch (error) {
    handleError(error as Error, "ChatHandlers.sendMessage");
    sendSystemError(ws, "Ошибка при обработке сообщения");
  }
}

// Обработчик получения истории чата
async function handleGetHistory(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<ChatHistoryPayload>(chatHistoryPayloadSchema, data);

    // Используем значения по умолчанию, если валидация не прошла или данные не указаны
    let limit = 50;
    let before = undefined;

    if (validation.success) {
      limit = validation.data.limit || limit;
      before = validation.data.before;
    }

    const history = await getChatHistory(limit, before);

    sendMessage(ws, "chat/history", {
      messages: history,
    });
  } catch (error) {
    handleError(error as Error, "ChatHandlers.getHistory");
    sendSystemError(ws, "Ошибка при получении истории чата");
  }
}

// Обработчик отправки приватного сообщения
async function handlePrivateMessage(ws: WebSocket, data: any): Promise<void> {
  try {
    // Получаем данные пользователя из соединения
    const playerData = (ws as any).playerData;

    // Проверка авторизации
    if (!playerData || !playerData.id) {
      sendError(ws, "chat/privateMessage", "Для отправки личных сообщений необходимо авторизоваться");
      return;
    }

    const validation = validateMessage<PrivateMessagePayload>(privateMessagePayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "chat/privateMessage", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { receiverId, message } = validation.data;

    // Проверка на спам
    if (isSpamming(playerData.id)) {
      sendError(ws, "chat/privateMessage", "Слишком частая отправка сообщений. Пожалуйста, подождите");
      return;
    }

    // Экранируем сообщение для предотвращения XSS
    const sanitizedText = escapeHtml(message);

    // Здесь можно добавить проверку существования получателя
    // ...

    // Отправляем приватное сообщение (можно добавить реализацию в chatEngine)
    // const result = await sendPrivateMessage(playerData.id, receiverId, sanitizedText, playerData.username);

    // Пока просто заглушка
    sendSuccess(ws, "chat/privateMessage", {
      sent: true,
      timestamp: Date.now(),
    });
  } catch (error) {
    handleError(error as Error, "ChatHandlers.privateMessage");
    sendSystemError(ws, "Ошибка при отправке личного сообщения");
  }
}

// Регистрация обработчиков
export function registerChatHandlers(): void {
  registerHandler("chat", "sendMessage", handleSendMessage);
  registerHandler("chat", "getHistory", handleGetHistory);
  registerHandler("chat", "privateMessage", handlePrivateMessage);
}
