// src/db/repositories/tokenRepository.ts

import { db } from "../connection";
import { log, error as logError } from "../../utils/logger";
import { type DB } from "../models/database"; // Убедимся, что импортируем тип DB

// Интерфейс для токена
export interface Token {
  id?: string;
  token: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
  deviceInfo?: Record<string, any>;
}

// Сохранение нового токена
export async function saveToken(tokenData: Omit<Token, "id">): Promise<boolean> {
  try {
    // Вместо использования sql-шаблона, будем напрямую присваивать значения
    const result = await db
      .insertInto("tokens")
      .values({
        token: tokenData.token,
        user_id: tokenData.userId,
        // Преобразование в строку, которую Kysely сможет правильно обработать
        issued_at: tokenData.issuedAt.toString(),
        expires_at: tokenData.expiresAt.toString(),
        revoked: tokenData.revoked,
        device_info: tokenData.deviceInfo || {},
      })
      .returning(["id"])
      .executeTakeFirst();

    return !!result;
  } catch (err) {
    logError(`Ошибка сохранения токена: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Получение токена по значению
export async function getTokenByValue(tokenValue: string): Promise<Token | undefined> {
  try {
    const result = await db
      .selectFrom("tokens")
      .select(["id", "token", "user_id as userId", "issued_at as issuedAt", "expires_at as expiresAt", "revoked", "device_info as deviceInfo"])
      .where("token", "=", tokenValue)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      ...result,
      issuedAt: Number(result.issuedAt),
      expiresAt: Number(result.expiresAt),
      revoked: result.revoked === true,
    } as Token;
  } catch (err) {
    logError(`Ошибка получения токена: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return undefined;
  }
}

// Получение всех активных токенов пользователя
export async function getUserTokens(userId: string): Promise<Token[]> {
  try {
    const currentTime = Date.now();

    // Используем raw-запрос для обхода проблем с типизацией
    // или преобразуем значения в строку
    const results = await db
      .selectFrom("tokens")
      .select(["id", "token", "user_id as userId", "issued_at as issuedAt", "expires_at as expiresAt", "revoked", "device_info as deviceInfo"])
      .where("user_id", "=", userId)
      .where("revoked", "=", false)
      .where("expires_at", ">", currentTime.toString()) // Преобразование в строку
      .execute();

    return results.map((row) => ({
      ...row,
      issuedAt: Number(row.issuedAt),
      expiresAt: Number(row.expiresAt),
      revoked: row.revoked === true,
    })) as Token[];
  } catch (err) {
    logError(`Ошибка получения токенов пользователя: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return [];
  }
}

// Отзыв токена (при logout)
export async function revokeToken(tokenValue: string): Promise<boolean> {
  try {
    const result = await db.updateTable("tokens").set({ revoked: true }).where("token", "=", tokenValue).returning(["id"]).executeTakeFirst();

    return !!result;
  } catch (err) {
    logError(`Ошибка отзыва токена: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Отзыв всех токенов пользователя
export async function revokeAllUserTokens(userId: string): Promise<boolean> {
  try {
    const result = await db.updateTable("tokens").set({ revoked: true }).where("user_id", "=", userId).where("revoked", "=", false).execute();

    return true;
  } catch (err) {
    logError(`Ошибка отзыва всех токенов пользователя: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Очистка устаревших токенов
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const currentTime = Date.now();

    const result = await db
      .deleteFrom("tokens")
      .where("expires_at", "<", currentTime.toString()) // Преобразование в строку
      .execute();

    return 1; // Возвращаем 1 для обозначения успешной операции
  } catch (err) {
    logError(`Ошибка очистки устаревших токенов: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return 0;
  }
}

// Обновление времени истечения токена
export async function extendTokenExpiration(tokenValue: string, newExpiresAt: number): Promise<boolean> {
  try {
    const result = await db
      .updateTable("tokens")
      .set({
        expires_at: newExpiresAt.toString(), // Преобразование в строку
      })
      .where("token", "=", tokenValue)
      .where("revoked", "=", false)
      .returning(["id"])
      .executeTakeFirst();

    return !!result;
  } catch (err) {
    logError(`Ошибка продления срока действия токена: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return false;
  }
}

// Получение количества активных токенов пользователя
export async function getActiveTokenCount(userId: string): Promise<number> {
  try {
    const currentTime = Date.now();

    const result = await db
      .selectFrom("tokens")
      .select(({ fn }) => [fn.count("id").as("count")])
      .where("user_id", "=", userId)
      .where("revoked", "=", false)
      .where("expires_at", ">", currentTime.toString()) // Преобразование в строку
      .executeTakeFirst();

    return result ? Number(result.count) : 0;
  } catch (err) {
    logError(`Ошибка получения количества активных токенов: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    return 0;
  }
}
