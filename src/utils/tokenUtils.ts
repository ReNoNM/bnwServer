// src/utils/tokenUtils.ts
import jwt from "jsonwebtoken";
import config from "../../config";
import * as tokenRepository from "../db/repositories/tokenRepository";

// Генерация JWT токена
export async function generateToken(userId: string, deviceInfo: Record<string, any> = {}): Promise<string> {
  const timestamp = Date.now();
  const expiresInMs = parseExpiresIn(config.security.jwtExpiresIn);
  const expiresAt = timestamp + expiresInMs;

  // Генерируем JWT токен
  const token = jwt.sign(
    {
      userId,
      iat: Math.floor(timestamp / 1000),
      exp: Math.floor(expiresAt / 1000),
    },
    config.security.jwtSecret
  );

  // Сохраняем токен в базе данных
  await tokenRepository.saveToken({
    token,
    userId,
    issuedAt: timestamp,
    expiresAt,
    revoked: false,
    deviceInfo,
  });

  return token;
}

// Проверка JWT токена
export async function validateToken(token: string): Promise<{ valid: boolean; userId?: string; expired?: boolean }> {
  try {
    // Проверяем токен в базе данных
    const tokenData = await tokenRepository.getTokenByValue(token);

    // Если токен не найден или отозван
    if (!tokenData || tokenData.revoked) {
      return { valid: false };
    }

    // Проверяем, не истек ли токен по времени в базе
    const currentTime = Date.now();
    if (currentTime > tokenData.expiresAt) {
      return { valid: false, userId: tokenData.userId, expired: true };
    }

    // Верифицируем JWT
    const decoded = jwt.verify(token, config.security.jwtSecret) as { userId: string };

    return { valid: true, userId: decoded.userId };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Получаем userId из просроченного токена
      try {
        const decoded = jwt.decode(token) as { userId: string };
        return { valid: false, userId: decoded.userId, expired: true };
      } catch {
        return { valid: false, expired: true };
      }
    }
    return { valid: false };
  }
}

// Функция для отзыва токена
export async function revokeToken(token: string): Promise<boolean> {
  return await tokenRepository.revokeToken(token);
}

// Функция для отзыва всех токенов пользователя
export async function revokeAllUserTokens(userId: string): Promise<boolean> {
  return await tokenRepository.revokeAllUserTokens(userId);
}

// Вспомогательная функция для преобразования значений типа "24h" в миллисекунды
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 24 * 60 * 60 * 1000; // По умолчанию 24 часа

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000; // секунды
    case "m":
      return value * 60 * 1000; // минуты
    case "h":
      return value * 60 * 60 * 1000; // часы
    case "d":
      return value * 24 * 60 * 60 * 1000; // дни
    default:
      return 24 * 60 * 60 * 1000; // По умолчанию 24 часа
  }
}
