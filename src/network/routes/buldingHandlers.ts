import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { handleError } from "../../utils/errorHandler";
import { mapRepository, buildingRepository } from "../../db/repositories";

import { validateMessage } from "../middleware/validation";
import { BuildingCreatePayload, buildingCreatePayloadSchema } from "../middleware/validation/buildint";
import buildingsConfig from "../../config/buildings";

async function buildingCreate(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<BuildingCreatePayload>(buildingCreatePayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "building/create", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const playerId = (ws as any)?.playerData?.id as string | undefined;
    if (!playerId) {
      sendError(ws, "building/create", "Неавторизовано");
      return;
    }

    const { buildingId, cellId } = validation.data;
    if (!buildingsConfig[buildingId]) {
      sendError(ws, "building/create", "Здание не найдено");
      return;
    }

    const cell = await mapRepository.getTileById(cellId);

    if (!cell) {
      sendError(ws, "building/create", "Клетка не найдена");
      return;
    }
    if (!!cell.buildingId || cell.ownerPlayerId !== playerId) {
      sendError(ws, "building/create", "Клетка недоступна");
      return;
    }

    const building = await buildingRepository.create({
      mapCellId: cellId,
      ownerPlayerId: playerId,
      level: 1,
      type: buildingsConfig[buildingId].type,
    });
    const returnCell = await mapRepository.updateTileById(cellId, { buildingId: building?.id });
    if (building?.id) {
      sendSuccess(ws, "building/create", {
        building: building,
        cell: returnCell,
      });
    }
  } catch (error) {
    handleError(error as Error, "MapHandlers.getRegion");
    sendSystemError(ws, "Ошибка при получении области карты");
  }
}

// Регистрация обработчиков карты
export function registerBuldingHandlers(): void {
  registerHandler("building", "buildingCreate", buildingCreate);
}
