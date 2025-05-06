import { Type, TSchema, Static } from "@sinclair/typebox";
import Ajv from "ajv";
import addFormats from "ajv-formats";

// Создаем и настраиваем экземпляр AJV для валидации
export const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Добавляем кастомный формат для регулярного выражения action
ajv.addFormat("action-format", /^[a-z]+\/[a-z]+$/);

// Базовая схема для всех сообщений в формате action/route
export const messageSchema = Type.Object({
  action: Type.String({ format: "action-format", errorMessage: { format: "Формат action должен быть 'route/action'" } }),
  data: Type.Optional(Type.Any()),
});

// Определяем тип Message на основе схемы
export type Message = Static<typeof messageSchema>;

// Хранилище предварительно скомпилированных валидаторов
const validatorCache = new Map<TSchema, ReturnType<typeof ajv.compile>>();

// Функция для получения валидатора (с кэшированием)
export function getValidator(schema: TSchema): ReturnType<typeof ajv.compile> {
  if (!validatorCache.has(schema)) {
    validatorCache.set(schema, ajv.compile(schema));
  }
  return validatorCache.get(schema)!;
}

// Функция для валидации, возвращает ошибки в понятном формате
export function validateMessage<T>(schema: TSchema, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const validator = getValidator(schema);
  const valid = validator(data);

  if (valid) {
    return { success: true, data: data as T };
  } else {
    // Преобразуем ошибки в массив понятных сообщений
    const errors = validator.errors?.map((err: any) => {
      // Получаем путь без начального слеша
      const path = err.instancePath ? err.instancePath.substring(1) : "";
      // Берем детальное сообщение об ошибке, если оно есть, иначе используем стандартное
      const message = err.message || "Ошибка валидации";
      return `${path ? path + ": " : ""}${message}`;
    }) || ["Неизвестная ошибка валидации"];

    return { success: false, errors };
  }
}
