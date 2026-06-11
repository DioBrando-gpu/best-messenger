const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_SECRET = process.env.COOKIE_SECRET || 'dio-token-secret-2026';
app.set('trust proxy', 1);
const USERNAME_REGEX = /^[a-z0-9_]{5,32}$/;

const DEFAULT_SETTINGS = {
  notifications: { enabled: true, sound: true, messagePreview: true, posts: true },
  privacy: { profileVisible: true, allowMessages: 'everyone', showLastSeen: true },
  language: 'ru',
  theme: 'dark'
};

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error(err);
      res.status(500).json({ message: err.message || 'Ошибка сервера' });
    });
  };
}

// ============== TOKEN AUTH (Authorization header) ==============
function createToken(username) {
  const payload = username + '|' + Date.now();
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(payload + '.' + sig).toString('base64');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const dot = decoded.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const username = payload.split('|')[0];
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
    if (sig !== expected) return null;
    return username;
  } catch (e) {
    return null;
  }
}

function getAuthUser(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const user = verifyToken(token);
    console.log('[AUTH] Bearer token:', token.slice(0, 20) + '...', '-> user:', user);
    return user;
  }
  // Fallback to cookie for backward compatibility
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === 'dio_auth') return decodeURIComponent(part.slice(eq + 1).trim());
  }
  console.log('[AUTH] No auth found. Headers:', JSON.stringify(req.headers));
  return null;
}

function requireAuth(req, res, next) {
  const username = getAuthUser(req);
  if (!username) return res.status(401).json({ message: 'Unauthorized' });
  req.authUsername = username;
  next();
}
// ================================================

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Введите username и пароль' });
  const users = await store.readUsers();
  const user = users.find(u => u.username === username.trim().toLowerCase());
  if (!user || user.password !== password) return res.status(401).json({ message: 'Неверный username или пароль' });
  const token = createToken(user.username);
  res.json({ message: 'Вход выполнен', username: user.username, token });
}));

app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Введите username и пароль' });
  const u = username.trim().toLowerCase();
  if (!USERNAME_REGEX.test(u)) return res.status(400).json({ message: 'Username: только a-z, 0-9 и _, минимум 5 символов' });
  const users = await store.readUsers();
  if (users.some(x => x.username === u)) return res.status(409).json({ message: 'Этот @username уже занят' });
  const avatars = ['😎', '🤖', '👨‍💻', '🎨', '🏃', '🧠', '⚡', '🚀', '🌟', '💎'];
  const newUser = { username: u, password, avatar: avatars[Math.floor(Math.random() * avatars.length)], avatarImage: null, bio: 'Новый пользователь DIO', followers: [], following: [], blacklist: [], createdAt: new Date().toISOString(), settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) };
  users.push(newUser);
  await store.writeUsers(users);
  const token = createToken(u);
  res.json({ message: 'Регистрация прошла успешно', username: u, token });
}));

app.post('/api/logout', (req, res) => {
  res.json({ message: 'Вы вышли из системы' });
});

app.get('/api/user', asyncHandler(async (req, res) => {
  const username = getAuthUser(req);
  if (!username) return res.json({ loggedIn: false });
  let user = await store.getUser(username);
  if (user) { user.lastSeen = new Date().toISOString(); await store.saveUser(user); }
  res.json({ loggedIn: true, username, settings: user?.settings || DEFAULT_SETTINGS });
}));

app.post('/api/user/heartbeat', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.authUsername);
  if (user) { user.lastSeen = new Date().toISOString(); await store.saveUser(user); }
  res.json({ ok: true });
}));

function formatLastSeen(iso) {
  if (!iso) return '';
  const d = new Date(iso); const now = new Date();
  const m = Math.floor((now - d) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return m + ' мин. назад';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' ч. назад';
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function findUser(users, username) { return users.find(u => u.username === username.trim().toLowerCase()); }

app.get('/api/feed', requireAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1; const limit = parseInt(req.query.limit) || 6;
  let posts = await store.readPosts(); const users = await store.readUsers();
  posts = posts.map(p => { const u = users.find(x => x.username === p.author); return { ...p, avatar: u?.avatar || '👤', avatarImage: u?.avatarImage || null, isFavorite: p.favorites?.includes(req.authUsername), isFollowing: u?.followers?.includes(req.authUsername) }; });
  if (req.query.random === 'true') posts.sort(() => 0.5 - Math.random()); else posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const sliced = posts.slice((page - 1) * limit, page * limit);
  res.json({ posts: sliced, hasMore: page * limit < posts.length });
}));

