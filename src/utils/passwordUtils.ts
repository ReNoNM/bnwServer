import crypto from 'crypto';

// Простая функция для хеширования пароля с солью
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Проверка пароля
export function verifyPassword(storedPassword: string, suppliedPassword: string): boolean {
  const [salt, storedHash] = storedPassword.split(':');
  const hash = crypto.pbkdf2Sync(suppliedPassword, salt, 1000, 64, 'sha512').toString('hex');
  return storedHash === hash;
}
