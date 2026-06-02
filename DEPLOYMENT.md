# Развёртывание DIO Messenger на Render.com

## Шаг 1: Подготовка к развёртыванию

### Обновление package.json
Убедитесь, что ваш `package.json` содержит правильный `start` скрипт:

```json
{
  "name": "dio-messenger",
  "version": "2.0.0",
  "description": "DIO - современный мессенджер с лентой, чатом и постами.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "body-parser": "^1.20.4",
    "express": "^4.18.3",
    "express-session": "^1.17.3"
  }
}
```

### Инициализация Git (если ещё не инициализирован)

```bash
cd c:\Users\D1O\Desktop\TotemMask

# Инициализируем git
git init

# Добавляем все файлы
git add .

# Коммитим
git commit -m "Initial commit: DIO Messenger v2.0.0"

# Добавляем remote (получите URL от GitHub/GitLab)
git remote add origin https://github.com/YourUsername/TotemMask.git

# Пушим
git branch -M main
git push -u origin main
```

## Шаг 2: Создание Web Service на Render.com

1. Перейдите на https://render.com
2. Нажмите **"New +" → "Web Service"**
3. Выберите ваш git репозиторий
4. Заполните форму:
   - **Name:** dio-messenger (или другое имя)
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free

5. Нажмите **"Create Web Service"**

## Шаг 2.1: PostgreSQL (постоянная память)

Без базы данных посты и сообщения пропадают после каждого деплоя.

1. В Render: **New + → PostgreSQL** → создайте базу (Free).
2. Откройте ваш **Web Service** → **Environment**.
3. Добавьте переменную **`DATABASE_URL`** — скопируйте **Internal Database URL** из карточки PostgreSQL.
4. Сохраните и дождитесь перезапуска.

При первом запуске сервер создаст таблицы и, если есть файлы в `data/*.json`, импортирует их в базу.

Локально: скопируйте `.env.example` в `.env` и укажите свой `DATABASE_URL`, либо оставьте без него — тогда данные в JSON (как раньше).

## Шаг 3: Настройка переменных окружения

После создания сервиса:

1. Перейдите в **Settings** вашего сервиса
2. Найдите **Environment** секцию
3. Добавьте переменные:
   - Ключ: `NODE_ENV` → Значение: `production`
   - Ключ: `PORT` → Значение: `3000` (обычно автоматически)

## Шаг 4: Проверка развёртывания

1. После развёртывания Render покажет URL: `https://dio-messenger-xxxx.onrender.com`
2. Откройте этот URL в браузере
3. Проверьте функционал:
   - ✅ Регистрация
   - ✅ Создание постов
   - ✅ Поиск пользователей
   - ✅ Отправка сообщений

## Шаг 5: Автоматическое развёртывание при обновлениях

Теперь каждый раз, когда вы делаете `git push` в основную ветку, Render автоматически переразвернёт ваше приложение.

```bash
# После изменений локально:
git add .
git commit -m "Описание изменений"
git push origin main

# Render автоматически начнёт развёртывание
```

## ⚠️ Важные замечания

### Persistence (сохранение данных)

По умолчанию, файловые системы Render не персистируют между перезагрузками. Вам нужно:

**Вариант 1: Использовать Render Disk (Платно)**
- Добавьте диск в настройках сервиса
- Смонтируйте его на `/data`

**Вариант 2: Миграция на БД (Рекомендуется)**
- PostgreSQL на Render (есть free trial)
- MongoDB (бесплатно на MongoDB Atlas)

### Для миграции на PostgreSQL:

1. Создайте PostgreSQL базу на Render
2. Установите `pg` пакет:
   ```bash
   npm install pg --save
   ```
3. Обновите `server.js` для использования БД вместо JSON файлов

## 🔗 Полезные ссылки

- [Render Документация](https://render.com/docs)
- [Node.js на Render](https://render.com/docs/deploy-node)
- [Управление базами данных](https://render.com/docs/databases)

## 🆘 Решение проблем

### Ошибка: "Cannot find module 'express'"
```bash
# Убедитесь, что npm install выполнился:
npm install
```

### Ошибка: "Failed to execute 'appendChild'"
Это была ошибка версионирования. Обновите код до последней версии:
```bash
git pull origin main
```

### Сервис не запускается
- Проверьте логи в Render Dashboard → Logs
- Убедитесь, что `server.js` существует
- Проверьте правильность `package.json`

### Данные теряются при перезагрузке
Это нормально для файловой системы Render. Мигрируйте на БД.

---

**После успешного развёртывания:**

1. Ваш мессенджер доступен 24/7
2. Любые обновления автоматически развёртываются
3. Готово для добавления функций!

Удачи! 🚀
