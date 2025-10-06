export interface Building {
  id: string;
  mapCellId: string;
  ownerPlayerId: string;
  type: string;
  level: number;
  data?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
