import { Type, Static } from '@sinclair/typebox';

// Схема для системных сообщений пинга
export const pingPayloadSchema = Type.Object({
  timestamp: Type.Optional(Type.Number()),
});

// Схема для системных сообщений статуса
export const statusPayloadSchema = Type.Object({
  details: Type.Optional(Type.Boolean()),
});

// Типы данных на основе схем
export type PingPayload = Static<typeof pingPayloadSchema>;
export type StatusPayload = Static<typeof statusPayloadSchema>;
