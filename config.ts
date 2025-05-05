import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

export default {
  port: process.env.PORT || 8080,
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "1234",
    name: process.env.DB_NAME || "game",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  },
  server: {
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "30000"),
    maxPayloadSize: parseInt(process.env.MAX_PAYLOAD_SIZE || "1048576"), // 1MB
  },
};
