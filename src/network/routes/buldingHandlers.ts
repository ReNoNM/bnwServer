import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { handleError } from "../../utils/errorHandler";
import { mapRepository, buildingRepository, inventoryRepository } from "../../db/repositories";
import { validateMessage } from "../middleware/validation";
import { BuildingCreatePayload, buildingCreatePayloadSchema, GetBuildingPayload, getBuildingPayloadSchema } from "../middleware/validation/building";
import buildingsConfig from "../../config/buildings";
import { assignWorkersPayloadSchema, AssignWorkersPayload } from "../middleware/validation/building";
import { updateWorkers } from "../../game/engine/miningEngine";

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
    const buildingConf = buildingsConfig[buildingId];
    if (!buildingConf) {
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

    // --- НОВАЯ ЛОГИКА: СОЗДАНИЕ ИНВЕНТАРЯ ---
    let newInventoryId: string | null = null;

    if (buildingConf.inventorySlots && buildingConf.inventorySlots > 0) {
      const container = await inventoryRepository.createContainer(buildingConf.inventorySlots, "building");
      if (container) {
        newInventoryId = container.id;
      }
    }
    // ----------------------------------------

    const building = await buildingRepository.create({
      mapCellId: cellId,
      ownerPlayerId: playerId,
      level: 1,
      type: buildingsConfig[buildingId].type,
      inventoryId: newInventoryId,
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

async function handleAssignWorkers(ws: WebSocket, data: any): Promise<void> {
  try {
    // 1. Проверка авторизации
    const playerId = (ws as any)?.playerData?.id;
    if (!playerId) {
      sendError(ws, "building/assignWorkers", "Неавторизовано");
      return;
    }

    // 2. Валидация входных данных
    const validation = validateMessage<AssignWorkersPayload>(assignWorkersPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "building/assignWorkers", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { buildingId, resourceKey, workers } = validation.data;

    // 3. Проверка прав (владелец здания)
    const buildings = await buildingRepository.getByBuildId(buildingId);
    const building = buildings[0];

    if (!building) {
      sendError(ws, "building/assignWorkers", "Здание не найдено");
      return;
    }

    if (building.ownerPlayerId !== playerId) {
      sendError(ws, "building/assignWorkers", "Вы не владелец этого здания");
      return;
    }

    // 4. Вызов логики движка
    // (Как ты просил, проверку на наличие свободного населения в городе пока не делаем)
    const updatedBuilding = await updateWorkers(buildingId, resourceKey, workers);

    // 5. Отправка ответа
    sendSuccess(ws, "building/assignWorkers", {
      building: updatedBuilding,
      // Возвращаем актуальное состояние для обновления UI клиента
      miningState: updatedBuilding.data?.mining?.[resourceKey],
    });
  } catch (error) {
    handleError(error as Error, "building.assignWorkers");
    // Если ошибка известная (например "Invalid resource key"), отправляем её текст
    sendError(ws, "building/assignWorkers", error instanceof Error ? error.message : "Ошибка при назначении рабочих");
  }
}

async function handleGetBuilding(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id;
    if (!playerId) {
      sendError(ws, "building/getBuilding", "Неавторизовано");
      return;
    }

    const validation = validateMessage<GetBuildingPayload>(getBuildingPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "building/getBuilding", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { buildingId } = validation.data;

    const buildings = await buildingRepository.getByBuildId(buildingId);
    const building = buildings[0];

    if (!building) {
      sendError(ws, "building/getBuilding", "Здание не найдено");
      return;
    }

    // Опционально: проверка владельца.
    // Если ты хочешь, чтобы чужие здания тоже можно было смотреть (например, для шпионажа),
    // убери этот блок или сделай проверку мягче (отдавай меньше данных).
    if (building.ownerPlayerId !== playerId) {
      sendError(ws, "building/getBuilding", "Это не ваше здание");
      return;
    }

    sendSuccess(ws, "building/getBuilding", {
      building: building,
    });
  } catch (error) {
    handleError(error as Error, "building.getBuilding");
    sendSystemError(ws, "Ошибка при получении информации о здании");
  }
}

// Регистрация обработчиков карты
export function registerBuldingHandlers(): void {
  registerHandler("building", "buildingCreate", buildingCreate);
  registerHandler("building", "assignWorkers", handleAssignWorkers);
  registerHandler("building", "getBuilding", handleGetBuilding);
}
