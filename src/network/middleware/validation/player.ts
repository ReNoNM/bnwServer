import { Type, Static } from "@sinclair/typebox";

export const searchWorldPayloadSchema = Type.Object({}, { additionalProperties: true });

export const getPointWorldPayloadSchema = Type.Object({}, { additionalProperties: true });

export const choosePointWorldPayloadSchema = Type.Object(
  {
    offerId: Type.String({ format: "uuid" }), // если вдруг не UUID — замени на Type.String()
    pointIndex: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  },
  { additionalProperties: true }
);

export const spawnPayloadSchema = Type.Object({}, { additionalProperties: true });

export type SpawnPayload = Static<typeof spawnPayloadSchema>;
export type ChoosePointWorldPayload = Static<typeof choosePointWorldPayloadSchema>;
export type GetPointWorldPayload = Static<typeof getPointWorldPayloadSchema>;
export type SearchWorldPayload = Static<typeof searchWorldPayloadSchema>;
