import { WebSocket } from "ws";
import { authenticatePlayer, initiateRegistration, verifyRegistrationCode, completeRegistration } from "../../game/engine/authEngine";
import {
  validateMessage,
  loginPayloadSchema,
  tokenPayloadSchema,
  registerEmailPayloadSchema,
  verifyCodePayloadSchema,
  completeRegistrationPayloadSchema,
} from "../middleware/validation";
import {
  type LoginPayload,
  type TokenPayload,
  type RegisterEmailPayload,
  type VerifyCodePayload,
  type CompleteRegistrationPayload,
} from "../middleware/validation";
import { addOnlinePlayer } from "../../game/stateManager";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { registerHandler } from "../messageDispatcher";
import { updateClientInfo } from "../socketHandler";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { validateToken } from "../../utils/tokenUtils";

// Обработчик первого шага регистрации (отправка кода на почту)
async function handleRegisterEmail(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<RegisterEmailPayload>(registerEmailPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/registerEmail", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { email, password } = validation.data;
    log(`Попытка начала регистрации: ${email}`);

    const result = await initiateRegistration(email, password);

    if (result.success) {
      sendSuccess(ws, "auth/registerEmail", {
        email,
        message: "На указанный email отправлен код подтверждения",
      });
      log(`Код подтверждения отправлен: ${email}`);
    } else {
      sendError(ws, "auth/registerEmail", result.error || "Неизвестная ошибка");
      log(`Ошибка начала регистрации: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.registerEmail");
    sendSystemError(ws, "Ошибка при обработке запроса начала регистрации");
  }
}

// Обработчик второго шага регистрации (проверка кода)
async function handleVerifyCode(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<VerifyCodePayload>(verifyCodePayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/verifyCode", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { email, code } = validation.data;
    log(`Попытка подтверждения кода: ${email}`);

    const result = await verifyRegistrationCode(email, code);

    if (result.success && result.verificationToken) {
      sendSuccess(ws, "auth/verifyCode", {
        email,
        verificationToken: result.verificationToken,
        message: "Код подтвержден. Теперь выберите имя пользователя",
      });
      log(`Код подтвержден: ${email}`);
    } else {
      sendError(ws, "auth/verifyCode", result.error || "Неизвестная ошибка");
      log(`Ошибка подтверждения кода: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.verifyCode");
    sendSystemError(ws, "Ошибка при обработке запроса подтверждения кода");
  }
}

// Обработчик третьего шага регистрации (ввод имени)
async function handleCompleteRegistration(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<CompleteRegistrationPayload>(completeRegistrationPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/completeRegistration", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { email, username, verificationToken } = validation.data;
    log(`Попытка завершения регистрации: ${email} с именем ${username}`);

    const result = await completeRegistration(email, username, verificationToken);

    if (result.success && result.player) {
      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: result.player.id,
        username: result.player.username,
      };

      // Обновляем информацию о клиенте
      updateClientInfo(ws, result.player.id, result.player.username);

      addOnlinePlayer(result.player.id);

      sendSuccess(ws, "auth/completeRegistration", {
        player: result.player,
        token: result.token,
      });

      log(`Регистрация успешно завершена: ${username}`);
    } else {
      sendError(ws, "auth/completeRegistration", result.error || "Неизвестная ошибка");
      log(`Ошибка завершения регистрации: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.completeRegistration");
    sendSystemError(ws, "Ошибка при обработке запроса завершения регистрации");
  }
}

// Обработчик входа
async function handleLogin(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<LoginPayload>(loginPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/login", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { username, password } = validation.data;
    log(`Попытка входа: ${username}`);

    const result = await authenticatePlayer(username, password);

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
async function handleTokenAuth(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<TokenPayload>(tokenPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/token", "Ошибка валидации токена", { details: validation.errors });
      return;
    }

    const result = validateToken(validation.data.token);

    if (result.valid && result.userId) {
      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: result.userId,
      };

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

// Обработчик для восстановления пароля (отправка кода)
async function handlePasswordResetRequest(ws: WebSocket, data: any): Promise<void> {
  try {
    // Тут должна быть проверка email и отправка кода восстановления
    // Это просто заглушка для примера
    sendSuccess(ws, "auth/passwordResetRequest", {
      message: "Инструкции по восстановлению пароля отправлены на указанный email",
    });
  } catch (error) {
    handleError(error as Error, "AuthHandlers.passwordResetRequest");
    sendSystemError(ws, "Ошибка при обработке запроса восстановления пароля");
  }
}

// Обработчик для смены пароля
async function handlePasswordReset(ws: WebSocket, data: any): Promise<void> {
  try {
    // Тут должна быть проверка кода и смена пароля
    // Это просто заглушка для примера
    sendSuccess(ws, "auth/passwordReset", {
      message: "Пароль успешно изменен",
    });
  } catch (error) {
    handleError(error as Error, "AuthHandlers.passwordReset");
    sendSystemError(ws, "Ошибка при обработке запроса смены пароля");
  }
}

// Регистрация обработчиков
export function registerAuthHandlers(): void {
  // Обработчики для аутентификации
  registerHandler("auth", "login", handleLogin);
  registerHandler("auth", "token", handleTokenAuth);

  // Новые обработчики для трехэтапной регистрации
  registerHandler("auth", "registerEmail", handleRegisterEmail);
  registerHandler("auth", "verifyCode", handleVerifyCode);
  registerHandler("auth", "completeRegistration", handleCompleteRegistration);

  // Обработчики для восстановления пароля
  registerHandler("auth", "passwordResetRequest", handlePasswordResetRequest);
  registerHandler("auth", "passwordReset", handlePasswordReset);
}
