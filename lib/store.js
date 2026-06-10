const fs = require('fs');
const path = require('path');
const db = require('./db');

const dataDir = path.join(__dirname, '..', 'data');
const files = {
  users: path.join(dataDir, 'users.json'),
  posts: path.join(dataDir, 'posts.json'),
  messages: path.join(dataDir, 'messages.json'),
  groups: path.join(dataDir, 'groups.json'),
  stands: path.join(dataDir, 'stands.json'),
  stories: path.join(dataDir, 'stories.json'),
  voice: path.join(dataDir, 'voice_messages.json')
};

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function writeJsonFile(file, data) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function rowToUser(row, followers = [], following = []) {
  return {
    username: row.username,
    nickname: row.nickname || '',
    password: row.password,
    avatar: row.avatar,
    avatarImage: row.avatar_image || row.avatarImage || null,
    bio: row.bio,
    blacklist: row.blacklist || [],
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {}),
    createdAt: row.created_at || row.createdAt,
    lastSeen: row.last_seen || row.lastSeen || null,
    email: row.email || '',
    followers,
    following
  };
}

function rowToMessage(row) {
  let reactions = {};
  try {
    if (row.reactions) {
      reactions = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions;
    }
  } catch (e) {}
  return {
    id: row.id,
    from: row.from_username || row.from,
    to: row.to_username || row.to,
    groupId: row.group_id || row.groupId || null,
    text: row.text,
    media: row.media || null,
    mediaType: row.media_type || row.mediaType || null,
    voice: row.voice || null,
    timestamp: row.created_at || row.timestamp,
    read: row.read || false,
    reactions,
    deleted: row.deleted || false
  };
}

function rowToPost(row) {
  return {
    id: row.id,
    author: row.author,
    text: row.text,
    image: row.image || null,
    timestamp: row.created_at || row.timestamp,
    likes: row.likes || [],
    favorites: row.favorites || [],
    comments: row.comments || [],
    shares: row.shares || 0,
    reposts: row.reposts || 0,
    originalAuthor: row.original_author || row.originalAuthor || null,
    originalPostId: row.original_post_id || row.originalPostId || null
  };
}

function rowToStand(row) {
  return {
    id: row.id,
    author: row.author,
    video: row.video,
    caption: row.caption || '',
    timestamp: row.created_at || row.timestamp,
    likes: row.likes || [],
    favorites: row.favorites || [],
    comments: row.comments || [],
    shares: row.shares || 0,
    reposts: row.reposts || 0
  };
}

function rowToGroup(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    owner: row.owner,
    admins: row.admins || [],
    members: row.members || [],
    createdAt: row.created_at || row.createdAt
  };
}

async function loadUserFollows(username) {
  const f = await db.query('SELECT follower FROM user_follows WHERE following = $1', [username]);
  const g = await db.query('SELECT following FROM user_follows WHERE follower = $1', [username]);
  return {
    followers: f.rows.map(r => r.follower),
    following: g.rows.map(r => r.following)
  };
}

async function readUsersPg() {
  const { rows } = await db.query('SELECT * FROM users ORDER BY username');
  const users = [];
  for (const row of rows) {
    const { followers, following } = await loadUserFollows(row.username);
    users.push(rowToUser(row, followers, following));
  }
  return users;
}

async function getUserPg(username) {
  const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  if (!rows[0]) return null;
  const { followers, following } = await loadUserFollows(username);
  return rowToUser(rows[0], followers, following);
}

