export interface MapTile {
  id: string;
  worldId: string;
  x: number;
  y: number;
  type: string;
  typeId: number;
  label: string;
  metadata?: Record<string, any>;
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
}

export function mapTileToDTO(mapTile: MapTile): MapTileDTO {
  return { ...mapTile };
}
