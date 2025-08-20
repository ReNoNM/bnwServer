import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendError, sendSuccess } from "../../utils/websocketUtils";
import { log } from "../../utils/logger";
import { handleError } from "../../utils/errorHandler";
import { playerRepository } from "../../db";
import { generateMap } from "../../utils/mapGenerator";
import { MapTile } from "../../db/models/mapTile";
import { spawnPointsOfferRepository, mapRepository, worldRepository, mapVisibilityRepository, buildingRepository } from "../../db/repositories";
import { ChoosePointWorldPayload, choosePointWorldPayloadSchema, validateMessage } from "../middleware/validation";
import { deflateSync } from "zlib";

export function registerPlayerHandlers(): void {
  registerHandler("player", "searchWorld", handleSearchWorld);
  registerHandler("player", "spawn", handleSpawn);
  registerHandler("player", "getPointWorld", handleGetPointWorld);
  registerHandler("player", "getStartedMap", handleGetStartedMap);
  registerHandler("player", "choosePointWorld", handleChoosePointWorld);
}

/**
 * Ищем случайный стандартный открытый мир, добавляем туда игрока.
 * Если после добавления стало ровно 20 игроков — закрываем мир.
 * Если миров нет — возвращаем found=false.
 */
async function handleSearchWorld(ws: WebSocket): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id as string | undefined;

    if (!playerId) {
      sendError(ws, "player/searchWorld", "Не удалось определить текущего игрока");
      return;
    }

    // Проверяем, есть ли у игрока уже главный мир
    const player = await playerRepository.getById(playerId);
    if (!player) {
      sendError(ws, "player/searchWorld", "Игрок не найден");
      return;
    }

    if (player.mainWorldId) {
      sendError(ws, "player/searchWorld", "У вас уже есть главный мир");
      return;
    }

    // Берём все миры и фильтруем: стандартные и открытые, без текущего игрока
    const worlds = await worldRepository.getAll();
    const candidates = worlds.filter(
      (w) => w.worldType === "standard" && w.isOpen === true && (!Array.isArray(w.players) || !w.players.includes(playerId))
    );

    if (candidates.length === 0) {
      sendSuccess(ws, "player/searchWorld", { found: false, reason: "NO_OPEN_STANDARD_WORLDS" });
      return;
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    const players = Array.isArray(picked.players) ? [...picked.players] : [];
    if (!players.includes(playerId)) {
      players.push(playerId);
    }

    const willClose = players.length === 20;

    await worldRepository.setPlayersAndOpen(picked.id, players, !willClose);
    await playerRepository.update(player.id, { mainWorldId: picked.id } as any);

    sendSuccess(ws, "player/searchWorld", {
      found: true,
      worldId: picked.id,
      playersCount: players.length,
    });

    log(`player/searchWorld -> ${picked.id} (players: ${players.length}, closedNow: ${willClose})`);
  } catch (error) {
    handleError(error as Error, "player.searchWorld");
    sendError(ws, "player/searchWorld", "Внутренняя ошибка сервера");
  }
}

