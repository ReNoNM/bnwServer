// src/network/middleware/auth.ts
import { WebSocket } from "ws";
import jwt from "jsonwebtoken";
import config from "../../../config";
import { log, error as logError } from "../../utils/logger";
import * as tokenRepository from "../../db/repositories/tokenRepository";

/**
 * Проверяет JWT токен и при успешной проверке сохраняет данные пользователя
 * @param ws WebSocket соединение
 * @param token JWT токен для проверки
 * @returns true если токен действителен, иначе false
 */
export async function authenticateConnection(ws: WebSocket, token: string): Promise<boolean> {
  try {
    if (!token) {
      return false;
    }

    try {
      // Проверяем подпись JWT
      const decoded = jwt.verify(token, config.security.jwtSecret) as { userId: string };

      // Проверяем, есть ли токен в базе данных и не отозван ли он
      const tokenData = await tokenRepository.getTokenByValue(token);
      if (!tokenData || tokenData.revoked) {
        return false;
      }

      // Проверяем, не истек ли токен
      const currentTime = Date.now();
      if (currentTime > tokenData.expiresAt) {
        return false;
      }

      // Сохраняем информацию о пользователе в объекте соединения
      (ws as any).playerData = {
        id: decoded.userId,
      };

      return true;
    } catch (jwtError) {
      // Ошибки верификации JWT (истекший токен, неверная подпись и т.д.)
      return false;
    }
  } catch (error) {
    logError(`Ошибка при аутентификации соединения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    return false;
  }
}
