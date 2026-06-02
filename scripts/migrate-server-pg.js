const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'server.js');
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
  "const bodyParser = require('body-parser');\nconst fs = require('fs');\nconst path = require('path');",
  "const bodyParser = require('body-parser');\nconst path = require('path');\nconst store = require('./lib/store');"
);

const headerEnd = s.indexOf('app.use(express.static');
const helpersStart = s.indexOf('const USERS_FILE');
const requireAuthStart = s.indexOf('function requireAuth');

const newHeader = `const GROUP_SLUG_REGEX = /^[a-z0-9_]{5,32}$/;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error(err);
      res.status(500).json({ message: err.message || 'Ошибка сервера' });
    });
  };
}

`;

s = s.slice(0, helpersStart) + newHeader + s.slice(requireAuthStart);

s = s.replace(
  /function enrichStand\(stand, viewer\) \{[\s\S]*?\n\}/,
  `async function enrichStand(stand, viewer) {
  const user = await store.getUser(stand.author);
  return {
    ...stand,
    avatar: user?.avatar || '👤',
    isFavorite: stand.favorites?.includes(viewer),
    isLiked: stand.likes?.includes(viewer),
    isFollowing: user?.followers?.includes(viewer)
  };
}`
);

s = s.replace(
  /function publicUserPayload\(user, viewerUsername\) \{[\s\S]*?\n\}/,
  `async function publicUserPayload(user, viewerUsername) {
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
}`
);

const insertAfterMigrateUser = s.indexOf('function findGroupById');
const wrappers = `
async function readUsers() {
  return (await store.readUsers()).map(migrateUser);
}
async function writeUsers(users) {
  await store.writeUsers(users.map(migrateUser));
}
async function readPosts() { return store.readPosts(); }
async function writePosts(posts) { await store.writePosts(posts); }
async function upsertPost(post) { await store.upsertPost(post); }
async function readMessages() { return store.readMessages(); }
async function writeMessages(messages) { await store.writeMessages(messages); }
async function addMessage(message) { await store.addMessage(message); }
async function readGroups() { return store.readGroups(); }
async function writeGroups(groups) { await store.writeGroups(groups); }
async function upsertGroup(group) { await store.upsertGroup(group); }
async function readStands() { return store.readStands(); }
async function writeStands(stands) { await store.writeStands(stands); }
async function upsertStand(stand) { await store.upsertStand(stand); }
async function readStories() { return store.readStories(); }
async function writeStories(stories) { await store.writeStories(stories); }
async function readVoiceMessages() { return store.readVoiceMessages(); }

`;
s = s.slice(0, insertAfterMigrateUser) + wrappers + s.slice(insertAfterMigrateUser);

// Remove old json read/write block between requireAuth and findGroupById if still there
s = s.replace(/function readJSON[\s\S]*?function writeStands[\s\S]*?\n\n/g, '');

