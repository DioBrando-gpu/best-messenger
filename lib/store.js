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
    return Array.isArray([]) ? [] : [];
  }
}

function writeJsonFile(file, data) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function rowToUser(row, followers = [], following = []) {
  return {
    username: row.username,
    password: row.password,
    avatar: row.avatar,
    bio: row.bio,
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
    createdAt: row.created_at || row.createdAt,
    lastSeen: row.last_seen || row.lastSeen || null,
    followers,
    following
  };
}

function rowToMessage(row) {
  return {
    id: Number(row.id),
    from: row.from_user || row.from,
    to: row.to_user || row.to,
    groupId: row.group_id || row.groupId || null,
    text: row.body || row.text,
    media: row.media || null,
    mediaType: row.media_type || row.mediatype || null,
    voice: row.voice || null,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    read: row.read
  };
}

function rowToPost(row) {
  return {
    id: Number(row.id),
    author: row.author,
    text: row.text,
    image: row.image,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
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
    id: Number(row.id),
    author: row.author,
    video: row.video,
    caption: row.caption,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    likes: row.likes || [],
    favorites: row.favorites || [],
    comments: row.comments || [],
    shares: row.shares || 0,
    reposts: row.reposts || 0,
    originalAuthor: row.original_author || row.originalAuthor || null,
    originalStandId: row.original_stand_id || row.originalStandId || null
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
    `INSERT INTO users (username, password, avatar, bio, settings, created_at, last_seen)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (username) DO UPDATE SET
       password = EXCLUDED.password,
       avatar = EXCLUDED.avatar,
       bio = EXCLUDED.bio,
       settings = EXCLUDED.settings,
       last_seen = $7`,
    [
      user.username,
      user.password,
      user.avatar || '👤',
      user.bio || '',
      JSON.stringify(user.settings || {}),
      user.createdAt || new Date().toISOString(),
      user.lastSeen || null
    ]
  );
  await db.query('DELETE FROM user_follows WHERE follower = $1 OR following = $1', [user.username]);
  for (const f of user.followers || []) {
    await db.query(
      'INSERT INTO user_follows (follower, following) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [f, user.username]
    );
  }
  for (const f of user.following || []) {
    await db.query(
      'INSERT INTO user_follows (follower, following) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.username, f]
    );
  }
}

async function writeUsersPg(users) {
  for (const user of users) {
    await saveUserPg(user);
  }
}

async function readPostsPg() {
  const { rows } = await db.query('SELECT * FROM posts ORDER BY timestamp DESC');
  return rows.map(rowToPost);
}

async function writePostsPg(posts) {
  await db.query('DELETE FROM posts');
  for (const p of posts) {
    await db.query(
      `INSERT INTO posts (id, author, text, image, timestamp, likes, favorites, comments, shares, reposts, original_author, original_post_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         author=$2, text=$3, image=$4, timestamp=$5, likes=$6::jsonb, favorites=$7::jsonb,
         comments=$8::jsonb, shares=$9, reposts=$10, original_author=$11, original_post_id=$12`,
      [
        p.id, p.author, p.text, p.image || null, p.timestamp,
        JSON.stringify(p.likes || []), JSON.stringify(p.favorites || []), JSON.stringify(p.comments || []),
        p.shares || 0, p.reposts || 0, p.originalAuthor || null, p.originalPostId || null
      ]
    );
  }
}

async function upsertPostPg(p) {
  await db.query(
    `INSERT INTO posts (id, author, text, image, timestamp, likes, favorites, comments, shares, reposts, original_author, original_post_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       author=$2, text=$3, image=$4, timestamp=$5, likes=$6::jsonb, favorites=$7::jsonb,
       comments=$8::jsonb, shares=$9, reposts=$10, original_author=$11, original_post_id=$12`,
    [
      p.id, p.author, p.text, p.image || null, p.timestamp,
      JSON.stringify(p.likes || []), JSON.stringify(p.favorites || []), JSON.stringify(p.comments || []),
      p.shares || 0, p.reposts || 0, p.originalAuthor || null, p.originalPostId || null
    ]
  );
}

