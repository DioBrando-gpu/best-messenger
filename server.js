const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const store = require('./lib/store');

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
const GROUP_SLUG_REGEX = /^[a-z0-9_]{5,32}$/;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error(err);
      res.status(500).json({ message: err.message || 'Ошибка сервера' });
    });
  };
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

async function readUsers() {
  return (await store.readUsers()).map(migrateUser);
}

async function writeUsers(users) {
  await store.writeUsers(users.map(migrateUser));
}

async function readPosts() {
  return store.readPosts();
}

async function writePosts(posts) {
  await store.writePosts(posts);
}

async function readMessages() {
  return store.readMessages();
}

async function writeMessages(messages) {
  await store.writeMessages(messages);
}

async function readStories() {
  return store.readStories();
}

async function writeStories(stories) {
  await store.writeStories(stories);
}

async function readGroups() {
  return store.readGroups();
}

async function writeGroups(groups) {
  await store.writeGroups(groups);
}

async function readStands() {
  return store.readStands();
}

async function writeStands(stands) {
  await store.writeStands(stands);
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

async function enrichStand(stand, viewer) {
  const user = await store.getUser(stand.author);
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

async function publicUserPayload(user, viewerUsername) {
  const visible = canViewProfile(viewerUsername, user);
  const postsCount = visible ? await store.countPostsByAuthor(user.username) : null;
  return {
    username: user.username,
    avatar: user.avatar,
    bio: visible ? user.bio : 'Профиль скрыт',
    followers: visible ? user.followers?.length || 0 : null,
    following: visible ? user.following?.length || 0 : null,
    posts: postsCount,
    profileVisible: visible,
    canMessage: canMessageUser(viewerUsername, user),
    isFollowing: user.followers?.includes(viewerUsername) || false
  };
}

app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Введите username и пароль' });
  }

  const validation = validateUsername(username);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.message });
  }

  const users = await readUsers();
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
  await writeUsers(users);
  req.session.username = newUser.username;
  res.json({ message: 'Регистрация прошла успешно', username: newUser.username });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Введите username и пароль' });
  }

  const users = await readUsers();
  const user = findUserByUsername(users, username);
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Неверный username или пароль' });
  }

  req.session.username = user.username;
  res.json({ message: 'Вход выполнен', username: user.username });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Вы вышли из системы' });
  });
});

app.get('/api/user', asyncHandler(async (req, res) => {
  if (!req.session || !req.session.username) {
    return res.json({ loggedIn: false });
  }
  const user = await store.getUser(req.session.username);
  res.json({
    loggedIn: true,
    username: req.session.username,
    settings: user?.settings || defaultSettings()
  });
}));

app.get('/api/feed', requireAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 6;
  const random = req.query.random === 'true';
  const posts = await readPosts();
  const users = await readUsers();
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
}));

app.post('/api/posts/create', requireAuth, asyncHandler(async (req, res) => {
  const { text, image } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ message: 'Текст поста не может быть пустым' });
  }

  const posts = await readPosts();
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
  await writePosts(posts);
  res.json({ message: 'Пост создан', post: newPost });
}));

app.post('/api/posts/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const posts = await readPosts();
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

  await writePosts(posts);
  res.json({ message: 'Лайк обновлен', likes: post.likes });
}));

app.post('/api/posts/:id/favorite', requireAuth, asyncHandler(async (req, res) => {
  const posts = await readPosts();
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
  await writePosts(posts);
  res.json({ message: 'Избранное обновлено', favorites: post.favorites });
}));

app.post('/api/posts/:id/comment', requireAuth, asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ message: 'Комментарий не может быть пустым' });
  }

  const posts = await readPosts();
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
  await writePosts(posts);
  res.json({ message: 'Комментарий добавлен', comments: post.comments });
}));

app.post('/api/posts/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const posts = await readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  post.shares = (post.shares || 0) + 1;
  await writePosts(posts);
  res.json({ message: 'Пост поделился', shares: post.shares });
}));

app.post('/api/posts/:id/repost', requireAuth, asyncHandler(async (req, res) => {
  const posts = await readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  const allPosts = await readPosts();
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
  await writePosts(allPosts);
  await writePosts(posts);
  res.json({ message: 'Репост создан', repost });
}));

