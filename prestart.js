// Fail-fast check: убедиться, что DATABASE_URL установлен.
// На Render без этой переменной сервер не сможет работать с PostgreSQL.
if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is not set.');
  console.error('На Render: открой Dashboard → Service → Environment → добавь DATABASE_URL');
  console.error('Локально для разработки можно использовать: npm run start:dev');
  process.exit(1);
}
require('./server.js');
