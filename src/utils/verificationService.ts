// src/utils/verificationService.ts

import crypto from "crypto";
import { log, error as logError } from "./logger";

// Хранение кодов верификации (в реальном приложении лучше использовать базу данных или Redis)
const verificationCodes: Record<string, { code: string; expires: number; hashedPassword: string }> = {};
const verificationTokens: Record<string, { email: string; expires: number; hashedPassword: string }> = {};

const verificationCodesRestore: Record<string, { code: string; expires: number }> = {};
const verificationTokensRestore: Record<string, { email: string; expires: number }> = {};

// Генерация кода верификации
export function generateVerificationCode(email: string, hashedPassword: string): string {
  // Генерируем 6-значный код
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Устанавливаем срок действия кода (30 минут)
  const expires = Date.now() + 30 * 60 * 1000;

  // Сохраняем код и хешированный пароль
  verificationCodes[email] = { code, expires, hashedPassword };

  // В реальном приложении здесь был бы код для отправки письма
  log(`Сгенерирован код верификации для ${email}: ${code}`);

  return code;
}

export function generatRestoreCode(email: string): string {
  // Генерируем 6-значный код
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Устанавливаем срок действия кода (30 минут)
  const expires = Date.now() + 30 * 60 * 1000;

  // Сохраняем код и хешированный пароль
  verificationCodesRestore[email] = { code, expires };

  // В реальном приложении здесь был бы код для отправки письма
  log(`Сгенерирован код верификации для ${email}: ${code}`);

  return code;
}

// Проверка кода верификации
export function verifyCode(email: string, code: string): { success: boolean; hashedPassword?: string } {
  const verification = verificationCodes[email];

  // if (!verification) {
  //   log(`Код для ${email} не найден`);
  //   return { success: false };
  // }

  // if (verification.expires < Date.now()) {
  //   // Код истек
  //   log(`Код для ${email} истек`);
  //   delete verificationCodes[email];
  //   return { success: false };
  // }

  // if (verification.code !== code) {
  //   log(`Неверный код для ${email}: получен ${code}, ожидался ${verification.code}`);
  //   return { success: false };
  // }

  log(`Код для ${email} подтвержден. Хешированный пароль: ${verification.hashedPassword}`);

  // Удаляем использованный код
  const hashedPassword = verification.hashedPassword;
  delete verificationCodes[email];

  return {
    success: true,
    hashedPassword,
  };
}

export function verifyCodeReset(email: string, code: string): { success: boolean; hashedPassword?: string } {
  const verification = verificationCodesRestore[email];

  // if (!verification) {
  //   log(`Код для ${email} не найден`);
  //   return { success: false };
  // }

  // if (verification.expires < Date.now()) {
  //   // Код истек
  //   log(`Код для ${email} истек`);
  //   delete verificationCodes[email];
  //   return { success: false };
  // }

  // if (verification.code !== code) {
  //   log(`Неверный код для ${email}: получен ${code}, ожидался ${verification.code}`);
  //   return { success: false };
  // }

  log(`Код для ${email} подтвержден.`);

  // Удаляем использованный код
  delete verificationCodesRestore[email];

  return {
    success: true,
  };
}

// Генерация токена для завершения регистрации
export function generateVerificationToken(email: string, hashedPassword: string): string {
  const token = crypto.randomBytes(32).toString("hex");

  // Устанавливаем срок действия токена (1 час)
  const expires = Date.now() + 60 * 60 * 1000;

  // Сохраняем токен
  verificationTokens[token] = { email, expires, hashedPassword };

  log(`Сгенерирован токен верификации для ${email} (хешированный пароль: ${hashedPassword})`);

  return token;
}

export function generateVerificationTokenRestore(email: string): string {
  const token = crypto.randomBytes(32).toString("hex");

  // Устанавливаем срок действия токена (1 час)
  const expires = Date.now() + 60 * 60 * 1000;

  // Сохраняем токен
  verificationTokensRestore[token] = { email, expires };

  log(`Сгенерирован токен верификации для ${email}`);

  return token;
}

// Проверка токена верификации
export function verifyToken(token: string): { valid: boolean; email?: string; hashedPassword?: string } {
  const verification = verificationTokens[token];

  if (!verification) {
    log(`Токен ${token} не найден`);
    return { valid: false };
  }

  if (verification.expires < Date.now()) {
    // Токен истек
    log(`Токен для ${verification.email} истек`);
    delete verificationTokens[token];
    return { valid: false };
  }

  log(`Токен для ${verification.email} подтвержден. Хешированный пароль: ${verification.hashedPassword}`);

  // Удаляем использованный токен
  const { email, hashedPassword } = verification;
  delete verificationTokens[token];

  return {
    valid: true,
    email,
    hashedPassword,
  };
}

export function verifyTokenRestore(token: string): { valid: boolean; email?: string } {
  const verification = verificationTokensRestore[token];

  if (!verification) {
    log(`Токен ${token} не найден`);
    return { valid: false };
  }

  if (verification.expires < Date.now()) {
    // Токен истек
    log(`Токен для ${verification.email} истек`);
    delete verificationTokens[token];
    return { valid: false };
  }

  log(`Токен для ${verification.email} подтвержден. `);

  // Удаляем использованный токен
  const { email } = verification;
  delete verificationTokens[token];

  return {
    valid: true,
    email,
  };
}

// Имитация отправки электронного письма (заглушка)
export function sendVerificationEmail(email: string, code: string): boolean {
  try {
    // В реальном приложении здесь был бы код для отправки письма
    log(`Отправлено письмо с кодом верификации на ${email}: ${code}`);
    return true;
  } catch (error) {
    logError(`Ошибка отправки письма с кодом верификации: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    return false;
  }
}
