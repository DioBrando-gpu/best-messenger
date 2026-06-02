const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);
const USERNAME_REGEX = /^[a-z0-9_]{5,32}$/;

const DEFAULT_SETTINGS = {
  notifications: {
    enabled: true,
    sound: true,
    messagePreview: true,
    posts: true
  },
  privacy: {
    profileVisible: true,
    allowMessages: 'everyone',
    showLastSeen: true
  },
  language: 'ru',
  theme: 'dark'
};
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const POSTS_FILE = path.join(__dirname, 'data', 'posts.json');
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const VOICE_MESSAGES_FILE = path.join(__dirname, 'data', 'voice_messages.json');
const STORIES_FILE = path.join(__dirname, 'data', 'stories.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'groups.json');
const STANDS_FILE = path.join(__dirname, 'data', 'stands.json');
const GROUP_SLUG_REGEX = /^[a-z0-9_]{5,32}$/;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

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
if (!fs.existsSync(VOICE_MESSAGES_FILE)) {
  fs.writeFileSync(VOICE_MESSAGES_FILE, '[]', 'utf8');
}
if (!fs.existsSync(STORIES_FILE)) {
  fs.writeFileSync(STORIES_FILE, '[]', 'utf8');
}
if (!fs.existsSync(GROUPS_FILE)) {
  fs.writeFileSync(GROUPS_FILE, '[]', 'utf8');
}
if (!fs.existsSync(STANDS_FILE)) {
  fs.writeFileSync(STANDS_FILE, '[]', 'utf8');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
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
  const users = readJSON(USERS_FILE).map(migrateUser);
  return users;
}

function writeUsers(users) {
  writeJSON(USERS_FILE, users.map(migrateUser));
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

function readVoiceMessages() {
  return readJSON(VOICE_MESSAGES_FILE);
}

function writeVoiceMessages(messages) {
  writeJSON(VOICE_MESSAGES_FILE, messages);
}

function readStories() {
  return readJSON(STORIES_FILE);
}

function writeStories(stories) {
  writeJSON(STORIES_FILE, stories);
}

function readGroups() {
  return readJSON(GROUPS_FILE);
}

function writeGroups(groups) {
  writeJSON(GROUPS_FILE, groups);
}

function readStands() {
  return readJSON(STANDS_FILE);
}

function writeStands(stands) {
  writeJSON(STANDS_FILE, stands);
}

function findGroupById(groups, id) {
  return groups.find(g => g.id === id);
}

function isGroupMember(group, username) {
  return group.members?.includes(username);
}

function canPostInGroup(username, group) {
  if (!isGroupMember(group, username)) return false;
  if (group.type === 'channel') {
    return group.owner === username || group.admins?.includes(username);
  }
  return true;
}

function enrichStand(stand, viewer) {
  const users = readUsers();
  const user = users.find(u => u.username === stand.author);
  return {
    ...stand,
    avatar: user?.avatar || '👤',
    isFavorite: stand.favorites?.includes(viewer),
    isLiked: stand.likes?.includes(viewer),
    isFollowing: user?.followers?.includes(viewer)
  };
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!USERNAME_REGEX.test(username)) {
    return {
      valid: false,
      username,
      message: 'Username: только a-z, 0-9 и _, минимум 5 символов'
    };
  }
  return { valid: true, username };
}

function defaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function migrateUser(user) {
  if (!user.settings) {
    user.settings = defaultSettings();
  } else {
    user.settings = { ...defaultSettings(), ...user.settings };
    user.settings.notifications = { ...defaultSettings().notifications, ...user.settings.notifications };
    user.settings.privacy = { ...defaultSettings().privacy, ...user.settings.privacy };
  }
  user.username = normalizeUsername(user.username);
  return user;
}

function findUserByUsername(users, username) {
  const normalized = normalizeUsername(username);
  return users.find(user => user.username === normalized);
}

function isUsernameTaken(users, username, exceptUsername) {
  const normalized = normalizeUsername(username);
  return users.some(user => user.username === normalized && user.username !== exceptUsername);
}

function canViewProfile(viewerUsername, targetUser) {
  if (!targetUser.settings?.privacy?.profileVisible) {
    return viewerUsername === targetUser.username;
  }
  return true;
}

function canMessageUser(viewerUsername, targetUser) {
  if (viewerUsername === targetUser.username) return false;
  const rule = targetUser.settings?.privacy?.allowMessages || 'everyone';
  if (rule === 'nobody') return false;
  if (rule === 'everyone') return true;
  if (rule === 'followers') {
    return targetUser.followers?.includes(viewerUsername);
  }
  return true;
}

function publicUserPayload(user, viewerUsername) {
  const visible = canViewProfile(viewerUsername, user);
  return {
    username: user.username,
    avatar: user.avatar,
    bio: visible ? user.bio : 'Профиль скрыт',
    followers: visible ? user.followers?.length || 0 : null,
    following: visible ? user.following?.length || 0 : null,
    posts: visible ? readPosts().filter(p => p.author === user.username).length : null,
    profileVisible: visible,
    canMessage: canMessageUser(viewerUsername, user),
    isFollowing: user.followers?.includes(viewerUsername) || false
  };
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Введите username и пароль' });
  }

  const validation = validateUsername(username);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.message });
  }

  const users = readUsers();
  if (isUsernameTaken(users, validation.username)) {
    return res.status(409).json({ message: 'Этот @username уже занят' });
  }

  const avatars = ['😎', '🤖', '👨‍💻', '🎨', '🏃', '🧠', '⚡', '🚀', '🌟', '💎'];
  const newUser = migrateUser({
    username: validation.username,
    password,
    avatar: avatars[Math.floor(Math.random() * avatars.length)],
    bio: 'Новый пользователь DIO',
    followers: [],
    following: [],
    createdAt: new Date().toISOString()
  });

  users.push(newUser);
  writeUsers(users);
  req.session.username = newUser.username;
  res.json({ message: 'Регистрация прошла успешно', username: newUser.username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Введите username и пароль' });
  }

  const users = readUsers();
  const user = findUserByUsername(users, username);
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Неверный username или пароль' });
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
  const user = findUserByUsername(readUsers(), req.session.username);
  res.json({
    loggedIn: true,
    username: req.session.username,
    settings: user?.settings || defaultSettings()
  });
});

