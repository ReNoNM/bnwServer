export interface World {
  id: string;
  name: string;
  sizeX: number;
  sizeY: number;
  worldType: string;
  createdAt: number;
  updatedAt: number;
  settings?: Record<string, any>;
}

export interface WorldDTO {
  id: string;
  name: string;
  sizeX: number;
  sizeY: number;
  worldType: string;
  createdAt: number;
  updatedAt: number;
  settings?: Record<string, any>;
}

export function worldToDTO(world: World): WorldDTO {
  return { ...world };
}
