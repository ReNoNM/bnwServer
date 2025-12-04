import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendMessage, sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { clients } from "../socketHandler";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { getCalendarSettings, getCurrentDate } from "../../game/engine/gameEventSystem";
import { events } from "../../game/engine/timeManager";

// Обработчик пинга
function handlePing(ws: WebSocket, data: any): void {
  sendMessage(ws, "system/pong", { timestamp: Date.now() });
}

// Обработчик понга (если нужно что-то делать при получении понга)
function handlePong(ws: WebSocket, data: any): void {
  // Находим клиента для данного WebSocket соединения
  const clientInfo = clients.find((client) => client.ws === ws);

  if (clientInfo) {
    // Обновляем время последней активности
    clientInfo.lastActivity = Date.now();
    log(`Pong получен от клиента ${clientInfo.username || clientInfo.id || "неизвестный пользователь"}`);
  }
}

async function handleGetDate(ws: WebSocket): Promise<void> {
  try {
    const date = getCurrentDate();
    const settings = getCalendarSettings();

    // Вычисляем длительность
    const durationMs = settings.secondsPerDay * 1000;

    // Если сервер только запустился и lastUpdate еще старый,
    // но таймер тикает, клиент может получить startTime в прошлом.
    // Это нормально, прогресс бар просто заполнится согласно прошедшему времени.

    sendSuccess(ws, "system/getDate", {
      year: date.year,
      month: date.month,
      day: date.day,

      // Поля для прогресс-бара в стиле Mining:
      startTime: date.lastUpdate, // Используем сохраненное время последнего обновления
      duration: durationMs,
    });
  } catch (error) {
    handleError(error as Error, "system.getDate");
    sendSystemError(ws, "Ошибка при получении даты");
  }
}
// Регистрация обработчиков системных сообщений
export function registerSystemHandlers(): void {
  registerHandler("system", "ping", handlePing);
  registerHandler("system", "pong", handlePong);
  registerHandler("system", "getDate", handleGetDate);
}
