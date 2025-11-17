export interface TimeEvent {
  id: string;
  type: "periodic" | "once" | "delayed";
  name: string;
  player_id?: string;
  world_id?: string;
  execute_at?: Date;
  interval?: number;
  last_execution?: Date;
  status: "active" | "paused" | "completed" | "cancelled";
  paused_at?: Date | null;
  remaining_time?: number | null; // миллисекунд до выполнения на момент паузы
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export type TimeEventDTO = Omit<TimeEvent, "created_at" | "updated_at">;