app.get('/api/feed', requireAuth, (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 6;
  const random = req.query.random === 'true';
  const posts = readPosts();
  const users = readUsers();
  const enrichedPosts = posts.map(post => {
    const user = users.find(u => u.username === post.author);
    return {
      ...post,
      avatar: user?.avatar || '👤',
      isFavorite: post.favorites?.includes(req.session.username),
      isFollowing: user?.followers?.includes(req.session.username)
    };
  });

  const sortedPosts = random
    ? enrichedPosts.sort(() => 0.5 - Math.random())
    : enrichedPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const pagedPosts = sortedPosts.slice((page - 1) * limit, page * limit);
  const hasMore = page * limit < sortedPosts.length;
  res.json({ posts: pagedPosts, hasMore });
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
    favorites: [],
    comments: [],
    shares: 0,
    reposts: 0,
    originalAuthor: null,
    originalPostId: null
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

app.post('/api/posts/:id/favorite', requireAuth, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  post.favorites = post.favorites || [];
  const idx = post.favorites.indexOf(req.session.username);
  if (idx > -1) {
    post.favorites.splice(idx, 1);
  } else {
    post.favorites.push(req.session.username);
  }
  writePosts(posts);
  res.json({ message: 'Избранное обновлено', favorites: post.favorites });
});

app.post('/api/posts/:id/comment', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ message: 'Комментарий не может быть пустым' });
  }

  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  post.comments = post.comments || [];
  post.comments.push({
    id: Date.now(),
    author: req.session.username,
    text: text.trim(),
    timestamp: new Date().toISOString()
  });
  writePosts(posts);
  res.json({ message: 'Комментарий добавлен', comments: post.comments });
});

