import { Type, Static } from "@sinclair/typebox";

// Схема для запроса области карты
export const getMapRegionPayloadSchema = Type.Object({
  worldId: Type.String({
    minLength: 1,
    errorMessage: { minLength: "ID мира не может быть пустым" },
  }),
  startX: Type.Number({
    minimum: 0,
    errorMessage: { minimum: "Координата X должна быть не менее 0" },
  }),
  startY: Type.Number({
    minimum: 0,
    errorMessage: { minimum: "Координата Y должна быть не менее 0" },
  }),
  endX: Type.Number({
    minimum: 0,
    errorMessage: { minimum: "Координата X должна быть не менее 0" },
  }),
  endY: Type.Number({
    minimum: 0,
    errorMessage: { minimum: "Координата Y должна быть не менее 0" },
  }),
});

// Схема для запроса конкретных тайлов
export const getMapTilesPayloadSchema = Type.Object({
  worldId: Type.String({
    minLength: 1,
    errorMessage: { minLength: "ID мира не может быть пустым" },
  }),
  tiles: Type.Array(
    Type.Object({
      x: Type.Number({ minimum: 0 }),
      y: Type.Number({ minimum: 0 }),
    }),
    {
      minItems: 1,
      maxItems: 500, // Ограничиваем максимальное количество тайлов за запрос
      errorMessage: {
        minItems: "Должен быть указан хотя бы один тайл",
        maxItems: "Слишком много тайлов за один запрос (максимум 500)",
      },
    }
  ),
});

// Схема для запроса одного тайла
export const getTilePayloadSchema = Type.Object({
  worldId: Type.String({
    minLength: 1,
    errorMessage: { minLength: "ID мира не может быть пустым" },
  }),
  x: Type.Number({
    minimum: 0,
    errorMessage: { minimum: "Координата X должна быть не менее 0" },
  }),
  y: Type.Number({
    minimum: 0,
    errorMessage: { minimum: "Координата Y должна быть не менее 0" },
  }),
});

// Типы данных на основе схем
export type GetMapRegionPayload = Static<typeof getMapRegionPayloadSchema>;
export type GetMapTilesPayload = Static<typeof getMapTilesPayloadSchema>;
export type GetTilePayload = Static<typeof getTilePayloadSchema>;
