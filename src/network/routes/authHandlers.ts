import { WebSocket } from "ws";
import {
  authenticatePlayer,
  initiateRegistration,
  verifyRegistrationCode,
  completeRegistration,
  initiateResetPassword,
  verifyRegistrationCodeReset,
  completeRestorePassword,
} from "../../game/engine/authEngine";
import {
  validateMessage,
  loginPayloadSchema,
  tokenPayloadSchema,
  registerEmailPayloadSchema,
  verifyCodePayloadSchema,
  completeRegistrationPayloadSchema,
  passwordResetRequestPayloadSchema,
  PasswordResetRequestPayloadSchema,
  RestorePasswordPayloadSchema,
  restorePasswordPayloadSchema,
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
import { tags } from "../../utils/data";
import { mapRepository } from "../../db/repositories";

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

    // await new Promise((resolve) => setTimeout(resolve, 5000));

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

    const { email, username, verificationToken, tagFormat, tagId, tagPosition } = validation.data;

    if (tagPosition !== "start" && tagPosition !== "end") {
      sendError(ws, "auth/completeRegistration", "Ошибка выбора тега", { details: "tagPosition" });
      return;
    }
    if (tagFormat !== "many" && tagFormat !== "single") {
      sendError(ws, "auth/completeRegistration", "Ошибка выбора тега", { details: "tagFormat" });
      return;
    }
    if (!tags[tagId - 1]) {
      sendError(ws, "auth/completeRegistration", "Ошибка выбора тега", { details: "tagId" });
      return;
    }

    log(`Попытка завершения регистрации: ${email} с именем ${username}`);

    const result = await completeRegistration(email, username, verificationToken, tagPosition, tagFormat, tagId);

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
      const tileCapital = result.player.mainWorldId
        ? await mapRepository.searchCapitalByPlayerId(result.player.mainWorldId, result.player.id)
        : undefined;
      // Обновляем информацию о клиенте
      updateClientInfo(ws, result.player.id, result.player.username);

      addOnlinePlayer(result.player.id);

      const responseToken = result.token;
      log(`Вход успешен: ${email} (${result.player.username}), токен получен`);
      sendSuccess(ws, "auth/login", {
        player: result.player,
        accessToken: responseToken,
        isCapital: !!tileCapital?.isCapital,
        x: tileCapital?.x,
        y: tileCapital?.y,
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
      const newToken = await generateToken(result.userId);

      // Обновляем данные пользователя
      const player = await playerRepository.getById(result.userId);
      if (!player) {
        sendError(ws, "auth/refreshToken", "Пользователь не найден");
        return;
      }

      sendSuccess(ws, "auth/refreshToken", {
        accessToken: newToken,
        message: "Токен успешно обновлен",
      });

      log(`Токен обновлен для пользователя: ${player.username} (${player.id})`);
    } else if (!result.valid) {
      sendError(ws, "auth/refreshToken", "Недействительный токен");
    } else {
      // Токен еще действителен, просто возвращаем его
      sendSuccess(ws, "auth/refreshToken", {
        accessToken: validation.data.token,
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
      const tileCapital = player.mainWorldId ? await mapRepository.searchCapitalByPlayerId(player.mainWorldId, player.id) : undefined;
      // Обновляем информацию о клиенте
      updateClientInfo(ws, player.id, player.username);

      // Добавляем игрока в список онлайн
      addOnlinePlayer(player.id);

      sendSuccess(ws, "auth/token", {
        message: "Аутентификация по токену успешна",
        player: player,
        isCapital: !!tileCapital?.isCapital,
        x: tileCapital?.x,
        y: tileCapital?.y,
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
    const validation = validateMessage<PasswordResetRequestPayloadSchema>(passwordResetRequestPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/passwordResetRequest", "Ошибка валидации", { details: validation.errors });
      return;
    }
    const { email } = validation.data;

    const result = await initiateResetPassword(email);

    if (result.success) {
      sendSuccess(ws, "auth/passwordResetRequest", {
        email,
        message: "На указанный email отправлен код подтверждения",
      });
      log(`Код подтверждения отправлен: ${email}`);
    } else {
      sendError(ws, "auth/passwordResetRequest", result.error || "Неизвестная ошибка");
      log(`Ошибка сброса пароля: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.passwordResetRequest");
    sendSystemError(ws, "Ошибка при обработке запроса восстановления пароля");
  }
}

async function handleVerifyCodeReset(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<VerifyCodePayload>(verifyCodePayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/verifyCodeReset", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { email, code } = validation.data;
    log(`Попытка подтверждения кода: ${email}`);

    const result = await verifyRegistrationCodeReset(email, code);

    if (result.success && result.verificationToken) {
      sendSuccess(ws, "auth/verifyCodeReset", {
        email,
        verificationToken: result.verificationToken,
        message: "Код подтвержден",
      });
      log(`Код подтвержден: ${email}`);
    } else {
      sendError(ws, "auth/verifyCodeReset", result.error || "Неизвестная ошибка");
      log(`Ошибка подтверждения кода: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.verifyCodeReset");
    sendSystemError(ws, "Ошибка при обработке запроса подтверждения кода");
  }
}

// Обработчик для смены пароля
async function handlePasswordRestore(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<RestorePasswordPayloadSchema>(restorePasswordPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "auth/passwordRestore", "Ошибка валидации", { details: validation.errors });
      return;
    }
    const { email, password, verificationToken } = validation.data;
    console.log("🚀 ~ handlePasswordRestore ~ password:", password);
    const result = await completeRestorePassword(email, password, verificationToken);

    if (result.success && result.player) {
      // Сохраняем данные о пользователе в объекте соединения
      (ws as any).playerData = {
        id: result.player.id,
        username: result.player.username,
      };

      // Обновляем информацию о клиенте
      updateClientInfo(ws, result.player.id, result.player.username);

      addOnlinePlayer(result.player.id);

      sendSuccess(ws, "auth/passwordRestore", {
        player: result.player,
        token: result.token,
        message: "Пароль успешно изменен",
      });
    } else {
      sendError(ws, "auth/passwordRestore", result.error || "Неизвестная ошибка");
      log(`Ошибка завершения сброса: ${result.error}`);
    }
  } catch (error) {
    handleError(error as Error, "AuthHandlers.passwordRestore");
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
  registerHandler("auth", "verifyCodeReset", handleVerifyCodeReset);
  registerHandler("auth", "passwordRestore", handlePasswordRestore);
}