app.post('/api/users/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const users = await readUsers();
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
    await writeUsers(users);
    return res.json({ message: 'Отписано', following: me.following.length, followers: target.followers.length });
  }

  target.followers.push(me.username);
  me.following.push(target.username);
  await writeUsers(users);
  res.json({ message: 'Подписано', following: me.following.length, followers: target.followers.length });
}));

app.delete('/api/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  const posts = await readPosts();
  const index = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ message: 'Пост не найден' });
  }

  if (posts[index].author !== req.session.username) {
    return res.status(403).json({ message: 'Вы не можете удалить чужой пост' });
  }

  posts.splice(index, 1);
  await writePosts(posts);
  res.json({ message: 'Пост удален' });
}));

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

app.get('/api/messages', requireAuth, asyncHandler(async (req, res) => {
  const username = req.session.username;
  const messages = await readMessages();
  const groups = await readGroups();
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
}));

app.get('/api/chat/dm/:username', requireAuth, asyncHandler(async (req, res) => {
  const otherUser = normalizeUsername(req.params.username);
  const users = await readUsers();
  if (!findUserByUsername(users, otherUser)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const messages = await readMessages();
  const chat = messages.filter(m =>
    !m.groupId &&
    ((m.from === req.session.username && m.to === otherUser) ||
      (m.from === otherUser && m.to === req.session.username))
  ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  chat.forEach(msg => {
    if (msg.to === req.session.username && !msg.read) msg.read = true;
  });
  await writeMessages(messages);

  res.json({ messages: chat, withUser: otherUser, chatType: 'dm' });
}));

app.get('/api/chat/:username', requireAuth, asyncHandler(async (req, res) => {
  const otherUser = normalizeUsername(req.params.username);
  const users = await readUsers();
  if (!findUserByUsername(users, otherUser)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  const messages = await readMessages();
  const chat = messages.filter(m =>
    !m.groupId &&
    ((m.from === req.session.username && m.to === otherUser) ||
      (m.from === otherUser && m.to === req.session.username))
  ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  chat.forEach(msg => {
    if (msg.to === req.session.username && !msg.read) msg.read = true;
  });
  await writeMessages(messages);
  res.json({ messages: chat, withUser: otherUser, chatType: 'dm' });
}));

app.get('/api/chat/group/:groupId', requireAuth, asyncHandler(async (req, res) => {
  const group = findGroupById(await readGroups(), req.params.groupId);
  if (!group || !isGroupMember(group, req.session.username)) {
    return res.status(404).json({ message: 'Группа не найдена' });
  }

  const messages = await readMessages();
  const chat = messages
    .filter(m => m.groupId === group.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  chat.forEach(msg => {
    if (msg.to === `group:${group.id}` && msg.from !== req.session.username && !msg.read) {
      msg.read = true;
    }
  });
  await writeMessages(messages);

  res.json({ messages: chat, group, chatType: 'group' });
}));

app.post('/api/messages/send', requireAuth, asyncHandler(async (req, res) => {
  const { to, groupId, text, media, mediaType, voice } = req.body;
  if (!text && !media && !voice) {
    return res.status(400).json({ message: 'Пустое сообщение' });
  }
  const bodyText = String(text || '').trim();
  if (!bodyText && !media && !voice) {
    return res.status(400).json({ message: 'Пустое сообщение' });
  }

  const messages = await readMessages();

  if (groupId) {
    const group = findGroupById(await readGroups(), groupId);
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
      text: bodyText || null,
      media: media || null,
      mediaType: mediaType || null,
      voice: voice || null,
      timestamp: new Date().toISOString(),
      read: false
    };
    messages.push(newMessage);
    await writeMessages(messages);
    return res.json({ message: 'Сообщение отправлено', msg: newMessage });
  }

  if (!to) {
    return res.status(400).json({ message: 'Укажите получателя' });
  }

  const users = await readUsers();
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
    text: bodyText || null,
    media: media || null,
    mediaType: mediaType || null,
    voice: voice || null,
    timestamp: new Date().toISOString(),
    read: false
  };

  messages.push(newMessage);
  await writeMessages(messages);
  res.json({ message: 'Сообщение отправлено', msg: newMessage });
}));

app.get('/api/groups', requireAuth, asyncHandler(async (req, res) => {
  const groups = await readGroups()
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
}));

app.post('/api/groups/create', requireAuth, asyncHandler(async (req, res) => {
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
    if ((await readGroups()).some(g => g.slug === groupSlug)) {
      return res.status(409).json({ message: 'Такой slug уже занят' });
    }
  }

  const groups = await readGroups();
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
  await writeGroups(groups);
  res.json({ message: 'Создано', group: newGroup });
}));

app.post('/api/groups/:id/join', requireAuth, asyncHandler(async (req, res) => {
  const groups = await readGroups();
  const group = findGroupById(groups, req.params.id);
  if (!group) return res.status(404).json({ message: 'Не найдено' });
  if (group.type === 'channel') {
    return res.status(400).json({ message: 'В канал можно только по приглашению' });
  }
  if (!isGroupMember(group, req.session.username)) {
    group.members.push(req.session.username);
    await writeGroups(groups);
  }
  res.json({ message: 'Вы в группе', group });
}));

app.post('/api/groups/:id/invite', requireAuth, asyncHandler(async (req, res) => {
  const { username } = req.body;
  const groups = await readGroups();
  const group = findGroupById(groups, req.params.id);
  if (!group) return res.status(404).json({ message: 'Не найдено' });
  if (group.owner !== req.session.username && !group.admins?.includes(req.session.username)) {
    return res.status(403).json({ message: 'Нет прав' });
  }
  const user = await store.getUser(username);
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  if (!isGroupMember(group, user.username)) {
    group.members.push(user.username);
    await writeGroups(groups);
  }
  res.json({ message: 'Участник добавлен' });
}));

app.get('/api/profile', requireAuth, asyncHandler(async (req, res) => {
  const users = await readUsers();
  const user = findUserByUsername(users, req.session.username);
  const posts = (await readPosts()).filter(p => p.author === req.session.username);

  res.json({
    username: req.session.username,
    avatar: user?.avatar || '👤',
    bio: user?.bio || 'О себе ничего не рассказано',
    followers: user?.followers?.length || 0,
    following: user?.following?.length || 0,
    posts: posts.length,
    settings: user?.settings || defaultSettings()
  });
}));

app.get('/api/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.session.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json({ settings: user.settings });
}));

