import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendSuccess, sendError, sendSystemError } from "../../utils/websocketUtils";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import * as worldRepository from "../../db/repositories/worldRepository";
import * as mapRepository from "../../db/repositories/mapRepository";
import {
  validateMessage,
  getMapRegionPayloadSchema,
  getMapTilesPayloadSchema,
  type GetMapRegionPayload,
  type GetMapTilesPayload,
} from "../middleware/validation";

// Обработчик получения области карты
async function handleGetMapRegion(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetMapRegionPayload>(getMapRegionPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "map/getRegion", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { worldId, startX, startY, endX, endY } = validation.data;

    // Проверяем, что координаты корректны
    if (startX > endX || startY > endY) {
      sendError(ws, "map/getRegion", "Некорректные координаты: начальные координаты больше конечных");
      return;
    }

    // Ограничиваем размер запрашиваемой области
    const maxRegionSize = 100 * 100; // Максимум 100x100 тайлов за запрос
    const regionSize = (endX - startX + 1) * (endY - startY + 1);

    if (regionSize > maxRegionSize) {
      sendError(ws, "map/getRegion", `Слишком большая область: ${regionSize} тайлов (максимум ${maxRegionSize})`);
      return;
    }

    // Проверяем существование мира
    const world = await worldRepository.getById(worldId);
    if (!world) {
      sendError(ws, "map/getRegion", "Мир не найден");
      return;
    }

    // Ограничиваем координаты размерами мира
    const clampedStartX = Math.max(0, Math.min(startX, world.sizeX - 1));
    const clampedStartY = Math.max(0, Math.min(startY, world.sizeY - 1));
    const clampedEndX = Math.max(0, Math.min(endX, world.sizeX - 1));
    const clampedEndY = Math.max(0, Math.min(endY, world.sizeY - 1));

    // Получаем тайлы области
    const mapTiles = await mapRepository.getRegion(worldId, clampedStartX, clampedStartY, clampedEndX, clampedEndY);

    // Создаем объект для быстрого поиска тайлов
    const tileMap = new Map<string, any>();
    mapTiles.forEach((tile) => {
      const key = `${tile.x},${tile.y}`;
      tileMap.set(key, {
        locationId: tile.typeId,
        type: tile.type,
        label: tile.label || tile.type,
        x: tile.x,
        y: tile.y,
      });
    });

    // Заполняем область, добавляя пустые тайлы где нужно
    const regionData = [];
    for (let y = clampedStartY; y <= clampedEndY; y++) {
      for (let x = clampedStartX; x <= clampedEndX; x++) {
        const key = `${x},${y}`;
        const tile = tileMap.get(key) || {
          locationId: 0,
          type: "plain",
          label: "Равнина",
          x: x,
          y: y,
        };
        regionData.push(tile);
      }
    }

    log(`Отправлена область карты ${worldId}: (${clampedStartX},${clampedStartY}) - (${clampedEndX},${clampedEndY}), ${regionData.length} тайлов`);

    sendSuccess(ws, "map/getRegion", {
      worldId: worldId,
      startX: clampedStartX,
      startY: clampedStartY,
      endX: clampedEndX,
      endY: clampedEndY,
      tiles: regionData,
      totalTiles: regionData.length,
    });
  } catch (error) {
    handleError(error as Error, "MapHandlers.getRegion");
    sendSystemError(ws, "Ошибка при получении области карты");
  }
}

// Обработчик получения конкретных тайлов
async function handleGetMapTiles(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetMapTilesPayload>(getMapTilesPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "map/getTiles", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { worldId, tiles: requestedTiles } = validation.data;

    // Проверяем существование мира
    const world = await worldRepository.getById(worldId);
    if (!world) {
      sendError(ws, "map/getTiles", "Мир не найден");
      return;
    }

    // Фильтруем координаты, чтобы они были в пределах мира
    const validCoordinates = requestedTiles.filter((coord) => coord.x >= 0 && coord.x < world.sizeX && coord.y >= 0 && coord.y < world.sizeY);

    if (validCoordinates.length === 0) {
      sendSuccess(ws, "map/getTiles", {
        worldId: worldId,
        tiles: [],
        totalTiles: 0,
      });
      return;
    }

    // Получаем тайлы из базы данных
    const mapTiles = await mapRepository.getTilesByCoordinates(worldId, validCoordinates);

    // Создаем объект для быстрого поиска
    const tileMap = new Map<string, any>();
    mapTiles.forEach((tile) => {
      const key = `${tile.x},${tile.y}`;
      tileMap.set(key, {
        locationId: tile.typeId,
        type: tile.type,
        label: tile.label || tile.type,
        x: tile.x,
        y: tile.y,
      });
    });

    // Формируем ответ, добавляя пустые тайлы для отсутствующих координат
    const resultTiles = validCoordinates.map((coord) => {
      const key = `${coord.x},${coord.y}`;
      return (
        tileMap.get(key) || {
          locationId: 0,
          type: "plain",
          label: "Равнина",
          x: coord.x,
          y: coord.y,
        }
      );
    });

    log(`Отправлены конкретные тайлы для мира ${worldId}: ${resultTiles.length} тайлов`);

    sendSuccess(ws, "map/getTiles", {
      worldId: worldId,
      tiles: resultTiles,
      totalTiles: resultTiles.length,
    });
  } catch (error) {
    handleError(error as Error, "MapHandlers.getTiles");
    sendSystemError(ws, "Ошибка при получении тайлов карты");
  }
}

// Обработчик получения одного тайла
async function handleGetTile(ws: WebSocket, data: any): Promise<void> {
  try {
    const { worldId, x, y } = data;

    if (!worldId || x === undefined || y === undefined) {
      sendError(ws, "map/getTile", "Не указаны обязательные параметры: worldId, x, y");
      return;
    }

    // Получаем тайл
    const tile = await mapRepository.getTile(worldId, x, y);

    if (!tile) {
      // Возвращаем пустой тайл, если не найден
      sendSuccess(ws, "map/getTile", {
        tile: {
          locationId: 0,
          type: "plain",
          label: "Равнина",
          x: x,
          y: y,
        },
      });
      return;
    }

    sendSuccess(ws, "map/getTile", {
      tile: {
        locationId: tile.typeId,
        type: tile.type,
        label: tile.label || tile.type,
        x: tile.x,
        y: tile.y,
      },
    });
  } catch (error) {
    handleError(error as Error, "MapHandlers.getTile");
    sendSystemError(ws, "Ошибка при получении тайла");
  }
}

// Регистрация обработчиков карты
export function registerMapHandlers(): void {
  registerHandler("map", "getRegion", handleGetMapRegion);
  registerHandler("map", "getTiles", handleGetMapTiles);
  registerHandler("map", "getTile", handleGetTile);
}
