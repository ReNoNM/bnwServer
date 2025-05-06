// src/network/routes/systemHandlers.ts
import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendMessage } from "../../utils/websocketUtils";
import { clients } from "../socketHandler";
import { log } from "../../utils/logger";

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
// Регистрация обработчиков системных сообщений
export function registerSystemHandlers(): void {
  registerHandler("system", "ping", handlePing);
  registerHandler("system", "pong", handlePong);
}
