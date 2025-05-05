import { PlayerTable } from "./player";
import { ChatMessageTable } from "./chatMessage";

// Определяем интерфейс базы данных для Kysely
export interface Database {
  players: PlayerTable;
  chat_messages: ChatMessageTable;
}
