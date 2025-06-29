// Часть файла src/network/messageDispatcher.ts
import { WebSocket } from "ws";
import { log, error as logError } from "../utils/logger";
import { handleError } from "../utils/errorHandler";
import { authenticateConnection } from "./middleware/auth";
import { validateMessage, messageSchema, Message } from "./middleware/validation";

// Тип для хранения обработчиков сообщений
type MessageHandler = (ws: WebSocket, data: any) => void | Promise<void>;

// Маршрутизатор сообщений
const routes: Record<string, Record<string, MessageHandler>> = {};

// Регистрация обработчика для определенного маршрута и действия
export function registerHandler(route: string, action: string, handler: MessageHandler): void {
  if (!routes[route]) {
    routes[route] = {};
  }
  routes[route][action] = handler;
  log(`Зарегистрирован обработчик для ${route}/${action}`);
}

// Проверяем, требуется ли аутентификация для маршрута
const requiresAuth: Record<string, boolean> = {
  auth: false, // Маршруты аутентификации не требуют предварительной авторизации
  chat: true, // Для чата требуется авторизация
  player: true, // Маршруты игрока требуют авторизацию
  system: false, // Системные маршруты (пинг, статус) не требуют авторизации
  map: false,
};

// Диспетчер сообщений
export async function dispatchMessage(ws: WebSocket, data: string): Promise<void> {
  try {
    // Парсим JSON сообщение
    let message: any;
    try {
      message = JSON.parse(data);
    } catch (e) {
      sendErrorResponse(ws, "Некорректный формат JSON");
      return;
    }

    // Обновляем время последней активности
    (ws as any).lastActivity = Date.now();

    // Валидируем базовую структуру сообщения
    const validation = validateMessage<Message>(messageSchema, message);
    if (!validation.success) {
      sendErrorResponse(ws, `Ошибка формата сообщения: ${validation.errors.join(", ")}`);
      return;
    }

    // Разбираем маршрут в формате "route/action"
    const [route, action] = validation.data.action.split("/");

    // Обработка пинга - специальный случай
    if (route === "system" && action === "ping") {
      ws.send(
        JSON.stringify({
          action: "system/pong",
          data: { timestamp: Date.now() },
        })
      );
      return;
    }

    // Проверка авторизации
    if (requiresAuth[route]) {
      // Проверяем, аутентифицирован ли пользователь уже
      if (!(ws as any).playerData) {
        // Если есть токен в сообщении, пробуем аутентифицироваться
        const token = message.data?.token;

        if (token) {
          const isAuthenticated = await authenticateConnection(ws, token);
          if (!isAuthenticated) {
            sendErrorResponse(ws, "Требуется авторизация");
            return;
          }
          // Если аутентификация успешна, продолжаем выполнение
        } else {
          sendErrorResponse(ws, "Требуется авторизация");
          return;
        }
      }
    }

    // Поиск обработчика
    const routeHandlers = routes[route];
    if (!routeHandlers) {
      sendErrorResponse(ws, `Неизвестный маршрут: ${route}`);
      return;
    }

    const handler = routeHandlers[action];
    if (!handler) {
      sendErrorResponse(ws, `Неизвестное действие для маршрута ${route}: ${action}`);
      return;
    }

    // Вызов обработчика (может быть асинхронным)
    const result = handler(ws, message.data || {});

    // Если обработчик возвращает Promise, обрабатываем возможные ошибки
    if (result instanceof Promise) {
      result.catch((error) => {
        handleError(error as Error, "MessageDispatcher");
        sendErrorResponse(ws, "Ошибка обработки сообщения");
      });
    }
  } catch (error) {
    handleError(error as Error, "MessageDispatcher");
    sendErrorResponse(ws, "Ошибка обработки сообщения");
  }
}

// Вспомогательная функция для отправки ошибок
function sendErrorResponse(ws: WebSocket, errorMessage: string): void {
  try {
    ws.send(
      JSON.stringify({
        action: "system/error",
        data: { error: errorMessage },
      })
    );
  } catch (error) {
    // Игнорируем ошибки отправки
    logError(`Не удалось отправить сообщение об ошибке: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
  }
}
