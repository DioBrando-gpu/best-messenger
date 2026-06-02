const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'users.json');

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(session({
  secret: 'totem-mask-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function readUsers() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(content || '[]');
  } catch (error) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Введите логин и пароль' });
  }

  const users = readUsers();
  const existing = users.find(user => user.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(409).json({ message: 'Пользователь с таким логином уже существует' });
  }

  users.push({ username, password });
  writeUsers(users);
  req.session.username = username;
  res.json({ message: 'Регистрация прошла успешно', username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Введите логин и пароль' });
  }

  const users = readUsers();
  const user = users.find(user => user.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }

  req.session.username = user.username;
  res.json({ message: 'Вход выполнен', username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Вы вышли из системы' });
  });
});

app.get('/api/user', (req, res) => {
  if (!req.session || !req.session.username) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, username: req.session.username });
});

app.get('/api/feed', requireAuth, (req, res) => {
  const posts = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    username: `artist_${index + 1}`,
    image: `https://picsum.photos/seed/totem-${index + 1}/640/640`,
    description: `Минималистичная фотография #${index + 1}`,
    likes: Math.floor(Math.random() * 250 + 20),
    time: `${Math.floor(Math.random() * 8 + 1)} ч назад`
  }));
  res.json({ posts });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const messages = [
    { id: 1, contact: 'Nina', text: 'Привет! Как тебе новый стиль?', unread: true },
    { id: 2, contact: 'Max', text: 'Скинь фото для ленты', unread: false },
    { id: 3, contact: 'Anna', text: 'Встречаемся сегодня вечером?', unread: false }
  ];
  res.json({ messages });
});

app.get('/api/profile', requireAuth, (req, res) => {
  res.json({
    username: req.session.username,
    bio: 'Минималистичный локальный профиль для теста.',
    following: 128,
    followers: 432,
    posts: 18
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
