import { Type, Static } from "@sinclair/typebox";

export const buildingCreatePayloadSchema = Type.Object({
  buildingId: Type.String({
    minLength: 1,
    errorMessage: { minLength: "Ошибка при выборе здания" },
  }),
  cellId: Type.String({
    minLength: 1,
    errorMessage: { minimum: "Ошибка при выбореа координаты" },
  }),
});

export type BuildingCreatePayload = Static<typeof buildingCreatePayloadSchema>;
