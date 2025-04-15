// src/network/routes/systemHandlers.ts
import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendMessage } from "../../utils/websocketUtils";

// Обработчик пинга
function handlePing(ws: WebSocket, data: any): void {
  sendMessage(ws, "system/pong", { timestamp: Date.now() });
}

// Обработчик понга (если нужно что-то делать при получении понга)
function handlePong(ws: WebSocket, data: any): void {
  // Можно обновить время последней активности клиента
  (ws as any).lastActivity = Date.now();
}

// Регистрация обработчиков системных сообщений
export function registerSystemHandlers(): void {
  registerHandler("system", "ping", handlePing);
  registerHandler("system", "pong", handlePong);
}
