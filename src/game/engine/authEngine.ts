import { Player } from "../../db/models/player";
import { hashPassword, verifyPassword } from "../../utils/passwordUtils";
import { generateToken } from "../../utils/tokenUtils";
import { log } from "../../utils/logger";
import { playerRepository } from "../../db";
import { generateVerificationCode, sendVerificationEmail, verifyCode, generateVerificationToken, verifyToken } from "../../utils/verificationService";

// Шаг 1: Инициация регистрации через почту
export async function initiateRegistration(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Проверка пароля на корректность
    if (!password || password.length < 6) {
      return { success: false, error: "Пароль должен содержать минимум 6 символов" };
    }

    // Проверяем, не занят ли уже email
    const existingPlayer = await playerRepository.getByEmail(email);
    if (existingPlayer) {
      return { success: false, error: "Этот email уже зарегистрирован" };
    }

    // Хеширование пароля
    const hashedPassword = hashPassword(password);
    log(`Сгенерирован хеш пароля для ${email}: ${hashedPassword}`);

    // Генерация кода подтверждения
    const code = generateVerificationCode(email, hashedPassword);

    // Отправка кода на почту (в данном случае - заглушка)
    if (!sendVerificationEmail(email, code)) {
      return { success: false, error: "Не удалось отправить код подтверждения" };
    }

    return { success: true };
  } catch (error) {
    log(`Ошибка при инициации регистрации: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при инициации регистрации" };
  }
}

// Шаг 2: Проверка кода подтверждения
export async function verifyRegistrationCode(email: string, code: string): Promise<{ success: boolean; verificationToken?: string; error?: string }> {
  try {
    // Проверка кода
    const verification = verifyCode(email, code);
    if (!verification.success) {
      return { success: false, error: "Неверный или истекший код подтверждения" };
    }

    const hashedPassword = verification.hashedPassword || "";

    if (!hashedPassword) {
      log(`ОШИБКА: Пустой хешированный пароль для ${email} после проверки кода`, true);
      return { success: false, error: "Внутренняя ошибка сервера: потеря данных аутентификации" };
    }

    // Получение токена для завершения регистрации
    const verificationToken = generateVerificationToken(email, hashedPassword);

    return { success: true, verificationToken };
  } catch (error) {
    log(`Ошибка при проверке кода подтверждения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при проверке кода подтверждения" };
  }
}

// Шаг 3: Завершение регистрации с выбором имени пользователя
export async function completeRegistration(
  email: string,
  username: string,
  verificationToken: string
): Promise<{ success: boolean; player?: Omit<Player, "password">; token?: string; error?: string }> {
  try {
    // Проверка имени пользователя на корректность
    if (!username || username.length < 3 || username.length > 20) {
      return { success: false, error: "Имя пользователя должно содержать от 3 до 20 символов" };
    }

    // Проверяем, не занято ли уже имя пользователя
    const existingPlayerByUsername = await playerRepository.getByUsername(username);
    if (existingPlayerByUsername) {
      return { success: false, error: "Пользователь с таким именем уже существует" };
    }

    // Проверка токена верификации
    const verification = verifyToken(verificationToken);
    if (!verification.valid || verification.email !== email) {
      return { success: false, error: "Недействительный токен верификации" };
    }

    const hashedPassword = verification.hashedPassword || "";

    if (!hashedPassword) {
      log(`ОШИБКА: Пустой хешированный пароль для ${email} при завершении регистрации`, true);
      return { success: false, error: "Внутренняя ошибка сервера: потеря данных аутентификации" };
    }

    // Создаем нового игрока
    const newPlayer = await playerRepository.add({
      username,
      email,
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
    log(`Ошибка при завершении регистрации: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при завершении регистрации" };
  }
}
// В функции authenticatePlayer
export async function authenticatePlayer(
  email: string,
  password: string
): Promise<{ success: boolean; player?: Omit<Player, "password">; token?: string; error?: string }> {
  try {
    // Найти пользователя по email
    const player = await playerRepository.getByEmail(email);

    if (!player) {
      return { success: false, error: "Неверные учетные данные" };
    }

    // Проверить пароль
    if (!verifyPassword(player.password, password)) {
      log(`Неудачная попытка входа: ${email}`, true);
      return { success: false, error: "Неверные учетные данные" };
    }

    // Создаем токен для авторизации
    const token = await generateToken(player.id);

    // Проверяем, что токен - это строка, а не объект
    if (typeof token !== "string") {
      log(`ОШИБКА: Токен должен быть строкой, получен тип: ${typeof token}`, true);
      return { success: false, error: "Ошибка генерации токена" };
    }

    // Логируем успешный вход
    log(`Игрок вошел в систему: ${player.username} (${player.id})`);

    // Не отправляем пароль клиенту
    const { password: _, ...playerWithoutPassword } = player;

    return {
      success: true,
      player: playerWithoutPassword,
      token: token, // Здесь должна быть строка токена
    };
  } catch (error) {
    log(`Ошибка при аутентификации игрока: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при аутентификации" };
  }
}
