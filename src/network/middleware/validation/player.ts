import { Type, Static } from "@sinclair/typebox";

export const searchWorldPayloadSchema = Type.Object({}, { additionalProperties: true });

export type SearchWorldPayload = Static<typeof searchWorldPayloadSchema>;
