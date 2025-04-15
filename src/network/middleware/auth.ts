import { WebSocket } from "ws";

export function authenticateConnection(ws: WebSocket, token: string): boolean {
  // В реальном приложении здесь должна быть проверка JWT или другого токена
  return token === "valid-token";
}
