# План исправления раздела Stand и PostgreSQL

## Текущее состояние

- **Кнопка "Stand" не работает** - синтаксическая ошибка в `app.js` строка 881
- **PostgreSQL настроен** - `DATABASE_URL` уже установлена
- **Проблема с сохранением данных** - посты исчезают через 15 минут (скорее всего перезапуск сервера без постоянного хранилища)

## Проблемы

### 1. Синтаксическая ошибка в app.js (строка 881)
```javascript
// Текущий код (ЛОМАНЫЙ):
{"text": "navSettings?.addEventListener('click', () => showSection('settings'));\\nnavStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });"}

// Должно быть (ИСПРАВЛЕННОЕ):
navSettings?.addEventListener('click', () => showSection('settings'));
navStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });
```

### 2. Отсутствие проверки DATABASE_URL при старте
- Нужно убедиться, что база данных инициализируется правильно
- Проверить, что данные сохраняются в PostgreSQL

## Шаги исправления

### Шаг 1: Исправить app.js
**Файл:** `public/app.js`  
**Строка:** 881

**Действия:**
- Удалить строку с `{"text": "..."}`
- Добавить два нормальных вызова `addEventListener` для `navSettings` и `navStand`

### Шаг 2: Проверить server.js
**Файл:** `server.js`  
**Проверить:**
- Эндпоинты `/api/stand/*` существуют и работают
- Функция `readStands()` и `writeStands()` используют PostgreSQL, если `DATABASE_URL` задана

### Шаг 3: Проверить lib/store.js
**Файл:** `lib/store.js`  
**Проверить:**
- Функция `usePostgres()` правильно определяет режим работы
- Все методы `readStandsPg()` / `writeStandsPg()` реализованы

### Шаг 4: Проверить lib/db.js
**Файл:** `lib/db.js`  
**Проверить:**
- Таблица `stands` создается корректно
- Схема соответствует структуре данных в `server.js`

### Шаг 5: Тестирование
- Запустить сервер локально
- Проверить, что кнопка "Stand" работает
- Проверить, что посты сохраняются в базу

## Код для исправления app.js

```javascript
// Удалить строку 881: {"text": "..."}
// Добавить после строки navProfile?.addEventListener(...):

navSettings?.addEventListener('click', () => showSection('settings'));
navStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });
```

## Проверка PostgreSQL

После исправления кода, проверить логи сервера при запуске:
- Если видите `Storage: PostgreSQL` - всё работает с базой
- Если видите `Storage: JSON files` - нужно проверить `DATABASE_URL`

## Скрипт миграции данных (если нужно)

Если данные в JSON, а база пуста, запустить:
```bash
node scripts/migrate-server-pg.js
```
