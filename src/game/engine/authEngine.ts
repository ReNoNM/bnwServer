import { Player } from "../../db/models/player";
import { hashPassword, verifyPassword } from "../../utils/passwordUtils";
import { generateToken } from "../../utils/tokenUtils";
import { log } from "../../utils/logger";
import { playerRepository } from "../../db";
import {
  generateVerificationCode,
  sendVerificationEmail,
  verifyCode,
  generateVerificationToken,
  verifyToken,
  generatRestoreCode,
  verifyCodeReset,
  generateVerificationTokenRestore,
  verifyTokenRestore,
} from "../../utils/verificationService";
import { pluralTags, tags } from "../../utils/data";

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
  verificationToken: string,
  tagPosition: string,
  tagFormat: string,
  tagId: number
): Promise<{ success: boolean; player?: Omit<Player, "password">; token?: string; error?: string }> {
  try {
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

    const tagName = tagFormat === "single" ? tags[tagId - 1] : pluralTags[tagId - 1];
    const tag = tagPosition === "end" ? tagName.toLowerCase() : tagName;
    // Создаем нового игрока
    const newPlayer = await playerRepository.add({
      username,
      email,
      password: hashedPassword,
      status: "online",
      tag,
      tagPosition,
    });

    if (!newPlayer) {
      return { success: false, error: "Ошибка при создании пользователя" };
    }

    // Создаем токен для авторизации
    const token = await generateToken(newPlayer.id);

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

    // Создаем JWT токен для авторизации
    const token = await generateToken(player.id);

    // Обновляем статус пользователя
    await playerRepository.update(player.id, { status: "online", lastLogin: Date.now() });

    // Логируем успешный вход
    log(`Игрок вошел в систему: ${player.username} (${player.id})`);

    // Не отправляем пароль клиенту
    const { password: _, ...playerWithoutPassword } = player;

    return {
      success: true,
      player: playerWithoutPassword,
      token: token,
    };
  } catch (error) {
    log(`Ошибка при аутентификации игрока: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при аутентификации" };
  }
}

export async function initiateResetPassword(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Проверяем, не занят ли уже email
    const existingPlayer = await playerRepository.getByEmail(email);
    if (!existingPlayer) {
      return { success: false, error: "Email не зарегистрирован" };
    }

    // Генерация кода подтверждения
    const code = generatRestoreCode(email);

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

export async function verifyRegistrationCodeReset(
  email: string,
  code: string
): Promise<{ success: boolean; verificationToken?: string; error?: string }> {
  try {
    // Проверка кода
    const verification = verifyCodeReset(email, code);
    if (!verification.success) {
      return { success: false, error: "Неверный или истекший код подтверждения" };
    }

    // Получение токена для завершения регистрации
    const verificationToken = generateVerificationTokenRestore(email);

    return { success: true, verificationToken };
  } catch (error) {
    log(`Ошибка при проверке кода подтверждения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при проверке кода подтверждения" };
  }
}

export async function completeRestorePassword(
  email: string,
  password: string,
  verificationToken: string
): Promise<{ success: boolean; player?: Omit<Player, "password">; token?: string; error?: string }> {
  try {
    // Проверка токена верификации
    const verification = verifyTokenRestore(verificationToken);
    if (!verification.valid || verification.email !== email) {
      return { success: false, error: "Недействительный токен верификации" };
    }

    // Проверяем, не занято ли уже имя пользователя
    const existingPlayer = await playerRepository.getByEmail(email);
    if (!existingPlayer) {
      return { success: false, error: "Пользователь не найден" };
    }

    const hashedPassword = hashPassword(password);

    if (!hashedPassword) {
      log(`ОШИБКА: Пустой хешированный пароль для ${email} при завершении регистрации`, true);
      return { success: false, error: "Внутренняя ошибка сервера: потеря данных аутентификации" };
    }

    await playerRepository.update(existingPlayer.id, {
      password: hashedPassword,
      status: "online",
    });

    // Создаем токен для авторизации
    const token = await generateToken(existingPlayer.id);

    // Логируем успешную регистрацию
    log(`Игрок сбросил пароль: ${existingPlayer.username}`);

    // Не отправляем пароль клиенту
    const { password: _, ...playerWithoutPassword } = existingPlayer;

    return { success: true, player: playerWithoutPassword, token };
  } catch (error) {
    log(`Ошибка при сбросе: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`, true);
    return { success: false, error: "Ошибка при завершении сброса" };
  }
}
