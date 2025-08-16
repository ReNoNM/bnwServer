export type VisibilityStatus = "notVisible" | "visible" | "scouted" | "visited";

interface BaseTile {
  id: string;
  worldId: string;
  x: number;
  y: number;
  status: VisibilityStatus;
}

interface TileContent {
  type: string;
  typeId: number;
  label: string;
  metadata?: Record<string, any>;
  isCapital: boolean;
  ownerPlayerId?: string;
  buildingId?: string;
}

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

export type MapTileWithVisibility = (BaseTile & { status: "notVisible" }) | (BaseTile & { status: "visible" | "scouted" | "visited" } & TileContent);

export type MapTileWithVisibilityDTO = MapTileWithVisibility;

export function mapTileWithVisibilityToDTO(tile: MapTileWithVisibility): MapTileWithVisibilityDTO {
  return { ...tile };
}