app.put('/api/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.session.username);
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
  await store.saveUser(migrateUser(user));
  res.json({ message: 'Настройки сохранены', settings: user.settings });
}));

app.patch('/api/profile', requireAuth, asyncHandler(async (req, res) => {
  const users = await readUsers();
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
      await store.renameUsername(oldUsername, validation.username);
      req.session.username = validation.username;
      user.username = validation.username;
    }
  }

  await store.saveUser(user);
  res.json({
    message: 'Профиль обновлён',
    username: user.username,
    bio: user.bio
  });
}));

app.get('/api/account/stats', requireAuth, asyncHandler(async (req, res) => {
  const username = req.session.username;
  const messages = (await readMessages()).filter(m => m.from === username || m.to === username);
  const posts = (await readPosts()).filter(p => p.author === username);
  res.json({
    messagesCount: messages.length,
    postsCount: posts.length,
    cacheHint: 'Клиентские настройки темы и языка хранятся в браузере и на сервере'
  });
}));

app.post('/api/account/clear-cache', requireAuth, asyncHandler(async (req, res) => {
  res.json({ message: 'Серверный кэш не используется. Очистите данные в браузере через раздел «Данные и память».' });
}));

app.get('/api/users/lookup/:username', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.getUser(req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json(await publicUserPayload(user, req.session.username));
}));

app.get('/api/users/search', requireAuth, asyncHandler(async (req, res) => {
  const query = normalizeUsername(req.query.q || '');
  const users = (await readUsers()).filter(u => {
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

  const usersPayload = await Promise.all(
    sorted
      .filter(u => query.length >= 1 || canViewProfile(req.session.username, u))
      .slice(0, 30)
      .map(u => publicUserPayload(u, req.session.username))
  );
  res.json({ users: usersPayload });
}));

app.get('/api/stand/feed', requireAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 5;
  const standsRaw = await readStands();
  const stands = (await Promise.all(standsRaw.map(s => enrichStand(s, req.session.username))))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const slice = stands.slice((page - 1) * limit, page * limit);
  res.json({ stands: slice, hasMore: page * limit < stands.length });
}));

