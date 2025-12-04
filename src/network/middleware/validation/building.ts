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

export const assignWorkersPayloadSchema = Type.Object({
  buildingId: Type.String({
    minLength: 1,
    errorMessage: { minLength: "ID здания обязателен" },
  }),
  resourceKey: Type.String({
    minLength: 1,
    errorMessage: { minLength: "Не указан тип ресурса" },
  }),
  workers: Type.Number({
    minimum: 0,
    maximum: 1000,
    errorMessage: {
      minimum: "Количество рабочих не может быть отрицательным",
      maximum: "Превышен лимит рабочих",
    },
  }),
});

export const getBuildingPayloadSchema = Type.Object({
  buildingId: Type.String({
    minLength: 1,
    errorMessage: { minLength: "ID здания обязателен" },
  }),
});
export type BuildingCreatePayload = Static<typeof buildingCreatePayloadSchema>;
export type AssignWorkersPayload = Static<typeof assignWorkersPayloadSchema>;
export type GetBuildingPayload = Static<typeof getBuildingPayloadSchema>;
