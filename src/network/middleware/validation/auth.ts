import { Type, Static } from '@sinclair/typebox';

// Схема для регистрации с более строгими правилами
export const registerPayloadSchema = Type.Object({
  username: Type.String({
    minLength: 3,
    maxLength: 20,
    pattern: '^[a-zA-Z0-9_]+$',
    errorMessage: {
      minLength: 'Имя пользователя должно содержать минимум 3 символа',
      maxLength: 'Имя пользователя не должно превышать 20 символов',
      pattern: 'Имя пользователя может содержать только буквы, цифры и знак подчеркивания'
    }
  }),
  password: Type.String({
    minLength: 6,
    maxLength: 100,
    errorMessage: {
      minLength: 'Пароль должен содержать минимум 6 символов',
      maxLength: 'Пароль слишком длинный'
    }
  })
});

// Схема для входа
export const loginPayloadSchema = Type.Object({
  username: Type.String({ 
    minLength: 1,
    errorMessage: { minLength: 'Введите имя пользователя' }
  }),
  password: Type.String({ 
    minLength: 1,
    errorMessage: { minLength: 'Введите пароль' }
  }),
});

// Схема для аутентификации по токену
export const tokenPayloadSchema = Type.Object({
  token: Type.String({ 
    minLength: 1,
    errorMessage: { minLength: 'Токен не может быть пустым' }
  }),
});

// Типы данных на основе схем
export type RegisterPayload = Static<typeof registerPayloadSchema>;
export type LoginPayload = Static<typeof loginPayloadSchema>;
export type TokenPayload = Static<typeof tokenPayloadSchema>;
