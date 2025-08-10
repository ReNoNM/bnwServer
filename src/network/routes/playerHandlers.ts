import { WebSocket } from "ws";
import { registerHandler } from "../messageDispatcher";
import { sendError, sendSuccess } from "../../utils/websocketUtils";
import { log } from "../../utils/logger";
import * as worldRepository from "../../db/repositories/worldRepository";
import * as mapRepository from "../../db/repositories/mapRepository";
import { handleError } from "../../utils/errorHandler";
import { playerRepository } from "../../db";
import { generateMap } from "../../utils/mapGenerator";
import { MapTileDTO } from "../../db/models/mapTile";

export function registerPlayerHandlers(): void {
  registerHandler("player", "searchWorld", handleSearchWorld);
  registerHandler("player", "spawn", handleSpawn);
  registerHandler("player", "getPointWorld", handleGetPointWorld);
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

    // берём карту мира
    const tiles = await mapRepository.getByWorldId(world.id);
    if (!tiles.length) {
      sendSuccess(ws, "player/getPointWorld", { noPoints: true, points: [] });
      return;
    }

    const { sizeX, sizeY } = world;
    const keyOf = (x: number, y: number) => `${x}:${y}`;
    const byPos = new Map<string, MapTileDTO>();
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

    // TODO: расстояние ≥ 15 клеток от чужого таунхолла
    const passTownhallDistance = (_x: number, _y: number) => true;

    // Кандидаты
    const candidates: Array<{ x: number; y: number }> = [];
    for (const t of tiles) {
      if (t.type !== "plain") continue;
      if (isBorder(t.x, t.y)) continue;
      if (!passNeighbors(t.x, t.y)) continue;
      if (!passTownhallDistance(t.x, t.y)) continue;
      candidates.push({ x: t.x, y: t.y });
    }

    if (!candidates.length) {
      sendSuccess(ws, "player/getPointWorld", { noPoints: true, points: [] });
      log(`player/getPointWorld -> no points (world: ${world.id}, player: ${player.id})`);
      return;
    }

    shuffleInPlace(candidates);
    console.log("🚀 ~ handleGetPointWorld ~ candidates:", candidates.length);
    const points = candidates.slice(0, 3);

    sendSuccess(ws, "player/getPointWorld", {
      noPoints: false,
      worldId: world.id,
      points,
      count: points.length,
    });

    log(`player/getPointWorld -> ${points.length} points (world: ${world.id}, player: ${player.id})`);
  } catch (error) {
    handleError(error as Error, "player.getPointWorld");
    sendError(ws, "player/getPointWorld", "Внутренняя ошибка сервера");
  }
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