app.post('/api/posts/create', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body.text?.trim()) return res.status(400).json({ message: 'Текст поста не может быть пустым' });
  const posts = await store.readPosts();
  const p = { id: Date.now(), author: req.authUsername, text: req.body.text.trim(), image: req.body.image || null, timestamp: new Date().toISOString(), likes: [], favorites: [], comments: [], shares: 0, reposts: 0, originalAuthor: null, originalPostId: null };
  posts.push(p); await store.writePosts(posts);
  res.json({ message: 'Пост создан', post: p });
}));

app.post('/api/posts/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const posts = await store.readPosts(); const p = posts.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Пост не найден' });
  const i = p.likes.indexOf(req.authUsername); if (i > -1) p.likes.splice(i, 1); else p.likes.push(req.authUsername);
  await store.writePosts(posts); res.json({ likes: p.likes });
}));

app.post('/api/posts/:id/favorite', requireAuth, asyncHandler(async (req, res) => {
  const posts = await store.readPosts(); const p = posts.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Пост не найден' });
  p.favorites = p.favorites || []; const i = p.favorites.indexOf(req.authUsername);
  if (i > -1) p.favorites.splice(i, 1); else p.favorites.push(req.authUsername);
  await store.writePosts(posts); res.json({ favorites: p.favorites });
}));

app.post('/api/posts/:id/comment', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body.text?.trim()) return res.status(400).json({ message: 'Пустой комментарий' });
  const posts = await store.readPosts(); const p = posts.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Пост не найден' });
  p.comments = p.comments || []; p.comments.push({ id: Date.now(), author: req.authUsername, text: req.body.text.trim(), timestamp: new Date().toISOString() });
  await store.writePosts(posts); res.json({ comments: p.comments });
}));

app.post('/api/posts/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const posts = await store.readPosts(); const p = posts.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Пост не найден' });
  p.shares = (p.shares || 0) + 1; await store.writePosts(posts); res.json({ shares: p.shares });
}));

app.post('/api/posts/:id/repost', requireAuth, asyncHandler(async (req, res) => {
  const posts = await store.readPosts(); const p = posts.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Пост не найден' });
  p.reposts = (p.reposts || 0) + 1;
  const r = { id: Date.now(), author: req.authUsername, text: 'Репост от @' + p.author + ': ' + p.text, image: p.image, timestamp: new Date().toISOString(), likes: [], favorites: [], comments: [], shares: 0, reposts: 0, originalAuthor: p.author, originalPostId: p.id };
  posts.push(r); await store.writePosts(posts); res.json({ repost: r });
}));

app.delete('/api/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  const posts = await store.readPosts(); const i = posts.findIndex(x => x.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ message: 'Пост не найден' });
  if (posts[i].author !== req.authUsername) return res.status(403).json({ message: 'Вы не можете удалить чужой пост' });
  posts.splice(i, 1); await store.writePosts(posts); res.json({ message: 'Пост удален' });
}));

app.post('/api/users/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const users = await store.readUsers(); const target = users.find(u => u.username === req.params.username.trim().toLowerCase()); const me = users.find(u => u.username === req.authUsername);
  if (!target || !me) return res.status(404).json({ message: 'Пользователь не найден' });
  if (target.username === me.username) return res.status(400).json({ message: 'Нельзя подписаться на себя' });
  target.followers = target.followers || []; me.following = me.following || [];
  const i = target.followers.indexOf(me.username);
  if (i > -1) { target.followers.splice(i, 1); const fi = me.following.indexOf(target.username); if (fi > -1) me.following.splice(fi, 1); await store.writeUsers(users); return res.json({ message: 'Отписано', following: me.following.length, followers: target.followers.length }); }
  target.followers.push(me.username); me.following.push(target.username); await store.writeUsers(users);
  res.json({ message: 'Подписано', following: me.following.length, followers: target.followers.length });
}));

