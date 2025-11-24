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

    sendSuccess(ws, "system/getDate", {
      year: date.year,
      month: date.month,
      day: date.day,
      lastUpdate: date.lastUpdate,
      nextUpdate: events.get("gameCycleDayChange")?.executeAt,
      nextDayIn: settings.secondsPerDay,
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
