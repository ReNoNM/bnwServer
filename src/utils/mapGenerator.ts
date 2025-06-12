export interface Area {
  locationId: number;
  name: string;
  className: string;
  size: [number, number];
  minCount: number;
  maxCount: number;
  priority?: number;
  isArea: boolean;
  isSide?: boolean;
  group?: string;
}

export interface Tile {
  locationId: number;
  type: string;
  label: string;
  x: number;
  y: number;
}

export interface MapResult {
  map: Tile[][];
  stats: Record<string, { count: number; cells: number }>;
}

interface GenerateMapOptions {
  mapSize?: number;
  minDistanceBetweenAreas?: number;
  maxPlacementAttempts?: number;
  areas: Area[];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  return arr.sort(() => Math.random() - 0.5);
}

function getSide(): string {
  return ["top", "right", "bottom", "left"][getRandomInt(0, 3)];
}

const defaultAreas: Area[] = [
  { locationId: 0, name: "Равнина", className: "plain", size: [1, 1], minCount: 1, maxCount: 1, isArea: false },
  { locationId: 1, name: "Холм", className: "hill", size: [2, 4], minCount: 40, maxCount: 60, priority: 1, isArea: true },
  { locationId: 2, name: "Озеро", className: "lake", size: [4, 8], minCount: 40, maxCount: 60, priority: 1, isArea: true },
  { locationId: 3, name: "Лес", className: "forest", size: [2, 10], minCount: 40, maxCount: 60, priority: 1, isArea: true },
  { locationId: 4, name: "Лекарственные сады", className: "garden", size: [3, 5], minCount: 10, maxCount: 20, priority: 2, isArea: true },
  { locationId: 5, name: "Духовные горы", className: "mountain", size: [3, 5], minCount: 40, maxCount: 60, priority: 2, isArea: true },
  { locationId: 6, name: "Дикий лес", className: "wild_forest", size: [3, 5], minCount: 20, maxCount: 40, priority: 2, isArea: true },
  { locationId: 7, name: "Духовный источник", className: "spring", size: [1, 1], minCount: 10, maxCount: 20, priority: 3, isArea: true },
  {
    locationId: 8,
    name: "Долина вулканов",
    className: "volcano",
    size: [5, 20],
    minCount: 0,
    maxCount: 1,
    priority: 5,
    isArea: true,
    group: "special_areas",
  },
  {
    locationId: 9,
    name: "Лагуна умиротворения",
    className: "lagoon",
    size: [5, 20],
    minCount: 0,
    maxCount: 1,
    priority: 5,
    isArea: true,
    group: "special_areas",
  },
  {
    locationId: 10,
    name: "Пески забвения",
    className: "desert",
    size: [5, 20],
    minCount: 0,
    maxCount: 1,
    priority: 5,
    isArea: true,
    group: "special_areas",
  },
  {
    locationId: 11,
    name: "Первобытный лес",
    className: "primeval_forest",
    size: [5, 20],
    minCount: 0,
    maxCount: 1,
    priority: 5,
    isArea: true,
    group: "special_areas",
  },
  {
    locationId: 12,
    name: "Болота смерти",
    className: "swamp",
    size: [5, 10],
    minCount: 0,
    maxCount: 3,
    priority: 10,
    isArea: true,
    group: "dangerous_areas",
  },
  {
    locationId: 13,
    name: "Безграничное море",
    className: "sea",
    size: [300, 500],
    minCount: 0,
    maxCount: 1,
    priority: 15,
    isArea: true,
    isSide: true,
    group: "dangerous_areas",
  },
  {
    locationId: 14,
    name: "Каньон уныния",
    className: "canyon",
    size: [5, 10],
    minCount: 0,
    maxCount: 3,
    priority: 10,
    isArea: true,
    group: "dangerous_areas",
  },
  {
    locationId: 15,
    name: "Разлом демонов",
    className: "rift",
    size: [5, 10],
    minCount: 0,
    maxCount: 3,
    priority: 10,
    isArea: true,
    group: "dangerous_areas",
  },
];