app.post('/api/users/:username/blacklist', requireAuth, asyncHandler(async (req, res) => {
  const users = await store.readUsers(); const target = users.find(u => u.username === req.params.username.trim().toLowerCase()); const me = users.find(u => u.username === req.authUsername);
  if (!target || !me) return res.status(404).json({ message: 'Пользователь не найден' });
  if (target.username === me.username) return res.status(400).json({ message: 'Нельзя добавить себя в чёрный список' });
  me.blacklist = me.blacklist || []; const i = me.blacklist.indexOf(target.username);
  if (i > -1) { me.blacklist.splice(i, 1); await store.saveUser(me); return res.json({ message: 'Пользователь удалён из чёрного списка', blacklisted: false }); }
  me.blacklist.push(target.username); if (me.following) { const fi = me.following.indexOf(target.username); if (fi > -1) me.following.splice(fi, 1); }
  if (target.followers) { const fi = target.followers.indexOf(me.username); if (fi > -1) target.followers.splice(fi, 1); }
  await store.saveUser(me); await store.saveUser(target);
  res.json({ message: 'Пользователь добавлен в чёрный список', blacklisted: true });
}));

app.get('/api/blacklist', requireAuth, asyncHandler(async (req, res) => {
  const me = await store.getUser(req.authUsername); if (!me) return res.json({ users: [] });
  const bl = me.blacklist || []; const users = await store.readUsers();
  res.json({ users: users.filter(u => bl.includes(u.username)).map(u => ({ username: u.username, avatar: u.avatar, avatarImage: u.avatarImage || null })) });
}));

app.get('/api/messages', requireAuth, asyncHandler(async (req, res) => {
  const u = req.authUsername; const messages = await store.readMessages(); const groups = await store.readGroups();
  const me = await store.getUser(u); const bl = me?.blacklist || [];
  const msgs = messages.filter(m => !m.groupId && (m.from === u || m.to === u));
  const g = {}; msgs.forEach(m => { const c = m.from === u ? m.to : m.from; if (!g[c]) g[c] = []; g[c].push(m); });
  const dc = Object.entries(g).filter(([n]) => !bl.includes(n)).map(([n, ms]) => ({ id: n, type: 'dm', name: n, displayName: '@' + n, lastMessage: ms[ms.length - 1]?.text, timestamp: ms[ms.length - 1]?.timestamp, unread: ms.some(x => x.to === u && !x.read) }));
  const gc = groups.filter(x => x.members?.includes(u)).map(x => { const msgs = messages.filter(m => m.groupId === x.id); const last = msgs[msgs.length - 1]; return { id: x.id, type: x.type, name: x.id, displayName: (x.type === 'channel' ? '📢 ' : '👥 ') + x.title, slug: x.slug, lastMessage: last?.text, timestamp: last?.timestamp, unread: msgs.some(m => m.to === 'group:' + x.id && m.from !== u && !m.read) }; });
  res.json({ contacts: [...dc, ...gc].sort((a, b) => (b.timestamp ? new Date(b.timestamp).getTime() : 0) - (a.timestamp ? new Date(a.timestamp).getTime() : 0)) });
}));

app.get('/api/chat/:username', requireAuth, asyncHandler(async (req, res) => {
  const other = req.params.username.trim().toLowerCase();
  const messages = await store.readMessages();
  const chat = messages.filter(m => !m.groupId && ((m.from === req.authUsername && m.to === other) || (m.from === other && m.to === req.authUsername))).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  chat.forEach(m => { if (m.to === req.authUsername && !m.read) m.read = true; }); await store.writeMessages(messages);
  res.json({ messages: chat, withUser: other, chatType: 'dm' });
}));

app.get('/api/chat/dm/:username', requireAuth, asyncHandler(async (req, res) => {
  const other = req.params.username.trim().toLowerCase();
  const messages = await store.readMessages();
  const chat = messages.filter(m => !m.groupId && ((m.from === req.authUsername && m.to === other) || (m.from === other && m.to === req.authUsername))).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  chat.forEach(m => { if (m.to === req.authUsername && !m.read) m.read = true; }); await store.writeMessages(messages);
  res.json({ messages: chat, withUser: other, chatType: 'dm' });
}));

