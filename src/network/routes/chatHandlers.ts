import { WebSocket } from "ws";
import { processChatMessage, getChatHistory, isSpamming } from "../../game/engine/chatEngine";
import { broadcast } from "../socketHandler";
import { log, error as logError } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError, sendMessage } from "../../utils/websocketUtils";

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
    const limit = data.limit || 50;
    const before = data.before || undefined;

    const history = await getChatHistory(limit, before);

    sendMessage(ws, "chat/history", {
      messages: history,
    });
  } catch (error) {
    handleError(error as Error, "ChatHandlers.getHistory");
    sendSystemError(ws, "Ошибка при получении истории чата");
  }
}

// Регистрация обработчиков
export function registerChatHandlers(): void {
  registerHandler("chat", "sendMessage", handleSendMessage);
  registerHandler("chat", "getHistory", handleGetHistory);
}
