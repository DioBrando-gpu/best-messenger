# DIO Messenger - Мессенджер на минималках

**Современный мессенджер с поддержкой постов, чата и будущей функциональностью голосовых и stories.**

## ✨ Функциональность

### Реализовано ✅
- 📱 Регистрация и вход
- 📝 Создание постов с опциональными изображениями
- 🔍 Поиск пользователей по "@" 
- 💬 Чаты с пользователями
- ❤️ Лайки на посты
- 👤 Профиль с количеством постов и подписчиков
- 🎨 Минималистичный темный интерфейс (как в Telegram)

### В разработке 🚀
- 🎤 Голосовые сообщения (API готов)
- 🎬 Stories - кружочки как в Telegram
- 🔐 Сквозное шифрование (E2E)
- 🔗 Подписки и подписчики

## 🛠️ Технологический стек

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JavaScript + CSS3
- **Хранилище:** JSON файлы (готово для миграции на БД)
- **Развёртывание:** Render.com

## 📦 Установка

```bash
# Клонирование репозитория
git clone <URL вашего репо>
cd TotemMask

# Установка зависимостей
npm install

# Запуск локально
node server.js
# Откройте http://localhost:3000
```

## 🚀 Развёртывание на Render.com

1. Создайте аккаунт на [render.com](https://render.com)
2. Подключите git репозиторий
3. Создайте Web Service с:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Установите PORT переменную окружения: `3000`

## 📁 Структура проекта

```
TotemMask/
├── server.js              # Express сервер
├── package.json           # Зависимости
├── users.json            # Локальные пользователи (для миграции)
├── public/
│   ├── index.html        # Главная страница
│   ├── login.html        # Страница входа
│   ├── app.js            # JavaScript клиента
│   └── style.css         # Стили
└── data/
    ├── users.json        # Пользователи
    ├── posts.json        # Посты
    ├── messages.json     # Сообщения
    ├── voice_messages.json   # Голосовые (готово)
    └── stories.json      # Stories (готово)
```

## 🎯 Как добавить функции

### Голосовые сообщения
В `app.js` функция `sendVoiceMessage()` готова к использованию. Замените TODO:

```javascript
// Используйте Web Audio API или MediaRecorder
const mediaRecorder = new MediaRecorder(stream);
mediaRecorder.ondataavailable = async (event) => {
  const audioBlob = event.data;
  await sendVoiceMessage(audioBlob);
};
```

### Stories
В `app.js` функция `createStory()` готова. Используйте Canvas или видео:

```javascript
// Захватите видео и отправьте
const canvas = document.createElement('canvas');
const imageData = canvas.toDataURL();
await createStory(imageData);
```

### Шифрование
Используйте **TweetNaCl.js** или **libsodium.js** для E2E:

```javascript
// Пример с TweetNaCl
const encrypted = nacl.secretbox(message, nonce, sharedSecret);
```

## 🔐 План внедрения шифрования

1. Генерировать пару ключей (публичный/приватный) при регистрации
2. Обмениваться публичными ключами между пользователями
3. Шифровать сообщения перед отправкой
4. Расшифровывать на клиентской стороне

## 🐛 Известные проблемы

- Данные хранятся в JSON (пересоздаётся при перезагрузке)
- Нет авторизации токенов (используется session)
- Нет rate limiting

## 📝 TODO

- [ ] Миграция на PostgreSQL
- [ ] JWT вместо сессий
- [ ] Полная E2E функциональность
- [ ] Мобильное приложение (React Native)
- [ ] WebSocket для real-time

## 🤝 Контрибьюция

Это учебный проект! Вносите улучшения через pull requests.

---

**Создано:** 2 июня 2026  
**Версия:** 2.0.0
