export interface Building {
  id: string;
  mapCellId: string;
  ownerPlayerId: string;
  type: string;
  level: number;
  data?: Record<string, any>;
  inventoryId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
