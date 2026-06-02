const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const POSTS_FILE = path.join(__dirname, 'data', 'posts.json');
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');

// Создаём папку data если её нет
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Инициализируем файлы данных если их нет
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}
if (!fs.existsSync(POSTS_FILE)) {
  fs.writeFileSync(POSTS_FILE, '[]', 'utf8');
}
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(session({
  secret: 'dio-messenger-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return JSON.parse(content || '[]');
  } catch (error) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readUsers() {
  return readJSON(USERS_FILE);
}

function writeUsers(users) {
  writeJSON(USERS_FILE, users);
}

function readPosts() {
  return readJSON(POSTS_FILE);
}

function writePosts(posts) {
  writeJSON(POSTS_FILE, posts);
}

function readMessages() {
  return readJSON(MESSAGES_FILE);
}

function writeMessages(messages) {
  writeJSON(MESSAGES_FILE, messages);
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

  const avatars = ['😎', '🤖', '👨‍💻', '🎨', '🏃', '🧠', '⚡', '🚀', '🌟', '💎'];
  const newUser = {
    username,
    password,
    avatar: avatars[Math.floor(Math.random() * avatars.length)],
    bio: 'Новый пользователь DIO',
    followers: [],
    following: [],
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
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
  const posts = readPosts();
  const users = readUsers();
  const enrichedPosts = posts.map(post => {
    const user = users.find(u => u.username === post.author);
    return {
      ...post,
      avatar: user?.avatar || '👤'
    };
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ posts: enrichedPosts });
});

app.post('/api/posts/create', requireAuth, (req, res) => {
  const { text, image } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ message: 'Текст поста не может быть пустым' });
  }

  const posts = readPosts();
  const newPost = {
    id: Date.now(),
    author: req.session.username,
    text: text.trim(),
    image: image || null,
    timestamp: new Date().toISOString(),
    likes: [],
    comments: []
  };

  posts.push(newPost);
  writePosts(posts);
  res.json({ message: 'Пост создан', post: newPost });
});

app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  const likeIndex = post.likes.indexOf(req.session.username);
  if (likeIndex > -1) {
    post.likes.splice(likeIndex, 1);
  } else {
    post.likes.push(req.session.username);
  }

  writePosts(posts);
  res.json({ message: 'Лайк обновлен', likes: post.likes });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const posts = readPosts();
  const index = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  if (posts[index].author !== req.session.username) {
    return res.status(403).json({ message: 'Вы не можете удалить чужой пост' });
  }

  posts.splice(index, 1);
  writePosts(posts);
  res.json({ message: 'Пост удален' });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const messages = readMessages();
  const userMessages = messages.filter(m => m.from === req.session.username || m.to === req.session.username);
  
  // Группируем по контакту
  const grouped = {};
  userMessages.forEach(msg => {
    const contact = msg.from === req.session.username ? msg.to : msg.from;
    if (!grouped[contact]) {
      grouped[contact] = [];
    }
    grouped[contact].push(msg);
  });

  const contacts = Object.entries(grouped).map(([name, msgs]) => ({
    name,
    lastMessage: msgs[msgs.length - 1]?.text,
    timestamp: msgs[msgs.length - 1]?.timestamp,
    unread: msgs.filter(m => m.to === req.session.username && !m.read).length > 0
  }));

  res.json({ contacts });
});

app.get('/api/chat/:username', requireAuth, (req, res) => {
  const otherUser = req.params.username;
  const messages = readMessages();
  const chat = messages.filter(m => 
    (m.from === req.session.username && m.to === otherUser) ||
    (m.from === otherUser && m.to === req.session.username)
  ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Отмечаем сообщения как прочитанные
  chat.forEach(msg => {
    if (msg.to === req.session.username && !msg.read) {
      msg.read = true;
    }
  });
  writeMessages(messages);

  res.json({ messages: chat, withUser: otherUser });
});

app.post('/api/messages/send', requireAuth, (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ message: 'Укажите получателя и текст' });
  }

  const users = readUsers();
  if (!users.find(u => u.username === to)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const messages = readMessages();
  const newMessage = {
    id: Date.now(),
    from: req.session.username,
    to: to,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    read: false
  };

  messages.push(newMessage);
  writeMessages(messages);
  res.json({ message: 'Сообщение отправлено', msg: newMessage });
});

app.get('/api/profile', requireAuth, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.username === req.session.username);
  const posts = readPosts().filter(p => p.author === req.session.username);
  
  res.json({
    username: req.session.username,
    avatar: user?.avatar || '👤',
    bio: user?.bio || 'О себе ничего не рассказано',
    followers: user?.followers?.length || 0,
    following: user?.following?.length || 0,
    posts: posts.length
  });
});

app.get('/api/users/search', requireAuth, (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  const users = readUsers().filter(u => 
    u.username.toLowerCase().includes(query) && u.username !== req.session.username
  );
  
  res.json({ users: users.map(u => ({
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    followers: u.followers?.length || 0
  })) });
});

app.get('/api/user/:username', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const posts = readPosts().filter(p => p.author === user.username);
  res.json({
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    followers: user.followers?.length || 0,
    following: user.following?.length || 0,
    posts: posts.length
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