s = s.replace(/\breadUsers\(\)/g, 'await readUsers()');
s = s.replace(/\bwriteUsers\(/g, 'await writeUsers(');
s = s.replace(/\breadPosts\(\)/g, 'await readPosts()');
s = s.replace(/\bwritePosts\(/g, 'await writePosts(');
s = s.replace(/\breadMessages\(\)/g, 'await readMessages()');
s = s.replace(/\bwriteMessages\(/g, 'await writeMessages(');
s = s.replace(/\breadGroups\(\)/g, 'await readGroups()');
s = s.replace(/\bwriteGroups\(/g, 'await writeGroups(');
s = s.replace(/\breadStands\(\)/g, 'await readStands()');
s = s.replace(/\bwriteStands\(/g, 'await writeStands(');
s = s.replace(/\breadStories\(\)/g, 'await readStories()');
s = s.replace(/\bwriteStories\(/g, 'await writeStories(');
s = s.replace(/\breadVoiceMessages\(\)/g, 'await readVoiceMessages()');

s = s.replace(/await await /g, 'await ');

// Wrap API routes (not logout, not catch-all)
s = s.replace(
  /app\.(get|post|put|patch|delete)\('\/api\/([^']+)',(?!\s*asyncHandler)/g,
  (m, method, path) => {
    if (path.startsWith('logout')) return m;
    return `app.${method}('/api/${path}',`;
  }
);

s = s.replace(
  /app\.(get|post|put|patch|delete)\('\/api\/([^']+)', requireAuth, (?!\s*asyncHandler)/g,
  "app.$1('/api/$2', requireAuth, asyncHandler(async "
);

s = s.replace(
  /app\.(get|post|put|patch|delete)\('\/api\/([^']+)', asyncHandler\(async requireAuth, asyncHandler\(async /g,
  "app.$1('/api/$2', requireAuth, asyncHandler(async "
);

// register, login, user without requireAuth
['register', 'login'].forEach(route => {
  s = s.replace(
    new RegExp(`app\\.post\\('/api/${route}', \\(req, res\\) =>`),
    `app.post('/api/${route}', asyncHandler(async (req, res) =>`
  );
});
s = s.replace(
  /app\.get\('\/api\/user', \(req, res\) =>/,
  "app.get('/api/user', asyncHandler(async (req, res) =>"
);

// requireAuth routes
s = s.replace(
  /app\.(get|post|put|patch|delete)\('\/api\/[^']+', requireAuth, \(req, res\) =>/g,
  (m) => m.replace(', (req, res) =>', ', asyncHandler(async (req, res) =>')
);

// Fix stand feed enrichStand
s = s.replace(
  /\.map\(s => enrichStand\(s, req\.session\.username\)\)/,
  '.map(s => enrichStand(s, req.session.username))'
);
s = s.replace(
  /const stands = await readStands\(\)\s*\n\s*\.map\(s => enrichStand/,
  'const standsRaw = await readStands();\n  const stands = await Promise.all(standsRaw.map(s => enrichStand'
);
s = s.replace(
  /enrichStand\(s, req\.session\.username\)\)\s*\n\s*\.sort/,
  'enrichStand(s, req.session.username)))\n    .sort'
);

// publicUserPayload await
s = s.replace(/res\.json\(publicUserPayload\(/g, 'res.json(await publicUserPayload(');
s = s.replace(
  /\.map\(u => publicUserPayload\(u, req\.session\.username\)\)/g,
  '.map(u => publicUserPayload(u, req.session.username))'
);
s = s.replace(
  /users: sorted\s*\n\s*\.filter[\s\S]*?\.map\(u => publicUserPayload\(u, req\.session\.username\)\)/,
  (match) => {
    return match.replace(
      '.map(u => publicUserPayload(u, req.session.username))',
      '.map(async u => await publicUserPayload(u, req.session.username))'
    ).replace('users: sorted', 'const usersList = sorted');
  }
);

// Fix search endpoint to use Promise.all - manual patch later

// Close asyncHandler routes
const lines = s.split('\n');
let inAsync = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('asyncHandler(async')) inAsync = true;
  if (inAsync && lines[i] === '});') {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (lines[j] && lines[j].startsWith('app.')) {
      lines[i] = '}));';
      inAsync = false;
    }
  }
}
s = lines.join('\n');

// profile rename use store
s = s.replace(
  /const oldUsername = user\.username;[\s\S]*?writeUsers\(users\);/,
  `const oldUsername = user.username;
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

// REMOVE duplicate old rename block - the script might mess up patch profile

s = s.replace(/function migrateUsersFile[\s\S]*?migrateUsersFile\(\);\s*\n\napp\.listen/, `async function start() {
  const info = await store.init();
  app.listen`);

s = s.replace(
  /app\.listen\(PORT, \(\) => \{\s*console\.log\(`Server started on port \$\{PORT\}`\);\s*\}\);/,
  `PORT, () => {
    console.log(\`Server started on port \${PORT} (storage: \${info.mode})\`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});`
);

fs.writeFileSync(file, s);
console.log('Patched server.js');
