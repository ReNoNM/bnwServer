import { z } from "zod";

// Базовая схема для всех сообщений в формате action/route
export const messageSchema = z.object({
  action: z.string().regex(/^[a-z]+\/[a-z]+$/, "Формат action должен быть 'route/action'"),
  data: z.any().optional(),
});

// Схема для регистрации с более строгими правилами
export const registerPayloadSchema = z.object({
  username: z
    .string()
    .min(3, "Имя пользователя должно содержать минимум 3 символа")
    .max(20, "Имя пользователя не должно превышать 20 символов")
    .regex(/^[a-zA-Z0-9_]+$/, "Имя пользователя может содержать только буквы, цифры и знак подчеркивания"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов").max(100, "Пароль слишком длинный"),
});

// Схема для входа
export const loginPayloadSchema = z.object({
  username: z.string().min(1, "Введите имя пользователя"),
  password: z.string().min(1, "Введите пароль"),
});

// Схема для сообщений чата с проверкой длины
export const chatPayloadSchema = z.object({
  senderId: z.string(),
  message: z.string().min(1, "Сообщение не может быть пустым").max(500, "Сообщение не должно превышать 500 символов"),
});

// Схема для аутентификации по токену
export const tokenPayloadSchema = z.object({
  token: z.string().min(1, "Токен не может быть пустым"),
});

// Схема для получения истории чата
export const chatHistoryPayloadSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  before: z.number().optional(),
});

// Функция для валидации, возвращает ошибки в понятном формате
export function validateMessage<T>(schema: z.ZodType<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    // Преобразуем ошибки Zod в массив понятных сообщений
    const errors = result.error.errors.map((err) => {
      const path = err.path.join(".");
      return `${path ? path + ": " : ""}${err.message}`;
    });

    return { success: false, errors };
  }
}
