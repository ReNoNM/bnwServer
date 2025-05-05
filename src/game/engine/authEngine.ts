import { Player } from "../../db/models/player";
import { addPlayer, getPlayerByUsername } from "../../db";
import { hashPassword, verifyPassword } from "../../utils/passwordUtils";
import { generateToken } from "../../utils/tokenUtils";
import { log } from "../../utils/logger";

export async function registerPlayer(
  username: string,
  password: string
): Promise<{ success: boolean; player?: Omit<Player, "password">; token?: string; error?: string }> {
  try {
    // Проверяем имя пользователя на корректность
    if (!username || username.length < 3 || username.length > 20) {
      return { success: false, error: "Имя пользователя должно содержать от 3 до 20 символов" };
    }

    // Проверяем пароль на корректность
    if (!password || password.length < 6) {
      return { success: false, error: "Пароль должен содержать минимум 6 символов" };
    }

    // Проверяем, существует ли уже пользователь с таким именем
    const existingPlayer = await getPlayerByUsername(username);
    if (existingPlayer) {
      return { success: false, error: "Пользователь с таким именем уже существует" };
    }

    // Хешируем пароль перед сохранением
    const hashedPassword = hashPassword(password);

    // Создаем нового игрока
    const newPlayer = await addPlayer({
      username,
      password: hashedPassword,
      status: "online",
    });

    if (!newPlayer) {
      return { success: false, error: "Ошибка при создании пользователя" };
    }

    // Создаем токен для авторизации
    const token = generateToken(newPlayer.id);

    // Логируем успешную регистрацию
    log(`Игрок зарегистрирован: ${username} (${newPlayer.id})`);

    // Не отправляем пароль клиенту
    const { password: _, ...playerWithoutPassword } = newPlayer;

    return { success: true, player: playerWithoutPassword, token };
  } catch (error) {
    log(`Ошибка при регистрации игрока: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при регистрации" };
  }
}

export async function authenticatePlayer(
  username: string,
  password: string
): Promise<{ success: boolean; player?: Omit<Player, "password">; token?: string; error?: string }> {
  try {
    // Ищем пользователя по имени
    const player = await getPlayerByUsername(username);

    if (!player) {
      return { success: false, error: "Неверные учетные данные" };
    }

    // Проверяем пароль
    if (!verifyPassword(player.password, password)) {
      log(`Неудачная попытка входа: ${username}`, true);
      return { success: false, error: "Неверные учетные данные" };
    }

    // Создаем токен для авторизации
    const token = generateToken(player.id);

    // Логируем успешный вход
    log(`Игрок вошел в систему: ${username} (${player.id})`);

    // Не отправляем пароль клиенту
    const { password: _, ...playerWithoutPassword } = player;

    return { success: true, player: playerWithoutPassword, token };
  } catch (error) {
    log(`Ошибка при аутентификации игрока: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при аутентификации" };
  }
}
