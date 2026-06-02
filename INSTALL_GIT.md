# 🔧 Как запустить автоматический деплой

## Проблема: Git не установлен

Я создал скрипт `deploy.ps1`, который автоматически заливает всё на GitHub, но сначала нужна установка Git.

---

## ✅ Решение за 5 минут

### Шаг 1: Установка Git (2 минуты)

1. Откройте https://git-scm.com/download/win
2. Нажмите **"Click here to download"** (зелёная кнопка)
3. Запустите установщик
4. **Нажимайте Next → Next → Finish** (все параметры по умолчанию)
5. **Перезагрузитесь** (важно!)

### Шаг 2: Создание GitHub репозитория (2 минуты)

1. Откройте https://github.com/new
2. Заполните:
   - **Repository name:** `TotemMask`
   - Выберите **Public**
3. **Нажмите Create repository**
4. **Скопируйте URL** вроде `https://github.com/YourName/TotemMask.git`

### Шаг 3: Запуск скрипта (1 минута)

1. Откройте **PowerShell** в папке проекта
   ```
   Правый клик в папке TotemMask → "Open PowerShell here"
   ```

2. Запустите скрипт:
   ```powershell
   .\deploy.ps1
   ```

3. Скрипт спросит:
   - Ваше имя (просто введите имя, Enter)
   - Почту GitHub (введите почту, Enter)
   - URL репозитория (вставьте скопированный URL, Enter)

4. **Всё!** Код залит на GitHub ✅

---

## 🎯 После автоматического деплоя

Если скрипт скажет ошибку при push, вам нужен **Personal Access Token** для GitHub:

### Получение Personal Access Token

1. Перейдите на https://github.com/settings/tokens
2. Нажмите **"Generate new token"**
3. Дайте имя: `dio-messenger`
4. Выберите scope: `repo` (полный доступ к репозиториям)
5. Нажмите **"Generate token"**
6. **Скопируйте токен** (он больше не покажется!)
7. Когда скрипт спросит пароль - вставьте этот токен

---

## 🚀 Render.com деплой (после GitHub)

После успешного `git push`:

1. Откройте https://render.com
2. **New Web Service** → выберите `TotemMask`
3. Параметры:
   ```
   Build Command: npm install
   Start Command: node server.js
   ```
4. **Create** и ждите ~2 минуты

Готово! Ссылка вроде `https://dio-messenger-xxx.onrender.com`

---

## 🛠️ Если что-то не работает

### "git: command not found" 
→ Git не установлен. Повторите Шаг 1 и **перезагрузитесь**

### "Failed to authenticate"
→ Используйте Personal Access Token вместо пароля (см. выше)

### "Repository already exists on this remote"
→ Ваш репо уже создан. Просто нажмите в скрипте Enter

### Скрипт не запускается
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Потом снова запустите скрипт

---

**Время на всё: ~7 минут** ⏱️

После этого код будет:
- ✅ На GitHub (видно всем)
- ✅ На Render.com (работает 24/7)
- ✅ Готов к развитию (просто `git push` для обновлений)

Удачи! 🚀
