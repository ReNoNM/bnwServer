import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { validateMessage } from "../middleware/validation";
import { getBuildingInventoryPayloadSchema, moveItemPayloadSchema, GetBuildingInventoryPayload, MoveItemPayload } from "../middleware/validation";
import { buildingRepository } from "../../db/repositories";
// Импортируем функции движка напрямую
import { getInventory, moveItem } from "../../game/engine/inventoryEngine";

/**
 * Получить содержимое инвентаря здания
 */
async function handleGetBuildingInventory(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetBuildingInventoryPayload>(getBuildingInventoryPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "inventory/getBuilding", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const playerId = (ws as any)?.playerData?.id;
    if (!playerId) {
      sendError(ws, "inventory/getBuilding", "Неавторизовано");
      return;
    }

    const { buildingId } = validation.data;

    // 1. Ищем здание
    // getByBuildId возвращает массив, берем первый элемент
    const buildings = await buildingRepository.getByBuildId(buildingId);
    const building = buildings[0];

    if (!building) {
      sendError(ws, "inventory/getBuilding", "Здание не найдено");
      return;
    }

    if (building.ownerPlayerId !== playerId) {
      sendError(ws, "inventory/getBuilding", "Это не ваше здание");
      return;
    }

    if (!building.inventoryId) {
      sendError(ws, "inventory/getBuilding", "У этого здания нет инвентаря");
      return;
    }

    // 2. Запрашиваем данные у движка
    const result = await getInventory(building.inventoryId);

    if (!result) {
      sendError(ws, "inventory/getBuilding", "Инвентарь не найден");
      return;
    }

    sendSuccess(ws, "inventory/getBuilding", {
      buildingId,
      containerId: building.inventoryId,
      capacity: result.info.capacity,
      type: result.info.type,
      items: result.items,
    });
  } catch (error) {
    sendSystemError(ws, "Ошибка при получении инвентаря");
  }
}

/**
 * Перемещение предмета (Drag & Drop)
 */
async function handleMoveItem(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<MoveItemPayload>(moveItemPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "inventory/move", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const playerId = (ws as any)?.playerData?.id;
    if (!playerId) {
      sendError(ws, "inventory/move", "Неавторизовано");
      return;
    }

    const { containerId, fromSlot, toSlot } = validation.data;

    // 1. ПРОВЕРКА ПРАВ: Принадлежит ли этот контейнер игроку?
    // Внимание: Убедись, что ты добавил метод getByInventoryIdAndOwner в buildingRepository (из предыдущего моего сообщения)
    const building = await buildingRepository.getByInventoryIdAndOwner(containerId, playerId);

    if (!building) {
      sendError(ws, "inventory/move", "Нет доступа к этому контейнеру");
      return;
    }

    // 2. Выполняем перемещение
    const result = await moveItem(containerId, fromSlot, toSlot);

    if (result.success) {
      sendSuccess(ws, "inventory/move", {
        containerId,
        fromSlot,
        toSlot,
        success: true,
      });
    } else {
      sendError(ws, "inventory/move", result.reason || "Не удалось переместить предмет");
    }
  } catch (error) {
    sendSystemError(ws, "Ошибка при перемещении предмета");
  }
}

// Регистрация
export function registerInventoryHandlers(): void {
  registerHandler("inventory", "getBuilding", handleGetBuildingInventory);
  registerHandler("inventory", "move", handleMoveItem);
}