app.get('/api/chat/group/:groupId', requireAuth, asyncHandler(async (req, res) => {
  const groups = await store.readGroups(); const g = groups.find(x => x.id === req.params.groupId);
  if (!g || !g.members?.includes(req.authUsername)) return res.status(404).json({ message: 'Группа не найдена' });
  const messages = await store.readMessages();
  const chat = messages.filter(m => m.groupId === g.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  chat.forEach(m => { if (m.to === 'group:' + g.id && m.from !== req.authUsername && !m.read) m.read = true; }); await store.writeMessages(messages);
  res.json({ messages: chat, group: g, chatType: 'group' });
}));

app.post('/api/messages/send', requireAuth, asyncHandler(async (req, res) => {
  const { to, groupId, text, media, mediaType, voice } = req.body;
  if (!text?.trim() && !media && !voice) return res.status(400).json({ message: 'Пустое сообщение' });
  const bodyText = String(text || '').trim(); const messages = await store.readMessages();
  if (groupId) {
    const groups = await store.readGroups(); const group = groups.find(x => x.id === groupId);
    if (!group || !group.members?.includes(req.authUsername)) return res.status(404).json({ message: 'Группа не найдена' });
    const m = { id: Date.now(), from: req.authUsername, to: 'group:' + group.id, groupId: group.id, text: bodyText || null, media: media || null, mediaType: mediaType || null, voice: voice || null, timestamp: new Date().toISOString(), read: false, reactions: {}, deleted: false };
    messages.push(m); await store.writeMessages(messages); return res.json({ message: 'Сообщение отправлено', msg: m });
  }
  if (!to) return res.status(400).json({ message: 'Укажите получателя' });
  const users = await store.readUsers(); const recipient = users.find(x => x.username === to.trim().toLowerCase());
  if (!recipient) return res.status(404).json({ message: 'Пользователь не найден' });
  if (recipient.blacklist?.includes(req.authUsername)) return res.status(403).json({ message: 'Вы в чёрном списке у этого пользователя' });
  const rule = recipient.settings?.privacy?.allowMessages || 'everyone';
  if (rule === 'nobody' || (rule === 'followers' && !recipient.followers?.includes(req.authUsername))) return res.status(403).json({ message: 'Этот пользователь не принимает сообщения' });
  const m = { id: Date.now(), from: req.authUsername, to: recipient.username, groupId: null, text: bodyText || null, media: media || null, mediaType: mediaType || null, voice: voice || null, timestamp: new Date().toISOString(), read: false, reactions: {}, deleted: false };
  messages.push(m); await store.writeMessages(messages);
  res.json({ message: 'Сообщение отправлено', msg: m });
}));

app.post('/api/messages/:id/react', requireAuth, asyncHandler(async (req, res) => {
  const { emoji } = req.body; if (!emoji) return res.status(400).json({ message: 'Укажите emoji' });
  const messages = await store.readMessages(); const msg = messages.find(m => m.id === parseInt(req.params.id));
  if (!msg) return res.status(404).json({ message: 'Сообщение не найдено' });
  if (msg.groupId) { const groups = await store.readGroups(); const g = groups.find(x => x.id === msg.groupId); if (!g || !g.members?.includes(req.authUsername)) return res.status(403).json({ message: 'Вы не участник этого чата' }); }
  else if (msg.from !== req.authUsername && msg.to !== req.authUsername) return res.status(403).json({ message: 'Это не ваше сообщение' });
  msg.reactions = msg.reactions || {}; const reactors = msg.reactions[emoji] || []; const i = reactors.indexOf(req.authUsername);
  if (i > -1) { reactors.splice(i, 1); if (reactors.length === 0) delete msg.reactions[emoji]; } else { reactors.push(req.authUsername); msg.reactions[emoji] = reactors; }
  await store.writeMessages(messages); res.json({ reactions: msg.reactions });
}));

app.delete('/api/messages/:id', requireAuth, asyncHandler(async (req, res) => {
  const messages = await store.readMessages(); const idx = messages.findIndex(m => m.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ message: 'Сообщение не найдено' });
  const msg = messages[idx];
  if (!msg.groupId) { if (!(msg.from === req.authUsername || msg.to === req.authUsername)) return res.status(403).json({ message: 'Вы не участник этого чата' }); }
  else { const groups = await store.readGroups(); const g = groups.find(x => x.id === msg.groupId); if (!g || !g.members?.includes(req.authUsername)) return res.status(403).json({ message: 'Вы не участник этой группы' }); }
  messages.splice(idx, 1); await store.writeMessages(messages); res.json({ message: 'Сообщение удалено' });
}));