app.post('/api/posts/:id/share', requireAuth, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  post.shares = (post.shares || 0) + 1;
  writePosts(posts);
  res.json({ message: 'Пост поделился', shares: post.shares });
});

app.post('/api/posts/:id/repost', requireAuth, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  const allPosts = readPosts();
  post.reposts = (post.reposts || 0) + 1;
  const repost = {
    id: Date.now(),
    author: req.session.username,
    text: `Репост от @${post.author}: ${post.text}`,
    image: post.image,
    timestamp: new Date().toISOString(),
    likes: [],
    favorites: [],
    comments: [],
    shares: 0,
    reposts: 0,
    originalAuthor: post.author,
    originalPostId: post.id
  };
  allPosts.push(repost);
  writePosts(allPosts);
  writePosts(posts);
  res.json({ message: 'Репост создан', repost });
});

app.post('/api/users/:username/follow', requireAuth, (req, res) => {
  const users = readUsers();
  const target = findUserByUsername(users, req.params.username);
  const me = findUserByUsername(users, req.session.username);
  if (!target || !me) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  if (target.username === me.username) {
    return res.status(400).json({ message: 'Нельзя подписаться на себя' });
  }

  target.followers = target.followers || [];
  me.following = me.following || [];
  const idx = target.followers.indexOf(me.username);
  if (idx > -1) {
    target.followers.splice(idx, 1);
    const followIdx = me.following.indexOf(target.username);
    if (followIdx > -1) me.following.splice(followIdx, 1);
    writeUsers(users);
    return res.json({ message: 'Отписано', following: me.following.length, followers: target.followers.length });
  }

  target.followers.push(me.username);
  me.following.push(target.username);
  writeUsers(users);
  res.json({ message: 'Подписано', following: me.following.length, followers: target.followers.length });
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

function getDmContacts(username, messages) {
  const userMessages = messages.filter(m =>
    !m.groupId &&
    (m.from === username || m.to === username)
  );
  const grouped = {};
  userMessages.forEach(msg => {
    const contact = msg.from === username ? msg.to : msg.from;
    if (!grouped[contact]) grouped[contact] = [];
    grouped[contact].push(msg);
  });
  return Object.entries(grouped).map(([name, msgs]) => ({
    id: name,
    type: 'dm',
    name,
    displayName: `@${name}`,
    lastMessage: msgs[msgs.length - 1]?.text,
    timestamp: msgs[msgs.length - 1]?.timestamp,
    unread: msgs.some(m => m.to === username && !m.read)
  }));
}

app.get('/api/messages', requireAuth, (req, res) => {
  const username = req.session.username;
  const messages = readMessages();
  const groups = readGroups();
  const dmContacts = getDmContacts(username, messages);

  const groupContacts = groups
    .filter(g => isGroupMember(g, username))
    .map(g => {
      const msgs = messages.filter(m => m.groupId === g.id);
      const last = msgs[msgs.length - 1];
      return {
        id: g.id,
        type: g.type,
        name: g.id,
        displayName: g.type === 'channel' ? `📢 ${g.title}` : `👥 ${g.title}`,
        slug: g.slug,
        lastMessage: last?.text,
        timestamp: last?.timestamp,
        unread: msgs.some(m => m.to === `group:${g.id}` && m.from !== username && !m.read)
      };
    })
    ;

  const contacts = [...dmContacts, ...groupContacts].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  res.json({ contacts });
});

app.get('/api/chat/dm/:username', requireAuth, (req, res) => {
  const otherUser = normalizeUsername(req.params.username);
  const users = readUsers();
  if (!findUserByUsername(users, otherUser)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const messages = readMessages();
  const chat = messages.filter(m =>
    !m.groupId &&
    ((m.from === req.session.username && m.to === otherUser) ||
      (m.from === otherUser && m.to === req.session.username))
  ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  chat.forEach(msg => {
    if (msg.to === req.session.username && !msg.read) msg.read = true;
  });
  writeMessages(messages);

  res.json({ messages: chat, withUser: otherUser, chatType: 'dm' });
});

app.get('/api/chat/:username', requireAuth, (req, res) => {
  const otherUser = normalizeUsername(req.params.username);
  const users = readUsers();
  if (!findUserByUsername(users, otherUser)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  const messages = readMessages();
  const chat = messages.filter(m =>
    !m.groupId &&
    ((m.from === req.session.username && m.to === otherUser) ||
      (m.from === otherUser && m.to === req.session.username))
  ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  chat.forEach(msg => {
    if (msg.to === req.session.username && !msg.read) msg.read = true;
  });
  writeMessages(messages);
  res.json({ messages: chat, withUser: otherUser, chatType: 'dm' });
});

app.get('/api/chat/group/:groupId', requireAuth, (req, res) => {
  const group = findGroupById(readGroups(), req.params.groupId);
  if (!group || !isGroupMember(group, req.session.username)) {
    return res.status(404).json({ message: 'Группа не найдена' });
  }

  const messages = readMessages();
  const chat = messages
    .filter(m => m.groupId === group.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  chat.forEach(msg => {
    if (msg.to === `group:${group.id}` && msg.from !== req.session.username && !msg.read) {
      msg.read = true;
    }
  });
  writeMessages(messages);

  res.json({ messages: chat, group, chatType: 'group' });
});

app.post('/api/messages/send', requireAuth, (req, res) => {
  const { to, groupId, text } = req.body;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: 'Введите текст сообщения' });
  }

  const messages = readMessages();

  if (groupId) {
    const group = findGroupById(readGroups(), groupId);
    if (!group || !isGroupMember(group, req.session.username)) {
      return res.status(404).json({ message: 'Группа не найдена' });
    }
    if (!canPostInGroup(req.session.username, group)) {
      return res.status(403).json({ message: 'В канале писать могут только администраторы' });
    }
    const newMessage = {
      id: Date.now(),
      from: req.session.username,
      to: `group:${group.id}`,
      groupId: group.id,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      read: false
    };
    messages.push(newMessage);
    writeMessages(messages);
    return res.json({ message: 'Сообщение отправлено', msg: newMessage });
  }

  if (!to) {
    return res.status(400).json({ message: 'Укажите получателя' });
  }

  const users = readUsers();
  const recipient = findUserByUsername(users, to);
  if (!recipient) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  if (!canMessageUser(req.session.username, recipient)) {
    return res.status(403).json({ message: 'Этот пользователь не принимает сообщения' });
  }

  const newMessage = {
    id: Date.now(),
    from: req.session.username,
    to: recipient.username,
    groupId: null,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    read: false
  };

  messages.push(newMessage);
  writeMessages(messages);
  res.json({ message: 'Сообщение отправлено', msg: newMessage });
});

app.get('/api/groups', requireAuth, (req, res) => {
  const groups = readGroups()
    .filter(g => isGroupMember(g, req.session.username))
    .map(g => ({
      id: g.id,
      title: g.title,
      type: g.type,
      slug: g.slug,
      owner: g.owner,
      membersCount: g.members?.length || 0
    }));
  res.json({ groups });
});

app.post('/api/groups/create', requireAuth, (req, res) => {
  const { title, type, slug, members } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ message: 'Укажите название' });
  }
  const groupType = type === 'channel' ? 'channel' : 'group';
  let groupSlug = null;
  if (slug) {
    groupSlug = normalizeUsername(slug);
    if (!GROUP_SLUG_REGEX.test(groupSlug)) {
      return res.status(400).json({ message: 'Slug: a-z, 0-9, _, минимум 5 символов' });
    }
    if (readGroups().some(g => g.slug === groupSlug)) {
      return res.status(409).json({ message: 'Такой slug уже занят' });
    }
  }

  const groups = readGroups();
  const id = `g_${Date.now()}`;
  const owner = req.session.username;
  const memberSet = new Set([owner, ...(Array.isArray(members) ? members : [])].map(normalizeUsername));
  const newGroup = {
    id,
    type: groupType,
    title: String(title).trim().slice(0, 80),
    slug: groupSlug,
    owner,
    admins: [owner],
    members: [...memberSet],
    createdAt: new Date().toISOString()
  };
  groups.push(newGroup);
  writeGroups(groups);
  res.json({ message: 'Создано', group: newGroup });
});

app.post('/api/groups/:id/join', requireAuth, (req, res) => {
  const groups = readGroups();
  const group = findGroupById(groups, req.params.id);
  if (!group) return res.status(404).json({ message: 'Не найдено' });
  if (group.type === 'channel') {
    return res.status(400).json({ message: 'В канал можно только по приглашению' });
  }
  if (!isGroupMember(group, req.session.username)) {
    group.members.push(req.session.username);
    writeGroups(groups);
  }
  res.json({ message: 'Вы в группе', group });
});

app.post('/api/groups/:id/invite', requireAuth, (req, res) => {
  const { username } = req.body;
  const groups = readGroups();
  const group = findGroupById(groups, req.params.id);
  if (!group) return res.status(404).json({ message: 'Не найдено' });
  if (group.owner !== req.session.username && !group.admins?.includes(req.session.username)) {
    return res.status(403).json({ message: 'Нет прав' });
  }
  const user = findUserByUsername(readUsers(), username);
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  if (!isGroupMember(group, user.username)) {
    group.members.push(user.username);
    writeGroups(groups);
  }
  res.json({ message: 'Участник добавлен' });
});

app.get('/api/profile', requireAuth, (req, res) => {
  const users = readUsers();
  const user = findUserByUsername(users, req.session.username);
  const posts = readPosts().filter(p => p.author === req.session.username);

  res.json({
    username: req.session.username,
    avatar: user?.avatar || '👤',
    bio: user?.bio || 'О себе ничего не рассказано',
    followers: user?.followers?.length || 0,
    following: user?.following?.length || 0,
    posts: posts.length,
    settings: user?.settings || defaultSettings()
  });
});

app.get('/api/settings', requireAuth, (req, res) => {
  const user = findUserByUsername(readUsers(), req.session.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json({ settings: user.settings });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const users = readUsers();
  const user = findUserByUsername(users, req.session.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const incoming = req.body?.settings || req.body || {};
  user.settings = {
    ...defaultSettings(),
    ...user.settings,
    ...incoming,
    notifications: { ...defaultSettings().notifications, ...user.settings.notifications, ...incoming.notifications },
    privacy: { ...defaultSettings().privacy, ...user.settings.privacy, ...incoming.privacy }
  };
  writeUsers(users);
  res.json({ message: 'Настройки сохранены', settings: user.settings });
});

app.patch('/api/profile', requireAuth, (req, res) => {
  const users = readUsers();
  const user = findUserByUsername(users, req.session.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  if (req.body.bio !== undefined) {
    user.bio = String(req.body.bio).trim().slice(0, 200);
  }

  if (req.body.username !== undefined) {
    const validation = validateUsername(req.body.username);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }
    if (isUsernameTaken(users, validation.username, user.username)) {
      return res.status(409).json({ message: 'Этот @username уже занят' });
    }
    const oldUsername = user.username;
    if (oldUsername !== validation.username) {
      const posts = readPosts();
      posts.forEach(post => {
        if (post.author === oldUsername) post.author = validation.username;
        if (post.originalAuthor === oldUsername) post.originalAuthor = validation.username;
        post.likes = (post.likes || []).map(name => name === oldUsername ? validation.username : name);
        post.favorites = (post.favorites || []).map(name => name === oldUsername ? validation.username : name);
        post.comments = (post.comments || []).map(comment => (
          comment.author === oldUsername ? { ...comment, author: validation.username } : comment
        ));
      });
      writePosts(posts);

      const messages = readMessages();
      messages.forEach(msg => {
        if (msg.from === oldUsername) msg.from = validation.username;
        if (msg.to === oldUsername) msg.to = validation.username;
      });
      writeMessages(messages);

      users.forEach(u => {
        u.followers = (u.followers || []).map(name => name === oldUsername ? validation.username : name);
        u.following = (u.following || []).map(name => name === oldUsername ? validation.username : name);
      });

      req.session.username = validation.username;
      user.username = validation.username;
    }
  }

  writeUsers(users);
  res.json({
    message: 'Профиль обновлён',
    username: user.username,
    bio: user.bio
  });
});

app.get('/api/account/stats', requireAuth, (req, res) => {
  const username = req.session.username;
  const messages = readMessages().filter(m => m.from === username || m.to === username);
  const posts = readPosts().filter(p => p.author === username);
  res.json({
    messagesCount: messages.length,
    postsCount: posts.length,
    cacheHint: 'Клиентские настройки темы и языка хранятся в браузере и на сервере'
  });
});

app.post('/api/account/clear-cache', requireAuth, (req, res) => {
  res.json({ message: 'Серверный кэш не используется. Очистите данные в браузере через раздел «Данные и память».' });
});

app.get('/api/users/lookup/:username', requireAuth, (req, res) => {
  const user = findUserByUsername(readUsers(), req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json(publicUserPayload(user, req.session.username));
});

app.get('/api/users/search', requireAuth, (req, res) => {
  const query = normalizeUsername(req.query.q || '');
  const users = readUsers().filter(u => {
    if (u.username === req.session.username) return false;
    if (!query) return true;
    return u.username.includes(query) || u.username === query;
  });

  const sorted = users.sort((a, b) => {
    const aExact = a.username === query ? 0 : 1;
    const bExact = b.username === query ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.username.localeCompare(b.username);
  });

  res.json({
    users: sorted
      .filter(u => query.length >= 1 || canViewProfile(req.session.username, u))
      .slice(0, 30)
      .map(u => publicUserPayload(u, req.session.username))
  });
});

app.get('/api/stand/feed', requireAuth, (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 5;
  const stands = readStands()
    .map(s => enrichStand(s, req.session.username))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const slice = stands.slice((page - 1) * limit, page * limit);
  res.json({ stands: slice, hasMore: page * limit < stands.length });
});

app.post('/api/stand/create', requireAuth, (req, res) => {
  const { video, caption } = req.body;
  if (!video) {
    return res.status(400).json({ message: 'Загрузите видео' });
  }
  if (video.length > MAX_VIDEO_BYTES) {
    return res.status(400).json({ message: 'Видео слишком большое (макс. ~25 МБ)' });
  }
  const stands = readStands();
  const newStand = {
    id: Date.now(),
    author: req.session.username,
    video,
    caption: String(caption || '').trim().slice(0, 300),
    timestamp: new Date().toISOString(),
    likes: [],
    favorites: [],
    comments: [],
    shares: 0,
    reposts: 0
  };
  stands.push(newStand);
  writeStands(stands);
  res.json({ message: 'Видео опубликовано в Stand', stand: newStand });
});

function standAction(standId, updater) {
  const stands = readStands();
  const stand = stands.find(s => s.id === parseInt(standId, 10));
  if (!stand) return null;
  updater(stand);
  writeStands(stands);
  return stand;
}

app.post('/api/stand/:id/like', requireAuth, (req, res) => {
  const stand = standAction(req.params.id, (s) => {
    s.likes = s.likes || [];
    const i = s.likes.indexOf(req.session.username);
    if (i > -1) s.likes.splice(i, 1);
    else s.likes.push(req.session.username);
  });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ likes: stand.likes });
});

app.post('/api/stand/:id/favorite', requireAuth, (req, res) => {
  const stand = standAction(req.params.id, (s) => {
    s.favorites = s.favorites || [];
    const i = s.favorites.indexOf(req.session.username);
    if (i > -1) s.favorites.splice(i, 1);
    else s.favorites.push(req.session.username);
  });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ favorites: stand.favorites });
});

