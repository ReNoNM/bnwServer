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
import { addOnlinePlayer, removeOnlinePlayer } from "../../game/stateManager";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { registerHandler } from "../messageDispatcher";
import { updateClientInfo } from "../socketHandler";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { generateToken, revokeAllUserTokens, revokeToken, validateToken } from "../../utils/tokenUtils";
import { playerRepository } from "../../db";

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
// В функцию handleLogin внесем изменения:
async function handleLogin(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<LoginPayload>(loginPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/login", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { email, password } = validation.data;
    log(`Попытка входа по email: ${email}`);

    const result = await authenticatePlayer(email, password);

    if (result.success && result.player) {
      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: result.player.id,
        username: result.player.username,
        email: result.player.email,
      };

      // Обновляем информацию о клиенте
      updateClientInfo(ws, result.player.id, result.player.username);

      addOnlinePlayer(result.player.id);

      const responseToken = result.token;
      log(`Вход успешен: ${email} (${result.player.username}), токен получен`);
      // Отправляем токен как строку, а не как объект
      sendSuccess(ws, "auth/login", {
        player: result.player,
        accessToken: responseToken, // Убедитесь, что это строка, а не объект
      });
    } else {
      sendError(ws, "auth/login", result.error || "Неизвестная ошибка");
      log(`Ошибка входа: ${email} - ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.login");
    sendSystemError(ws, "Ошибка при обработке запроса входа");
  }
}

// src/network/routes/authHandlers.ts (добавление)
// Обработчик обновления токена
async function handleRefreshToken(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<TokenPayload>(tokenPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/refreshToken", "Ошибка валидации токена", { details: validation.errors });
      return;
    }

    const result = await validateToken(validation.data.token);

    // Если токен истек, но был валидным
    if (!result.valid && result.expired && result.userId) {
      // Создаем новый токен
      const newToken = generateToken(result.userId);

      // Обновляем данные пользователя
      const player = await playerRepository.getById(result.userId);
      if (!player) {
        sendError(ws, "auth/refreshToken", "Пользователь не найден");
        return;
      }

      sendSuccess(ws, "auth/refreshToken", {
        accessToken: newToken, // Изменили имя поля с token на accessToken
        message: "Токен успешно обновлен",
      });

      log(`Токен обновлен для пользователя: ${player.username} (${player.id})`);
    } else if (!result.valid) {
      sendError(ws, "auth/refreshToken", "Недействительный токен");
    } else {
      // Токен еще действителен, просто возвращаем его
      sendSuccess(ws, "auth/refreshToken", {
        accessToken: validation.data.token, // Изменили имя поля с token на accessToken
        message: "Токен еще действителен",
      });
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.refreshToken");
    sendSystemError(ws, "Ошибка при обработке запроса обновления токена");
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

    const result = await validateToken(validation.data.token);

    if (result.valid && result.userId) {
      // Получаем данные пользователя
      const player = await playerRepository.getById(result.userId);

      if (!player) {
        sendError(ws, "auth/token", "Пользователь не найден");
        return;
      }

      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: player.id,
        username: player.username,
        email: player.email,
      };

      // Обновляем информацию о клиенте
      updateClientInfo(ws, player.id, player.username);

      // Добавляем игрока в список онлайн
      addOnlinePlayer(player.id);

      sendSuccess(ws, "auth/token", {
        message: "Аутентификация по токену успешна",
        player: { id: player.id, username: player.username, email: player.email },
      });

      log(`Аутентификация по токену: ${player.username} (${player.id})`);
    } else if (result.expired) {
      sendError(ws, "auth/token", "Токен истек", { expired: true });
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

async function handleLogout(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerData = (ws as any).playerData;

    // Если пользователь не авторизован, ничего не делаем
    if (!playerData || !playerData.id) {
      sendError(ws, "auth/logout", "Вы не авторизованы");
      return;
    }

    // Если передан токен, отзываем только его
    if (data.token) {
      const success = await revokeToken(data.token);

      if (success) {
        sendSuccess(ws, "auth/logout", {
          message: "Выход выполнен успешно",
        });

        // Удаляем информацию о пользователе из соединения
        delete (ws as any).playerData;

        log(`Пользователь вышел из системы: ${playerData.id}`);
      } else {
        sendError(ws, "auth/logout", "Ошибка при выходе из системы");
      }
    }
    // Если токен не передан, отзываем все токены пользователя
    else {
      const success = await revokeAllUserTokens(playerData.id);

      if (success) {
        sendSuccess(ws, "auth/logout", {
          message: "Выход выполнен успешно на всех устройствах",
        });

        // Удаляем информацию о пользователе из соединения
        delete (ws as any).playerData;

        log(`Пользователь вышел из системы на всех устройствах: ${playerData.id}`);
      } else {
        sendError(ws, "auth/logout", "Ошибка при выходе из системы");
      }
    }

    // Обновляем статус игрока с использованием метода update
    await playerRepository.update(playerData.id, { status: "offline" });

    // Удаляем из списка онлайн-игроков
    removeOnlinePlayer(playerData.id);
  } catch (error) {
    handleError(error as Error, "AuthHandlers.logout");
    sendSystemError(ws, "Ошибка при обработке запроса выхода");
  }
}
// Регистрация обработчиков
export function registerAuthHandlers(): void {
  // Обработчики для аутентификации
  registerHandler("auth", "login", handleLogin);
  registerHandler("auth", "token", handleTokenAuth);
  registerHandler("auth", "refreshToken", handleRefreshToken);
  registerHandler("auth", "logout", handleLogout);

  // Новые обработчики для трехэтапной регистрации
  registerHandler("auth", "registerEmail", handleRegisterEmail);
  registerHandler("auth", "verifyCode", handleVerifyCode);
  registerHandler("auth", "completeRegistration", handleCompleteRegistration);

  // Обработчики для восстановления пароля
  registerHandler("auth", "passwordResetRequest", handlePasswordResetRequest);
  registerHandler("auth", "passwordReset", handlePasswordReset);
}
