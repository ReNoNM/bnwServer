import { Type, Static } from "@sinclair/typebox";

// Схема для сообщений чата с проверкой длины
export const chatPayloadSchema = Type.Object({
  senderId: Type.String(),
  message: Type.String({
    minLength: 1,
    maxLength: 500,
    errorMessage: {
      minLength: "Сообщение не может быть пустым",
      maxLength: "Сообщение не должно превышать 500 символов",
    },
  }),
});

// Схема для получения истории чата
export const chatHistoryPayloadSchema = Type.Object({
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 100,
      errorMessage: {
        minimum: "Лимит должен быть не менее 1",
        maximum: "Лимит не должен превышать 100",
      },
    })
  ),
  before: Type.Optional(Type.Number()),
});

// Схема для приватных сообщений
export const privateMessagePayloadSchema = Type.Object({
  receiverId: Type.String({
    errorMessage: {
      type: "ID получателя должен быть строкой",
    },
  }),
  message: Type.String({
    minLength: 1,
    maxLength: 500,
    errorMessage: {
      minLength: "Сообщение не может быть пустым",
      maxLength: "Сообщение не должно превышать 500 символов",
    },
  }),
});

// Типы данных на основе схем
export type ChatPayload = Static<typeof chatPayloadSchema>;
export type ChatHistoryPayload = Static<typeof chatHistoryPayloadSchema>;
export type PrivateMessagePayload = Static<typeof privateMessagePayloadSchema>;