function getRandomWorldName(): string {
  const worldNames = [
    "Земли Вечной Зимы",
    "Кровавые Пески",
    "Мир Полых Звезд",
    "Эфирный Океан",
    "Глубины Хаоса",
    "Сквернолесье",
    "Кристальный Купол",
    "Башни Безмолвия",
    "Трон Пепла",
    "Мир Голубой Волны",
    "Астральная Равнина",
    "Проклятые Топи",
    "Сияющие Небеса",
    "Багровые Холмы",
    "Бездна Теней",
    "Осколки Рассвета",
    "Морозный Предел",
    "Зеркальное Озеро",
    "Заледеневшие Склоны",
    "Долина Забвения",
    "Лес Падающих Звёзд",
    "Песчаные Бури",
    "Ночные Холмы",
    "Дыхание Бездны",
    "Остров Забытого Солнца",
    "Плато Тысячи Ветров",
    "Штормовые Скалы",
    "Руины Света",
    "Ржавые Пустоши",
    "Обитель Туманов",
    "Огненные Пики",
    "Морские Лабиринты",
    "Кости Земли",
    "Покой Древних",
    "Пепельные Горы",
    "Земли Обугленного Камня",
    "Плачущие Скалы",
    "Туманные Болота",
    "Лунное Озеро",
    "Остров Падающих Листьев",
    "Хрустальный Берег",
    "Безмолвная Долина",
    "Скованные Ветром Плато",
    "Сердце Пустоты",
    "Залив Чёрных Волн",
    "Багровая Трясина",
    "Звёздная Пропасть",
    "Гроза Предвечерья",
    "Болотные Оковы",
    "Гибельные Пески",
    "Алтарь Угасающего Огня",
    "Горящий Каньон",
    "Око Смерти",
    "Предел Морозного Заката",
    "Гарнизон Теней",
    "Слёзы Огненной Реки",
    "Облачный Круг",
    "Дюны Забытого Ветра",
    "Стеклянная Пустошь",
    "Огненные Врата",
    "Пыльный Ковчег",
    "Мир Бурлящих Сфер",
    "Склеп Шепчущих",
    "Чаща Обречённых",
    "Вечная Равнина",
    "Гряда Разбитых Оков",
    "Тёмные Ключи",
    "Огни Угасающей Луны",
    "Багровый Прилив",
    "Каньон Молчания",
    "Остров Одинокого Шторма",
    "Земли Застывших Волн",
    "Сквозь Ледяную Пустоту",
    "Каменные Лабиринты",
    "Безмолвный Вулкан",
    "Обрыв Сумрачной Звезды",
    "Хрустальные Пещеры",
    "Долина Иссохших Рек",
    "Земли Затерянных Ковчегов",
    "Сверкающие Осколки",
    "Лазурный Маяк",
    "Тропы Забытого Солнца",
    "Чёрная Бездна",
    "Остров Разбитых Мечей",
    "Пепельный Дворец",
    "Залив Ветра и Пепла",
    "Гряда Сломанных Стражей",
    "Земли Кровавых Облаков",
    "Пустыня Трещащих Костей",
    "Проклятые Пики",
    "Хребет Горящих Стрел",
    "Обитель Мёртвых Ветров",
    "Долина Грёз",
    "Равнина Ржавых Волн",
    "Берег Стылых Молний",
    "Шёпот Песочных Часов",
    "Костяной Лабиринт",
    "Гряда Сломанных Крыльев",
    "Храм Погасшего Света",
    "Бездна Ледяных Шипов",
    "Чаща Угасших Звёзд",
    "Река Тлеющих Камней",
  ];
  return worldNames[Math.floor(Math.random() * worldNames.length)];
}

async function handleSpawn(ws: WebSocket, data: any): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id as string | undefined;
    if (!playerId) {
      sendError(ws, "player/spawn", "Неавторизовано");
      return;
    }

    const player = await playerRepository.getById(playerId);
    if (!player) {
      sendError(ws, "player/spawn", "Игрок не найден");
      return;
    }

    if (player.mainWorldId) {
      sendError(ws, "player/spawn", "У игрока уже есть мир");
      return;
    }

    // Создаём мир
    const worldName = getRandomWorldName();
    const newWorld = await worldRepository.add({
      name: worldName,
      sizeX: 50,
      sizeY: 50,
      worldType: "standard",
      settings: {},
    });

    if (!newWorld) {
      sendError(ws, "player/spawn", "Не удалось создать мир");
      return;
    }

    // Генерация карты
    const map = generateMap();
    const tiles = [];
    for (let x = 0; x < map.map.length; x++) {
      for (let y = 0; y < map.map[x].length; y++) {
        const t = map.map[x][y];
        tiles.push({
          worldId: newWorld.id,
          x,
          y,
          type: t.type,
          typeId: t.locationId,
          label: t.label,
          metadata: { generated: true, generatedAt: Date.now() },
          isCapital: false,
        });
      }
    }

    const saved = await mapRepository.addTiles(tiles);
    if (!saved) {
      sendError(ws, "player/spawn", "Не удалось сохранить карту мира");
      return;
    }

    // Добавляем игрока в мир
    await worldRepository.setPlayersAndOpen(newWorld.id, [player.id], true);
    // Обновляем игрока
    await playerRepository.update(player.id, { mainWorldId: newWorld.id } as any);

    sendSuccess(ws, "player/spawn", {
      created: true,
      worldId: newWorld.id,
      playersCount: 1,
    });

    log(`player/spawn -> created ${newWorld.id} (player: ${player.id})`);
  } catch (error) {
    handleError(error as Error, "player.spawn");
    sendError(ws, "player/spawn", "Внутренняя ошибка сервера");
  }
}

