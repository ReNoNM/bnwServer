export interface Unit {
  id: string;
  ownerPlayerId: string;
  worldId: string;
  x: number;
  y: number;
  name: string;
  inventoryId?: string | null;
  data?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}
