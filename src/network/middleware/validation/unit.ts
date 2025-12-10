import { Type, Static } from "@sinclair/typebox";

// Получить конкретного юнита
export const getUnitByIdPayloadSchema = Type.Object({
  unitId: Type.String({ minLength: 1 }),
});

// Получить юнитов в конкретной точке (x, y)
export const getUnitsAtPayloadSchema = Type.Object({
  worldId: Type.String({ minLength: 1 }),
  x: Type.Number(),
  y: Type.Number(),
});

// Получить всех моих юнитов в мире (для списка слева или меню)
export const getMyUnitsPayloadSchema = Type.Object({
  worldId: Type.String({ minLength: 1 }),
});

export type GetUnitByIdPayload = Static<typeof getUnitByIdPayloadSchema>;
export type GetUnitsAtPayload = Static<typeof getUnitsAtPayloadSchema>;
export type GetMyUnitsPayload = Static<typeof getMyUnitsPayloadSchema>;
