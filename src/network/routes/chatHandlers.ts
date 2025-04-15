// import { WebSocket } from "ws";
// import { validateMessage, chatPayloadSchema } from "../middleware/validation";
// import { processChatMessage, getChatHistory, isSpamming } from "../../game/engine/chatEngine";
// import { broadcast } from "../socketHandler";
// import { log } from "../../utils/logger";
// import { handleError } from "../../utils/errorHandler";
// import { registerHandler } from "../messageDispatcher";
// import { sendSuccess, sendError, sendSystemError, sendMessage } from "../../utils/websocketUtils";

// // Простое экранирование HTML для предотвращения XSS
// function escapeHtml(text: string): string {
//   return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
// }

// // Обработчик отправки сообщения
// function handleSendMessage(ws: WebSocket, data: any): void {
//   try {
//     // Получаем данные о пользователе из WebSocket
//     const playerData = (ws as any).playerData;
//     if (!playerData || !playerData.id) {
//       sendError(ws, "chat/send", "Требуется аутентификация");
//       return;
//     }

//     // Заполняем senderId из аутентифицированных данных
//     const messageData = { ...data, senderId: playerData.id };

//     const validation = validateMessage(chatPayloadSchema, messageData);
//     if (!validation.success) {
//       sendError(ws, "chat/send", "Ошибка валидации", { details: validation.errors });
//       return;
//     }

//     const { senderId, message: chatText } = validation.data;

//     // Проверка на спам
//     if (isSpamming(senderId)) {
//       sendError(ws, "chat/send", "Слишком много сообщений. Пожалуйста, подождите.");
//       return;
//     }

//     // Экранируем сообщение для предотвращения XSS
//     const sanitizedText = escapeHtml(chatText);

//     // Обрабатываем сообщение
//     const chatMsg = processChatMessage(senderId, sanitizedText);

//     if (!chatMsg) {
//       sendError(ws, "chat/send", "Сообщение не может быть отправлено");
//       return;
//     }

//     // Логируем сообщение
//     log(`Чат: ${playerData.username}: ${chatText}`);

//     // Отправляем сообщение всем подключенным клиентам
//     broadcast({
//       action: "chat/newMessage",
//       data: {
//         message: {
//           ...chatMsg,
//           username: playerData.username, // Добавляем имя пользователя
//         },
//       },
//     });

//     // Отправляем подтверждение отправителю
//     sendSuccess(ws, "chat/send", {
//       messageId: chatMsg.timestamp, // Используем timestamp как временный ID
//     });
//   } catch (error) {
//     handleError(error as Error, "ChatHandlers.sendMessage");
//     sendSystemError(ws, "Ошибка при обработке сообщения");
//   }
// }

// // Обработчик получения истории чата
// function handleGetHistory(ws: WebSocket, data: any): void {
//   try {
//     const limit = data.limit || 50;
//     const before = data.before || undefined;

//     const history = getChatHistory(limit, before);

//     sendMessage(ws, "chat/history", {
//       messages: history,
//     });
//   } catch (error) {
//     handleError(error as Error, "ChatHandlers.getHistory");
//     sendSystemError(ws, "Ошибка при получении истории чата");
//   }
// }

// // Регистрация обработчиков
// export function registerChatHandlers(): void {
//   registerHandler("chat", "sendMessage", handleSendMessage);
//   registerHandler("chat", "getHistory", handleGetHistory);
// }

import { WebSocket } from "ws";
import { processChatMessage, getChatHistory } from "../../game/engine/chatEngine";
import { broadcast } from "../socketHandler";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError, sendMessage } from "../../utils/websocketUtils";

// Простое экранирование HTML для предотвращения XSS
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Обработчик отправки сообщения - упрощенная версия без проверки авторизации
function handleSendMessage(ws: WebSocket, data: any): void {
  try {
    // В упрощенной версии разрешаем пользователю указать свое имя
    const username = data.username || "Аноним";
    const chatText = data.message || "";

    if (!chatText.trim()) {
      sendError(ws, "chat/send", "Сообщение не может быть пустым");
      return;
    }

    // Генерируем временный ID для гостя
    const tempId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Экранируем сообщение для предотвращения XSS
    const sanitizedText = escapeHtml(chatText);

    // Обрабатываем сообщение
    const chatMsg = processChatMessage(tempId, sanitizedText);
    console.log("🚀 ~ handleSendMessage ~ chatMsg:", chatMsg);

    if (!chatMsg) {
      sendError(ws, "chat/send", "Сообщение не может быть отправлено");
      return;
    }

    // Логируем сообщение
    log(`Чат: ${username}: ${chatText}`);

    // Отправляем сообщение всем подключенным клиентам
    broadcast({
      action: "chat/newMessage",
      data: {
        message: {
          ...chatMsg,
          username: username,
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
function handleGetHistory(ws: WebSocket, data: any): void {
  try {
    const limit = data.limit || 50;
    const before = data.before || undefined;

    const history = getChatHistory(limit, before);

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
