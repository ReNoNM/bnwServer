import { log } from "./logger";

// Перечисление основных типов ошибок
export enum ErrorType {
  VALIDATION = "VALIDATION",
  AUTHENTICATION = "AUTHENTICATION",
  NETWORK = "NETWORK",
  UNKNOWN = "UNKNOWN",
}

// Функция для обработки ошибок
export function handleError(error: Error, context: string = ""): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error.message || "Неизвестная ошибка";
  const contextInfo = context ? ` в контексте [${context}]` : "";

  // Логируем ошибку с контекстом
  log(`Ошибка${contextInfo}: ${errorMessage}`, true);

  // Логируем стек вызовов для отладки в development
  if (process.env.NODE_ENV !== "production" && error.stack) {
    console.error(error.stack);
  }
}

// Функция для создания ошибок с типом
export function createError(message: string, type: ErrorType = ErrorType.UNKNOWN): Error {
  const error = new Error(message);
  (error as any).errorType = type;
  return error;
}

// Вспомогательные функции для создания типизированных ошибок
export function createValidationError(message: string): Error {
  return createError(message, ErrorType.VALIDATION);
}

export function createAuthError(message: string): Error {
  return createError(message, ErrorType.AUTHENTICATION);
}

export function createNetworkError(message: string): Error {
  return createError(message, ErrorType.NETWORK);
}
