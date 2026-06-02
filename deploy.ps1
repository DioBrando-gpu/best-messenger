# DIO Messenger - Автоматический деплой на GitHub и Render
# Запустите: .\deploy.ps1

Write-Host "🚀 DIO Messenger - Автоматический деплой" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Проверка git
$gitInstalled = git --version 2>$null
if (-not $gitInstalled) {
    Write-Host "❌ Git не установлен!" -ForegroundColor Red
    Write-Host "Установите Git с https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "Затем запустите этот скрипт снова" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Git найден: $gitInstalled" -ForegroundColor Green
Write-Host ""

# Проверка GitHub учётных данных
Write-Host "📋 Настройка GitHub учётных данных" -ForegroundColor Cyan
$userName = git config --global user.name
$userEmail = git config --global user.email

if (-not $userName) {
    Write-Host "Введите ваше имя для GitHub:"
    $userName = Read-Host
    git config --global user.name "$userName"
}

if (-not $userEmail) {
    Write-Host "Введите вашу почту GitHub:"
    $userEmail = Read-Host
    git config --global user.email "$userEmail"
}

Write-Host "✅ Учётные данные установлены: $userName <$userEmail>" -ForegroundColor Green
Write-Host ""

# Инициализация git репо (если нужно)
if (-not (Test-Path ".git")) {
    Write-Host "📦 Инициализируем git репозиторий..." -ForegroundColor Cyan
    git init
    Write-Host "✅ Репо инициализировано" -ForegroundColor Green
} else {
    Write-Host "✅ Git репо уже существует" -ForegroundColor Green
}

Write-Host ""

# Добавление всех файлов
Write-Host "📄 Добавляем файлы..." -ForegroundColor Cyan
git add .
Write-Host "✅ Файлы добавлены" -ForegroundColor Green

Write-Host ""

# Создание коммита
Write-Host "💾 Создаём коммит..." -ForegroundColor Cyan
$commitMsg = "DIO Messenger v2.1.0 - User search, chat fixes, E2E ready"
git commit -m "$commitMsg"
Write-Host "✅ Коммит создан" -ForegroundColor Green

Write-Host ""
Write-Host "🌐 GitHub Repository" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Проверка remote
$hasRemote = git config --get remote.origin.url
if ($hasRemote) {
    Write-Host "✅ Remote уже настроен: $hasRemote" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Пушим код..." -ForegroundColor Cyan
    
    # Для первого раза пробуем main ветку
    $branch = git rev-parse --abbrev-ref HEAD
    
    if ($branch -eq "master") {
        git branch -M main
        Write-Host "✅ Ветка переименована в main" -ForegroundColor Green
    }
    
    git push -u origin main 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Код успешно залит на GitHub!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Ошибка push. Проверьте git credentials" -ForegroundColor Yellow
        Write-Host "Попробуйте вручную: git push -u origin main" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Remote не настроен" -ForegroundColor Red
    Write-Host ""
    Write-Host "Введите URL вашего GitHub репозитория:" -ForegroundColor Yellow
    Write-Host "(Пример: https://github.com/username/TotemMask)" -ForegroundColor Gray
    $repoUrl = Read-Host
    
    git remote add origin "$repoUrl"
    Write-Host "✅ Remote добавлен: $repoUrl" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "🚀 Пушим код..." -ForegroundColor Cyan
    
    git branch -M main
    git push -u origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Код успешно залит на GitHub!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Ошибка при push" -ForegroundColor Yellow
        Write-Host "Возможно нужен Personal Access Token" -ForegroundColor Yellow
        Write-Host "Создайте на https://github.com/settings/tokens" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "📝 Следующие шаги:" -ForegroundColor Cyan
Write-Host "1. Перейдите на https://render.com" -ForegroundColor White
Write-Host "2. Нажмите 'New Web Service'" -ForegroundColor White
Write-Host "3. Выберите ваш GitHub репозиторий 'TotemMask'" -ForegroundColor White
Write-Host "4. Заполните:" -ForegroundColor White
Write-Host "   Build Command: npm install" -ForegroundColor Gray
Write-Host "   Start Command: node server.js" -ForegroundColor Gray
Write-Host "5. Нажмите 'Create Web Service'" -ForegroundColor White
Write-Host ""
Write-Host "✨ Готово! Вскоре ваш мессенджер будет онлайн 🚀" -ForegroundColor Green