export function generateMap({
  mapSize = 50,
  minDistanceBetweenAreas = 0,
  maxPlacementAttempts = 1500,
  areas = defaultAreas,
}: GenerateMapOptions = {}): MapResult {
  const map: Tile[][] = Array.from({ length: mapSize }, (_, row) =>
    Array.from({ length: mapSize }, (_, col) => ({
      locationId: 0,
      type: "plain",
      label: "Равнина",
      x: col,
      y: row,
    }))
  );

  const stats: MapResult["stats"] = {};
  const sortedAreas = [...areas].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const groupStats: Record<string, { count: number; areaCount: number }> = {};

  function isValidPlacement(cells: [number, number][]): boolean {
    return cells.every(([col, row]) => {
      for (let i = col - minDistanceBetweenAreas; i <= col + minDistanceBetweenAreas; i++) {
        for (let j = row - minDistanceBetweenAreas; j <= row + minDistanceBetweenAreas; j++) {
          if (i >= 0 && j >= 0 && i < mapSize && j < mapSize && map[j][i].type !== "plain") return false;
        }
      }
      return true;
    });
  }

  function placeArea(area: Area): boolean {
    let attempts = 0;
    while (attempts++ < maxPlacementAttempts) {
      let startCol, startRow;

      if (area.isSide) {
        const side = getSide();

        switch (side) {
          case "top":
            startRow = 0;
            startCol = getRandomInt(0, mapSize - 1);
            break;
          case "bottom":
            startRow = mapSize - 1;
            startCol = getRandomInt(0, mapSize - 1);
            break;
          case "left":
            startCol = 0;
            startRow = getRandomInt(0, mapSize - 1);
            break;
          case "right":
            startCol = mapSize - 1;
            startRow = getRandomInt(0, mapSize - 1);
            break;
        }
      } else {
        startCol = getRandomInt(0, mapSize - 1);
        startRow = getRandomInt(0, mapSize - 1);
      }

      const areaSize = getRandomInt(area.size[0], area.size[1]);
      const cells = new Set<string>();
      const frontier: [number, number][] = [[startCol, startRow]];

      while (cells.size < areaSize && frontier.length > 0) {
        const idx = getRandomInt(0, frontier.length - 1);
        const [col, row] = frontier.splice(idx, 1)[0];
        const key = `${col},${row}`;

        if (!cells.has(key) && col >= 0 && row >= 0 && col < mapSize && row < mapSize) {
          cells.add(key);

          shuffle([
            [col + 1, row],
            [col - 1, row],
            [col, row + 1],
            [col, row - 1],
          ]).forEach(([nCol, nRow]) => {
            const nKey = `${nCol},${nRow}`;
            if (nCol >= 0 && nRow >= 0 && nCol < mapSize && nRow < mapSize && !cells.has(nKey) && map[nRow][nCol].type === "plain") {
              frontier.push([nCol, nRow]);
            }
          });
        }
      }

      const coordCells: [number, number][] = [...cells].map((str) => str.split(",").map(Number) as [number, number]);

      if (coordCells.length === areaSize && isValidPlacement(coordCells)) {
        coordCells.forEach(([col, row]) => {
          map[row][col] = {
            type: area.className,
            label: area.name,
            x: col,
            y: row,
            locationId: area.locationId,
          };
        });

        stats[area.name] = stats[area.name] || { count: 0, cells: 0 };
        stats[area.name].count += 1;
        stats[area.name].cells += coordCells.length;
        return true;
      }
    }
    return false;
  }

  for (const area of sortedAreas) {
    if (!area.isArea) continue;

    let count: number;
    if (area.group) {
      if (!groupStats[area.group]) {
        groupStats[area.group] = { count: 0, areaCount: 0 };
      }
      groupStats[area.group].areaCount++;
      const inGroup = areas.filter((a) => a.group === area.group).length;
      count =
        groupStats[area.group].areaCount === inGroup && groupStats[area.group].count === 0
          ? getRandomInt(1, area.maxCount)
          : getRandomInt(area.minCount, area.maxCount);
      groupStats[area.group].count += count;
    } else {
      count = getRandomInt(area.minCount, area.maxCount);
    }

    for (let i = 0; i < count; i++) placeArea(area);
  }

  return { map, stats };
}
