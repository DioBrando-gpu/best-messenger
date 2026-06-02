# ВАЖНО: Инструкции по исправлению и развёртыванию

## 🔧 Что было исправлено в версии 2.1.0

### Ошибка #1: Конфликт функций `createPost`
**Проблема:** В `public/app.js` было две функции с одинаковым именем:
- `createPost(post)` - для отображения поста
- `createPost()` - для отправки нового поста

Вторая переопределяла первую, что вызывало ошибку: 
```
Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.
```

**Решение:** 
- `createPost(post)` → переименована в `renderPost(post)`
- `createPost()` → переименована в `submitPost()`

### Добавлены новые функции:
✅ `searchUsers(query)` - поиск пользователей по "@"
✅ `startChat(username)` - начало диалога с пользователем
✅ API endpoints для голосовых и stories (готово к использованию)
✅ Заглушки для будущей функциональности

---

## 📦 Как развернуть на Render.com

### Способ 1: Через Git (Рекомендуется)

#### 1.1 Инициализация Git локально

```powershell
# Откройте PowerShell в папке проекта
cd c:\Users\D1O\Desktop\TotemMask

# Инициализируем git репозиторий
git init

# Проверяем статус
git status
```

#### 1.2 Создание репозитория на GitHub

1. Перейдите на https://github.com/new
2. Создайте публичный репозиторий с именем `TotemMask`
3. НЕ инициализируйте с README (у нас уже есть)

#### 1.3 Загрузка кода на GitHub

```powershell
# Добавляем все файлы
git add .

# Создаём первый коммит
git commit -m "DIO Messenger v2.0.0 - Fixed appendChild bug, added user search and chat"

# Добавляем remote (замените USERNAME на вашу ссылку)
git remote add origin https://github.com/USERNAME/TotemMask.git

# Меняем ветку на main
git branch -M main

# Пушим на GitHub
git push -u origin main
```

#### 1.4 Развёртывание на Render.com

1. Перейдите на https://render.com
2. Нажмите **Dashboard** → **New +** → **Web Service**
3. Выберите ваш GitHub репозиторий `TotemMask`
4. Заполните параметры:
   - **Name:** `dio-messenger`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free` (можно обновить позже)

5. Нажмите **Create Web Service**

#### 1.5 Проверка статуса

После нажатия Create:
- Render начнёт сборку (Build)
- Затем запустит сервер (Deploy)
- Вы получите URL типа: `https://dio-messenger-xxxx.onrender.com`

---

### Способ 2: Manual Deploy (если Git не работает)

1. Зайдите на https://render.com
2. Нажмите **Dashboard** → **New +** → **Web Service**
3. Нажмите **Connect manually**
4. Заполните поля:
   - **Repository:** `https://github.com/USERNAME/TotemMask`
   - Остальное как выше

---

## ✅ Тестирование после деплоя

### На сайте:

```
1. Откройте https://dio-messenger-xxxx.onrender.com
2. Нажмите "Регистрация"
3. Создайте аккаунт: `testuser` / `123456`
4. Создайте пост
5. Перейдите на "Сообщения"
6. Введите "@" и имя пользователя в поиск
7. Отправьте сообщение
```

### Проверьте консоль браузера (F12):

- ❌ Не должно быть ошибок `appendChild`
- ✅ Status должен показать "Пост опубликован!"
- ✅ Посты должны отображаться на ленте

---

## 🔄 Обновление кода на Render

После любых изменений:

```powershell
# Локально
git add .
git commit -m "Описание изменений"
git push origin main

# Render автоматически начнёт переразвёртывание
# Проверьте статус в Dashboard → Deploys
```

---

## 🆘 Если что-то не работает

### Проблема: "Cannot find module 'express'"
```powershell
# Убедитесь, что зависимости установлены
npm install

# Пересоберите проект
git add package-lock.json
git commit -m "Update dependencies"
git push origin main
```

### Проблема: Сервис не запускается
- Откройте Dashboard → Logs на Render
- Посмотрите ошибки в логах
- Проверьте, что `server.js` существует
- Убедитесь, что PORT = 3000

### Проблема: Данные теряются после перезагрузки
Это нормально - JSON файлы не персистируют. Используйте Render Postgres:

1. Dashboard → Create New → PostgreSQL
2. Обновите `server.js` для использования БД
3. (Позже может добавить миграцию)

---

## 📝 Что дальше?

После успешного деплоя:

1. ✅ Мессенджер работает 24/7
2. 🎤 Реализуйте голосовые (см. ROADMAP.md)
3. 🎬 Добавьте stories
4. 🔐 Внедрите E2E шифрование

Все инструкции в файле `ROADMAP.md`

---

**Версия:** 2.1.0  
**Дата:** 2 июня 2026  
**Статус:** ✅ Готово к развёртыванию