app.post('/api/stand/:id/comment', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Пустой комментарий' });
  const stand = standAction(req.params.id, (s) => {
    s.comments = s.comments || [];
    s.comments.push({
      id: Date.now(),
      author: req.session.username,
      text: text.trim(),
      timestamp: new Date().toISOString()
    });
  });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ comments: stand.comments });
});

app.post('/api/stand/:id/share', requireAuth, (req, res) => {
  const stand = standAction(req.params.id, (s) => { s.shares = (s.shares || 0) + 1; });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ shares: stand.shares });
});

app.post('/api/stand/:id/repost', requireAuth, (req, res) => {
  const stands = readStands();
  const original = stands.find(s => s.id === parseInt(req.params.id, 10));
  if (!original) return res.status(404).json({ message: 'Не найдено' });
  original.reposts = (original.reposts || 0) + 1;
  const repost = {
    id: Date.now(),
    author: req.session.username,
    video: original.video,
    caption: `Repost @${original.author}: ${original.caption || ''}`,
    timestamp: new Date().toISOString(),
    likes: [],
    favorites: [],
    comments: [],
    shares: 0,
    reposts: 0,
    originalAuthor: original.author,
    originalStandId: original.id
  };
  stands.push(repost);
  writeStands(stands);
  res.json({ message: 'Репост в Stand', repost });
});

