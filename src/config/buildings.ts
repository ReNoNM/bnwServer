import rawData from "./buildings.json";

interface BuildingBonus {
  [level: string]: string[];
}

export interface Building {
  numeric: number;
  type: string;
  name: string;
  descriptionBonus: BuildingBonus;
  inventorySlots: number;
}

export interface BuildingsConfig {
  [key: string]: Building;
}

const buildingsConfig: BuildingsConfig = rawData;

export default buildingsConfig;
