import { Type, Static } from "@sinclair/typebox";

export const getBuildingInventoryPayloadSchema = Type.Object({
  buildingId: Type.String({ minLength: 1 }),
});

export const moveItemPayloadSchema = Type.Object({
  containerId: Type.String({ minLength: 1 }),
  fromSlot: Type.Number({ minimum: 0 }),
  toSlot: Type.Number({ minimum: 0 }),
});

export type GetBuildingInventoryPayload = Static<typeof getBuildingInventoryPayloadSchema>;
export type MoveItemPayload = Static<typeof moveItemPayloadSchema>;
