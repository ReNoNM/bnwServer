import { WebSocket } from "ws";
import { dispatchMessage } from "./messageDispatcher";
import { log, error as logError } from "../utils/logger";
import { removeOnlinePlayer } from "../game/stateManager";
import config from "../../config"; // Добавляем импорт

// Отслеживание клиентских соединений
interface ClientInfo {
  ws: WebSocket;
  id?: string;
  username?: string;
  lastActivity: number;
  isAuthenticated: boolean;
}

const clients: ClientInfo[] = [];
const HEARTBEAT_INTERVAL = config.server.heartbeatInterval;

export function handleMessage(ws: WebSocket, data: string): void {
  // Делегируем обработку сообщения диспетчеру
  dispatchMessage(ws, data);
}

export function addClient(ws: WebSocket): void {
  // Добавляем информацию о новом клиенте
  const clientInfo: ClientInfo = {
    ws,
    lastActivity: Date.now(),
    isAuthenticated: false,
  };

  clients.push(clientInfo);

  log(`Новое соединение установлено, всего подключений: ${clients.length}`);

  // Настраиваем обработчики событий
  ws.on("close", () => {
    const index = clients.findIndex((client) => client.ws === ws);

    if (index !== -1) {
      // Если пользователь был аутентифицирован, удаляем его из онлайн игроков
      if (clients[index].id) {
        removeOnlinePlayer(clients[index].id);
        log(`Игрок отключился: ${clients[index].username || clients[index].id}`);
      }

      // Удаляем клиента из списка
      clients.splice(index, 1);
      log(`Соединение закрыто, осталось подключений: ${clients.length}`);
    }
  });

  ws.on("error", (err) => {
    logError(`Ошибка WebSocket: ${err.message}`);
    ws.close();
  });

  // Отправляем приветственное сообщение
  ws.send(
    JSON.stringify({
      action: "system/connect",
      data: {
        message: "Соединение с сервером установлено",
        timestamp: Date.now(),
      },
    })
  );
}

export function broadcast(message: any, exceptClient?: WebSocket): void {
  const messageStr = typeof message === "string" ? message : JSON.stringify(message);

  try {
    for (const client of clients) {
      if (client.ws !== exceptClient && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  } catch (error) {
    logError(`Ошибка при рассылке сообщения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
  }
}

// Функция отправки сообщения конкретному пользователю
export function sendToUser(userId: string, message: any): boolean {
  const messageStr = typeof message === "string" ? message : JSON.stringify(message);

  try {
    const client = clients.find((c) => c.id === userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
      return true;
    }
    return false;
  } catch (error) {
    logError(`Ошибка при отправке сообщения пользователю ${userId}: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Старт проверки соединений (heartbeat)
export function startHeartbeat(): void {
  setInterval(() => {
    const now = Date.now();

    clients.forEach((client) => {
      // Проверяем активность клиента
      const inactiveTime = now - client.lastActivity;

      // Если клиент неактивен более 2 минут, закрываем соединение
      if (inactiveTime > 120000) {
        log(`Закрытие неактивного соединения ${client.username || client.id || "неизвестный пользователь"}`);
        client.ws.close(1000, "Превышено время бездействия");
        return;
      }

      // Если клиент не отвечал более 30 секунд, отправляем пинг
      if (inactiveTime > 30000 && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(
            JSON.stringify({
              action: "system/ping",
              data: { timestamp: now },
            })
          );
        } catch (error) {
          // Если не удается отправить сообщение, закрываем соединение
          client.ws.close();
        }
      }
    });
  }, HEARTBEAT_INTERVAL);
}

// Обновление информации о клиенте после аутентификации
export function updateClientInfo(ws: WebSocket, id: string, username: string): void {
  const client = clients.find((c) => c.ws === ws);
  if (client) {
    client.id = id;
    client.username = username;
    client.isAuthenticated = true;
    client.lastActivity = Date.now();
    log(`Обновлена информация о клиенте: ${username} (${id})`);
  }
}
