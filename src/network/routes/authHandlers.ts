import { WebSocket } from "ws";
import { registerPlayer, authenticatePlayer } from "../../game/engine/authEngine";
import { validateMessage, registerPayloadSchema, loginPayloadSchema } from "../middleware/validation";
import { addOnlinePlayer } from "../../game/stateManager";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { registerHandler } from "../messageDispatcher";
import { updateClientInfo } from "../socketHandler";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";

// Обработчик регистрации
function handleRegister(ws: WebSocket, data: any): void {
  try {
    const validation = validateMessage(registerPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/register", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { username, password } = validation.data;
    log(`Попытка регистрации: ${username}`);

    const result = registerPlayer(username, password);

    if (result.success && result.player) {
      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: result.player.id,
        username: result.player.username,
      };

      // Обновляем информацию о клиенте
      updateClientInfo(ws, result.player.id, result.player.username);

      addOnlinePlayer(result.player.id);

      sendSuccess(ws, "auth/register", {
        player: result.player,
        token: result.token,
      });

      log(`Регистрация успешна: ${username}`);
    } else {
      sendError(ws, "auth/register", result.error || "Неизвестная ошибка");
      log(`Ошибка регистрации: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.register");
    sendSystemError(ws, "Ошибка при обработке запроса регистрации");
  }
}

// Обработчик входа
function handleLogin(ws: WebSocket, data: any): void {
  try {
    const validation = validateMessage(loginPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/login", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { username, password } = validation.data;
    log(`Попытка входа: ${username}`);

    const result = authenticatePlayer(username, password);

    if (result.success && result.player) {
      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: result.player.id,
        username: result.player.username,
      };

      // Обновляем информацию о клиенте
      updateClientInfo(ws, result.player.id, result.player.username);

      addOnlinePlayer(result.player.id);

      sendSuccess(ws, "auth/login", {
        player: result.player,
        token: result.token,
      });

      log(`Вход успешен: ${username}`);
    } else {
      sendError(ws, "auth/login", result.error || "Неизвестная ошибка");
      log(`Ошибка входа: ${username} - ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.login");
    sendSystemError(ws, "Ошибка при обработке запроса входа");
  }
}

// Обработчик аутентификации по токену
function handleTokenAuth(ws: WebSocket, data: any): void {
  try {
    if (!data.token) {
      sendError(ws, "auth/token", "Токен не предоставлен");
      return;
    }

    const { authenticateByToken } = require("../messageDispatcher");
    const result = authenticateByToken(ws, data.token);

    if (result) {
      // Здесь можно загрузить дополнительные данные о пользователе
      sendSuccess(ws, "auth/token", {
        message: "Аутентификация по токену успешна",
      });
    } else {
      sendError(ws, "auth/token", "Недействительный токен");
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.token");
    sendSystemError(ws, "Ошибка при обработке запроса аутентификации по токену");
  }
}

// Регистрация обработчиков
export function registerAuthHandlers(): void {
  registerHandler("auth", "register", handleRegister);
  registerHandler("auth", "login", handleLogin);
  registerHandler("auth", "token", handleTokenAuth);
}
