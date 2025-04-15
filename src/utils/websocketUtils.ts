import { WebSocket } from 'ws';
import { log, error as logError } from './logger';

// Тип для сообщения с action-based структурой
export interface WsMessage {
  action: string;
  data?: any;
}

/**
 * Отправляет сообщение через WebSocket соединение
 * @param ws WebSocket соединение
 * @param action строка в формате "route/action"
 * @param data данные для отправки (опционально)
 * @returns true если отправка успешна, false в случае ошибки
 */
export function sendMessage(ws: WebSocket, action: string, data?: any): boolean {
  try {
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    const message: WsMessage = {
      action,
      ...(data !== undefined ? { data } : {})
    };
    
    ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    logError(`Ошибка отправки сообщения ${action}: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    return false;
  }
}

/**
 * Отправляет сообщение об успешной операции
 */
export function sendSuccess(ws: WebSocket, action: string, data?: any): boolean {
  return sendMessage(ws, `${action}Success`, data);
}

/**
 * Отправляет сообщение о неудачной операции
 */
export function sendError(ws: WebSocket, action: string, error: string, details?: any): boolean {
  return sendMessage(ws, `${action}Failed`, { error, ...(details ? { details } : {}) });
}

/**
 * Отправляет системную ошибку
 */
export function sendSystemError(ws: WebSocket, error: string): boolean {
  return sendMessage(ws, 'system/error', { error });
}

/**
 * Отправляет broadcast-сообщение всем клиентам
 * @param clients массив WebSocket соединений
 * @param action строка в формате "route/action"
 * @param data данные для отправки (опционально)
 * @param exclude WebSocket соединение, которое нужно исключить из рассылки
 * @returns количество успешно отправленных сообщений
 */
export function broadcastMessage(
  clients: WebSocket[],
  action: string,
  data?: any,
  exclude?: WebSocket
): number {
  let successful = 0;
  
  const message = JSON.stringify({
    action,
    ...(data !== undefined ? { data } : {})
  });
  
  for (const client of clients) {
    if (client === exclude || client.readyState !== WebSocket.OPEN) {
      continue;
    }
    
    try {
      client.send(message);
      successful++;
    } catch (err) {
      logError(`Ошибка broadcast-отправки сообщения ${action}: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    }
  }
  
  return successful;
}
