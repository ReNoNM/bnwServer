export interface InventoryItem {
  id: string;
  containerId: string;
  itemType: string;
  quantity: number;
  slotIndex: number;
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface InventoryItemDTO {
  id: string;
  itemType: string;
  quantity: number;
  slotIndex: number;
  metadata?: Record<string, any>;
}
