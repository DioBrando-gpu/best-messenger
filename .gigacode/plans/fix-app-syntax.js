const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'public', 'app.js');
let content = fs.readFileSync(appJsPath, 'utf8');

// Найти и заменить строку с ошибкой
const errorLine = '{"text": "navSettings?.addEventListener(\'click\', () => showSection(\'settings\'));\\nnavStand?.addEventListener(\'click\', () => { showSection(\'stand\'); loadStandFeed(true); });"}';
const correctLines = `navSettings?.addEventListener('click', () => showSection('settings'));
navStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });`;

if (content.includes(errorLine)) {
  content = content.replace(errorLine, correctLines);
  fs.writeFileSync(appJsPath, content, 'utf8');
  console.log('✅ Исправлено: синтаксическая ошибка в app.js');
} else {
  console.log('⚠️  Строка с ошибкой не найдена (возможно уже исправлена)');
}

// Проверка синтаксиса
const { execSync } = require('child_process');
try {
  execSync('node -c public/app.js', { stdio: 'inherit' });
  console.log('✅ app.js: синтаксис OK');
} catch (e) {
  console.error('❌ app.js: синтаксическая ошибка');
  process.exit(1);
}

try {
  execSync('node -c server.js', { stdio: 'inherit' });
  console.log('✅ server.js: синтаксис OK');
} catch (e) {
  console.error('❌ server.js: синтаксическая ошибка');
  process.exit(1);
}

console.log('\n✅ Все файлы прошли проверку синтаксиса');