async function deletePostPg(id) {
  await db.query('DELETE FROM posts WHERE id = $1', [id]);
}

async function readMessagesPg() {
  const { rows } = await db.query('SELECT * FROM messages ORDER BY timestamp ASC');
  return rows.map(rowToMessage);
}

async function writeMessagesPg(messages) {
  await db.query('DELETE FROM messages');
  for (const m of messages) {
    await db.query(
      `INSERT INTO messages (id, from_user, to_user, group_id, body, media, media_type, voice, timestamp, read)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.from, m.to, m.groupId || null, m.text || null, m.media || null, m.mediaType || null, m.voice || null, m.timestamp, Boolean(m.read)]
    );
  }
}

async function addMessagePg(m) {
  await db.query(
    `INSERT INTO messages (id, from_user, to_user, group_id, body, media, media_type, voice, timestamp, read)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [m.id, m.from, m.to, m.groupId || null, m.text || null, m.media || null, m.mediaType || null, m.voice || null, m.timestamp, Boolean(m.read)]
  );
}

async function readGroupsPg() {
  const { rows } = await db.query('SELECT * FROM chat_groups');
  return rows.map(rowToGroup);
}

async function writeGroupsPg(groups) {
  await db.query('DELETE FROM chat_groups');
  for (const g of groups) {
    await db.query(
      `INSERT INTO chat_groups (id, type, title, slug, owner, admins, members, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
      [g.id, g.type, g.title, g.slug || null, g.owner, JSON.stringify(g.admins || []), JSON.stringify(g.members || []), g.createdAt || new Date().toISOString()]
    );
  }
}

async function upsertGroupPg(g) {
  await db.query(
    `INSERT INTO chat_groups (id, type, title, slug, owner, admins, members, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
     ON CONFLICT (id) DO UPDATE SET type=$2, title=$3, slug=$4, owner=$5, admins=$6::jsonb, members=$7::jsonb`,
    [g.id, g.type, g.title, g.slug || null, g.owner, JSON.stringify(g.admins || []), JSON.stringify(g.members || []), g.createdAt || new Date().toISOString()]
  );
}

async function readStandsPg() {
  const { rows } = await db.query('SELECT * FROM stands ORDER BY timestamp DESC');
  return rows.map(rowToStand);
}

async function writeStandsPg(stands) {
  for (const s of stands) {
    await db.query(
      `INSERT INTO stands (id, author, video, caption, timestamp, likes, favorites, comments, shares, reposts, original_author, original_stand_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         author=$2, video=$3, caption=$4, timestamp=$5, likes=$6::jsonb, favorites=$7::jsonb,
         comments=$8::jsonb, shares=$9, reposts=$10, original_author=$11, original_stand_id=$12`,
      [
        s.id, s.author, s.video, s.caption || '', s.timestamp,
        JSON.stringify(s.likes || []), JSON.stringify(s.favorites || []), JSON.stringify(s.comments || []),
        s.shares || 0, s.reposts || 0, s.originalAuthor || null, s.originalStandId || null
      ]
    );
  }
}

async function upsertStandPg(s) {
  await db.query(
    `INSERT INTO stands (id, author, video, caption, timestamp, likes, favorites, comments, shares, reposts, original_author, original_stand_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       author=$2, video=$3, caption=$4, timestamp=$5, likes=$6::jsonb, favorites=$7::jsonb,
       comments=$8::jsonb, shares=$9, reposts=$10, original_author=$11, original_stand_id=$12`,
    [
      s.id, s.author, s.video, s.caption || '', s.timestamp,
      JSON.stringify(s.likes || []), JSON.stringify(s.favorites || []), JSON.stringify(s.comments || []),
      s.shares || 0, s.reposts || 0, s.originalAuthor || null, s.originalStandId || null
    ]
  );
}

async function deleteStandPg(id) {
  await db.query('DELETE FROM stands WHERE id = $1', [id]);
}

async function countPostsByAuthorPg(username) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM posts WHERE author = $1', [username]);
  return rows[0].c;
}

async function renameUsernamePg(oldName, newName) {
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET username = $1 WHERE username = $2', [newName, oldName]);
    await client.query('UPDATE user_follows SET follower = $1 WHERE follower = $2', [newName, oldName]);
    await client.query('UPDATE user_follows SET following = $1 WHERE following = $2', [newName, oldName]);
    await client.query('UPDATE posts SET author = $1 WHERE author = $2', [newName, oldName]);
    await client.query('UPDATE posts SET original_author = $1 WHERE original_author = $2', [newName, oldName]);
    await client.query('UPDATE messages SET from_user = $1 WHERE from_user = $2', [newName, oldName]);
    await client.query('UPDATE messages SET to_user = $1 WHERE to_user = $2', [newName, oldName]);
    await client.query('UPDATE stands SET author = $1 WHERE author = $2', [newName, oldName]);
    await client.query('UPDATE chat_groups SET owner = $1 WHERE owner = $2', [newName, oldName]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function importJsonIfEmpty() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c > 0) return;

  const users = readJsonFile(files.users);
  const posts = readJsonFile(files.posts);
  const messages = readJsonFile(files.messages);
  const groups = readJsonFile(files.groups);
  const stands = readJsonFile(files.stands);

  if (!users.length && !posts.length && !messages.length) {
    console.log('PostgreSQL: empty database, no JSON to import');
    return;
  }

  console.log('PostgreSQL: importing data from JSON files...');
  if (users.length) await writeUsersPg(users.map(u => ({ ...u, username: String(u.username).toLowerCase() })));
  if (posts.length) await writePostsPg(posts);
  if (messages.length) await writeMessagesPg(messages);
  if (groups.length) await writeGroupsPg(groups);
  if (stands.length) await writeStandsPg(stands);
  console.log('PostgreSQL: import done');
}

const store = {
  async init() {
    if (!db.usePostgres()) {
      console.log('Storage: JSON files (set DATABASE_URL for PostgreSQL)');
      return { mode: 'json' };
    }
    await db.initSchema();
    await importJsonIfEmpty();
    console.log('Storage: PostgreSQL');
    return { mode: 'postgres' };
  },

  usePostgres: db.usePostgres,

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
    return users.find(u => u.username === username) || null;
  },

  async saveUser(user) {
    if (db.usePostgres()) return saveUserPg(user);
    const users = readJsonFile(files.users);
    const idx = users.findIndex(u => u.username === user.username);
    if (idx >= 0) users[idx] = user;
    else users.push(user);
    writeJsonFile(files.users, users);
  },

  async readPosts() {
    if (db.usePostgres()) return readPostsPg();
    return readJsonFile(files.posts);
  },

  async writePosts(posts) {
    if (db.usePostgres()) return writePostsPg(posts);
    writeJsonFile(files.posts, posts);
  },

  async upsertPost(post) {
    if (db.usePostgres()) return upsertPostPg(post);
    const posts = readJsonFile(files.posts);
    const idx = posts.findIndex(p => p.id === post.id);
    if (idx >= 0) posts[idx] = post;
    else posts.push(post);
    writeJsonFile(files.posts, posts);
  },

  async deletePost(id) {
    if (db.usePostgres()) return deletePostPg(id);
    const posts = readJsonFile(files.posts).filter(p => p.id !== id);
    writeJsonFile(files.posts, posts);
  },

  async readMessages() {
    if (db.usePostgres()) return readMessagesPg();
    return readJsonFile(files.messages);
  },

  async writeMessages(messages) {
    if (db.usePostgres()) return writeMessagesPg(messages);
    writeJsonFile(files.messages, messages);
  },

  async addMessage(message) {
    if (db.usePostgres()) return addMessagePg(message);
    const messages = readJsonFile(files.messages);
    messages.push(message);
    writeJsonFile(files.messages, messages);
  },

  async readGroups() {
    if (db.usePostgres()) return readGroupsPg();
    return readJsonFile(files.groups);
  },

  async writeGroups(groups) {
    if (db.usePostgres()) return writeGroupsPg(groups);
    writeJsonFile(files.groups, groups);
  },

  async upsertGroup(group) {
    if (db.usePostgres()) return upsertGroupPg(group);
    const groups = readJsonFile(files.groups);
    const idx = groups.findIndex(g => g.id === group.id);
    if (idx >= 0) groups[idx] = group;
    else groups.push(group);
    writeJsonFile(files.groups, groups);
  },

  async readStands() {
    if (db.usePostgres()) return readStandsPg();
    return readJsonFile(files.stands);
  },

  async writeStands(stands) {
    if (db.usePostgres()) return writeStandsPg(stands);
    writeJsonFile(files.stands, stands);
  },

  async upsertStand(stand) {
    if (db.usePostgres()) return upsertStandPg(stand);
    const stands = readJsonFile(files.stands);
    const idx = stands.findIndex(s => s.id === stand.id);
    if (idx >= 0) stands[idx] = stand;
    else stands.push(stand);
    writeJsonFile(files.stands, stands);
  },

  async deleteStand(id) {
    if (db.usePostgres()) return deleteStandPg(id);
    writeJsonFile(files.stands, readJsonFile(files.stands).filter(s => s.id !== id));
  },

  async countPostsByAuthor(username) {
    if (db.usePostgres()) return countPostsByAuthorPg(username);
    return readJsonFile(files.posts).filter(p => p.author === username).length;
  },

  async renameUsername(oldName, newName) {
    if (db.usePostgres()) return renameUsernamePg(oldName, newName);

    const posts = readJsonFile(files.posts);
    posts.forEach(post => {
      if (post.author === oldName) post.author = newName;
      if (post.originalAuthor === oldName) post.originalAuthor = newName;
      post.likes = (post.likes || []).map(n => (n === oldName ? newName : n));
      post.favorites = (post.favorites || []).map(n => (n === oldName ? newName : n));
      post.comments = (post.comments || []).map(c => (c.author === oldName ? { ...c, author: newName } : c));
    });
    writeJsonFile(files.posts, posts);

    const messages = readJsonFile(files.messages);
    messages.forEach(m => {
      if (m.from === oldName) m.from = newName;
      if (m.to === oldName) m.to = newName;
    });
    writeJsonFile(files.messages, messages);

    const users = readJsonFile(files.users);
    users.forEach(u => {
      u.followers = (u.followers || []).map(n => (n === oldName ? newName : n));
      u.following = (u.following || []).map(n => (n === oldName ? newName : n));
      if (u.username === oldName) u.username = newName;
    });
    writeJsonFile(files.users, users);
  },

  async readStories() {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT * FROM stories');
      return rows;
    }
    return readJsonFile(files.stories);
  },

  async writeStories(stories) {
    if (db.usePostgres()) {
      await db.query('DELETE FROM stories');
      for (const s of stories) {
        await db.query(
          'INSERT INTO stories (id, author, media, duration, timestamp, views) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
          [s.id, s.author, s.media, s.duration || 10, s.timestamp, JSON.stringify(s.views || [])]
        );
      }
      return;
    }
    writeJsonFile(files.stories, stories);
  },

  async readVoiceMessages() {
    if (db.usePostgres()) {
      const { rows } = await db.query('SELECT * FROM voice_messages');
      return rows.map(r => ({
        id: Number(r.id),
        from: r.from_user,
        to: r.to_user,
        audioData: r.audio_data,
        timestamp: r.timestamp,
        read: r.read
      }));
    }
    return readJsonFile(files.voice);
  },

  async addVoiceMessage(msg) {
    if (db.usePostgres()) {
      await db.query(
        'INSERT INTO voice_messages (id, from_user, to_user, audio_data, timestamp, read) VALUES ($1,$2,$3,$4,$5,$6)',
        [msg.id, msg.from, msg.to, msg.audioData, msg.timestamp, Boolean(msg.read)]
      );
      return;
    }
    const list = readJsonFile(files.voice);
    list.push(msg);
    writeJsonFile(files.voice, list);
  }
};

module.exports = store;