app.delete('/api/chat/:username', requireAuth, asyncHandler(async (req, res) => {
  const u = req.params.username.trim().toLowerCase(); const messages = await store.readMessages();
  const filtered = messages.filter(m => m.groupId || !((m.from === req.authUsername && m.to === u) || (m.from === u && m.to === req.authUsername)));
  await store.writeMessages(filtered); res.json({ message: 'Переписка удалена' });
}));

app.get('/api/groups', requireAuth, asyncHandler(async (req, res) => {
  const groups = (await store.readGroups()).filter(g => g.members?.includes(req.authUsername)).map(g => ({ id: g.id, title: g.title, type: g.type, slug: g.slug, owner: g.owner, membersCount: g.members?.length || 0 }));
  res.json({ groups });
}));

app.post('/api/groups/create', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body.title?.trim()) return res.status(400).json({ message: 'Укажите название' });
  const groups = await store.readGroups();
  const ms = new Set([req.authUsername, ...(Array.isArray(req.body.members) ? req.body.members : [])].map(m => m.trim().toLowerCase()));
  const g = { id: 'g_' + Date.now(), type: req.body.type === 'channel' ? 'channel' : 'group', title: String(req.body.title).trim().slice(0, 80), slug: (req.body.slug || '').trim().toLowerCase() || null, owner: req.authUsername, admins: [req.authUsername], members: [...ms], createdAt: new Date().toISOString() };
  groups.push(g); await store.writeGroups(groups); res.json({ message: 'Создано', group: g });
}));

app.post('/api/groups/:id/join', requireAuth, asyncHandler(async (req, res) => {
  const groups = await store.readGroups(); const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ message: 'Не найдено' });
  if (g.type === 'channel') return res.status(400).json({ message: 'В канал можно только по приглашению' });
  if (!g.members?.includes(req.authUsername)) { g.members.push(req.authUsername); await store.writeGroups(groups); }
  res.json({ message: 'Вы в группе', group: g });
}));

app.post('/api/groups/:id/invite', requireAuth, asyncHandler(async (req, res) => {
  const groups = await store.readGroups(); const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ message: 'Не найдено' });
  if (g.owner !== req.authUsername && !g.admins?.includes(req.authUsername)) return res.status(403).json({ message: 'Нет прав' });
  const user = await store.getUser((req.body.username || '').trim().toLowerCase());
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  if (!g.members?.includes(user.username)) { g.members.push(user.username); await store.writeGroups(groups); }
  res.json({ message: 'Участник добавлен' });
}));

app.get('/api/profile', requireAuth, asyncHandler(async (req, res) => {
  const users = await store.readUsers(); const user = users.find(u => u.username === req.authUsername);
  const posts = (await store.readPosts()).filter(p => p.author === req.authUsername);
  res.json({ username: req.authUsername, avatar: user?.avatar || '👤', avatarImage: user?.avatarImage || null, bio: user?.bio || 'О себе ничего не рассказано', followers: user?.followers?.length || 0, following: user?.following?.length || 0, posts: posts.length, settings: user?.settings || DEFAULT_SETTINGS });
}));

app.post('/api/profile/avatar', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body.avatarImage?.startsWith('data:image/')) return res.status(400).json({ message: 'Некорректное изображение' });
  const user = await store.getUser(req.authUsername); if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  user.avatarImage = req.body.avatarImage; await store.saveUser(user);
  res.json({ message: 'Аватар обновлён', avatarImage: req.body.avatarImage });
}));

app.get('/api/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.authUsername);
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  res.json({ settings: user.settings, email: user.email || '' });
}));

app.put('/api/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.authUsername); if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const inc = req.body?.settings || req.body || {};
  user.settings = { ...DEFAULT_SETTINGS, ...user.settings, ...inc, notifications: { ...DEFAULT_SETTINGS.notifications, ...user.settings?.notifications, ...inc.notifications }, privacy: { ...DEFAULT_SETTINGS.privacy, ...user.settings?.privacy, ...inc.privacy } };
  await store.saveUser(user); res.json({ message: 'Настройки сохранены', settings: user.settings });
}));

