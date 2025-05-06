import crypto from "crypto";
import config from "../../config";
import * as tokenRepository from "../db/repositories/tokenRepository";

// Генерируем токен и сохраняем его в базе
export async function generateToken(userId: string, deviceInfo: Record<string, any> = {}): Promise<string> {
  const randomPart = crypto.randomBytes(24).toString("hex");
  const timestamp = Date.now();
  const secretKey = config.security.jwtSecret;

  const dataToHash = `${userId}:${randomPart}:${timestamp}:${secretKey}`;
  const hash = crypto.createHash("sha256").update(dataToHash).digest("hex");

  // Определяем срок действия
  const expiresInMs = parseExpiresIn(config.security.jwtExpiresIn);
  const expiresAt = timestamp + expiresInMs;

  // Формируем токен
  const token = `${userId}.${randomPart}.${timestamp}.${expiresAt}.${hash}`;

  const tokenString = `${userId}.${randomPart}.${timestamp}.${expiresAt}.${hash}`;

  // Отладочный вывод - только в логи, не в ответ клиенту
  console.log(`Token type: ${typeof tokenString}`);
  console.log(`Generated token (first 20 chars): ${String(tokenString).substring(0, 20)}`);

  // Сохраняем токен в базе данных
  await tokenRepository.saveToken({
    token,
    userId,
    issuedAt: timestamp,
    expiresAt,
    revoked: false,
    deviceInfo,
  });

  return tokenString; // Убедитесь, что возвращается строка, а не объект
}

// Проверяем валидность токена с учетом хранения в базе
export async function validateToken(token: string): Promise<{ valid: boolean; userId?: string; expired?: boolean }> {
  try {
    // Сначала проверяем структуру токена
    const [userId, randomPart, timestamp, expiresAt, hash] = token.split(".");

    if (!userId || !randomPart || !timestamp || !expiresAt || !hash) {
      return { valid: false };
    }

    // Проверяем в базе данных
    const tokenData = await tokenRepository.getTokenByValue(token);

    // Если токен не найден или отозван
    if (!tokenData || tokenData.revoked) {
      return { valid: false };
    }

    // Проверяем, не истек ли токен
    const currentTime = Date.now();
    if (currentTime > tokenData.expiresAt) {
      return { valid: false, userId, expired: true };
    }

    // Проверяем подпись токена
    const secretKey = config.security.jwtSecret;
    const dataToHash = `${userId}:${randomPart}:${timestamp}:${secretKey}`;
    const expectedHash = crypto.createHash("sha256").update(dataToHash).digest("hex");

    if (hash !== expectedHash) {
      return { valid: false };
    }

    return { valid: true, userId };
  } catch (error) {
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