async function handleGetPointWorld(ws: WebSocket): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id as string | undefined;
    if (!playerId) {
      sendError(ws, "player/getPointWorld", "Неавторизовано");
      return;
    }

    const player = await playerRepository.getById(playerId);
    if (!player) {
      sendError(ws, "player/getPointWorld", "Игрок не найден");
      return;
    }

    if (!player.mainWorldId) {
      sendError(ws, "player/getPointWorld", "У игрока нет текущего мира");
      return;
    }

    const world = await worldRepository.getById(player.mainWorldId);
    if (!world) {
      sendError(ws, "player/getPointWorld", "Мир не найден");
      return;
    }

    const existingOffer = await spawnPointsOfferRepository.getActiveForPlayer(player.id, world.id);
    if (existingOffer) {
      sendSuccess(ws, "player/getPointWorld", {
        noPoints: false,
        worldId: world.id,
        offerId: existingOffer.id,
        points: existingOffer.points,
        count: world.players.length,
        worldName: world.name,
      });
      return;
    }

    // берём карту мира
    const tiles = await mapRepository.getByWorldId(world.id);
    if (!tiles.length) {
      await playerRepository.update(player.id, { mainWorldId: "" } as any);
      sendSuccess(ws, "player/getPointWorld", { noPoints: true, points: [] });
      return;
    }

    const offeredPoints = await spawnPointsOfferRepository.getActivePointsByWorld(world.id);

    // вспомогалка: манхэттенское расстояние
    const farFromOffered = (x: number, y: number) => {
      for (const p of offeredPoints) {
        const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
        if (dist < 3) return false; // слишком близко (<3)
      }
      return true;
    };

    const { sizeX, sizeY } = world;
    const keyOf = (x: number, y: number) => `${x}:${y}`;
    const byPos = new Map<string, MapTile>();
    for (const t of tiles) byPos.set(keyOf(t.x, t.y), t);

    const allowedNeighbors = new Set(["plain", "hill", "lake", "forest"]);

    const isBorder = (x: number, y: number) => x <= 0 || y <= 0 || x >= sizeX - 1 || y >= sizeY - 1;

    const get = (x: number, y: number) => byPos.get(keyOf(x, y));
    const passNeighbors = (x: number, y: number) => {
      const up = get(x, y - 1);
      const down = get(x, y + 1);
      const left = get(x - 1, y);
      const right = get(x + 1, y);
      return (
        !!up &&
        allowedNeighbors.has(up.type) &&
        !!down &&
        allowedNeighbors.has(down.type) &&
        !!left &&
        allowedNeighbors.has(left.type) &&
        !!right &&
        allowedNeighbors.has(right.type)
      );
    };

    const foreignTownhalls = tiles.filter((t) => t.isCapital && t.ownerPlayerId && t.ownerPlayerId !== playerId).map((t) => ({ x: t.x, y: t.y }));
    const foreignEnemyTerritory = tiles.filter((t) => t.ownerPlayerId && t.ownerPlayerId !== playerId).map((t) => ({ x: t.x, y: t.y }));

    //  расстояние ≥ 5 клеток от чужого таунхолла
    const passTownhallDistance = (_x: number, _y: number) => {
      if (foreignTownhalls.length === 0) return true;
      return foreignTownhalls.every(({ x, y }) => {
        const manhattan = Math.abs(x - _x) + Math.abs(y - _y);
        return manhattan >= 5;
      });
    };

    const passEnemyDistance = (_x: number, _y: number) => {
      if (foreignEnemyTerritory.length === 0) return true;
      return foreignEnemyTerritory.every(({ x, y }) => {
        const manhattan = Math.abs(x - _x) + Math.abs(y - _y);
        return manhattan >= 2;
      });
    };

    // Кандидаты
    const candidates: Array<{ x: number; y: number }> = [];
    for (const t of tiles) {
      if (t.type !== "plain") continue;
      if (isBorder(t.x, t.y)) continue;
      if (!passNeighbors(t.x, t.y)) continue;
      if (!passTownhallDistance(t.x, t.y)) continue;
      if (!passEnemyDistance(t.x, t.y)) continue;
      if (!farFromOffered(t.x, t.y)) continue;
      candidates.push({ x: t.x, y: t.y });
    }

    if (!candidates.length) {
      await playerRepository.update(player.id, { mainWorldId: "" } as any);
      sendSuccess(ws, "player/getPointWorld", { noPoints: true });
      log(`player/getPointWorld -> no points (world: ${world.id}, player: ${player.id})`);
      return;
    }

    shuffleInPlace(candidates);
    console.log("🚀 ~ handleGetPointWorld ~ candidates:", candidates.length);
    const points = candidates.slice(0, 3);

    const offer = await spawnPointsOfferRepository.create({
      playerId: player.id,
      worldId: world.id,
      points,
    });
    if (!offer) {
      sendError(ws, "player/getPointWorld", "Не удалось сохранить варианты");
      return;
    }

    sendSuccess(ws, "player/getPointWorld", {
      noPoints: false,
      worldId: world.id,
      points,
      offerId: offer.id,
      count: world.players.length,
      worldName: world.name,
    });

    log(`player/getPointWorld -> ${points.length} points (world: ${world.id}, player: ${player.id})`);
  } catch (error) {
    handleError(error as Error, "player.getPointWorld");
    sendError(ws, "player/getPointWorld", "Внутренняя ошибка сервера");
  }
}
async function handleGetStartedMap(ws: WebSocket): Promise<void> {
  try {
    const playerId = (ws as any)?.playerData?.id as string | undefined;
    if (!playerId) {
      sendError(ws, "player/getStartedMap", "Неавторизовано");
      return;
    }

    const player = await playerRepository.getById(playerId);
    if (!player) {
      sendError(ws, "player/getStartedMap", "Игрок не найден");
      return;
    }

    if (!player.mainWorldId) {
      sendError(ws, "player/getStartedMap", "У игрока нет текущего мира");
      return;
    }

    const world = await worldRepository.getById(player.mainWorldId);
    if (!world) {
      sendError(ws, "player/getStartedMap", "Мир не найден");
      return;
    }

    const existingOffer = await spawnPointsOfferRepository.getActiveForPlayer(player.id, world.id);
    if (!existingOffer?.id || existingOffer?.consumed) {
      sendError(ws, "player/getStartedMap", "Мировые точки не найдены");
      return;
    }

    const tiles: MapTile[] = [];
    for await (const item of existingOffer.points) {
      const cells = await mapRepository.getRegion(world.id, item.x - 1, item.y - 1, item.x + 1, item.y + 1);
      tiles.push(...cells.map((item) => ({ ...item, status: "visible" })));
    }
    sendSuccess(ws, "player/getStartedMap", {
      tiles: deflateSync(Buffer.from(JSON.stringify(tiles))).toString("base64"),
    });
  } catch (error) {
    handleError(error as Error, "player.getStartedMap");
    sendError(ws, "player/getStartedMap", "Внутренняя ошибка сервера");
  }
}
function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function handleChoosePointWorld(ws: WebSocket, data: any): Promise<void> {
  try {
    const validation = validateMessage<ChoosePointWorldPayload>(choosePointWorldPayloadSchema, data);
    if (!validation.success) {
      sendError(ws, "player/choosePointWorld", "Ошибка валидации", { details: validation.errors });
      return;
    }

    const playerId = (ws as any)?.playerData?.id as string | undefined;
    if (!playerId) {
      sendError(ws, "player/choosePointWorld", "Неавторизовано");
      return;
    }

    const { offerId, pointIndex } = validation.data;
    if (!offerId) {
      sendError(ws, "player/choosePointWorld", "Некорректные данные");
      return;
    }

    // Получаем оффер
    const offer = await spawnPointsOfferRepository.getActiveById(offerId, playerId);
    if (!offer) {
      sendError(ws, "player/choosePointWorld", "Оффер не найден или уже использован");
      return;
    }

    // Проверяем индекс точки (если не передан, берем первую)
    const selectedPointIndex = pointIndex !== undefined ? pointIndex : 0;
    if (selectedPointIndex < 0 || selectedPointIndex >= offer.points.length) {
      sendError(ws, "player/choosePointWorld", "Некорректный индекс точки");
      return;
    }

    const selectedPoint = offer.points[selectedPointIndex];
    const { x, y } = selectedPoint;
    const worldId = offer.worldId;

    // Начинаем транзакцию для всех операций
    try {
      // 1. Получаем ID клетки карты
      const mapTile = await mapRepository.getTile(worldId, x, y);
      if (!mapTile) {
        sendError(ws, "player/choosePointWorld", "Клетка карты не найдена");
        return;
      }

      // 2. Создаем здание mainhall
      const building = await buildingRepository.create({
        mapCellId: mapTile.id,
        ownerPlayerId: playerId,
        type: "mainhall",
        level: 1,
      });

      if (!building) {
        sendError(ws, "player/choosePointWorld", "Не удалось создать главное здание");
        return;
      }

      // 3. Обновляем выбранную клетку карты
      await mapRepository.updateTile(worldId, x, y, {
        isCapital: true,
        ownerPlayerId: playerId,
        buildingId: building.id,
      });

      // 4. Обновляем соседние клетки крестом (верх, низ, лево, право)
      const crossNeighbors = [
        { x: x, y: y - 1 }, // верх
        { x: x, y: y + 1 }, // низ
        { x: x - 1, y: y }, // лево
        { x: x + 1, y: y }, // право
      ];

      const neighborUpdates = crossNeighbors.map((coord) => ({
        worldId,
        x: coord.x,
        y: coord.y,
        ownerPlayerId: playerId,
      }));

      await mapRepository.updateTilesBatch(neighborUpdates);

      // 5. Создаем видимость для квадрата 3x3 (радиус 1 с диагоналями)
      const visibilityCells = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const vx = x + dx;
          const vy = y + dy;

          // Получаем ID клетки для видимости
          const visTile = await mapRepository.getTile(worldId, vx, vy);
          if (visTile) {
            visibilityCells.push({
              mapCellId: visTile.id,
              playerId: playerId,
              status: "scouted" as const,
            });
          }
        }
      }

      // Пакетное создание/обновление видимости
      if (visibilityCells.length > 0) {
        await mapVisibilityRepository.createOrUpdateBatch(visibilityCells);
      }

      // 6. Помечаем оффер как использованный
      await spawnPointsOfferRepository.consume(offer.id);

      // 7. Логируем успешную операцию
      log(`Игрок ${playerId} выбрал точку спавна (${x}, ${y}) в мире ${worldId}`);

      // Отправляем успешный ответ
      sendSuccess(ws, "player/choosePointWorld", {
        worldId: offer.worldId,
        point: selectedPoint,
        buildingId: building.id,
      });
    } catch (err) {
      handleError(err as Error, "player.choosePointWorld.transaction");
      sendError(ws, "player/choosePointWorld", "Ошибка при основании столицы");
    }
  } catch (error) {
    handleError(error as Error, "player.choosePointWorld");
    sendError(ws, "player/choosePointWorld", "Внутренняя ошибка сервера");
  }
}