app.patch('/api/profile', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.authUsername); if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  if (req.body.bio !== undefined) user.bio = String(req.body.bio).trim().slice(0, 200);
  await store.saveUser(user); res.json({ message: 'Профиль обновлён', bio: user.bio });
}));

app.post('/api/settings/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 5) return res.status(400).json({ message: 'Некорректный пароль' });
  const user = await store.getUser(req.authUsername); if (!user || user.password !== oldPassword) return res.status(400).json({ message: 'Неверный текущий пароль' });
  user.password = newPassword; await store.saveUser(user);
  res.json({ message: 'Пароль успешно изменён' });
}));

app.get('/api/users/lookup/:username', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.params.username?.trim().toLowerCase());
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const visible = user.settings?.privacy?.profileVisible !== false || req.authUsername === user.username;
  const postsCount = visible ? await store.countPostsByAuthor(user.username) : null;
  res.json({ username: user.username, avatar: user.avatar, avatarImage: user.avatarImage || null, bio: visible ? user.bio : 'Профиль скрыт', followers: visible ? user.followers?.length || 0 : null, following: visible ? user.following?.length || 0 : null, posts: postsCount, profileVisible: visible, isFollowing: user.followers?.includes(req.authUsername) || false });
}));

app.get('/api/users/search', requireAuth, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase(); const all = await store.readUsers();
  const filtered = all.filter(u => u.username !== req.authUsername && (!q || u.username.includes(q))).sort((a, b) => a.username.localeCompare(b.username)).slice(0, 30);
  res.json({ users: filtered.map(u => ({ username: u.username, avatar: u.avatar, avatarImage: u.avatarImage || null, bio: (u.settings?.privacy?.profileVisible !== false || req.authUsername === u.username) ? u.bio : 'Профиль скрыт', isFollowing: u.followers?.includes(req.authUsername) || false })) });
}));

app.get('/api/users/:username/profile', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.params.username?.trim().toLowerCase());
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const visible = user.settings?.privacy?.profileVisible !== false || req.authUsername === user.username;
  const postsCount = visible ? await store.countPostsByAuthor(user.username) : null;
  res.json({ username: user.username, avatar: user.avatar, avatarImage: user.avatarImage || null, bio: visible ? user.bio : 'Профиль скрыт', followers: visible ? user.followers?.length || 0 : null, following: visible ? user.following?.length || 0 : null, posts: postsCount, profileVisible: visible, isFollowing: user.followers?.includes(req.authUsername) || false });
}));

app.get('/api/stand/feed', requireAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1; const limit = parseInt(req.query.limit) || 5;
  let stands = await store.readStands();
  for (const s of stands) { const u = await store.getUser(s.author); if (u) { s.avatar = u.avatar || '👤'; s.isLiked = s.likes?.includes(req.authUsername); s.isFavorite = s.favorites?.includes(req.authUsername); s.isFollowing = u.followers?.includes(req.authUsername); } }
  stands.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ stands: stands.slice((page - 1) * limit, page * limit), hasMore: page * limit < stands.length });
}));

app.post('/api/stand/create', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body.video) return res.status(400).json({ message: 'Загрузите видео' });
  const stands = await store.readStands();
  const s = { id: Date.now(), author: req.authUsername, video: req.body.video, caption: String(req.body.caption || '').trim().slice(0, 300), timestamp: new Date().toISOString(), likes: [], favorites: [], comments: [], shares: 0, reposts: 0 };
  stands.push(s); await store.writeStands(stands);
  res.json({ message: 'Видео опубликовано в Stand', stand: s });
}));

async function standAct(id, fn) { const ss = await store.readStands(); const s = ss.find(x => x.id === parseInt(id)); if (!s) return null; fn(s); await store.writeStands(ss); return s; }

app.post('/api/stand/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const s = await standAct(req.params.id, x => { x.likes = x.likes || []; const i = x.likes.indexOf(req.authUsername); if (i > -1) x.likes.splice(i, 1); else x.likes.push(req.authUsername); });
  if (!s) return res.status(404).json({ message: 'Не найдено' }); res.json({ likes: s.likes });
}));