app.delete('/api/stand/:id', requireAuth, (req, res) => {
  const stands = readStands();
  const idx = stands.findIndex(s => s.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ message: 'Не найдено' });
  if (stands[idx].author !== req.session.username) {
    return res.status(403).json({ message: 'Можно удалить только своё видео' });
  }
  stands.splice(idx, 1);
  writeStands(stands);
  res.json({ message: 'Удалено' });
});

app.get('/api/users/:username/profile', requireAuth, (req, res) => {
  const users = readUsers();
  const user = findUserByUsername(users, req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json(publicUserPayload(user, req.session.username));
});

app.get('/api/user/:username', requireAuth, (req, res) => {
  const users = readUsers();
  const user = findUserByUsername(users, req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json(publicUserPayload(user, req.session.username));
});

app.post('/api/voice/send', requireAuth, (req, res) => {
  const { to, audioData } = req.body;
  if (!to || !audioData) {
    return res.status(400).json({ message: 'Укажите получателя и аудио' });
  }

  const users = readUsers();
  if (!users.find(u => u.username === to)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const voiceMessages = readVoiceMessages();
  const newVoiceMsg = {
    id: Date.now(),
    from: req.session.username,
    to: to,
    audioData: audioData,
    timestamp: new Date().toISOString(),
    read: false
  };

  voiceMessages.push(newVoiceMsg);
  writeVoiceMessages(voiceMessages);
  res.json({ message: 'Голосовое сообщение отправлено', msg: newVoiceMsg });
});

app.post('/api/stories/create', requireAuth, (req, res) => {
  const { media, duration } = req.body;
  if (!media) {
    return res.status(400).json({ message: 'Укажите контент истории' });
  }

  const stories = readStories();
  const newStory = {
    id: Date.now(),
    author: req.session.username,
    media: media,
    duration: duration || 10,
    timestamp: new Date().toISOString(),
    views: []
  };

  stories.push(newStory);
  writeStories(stories);
  res.json({ message: 'История создана', story: newStory });
});

app.get('/api/stories/feed', requireAuth, (req, res) => {
  const stories = readStories();
  const users = readUsers();
  const currentUser = users.find(u => u.username === req.session.username);
  
  const enrichedStories = stories
    .filter(s => currentUser?.following?.includes(s.author) || s.author === req.session.username)
    .map(s => {
      const user = users.find(u => u.username === s.author);
      return {
        ...s,
        avatar: user?.avatar || '👤'
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({ stories: enrichedStories });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function migrateUsersFile() {
  const raw = readJSON(USERS_FILE);
  if (!Array.isArray(raw) || raw.length === 0) return;
  const migrated = raw.map(migrateUser);
  writeJSON(USERS_FILE, migrated);
}

migrateUsersFile();

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
