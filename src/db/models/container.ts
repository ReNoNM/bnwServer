export interface Container {
  id: string;
  capacity: number;
  type: string;
  maxWeight?: number;
  createdAt: number;
}

export interface ContainerDTO {
  id: string;
  capacity: number;
  type: string;
}