app.post('/api/stand/:id/favorite', requireAuth, asyncHandler(async (req, res) => {
  const s = await standAct(req.params.id, x => { x.favorites = x.favorites || []; const i = x.favorites.indexOf(req.authUsername); if (i > -1) x.favorites.splice(i, 1); else x.favorites.push(req.authUsername); });
  if (!s) return res.status(404).json({ message: 'Не найдено' }); res.json({ favorites: s.favorites });
}));

app.post('/api/stand/:id/comment', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body.text?.trim()) return res.status(400).json({ message: 'Пустой комментарий' });
  const s = await standAct(req.params.id, x => { x.comments = x.comments || []; x.comments.push({ id: Date.now(), author: req.authUsername, text: req.body.text.trim(), timestamp: new Date().toISOString() }); });
  if (!s) return res.status(404).json({ message: 'Не найдено' }); res.json({ comments: s.comments });
}));

app.post('/api/stand/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const s = await standAct(req.params.id, x => { x.shares = (x.shares || 0) + 1; });
  if (!s) return res.status(404).json({ message: 'Не найдено' }); res.json({ shares: s.shares });
}));

app.post('/api/stand/:id/repost', requireAuth, asyncHandler(async (req, res) => {
  const stands = await store.readStands(); const orig = stands.find(x => x.id === parseInt(req.params.id));
  if (!orig) return res.status(404).json({ message: 'Не найдено' });
  orig.reposts = (orig.reposts || 0) + 1;
  const r = { id: Date.now(), author: req.authUsername, video: orig.video, caption: 'Repost @' + orig.author + ': ' + (orig.caption || ''), timestamp: new Date().toISOString(), likes: [], favorites: [], comments: [], shares: 0, reposts: 0, originalAuthor: orig.author, originalStandId: orig.id };
  stands.push(r); await store.writeStands(stands); res.json({ repost: r });
}));

app.delete('/api/stand/:id', requireAuth, asyncHandler(async (req, res) => {
  const stands = await store.readStands(); const i = stands.findIndex(x => x.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ message: 'Не найдено' });
  if (stands[i].author !== req.authUsername) return res.status(403).json({ message: 'Можно удалить только своё видео' });
  stands.splice(i, 1); await store.writeStands(stands); res.json({ message: 'Удалено' });
}));

app.get('/api/account/stats', requireAuth, asyncHandler(async (req, res) => {
  const u = req.authUsername; const msgs = (await store.readMessages()).filter(m => m.from === u || m.to === u); const posts = (await store.readPosts()).filter(p => p.author === u);
  res.json({ messagesCount: msgs.length, postsCount: posts.length });
}));

app.get('/api/__debug', asyncHandler(async (req, res) => {
  const mode = process.env.DATABASE_URL ? 'postgres' : 'json';
  try { const counts = { users: (await store.readUsers()).length, posts: (await store.readPosts()).length, messages: (await store.readMessages()).length, stands: (await store.readStands()).length, groups: (await store.readGroups()).length }; res.json({ mode, counts, hasDbUrl: !!process.env.DATABASE_URL }); }
  catch (e) { res.json({ mode, error: e.message }); }
}));

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

async function start() {
  const info = await store.init();
  console.log('=== DIO START === storage:', info.mode);
  const server_http = http.createServer(app);
  const wss = new WebSocket.Server({ server: server_http });
  const wsClients = new Map();
  wss.on('connection', (ws) => {
    let username = null;
    ws.on('message', (data) => {
      try { const msg = JSON.parse(data); if (msg.type === 'auth' && msg.username) { username = msg.username; if (!wsClients.has(username)) wsClients.set(username, new Set()); wsClients.get(username).add(ws); ws.send(JSON.stringify({ type: 'auth_ok' })); } } catch (e) {}
    });
    ws.on('close', () => { if (username && wsClients.has(username)) { wsClients.get(username).delete(ws); if (wsClients.get(username).size === 0) wsClients.delete(username); } });
  });
  app.set('ws_send', (targetUser, data) => {
    const clients = wsClients.get(targetUser);
    if (clients) { const p = JSON.stringify(data); clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(p); }); }
  });
  server_http.listen(PORT, () => { console.log('Server started on port', PORT); });
}

start().catch(err => { console.error('Failed to start:', err); });