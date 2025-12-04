export interface MiningResourceConfig {
  name: string;
  itemId: string; // ID предмета, который попадет в инвентарь
  baseYield: number; // Количество ресурсов за 1 цикл с 1 рабочего
  durationInDays: number; // Длительность цикла в игровых днях
}

export const miningConfig = {
  resources: {
    spiritual_wood_1: {
      name: "Духовная древесина I",
      itemId: "spiritual_wood_1",
      baseYield: 4,
      durationInDays: 1,
    } as MiningResourceConfig,

    spiritual_wood_2: {
      name: "Духовная древесина II",
      itemId: "spiritual_wood_2",
      baseYield: 2,
      durationInDays: 1,
    } as MiningResourceConfig,
  },
};