async function saveUserPg(user) {
  await db.query(
    `INSERT INTO users (username, nickname, password, avatar, avatar_image, bio, settings, created_at, last_seen, email, blacklist)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb)
     ON CONFLICT (username) DO UPDATE SET
       nickname = EXCLUDED.nickname,
       password = EXCLUDED.password,
       avatar = EXCLUDED.avatar,
       avatar_image = EXCLUDED.avatar_image,
       bio = EXCLUDED.bio,
       settings = EXCLUDED.settings,
       last_seen = $9,
       email = $10,
       blacklist = $11::jsonb`,
    [
      user.username,
      user.nickname || '',
      user.password,
      user.avatar || '👤',
      user.avatarImage || null,
      user.bio || '',
      JSON.stringify(user.settings || {}),
      user.createdAt || new Date().toISOString(),
      user.lastSeen || null,
      user.email || '',
      JSON.stringify(user.blacklist || [])
    ]
  );
  await db.query('DELETE FROM user_follows WHERE follower = $1 OR following = $1', [user.username]);
  for (const f of user.followers || []) {
    await db.query('INSERT INTO user_follows (follower, following) VALUES ($1, $2) ON CONFLICT DO NOTHING', [f, user.username]);
  }
  for (const f of user.following || []) {
    await db.query('INSERT INTO user_follows (follower, following) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.username, f]);
  }
}

async function writeUsersPg(users) {
  for (const user of users) {
    await saveUserPg(user);
  }
}

async function renameUsernamePg(oldUsername, newUsername) {
  const user = await getUserPg(oldUsername);
  if (!user) throw new Error('User not found');
  const users = await readUsersPg();
  const exists = users.find(u => u.username === newUsername);
  if (exists) throw new Error('Username already taken');
  user.username = newUsername;
  await saveUserPg(user);
  await renameInMessagesPg(oldUsername, newUsername);
  await renameInPostsPg(oldUsername, newUsername);
  await renameInStandsPg(oldUsername, newUsername);
  await renameInGroupsPg(oldUsername, newUsername);
  await renameInFollowsPg(oldUsername, newUsername);
  return user;
}

async function renameInMessagesPg(oldUsername, newUsername) {
  await db.query('UPDATE messages SET from_username = $1 WHERE from_username = $2', [newUsername, oldUsername]);
  await db.query('UPDATE messages SET to_username = $1 WHERE to_username = $2', [newUsername, oldUsername]);
}

async function renameInPostsPg(oldUsername, newUsername) {
  await db.query('UPDATE posts SET author = $1 WHERE author = $2', [newUsername, oldUsername]);
}

async function renameInStandsPg(oldUsername, newUsername) {
  await db.query('UPDATE stands SET author = $1 WHERE author = $2', [newUsername, oldUsername]);
}

async function renameInGroupsPg(oldUsername, newUsername) {
  await db.query("UPDATE groups SET members = array_replace(members, $1, $2) WHERE $1 = ANY(members)", [oldUsername, newUsername]);
  await db.query("UPDATE groups SET admins = array_replace(admins, $1, $2) WHERE $1 = ANY(admins)", [oldUsername, newUsername]);
  await db.query('UPDATE groups SET owner = $1 WHERE owner = $2', [newUsername, oldUsername]);
}

async function renameInFollowsPg(oldUsername, newUsername) {
  await db.query('UPDATE user_follows SET follower = $1 WHERE follower = $2', [newUsername, oldUsername]);
  await db.query('UPDATE user_follows SET following = $1 WHERE following = $2', [newUsername, oldUsername]);
}

module.exports = {
  async init() {
    return db.init();
  },
  async readUsers() {
    if (db.usePostgres()) return readUsersPg();
    return readJsonFile(files.users);
  },
  async writeUsers(users) {
    if (db.usePostgres()) return writeUsersPg(users);
    writeJsonFile(files.users, users);
  },
  async getUser(username) {
    if (db.usePostgres()) return getUserPg(username);
    const users = readJsonFile(files.users);
    return users.find(u => u.username === username?.trim().toLowerCase()) || null;
  },
  async saveUser(user) {
    if (db.usePostgres()) return saveUserPg(user);
    const users = readJsonFile(files.users);
    const i = users.findIndex(u => u.username === user.username);
    if (i > -1) users[i] = user;
    else users.push(user);
    writeJsonFile(files.users, users);
  },
  async renameUsername(oldUsername, newUsername) {
    if (db.usePostgres()) return renameUsernamePg(oldUsername, newUsername);
    const users = readJsonFile(files.users);
    const user = users.find(u => u.username === oldUsername);
    if (!user) throw new Error('User not found');
    if (users.find(u => u.username === newUsername)) throw new Error('Username taken');
    user.username = newUsername;
    const messages = readJsonFile(files.messages);
    messages.forEach(m => { if (m.from === oldUsername) m.from = newUsername; if (m.to === oldUsername) m.to = newUsername; });
    writeJsonFile(files.messages, messages);
    const posts = readJsonFile(files.posts);
    posts.forEach(p => { if (p.author === oldUsername) p.author = newUsername; });
    writeJsonFile(files.posts, posts);
    writeJsonFile(files.users, users);
  },
  async countPostsByAuthor(username) {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT COUNT(*) as c FROM posts WHERE author = $1', [username]);
      return parseInt(rows[0]?.c) || 0;
    }
    return readJsonFile(files.posts).filter(p => p.author === username).length;
  },
  async readPosts() {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT * FROM posts ORDER BY created_at DESC');
      return rows.map(rowToPost);
    }
    return readJsonFile(files.posts);
  },
  async writePosts(posts) {
    if (db.usePostgres()) {
      await db.query('DELETE FROM posts');
      for (const p of posts) {
        await db.query(
          `INSERT INTO posts (id, author, text, image, created_at, likes, favorites, comments, shares, reposts, original_author, original_post_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
          [p.id, p.author, p.text, p.image || null, p.timestamp, JSON.stringify(p.likes || []), JSON.stringify(p.favorites || []), JSON.stringify(p.comments || []), p.shares || 0, p.reposts || 0, p.originalAuthor || null, p.originalPostId || null]
        );
      }
      return;
    }
    writeJsonFile(files.posts, posts);
  },
  async readMessages() {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT * FROM messages ORDER BY created_at');
      return rows.map(rowToMessage);
    }
    return readJsonFile(files.messages);
  },
  async writeMessages(messages) {
    if (db.usePostgres()) {
      await db.query('DELETE FROM messages');
      for (const m of messages) {
        await db.query(
          `INSERT INTO messages (id, from_username, to_username, group_id, text, media, media_type, voice, created_at, "read", reactions, deleted)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
          [m.id, m.from, m.to, m.groupId || null, m.text || null, m.media || null, m.mediaType || null, m.voice || null, m.timestamp, m.read || false, JSON.stringify(m.reactions || {}), m.deleted || false]
        );
      }
      return;
    }
    writeJsonFile(files.messages, messages);
  },
  async readGroups() {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT * FROM groups ORDER BY created_at');
      return rows.map(rowToGroup);
    }
    return readJsonFile(files.groups);
  },
  async writeGroups(groups) {
    if (db.usePostgres()) {
      await db.query('DELETE FROM groups');
      for (const g of groups) {
        await db.query(
          `INSERT INTO groups (id, type, title, slug, owner, admins, members, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [g.id, g.type, g.title, g.slug || null, g.owner, g.admins || [], g.members || [], g.createdAt]
        );
      }
      return;
    }
    writeJsonFile(files.groups, groups);
  },
  async readStands() {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT * FROM stands ORDER BY created_at');
      return rows.map(rowToStand);
    }
    return readJsonFile(files.stands);
  },
  async writeStands(stands) {
    if (db.usePostgres()) {
      await db.query('DELETE FROM stands');
      for (const s of stands) {
        await db.query(
          `INSERT INTO stands (id, author, video, caption, created_at, likes, favorites, comments, shares, reposts)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)`,
          [s.id, s.author, s.video, s.caption || '', s.timestamp, JSON.stringify(s.likes || []), JSON.stringify(s.favorites || []), JSON.stringify(s.comments || []), s.shares || 0, s.reposts || 0]
        );
      }
      return;
    }
    writeJsonFile(files.stands, stands);
  },
  async readStories() {
    return readJsonFile(files.stories);
  },
  async writeStories(stories) {
    writeJsonFile(files.stories, stories);
  },
  async addVoiceMessage(msg) {
    const msgs = readJsonFile(files.voice);
    msgs.push(msg);
    writeJsonFile(files.voice, msgs);
  }
};