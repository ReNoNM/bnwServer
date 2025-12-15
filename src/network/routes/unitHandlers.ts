import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { handleError } from "../../utils/errorHandler";
import { unitRepository, mapRepository } from "../../db/repositories";
import { validateMessage } from "../middleware/validation";
import {
  getUnitByIdPayloadSchema,
  GetUnitByIdPayload,
  getUnitsAtPayloadSchema,
  GetUnitsAtPayload,
  getMyUnitsPayloadSchema,
  GetMyUnitsPayload,
} from "../middleware/validation/unit";

/**
 * Получить юнита по ID
 */
async function handleGetUnitById(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetUnitByIdPayload>(getUnitByIdPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "unit/getById", "Ошибка валидации");
      return;
    }

    const { unitId } = validation.data;
    const unit = await unitRepository.getById(unitId);

    if (!unit) {
      sendError(ws, "unit/getById", "Юнит не найден");
      return;
    }

    sendSuccess(ws, "unit/getById", { unit });
  } catch (error) {
    handleError(error as Error, "unit.getById");
    sendSystemError(ws, "Ошибка получения юнита");
  }
}

/**
 * Получить всех моих юнитов в конкретном мире
 */
async function handleGetMyUnits(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id;
    if (!playerId) {
      sendError(ws, "unit/getMyUnits", "Неавторизовано");
      return;
    }
    const validation = validateMessage<GetMyUnitsPayload>(getMyUnitsPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "unit/getMyUnits", "Ошибка валидации");
      return;
    }

    const { worldId } = validation.data;

    const units = await unitRepository.getByOwner(playerId, worldId);

    sendSuccess(ws, "unit/getMyUnits", { units });
  } catch (error) {
    handleError(error as Error, "unit.getMyUnits");
    sendSystemError(ws, "Ошибка получения списка юнитов");
  }
}

/**
 * Получить юнитов по координатам (X, Y)
 */
async function handleGetUnitsAt(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetUnitsAtPayload>(getUnitsAtPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "unit/getAt", "Ошибка валидации");
      return;
    }

    const { worldId, x, y } = validation.data;

    // Используем getByRegion с размером 1x1, чтобы получить точное совпадение
    const units = await unitRepository.getByRegion(worldId, x, y, x, y);

    sendSuccess(ws, "unit/getAt", { x, y, units });
  } catch (error) {
    handleError(error as Error, "unit.getAt");
    sendSystemError(ws, "Ошибка получения юнитов на клетке");
  }
}

// Если очень нужно по ID клетки (MapCellId), а не по X/Y
// Но лучше использовать X/Y, так как у нас вся навигация по ним
async function handleGetUnitsByCellId(ws: WebSocket, data: any): Promise<void> {
  try {
    const { cellId } = data;
    if (!cellId) {
      sendError(ws, "unit/getByCell", "Нет cellId");
      return;
    }

    const tile = await mapRepository.getTileById(cellId);
    if (!tile) {
      sendError(ws, "unit/getByCell", "Клетка не найдена");
      return;
    }

    const units = await unitRepository.getByRegion(tile.worldId, tile.x, tile.y, tile.x, tile.y);
    sendSuccess(ws, "unit/getByCell", { cellId, units });
  } catch (e) {
    sendSystemError(ws, "Ошибка");
  }
}

export function registerUnitHandlers(): void {
  registerHandler("unit", "getById", handleGetUnitById);
  registerHandler("unit", "getMyUnits", handleGetMyUnits);
  registerHandler("unit", "getAt", handleGetUnitsAt);
  registerHandler("unit", "getByCell", handleGetUnitsByCellId);
}