app.post('/api/stand/create', requireAuth, asyncHandler(async (req, res) => {
  const { video, caption } = req.body;
  if (!video) {
    return res.status(400).json({ message: 'Загрузите видео' });
  }
  if (video.length > MAX_VIDEO_BYTES) {
    return res.status(400).json({ message: 'Видео слишком большое (макс. ~25 МБ)' });
  }
  const stands = await readStands();
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
  await writeStands(stands);
  res.json({ message: 'Видео опубликовано в Stand', stand: newStand });
}));

async function standAction(standId, updater) {
  const stands = await readStands();
  const stand = stands.find(s => s.id === parseInt(standId, 10));
  if (!stand) return null;
  updater(stand);
  await writeStands(stands);
  return stand;
}

app.post('/api/stand/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const stand = await standAction(req.params.id, (s) => {
    s.likes = s.likes || [];
    const i = s.likes.indexOf(req.session.username);
    if (i > -1) s.likes.splice(i, 1);
    else s.likes.push(req.session.username);
  });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ likes: stand.likes });
}));

app.post('/api/stand/:id/favorite', requireAuth, asyncHandler(async (req, res) => {
  const stand = await standAction(req.params.id, (s) => {
    s.favorites = s.favorites || [];
    const i = s.favorites.indexOf(req.session.username);
    if (i > -1) s.favorites.splice(i, 1);
    else s.favorites.push(req.session.username);
  });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ favorites: stand.favorites });
}));

app.post('/api/stand/:id/comment', requireAuth, asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Пустой комментарий' });
  const stand = await standAction(req.params.id, (s) => {
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
}));

app.post('/api/stand/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const stand = await standAction(req.params.id, (s) => { s.shares = (s.shares || 0) + 1; });
  if (!stand) return res.status(404).json({ message: 'Не найдено' });
  res.json({ shares: stand.shares });
}));

app.post('/api/stand/:id/repost', requireAuth, asyncHandler(async (req, res) => {
  const stands = await readStands();
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
  await writeStands(stands);
  res.json({ message: 'Репост в Stand', repost });
}));

app.delete('/api/stand/:id', requireAuth, asyncHandler(async (req, res) => {
  const stands = await readStands();
  const idx = stands.findIndex(s => s.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ message: 'Не найдено' });
  if (stands[idx].author !== req.session.username) {
    return res.status(403).json({ message: 'Можно удалить только своё видео' });
  }
  stands.splice(idx, 1);
  await writeStands(stands);
  res.json({ message: 'Удалено' });
}));

app.get('/api/users/:username/profile', requireAuth, asyncHandler(async (req, res) => {
  const users = await readUsers();
  const user = findUserByUsername(users, req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json(await publicUserPayload(user, req.session.username));
}));

app.get('/api/user/:username', requireAuth, asyncHandler(async (req, res) => {
  const users = await readUsers();
  const user = findUserByUsername(users, req.params.username);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  res.json(await publicUserPayload(user, req.session.username));
}));

app.post('/api/voice/send', requireAuth, asyncHandler(async (req, res) => {
  const { to, audioData } = req.body;
  if (!to || !audioData) {
    return res.status(400).json({ message: 'Укажите получателя и аудио' });
  }

  const users = await readUsers();
  if (!users.find(u => u.username === to)) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const newVoiceMsg = {
    id: Date.now(),
    from: req.session.username,
    to: to,
    audioData: audioData,
    timestamp: new Date().toISOString(),
    read: false
  };

  await store.addVoiceMessage(newVoiceMsg);
  res.json({ message: 'Голосовое сообщение отправлено', msg: newVoiceMsg });
}));

app.post('/api/stories/create', requireAuth, asyncHandler(async (req, res) => {
  const { media, duration } = req.body;
  if (!media) {
    return res.status(400).json({ message: 'Укажите контент истории' });
  }

  const stories = await readStories();
  const newStory = {
    id: Date.now(),
    author: req.session.username,
    media: media,
    duration: duration || 10,
    timestamp: new Date().toISOString(),
    views: []
  };

  stories.push(newStory);
  await writeStories(stories);
  res.json({ message: 'История создана', story: newStory });
}));

app.get('/api/stories/feed', requireAuth, asyncHandler(async (req, res) => {
  const stories = await readStories();
  const users = await readUsers();
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
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  const info = await store.init();
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT} (storage: ${info.mode})`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
