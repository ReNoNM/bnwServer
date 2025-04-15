// import { WebSocket } from "ws";
// import { log, error as logError } from "../utils/logger";
// import { handleError } from "../utils/errorHandler";
// import { validateToken } from "../utils/tokenUtils";

// // Тип для хранения обработчиков сообщений
// type MessageHandler = (ws: WebSocket, data: any) => void;

// // Маршрутизатор сообщений
// const routes: Record<string, Record<string, MessageHandler>> = {};

// // Регистрация обработчика для определенного маршрута и действия
// export function registerHandler(route: string, action: string, handler: MessageHandler): void {
//   if (!routes[route]) {
//     routes[route] = {};
//   }
//   routes[route][action] = handler;
//   log(`Зарегистрирован обработчик для ${route}/${action}`);
// }

// // Проверяем, требуется ли аутентификация для маршрута
// const requiresAuth: Record<string, boolean> = {
//   'auth': false,   // Маршруты аутентификации не требуют предварительной авторизации
//   'chat': true,    // Маршруты чата требуют авторизацию
//   'player': true,  // Маршруты игрока требуют авторизацию
//   'system': false  // Системные маршруты (пинг, статус) не требуют авторизации
// };

// // Диспетчер сообщений
// export function dispatchMessage(ws: WebSocket, data: string): void {
//   try {
//     const message = JSON.parse(data);

//     // Обновляем время последней активности
//     (ws as any).lastActivity = Date.now();

//     // Проверяем формат сообщения
//     if (!message.action || typeof message.action !== 'string') {
//       sendErrorResponse(ws, 'Некорректный формат сообщения. Ожидается поле "action"');
//       return;
//     }

//     // Разбираем маршрут в формате "route/action"
//     const [route, action] = message.action.split('/');

//     if (!route || !action) {
//       sendErrorResponse(ws, 'Некорректный формат action. Ожидается "route/action"');
//       return;
//     }

//     // Обработка пинга
//     if (route === 'system' && action === 'ping') {
//       ws.send(JSON.stringify({
//         action: 'system/pong',
//         data: { timestamp: Date.now() }
//       }));
//       return;
//     }

//     // Проверка авторизации
//     if (requiresAuth[route] && !(ws as any).playerData) {
//       sendErrorResponse(ws, 'Требуется авторизация');
//       return;
//     }

//     // Поиск обработчика
//     const routeHandlers = routes[route];
//     if (!routeHandlers) {
//       sendErrorResponse(ws, `Неизвестный маршрут: ${route}`);
//       return;
//     }

//     const handler = routeHandlers[action];
//     if (!handler) {
//       sendErrorResponse(ws, `Неизвестное действие для маршрута ${route}: ${action}`);
//       return;
//     }

//     // Вызов обработчика
//     handler(ws, message.data || {});

//   } catch (error) {
//     handleError(error as Error, "MessageDispatcher");
//     sendErrorResponse(ws, 'Ошибка обработки сообщения');
//   }
// }

// // Вспомогательная функция для отправки ошибок
// function sendErrorResponse(ws: WebSocket, errorMessage: string): void {
//   try {
//     ws.send(JSON.stringify({
//       action: 'system/error',
//       data: { error: errorMessage }
//     }));
//   } catch (error) {
//     // Игнорируем ошибки отправки
//     logError(`Не удалось отправить сообщение об ошибке: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
//   }
// }

// // Повторная аутентификация по токену
// export function authenticateByToken(ws: WebSocket, token: string): boolean {
//   const result = validateToken(token);
//   if (result.valid && result.userId) {
//     (ws as any).playerData = { id: result.userId };
//     log(`Успешная авторизация по токену: ${result.userId}`);
//     return true;
//   }
//   return false;
// }
import { WebSocket } from "ws";
import { log, error as logError } from "../utils/logger";
import { handleError } from "../utils/errorHandler";
import { validateToken } from "../utils/tokenUtils";

// Тип для хранения обработчиков сообщений
type MessageHandler = (ws: WebSocket, data: any) => void;

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
// Для тестирования отключаем проверку для чата
const requiresAuth: Record<string, boolean> = {
  auth: false, // Маршруты аутентификации не требуют предварительной авторизации
  chat: false, // Для тестирования отключаем проверку для чата
  player: true, // Маршруты игрока требуют авторизацию
  system: false, // Системные маршруты (пинг, статус) не требуют авторизации
};

// Диспетчер сообщений
export function dispatchMessage(ws: WebSocket, data: string): void {
  try {
    const message = JSON.parse(data);

    // Обновляем время последней активности
    (ws as any).lastActivity = Date.now();

    // Проверяем формат сообщения
    if (!message.action || typeof message.action !== "string") {
      sendErrorResponse(ws, 'Некорректный формат сообщения. Ожидается поле "action"');
      return;
    }

    // Разбираем маршрут в формате "route/action"
    const [route, action] = message.action.split("/");

    if (!route || !action) {
      sendErrorResponse(ws, 'Некорректный формат action. Ожидается "route/action"');
      return;
    }

    // Обработка пинга
    if (route === "system" && action === "ping") {
      ws.send(
        JSON.stringify({
          action: "system/pong",
          data: { timestamp: Date.now() },
        })
      );
      return;
    }

    // Проверка авторизации (отключена для чата в тестовом режиме)
    if (requiresAuth[route] && !(ws as any).playerData) {
      sendErrorResponse(ws, "Требуется авторизация");
      return;
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

    // Вызов обработчика
    handler(ws, message.data || {});
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

// Повторная аутентификация по токену
export function authenticateByToken(ws: WebSocket, token: string): boolean {
  const result = validateToken(token);
  if (result.valid && result.userId) {
    (ws as any).playerData = { id: result.userId };
    log(`Успешная авторизация по токену: ${result.userId}`);
    return true;
  }
  return false;
}
