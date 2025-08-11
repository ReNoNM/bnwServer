export interface MapTile {
  id: string;
  worldId: string;
  x: number;
  y: number;
  type: string;
  typeId: number;
  label: string;
  metadata?: Record<string, any>;
  isCapital: boolean;
  ownerPlayerId?: string;
  buildingId?: string;
}

export interface MapTileDTO {
  id: string;
  worldId: string;
  x: number;
  y: number;
  type: string;
  typeId: number;
  label: string;
  metadata?: Record<string, any>;
  isCapital: boolean;
  ownerPlayerId?: string;
  buildingId?: string;
}

export function mapTileToDTO(mapTile: MapTile): MapTileDTO {
  return { ...mapTile };
}
