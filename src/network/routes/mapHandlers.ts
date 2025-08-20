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
  GetWorldMapPayload,
  getWolrdMapPayloadSchema,
} from "../middleware/validation";
import { deflateSync } from "zlib";
import { MapTileWithVisibility } from "../../db/models/mapTile";

// Обработчик получения области карты
async function handleGetMapRegion(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetMapRegionPayload>(getMapRegionPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "map/getRegion", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { worldId, startX, startY, endX, endY } = validation.data;

    if (startX > endX || startY > endY) {
      sendError(ws, "map/getRegion", "Некорректные координаты: начальные координаты больше конечных");
      return;
    }

    const maxRegionSize = 100 * 100;
    const regionSize = (endX - startX + 1) * (endY - startY + 1);
    if (regionSize > maxRegionSize) {
      sendError(ws, "map/getRegion", `Слишком большая область: ${regionSize} тайлов (максимум ${maxRegionSize})`);
      return;
    }

    const world = await worldRepository.getById(worldId);
    if (!world) {
      sendError(ws, "map/getRegion", "Мир не найден");
      return;
    }

    const clampedStartX = Math.max(0, Math.min(startX, world.sizeX - 1));
    const clampedStartY = Math.max(0, Math.min(startY, world.sizeY - 1));
    const clampedEndX = Math.max(0, Math.min(endX, world.sizeX - 1));
    const clampedEndY = Math.max(0, Math.min(endY, world.sizeY - 1));

    const playerId = (ws as any)?.playerData?.id as string | undefined;
    if (!playerId) {
      sendError(ws, "map/getRegion", "Неавторизовано");
      return;
    }

    // Берём уже «присобранные» тайлы с видимостью
    const tiles = await mapRepository.getRegionForPlayer(worldId, playerId, clampedStartX, clampedStartY, clampedEndX, clampedEndY);

    // Как и раньше, заполним «дыры» (вне диапазона map? или если каких-то ячеек нет в БД map)
    // но теперь с учётом статуса notVisible по умолчанию.
    const tileByXY = new Map<string, MapTileWithVisibility>();
    for (const t of tiles) tileByXY.set(`${t.x},${t.y}`, t);

    const regionData: MapTileWithVisibility[] = [];
    for (let y = clampedStartY; y <= clampedEndY; y++) {
      for (let x = clampedStartX; x <= clampedEndX; x++) {
        const key = `${x},${y}`;
        const existing = tileByXY.get(key);
        if (existing) {
          regionData.push(existing);
        } else {
          // Если в таблице map нет записи — вернём пустую «плоскость»,
          // но статус всё равно notVisible (игрок её не видел).
          regionData.push({
            id: crypto.randomUUID(), // или составной id без сохранения, если нельзя генерить
            worldId,
            x,
            y,
            status: "notVisible",
          });
        }
      }
    }
    // log(`Отправлена область карты ${worldId}: (${clampedStartX},${clampedStartY}) - (${clampedEndX},${clampedEndY}), ${regionData.length} тайлов`);

    sendSuccess(ws, "map/getRegion", {
      worldId,
      startX: clampedStartX,
      startY: clampedStartY,
      endX: clampedEndX,
      endY: clampedEndY,
      tiles: deflateSync(Buffer.from(JSON.stringify(regionData))).toString("base64"),
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

async function handleGetWorlds(ws: WebSocket, data: any): Promise<void> {
  console.log("start");
  try {
    const worlds = await worldRepository.getAll();

    log(`Запрошен список миров: найдено ${worlds.length} миров`);

    sendSuccess(ws, "map/getWorlds", {
      worlds: worlds,
      count: worlds.length,
    });
  } catch (error) {
    handleError(error as Error, "MapHandlers.getWorlds");
    sendSystemError(ws, "Ошибка при получении списка миров");
  }
}

// Обработчик загрузки карты мира
async function handleLoadWorldMap(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<GetWorldMapPayload>(getWolrdMapPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "map/getTiles", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const { worldId } = validation.data;

    if (!worldId) {
      sendError(ws, "map/getWorldMap", "Не указан ID мира");
      return;
    }

    // Получаем информацию о мире
    const world = await worldRepository.getById(worldId);
    if (!world) {
      sendError(ws, "map/getWorldMap", "Мир не найден");
      return;
    }

    // Получаем карту мира
    const mapTiles = await mapRepository.getByWorldId(worldId);

    if (mapTiles.length === 0) {
      sendError(ws, "map/getWorldMap", "Карта мира пуста или не сгенерирована");
      return;
    }

    const mapGrid: any = [];
    for (let y = 0; y < world.sizeY; y++) {
      mapGrid[y] = [];
      for (let x = 0; x < world.sizeX; x++) {
        mapGrid[y][x] = {
          locationId: 0,
          type: "plain",
          label: "Равнина",
          x: x,
          y: y,
        };
      }
    }

    // Заполняем карту данными из базы
    mapTiles.forEach((tile) => {
      if (tile.x < world.sizeX && tile.y < world.sizeY) {
        mapGrid[tile.y][tile.x] = {
          locationId: tile.typeId,
          type: tile.type,
          label: tile.label || tile.type,
          x: tile.x,
          y: tile.y,
        };
      }
    });

    // Подсчитываем статистику
    const stats: any = {};
    mapTiles.forEach((tile) => {
      const label = tile.label || tile.type;
      if (!stats[label]) {
        stats[label] = { count: 0, cells: 0 };
      }
      stats[label].cells++;
    });

    // Подсчитываем количество областей (упрощенно)
    Object.keys(stats).forEach((key) => {
      if (key !== "plain" && key !== "Равнина") {
        stats[key].count = Math.ceil(stats[key].cells / 10); // Примерная оценка
      } else {
        stats[key].count = 1;
      }
    });
    const compressedMap = deflateSync(Buffer.from(JSON.stringify(mapGrid))).toString("base64");
    log(`Загружена карта мира ${world.name}: ${mapTiles.length} тайлов`);

    sendSuccess(ws, "map/getWorldMap", {
      world: world,
      map: compressedMap,
      stats: stats,
      tilesCount: mapTiles.length,
    });
  } catch (error) {
    handleError(error as Error, "map.getWorldMap");
    sendSystemError(ws, "Ошибка при загрузке карты мира");
  }
}

// Регистрация обработчиков карты
export function registerMapHandlers(): void {
  registerHandler("map", "getRegion", handleGetMapRegion);
  registerHandler("map", "getTiles", handleGetMapTiles);
  registerHandler("map", "getTile", handleGetTile);
  registerHandler("map", "getWorlds", handleGetWorlds);
  registerHandler("map", "getWorldMap", handleLoadWorldMap);
}
