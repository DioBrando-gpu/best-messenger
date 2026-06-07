const apiStatus = document.querySelector('#api-status');
const feedContainer = document.querySelector('#feed');
const contactsList = document.querySelector('#contacts-list');
const chatArea = document.querySelector('#chat-area');
const chatMessages = document.querySelector('#chat-messages');
const profileContainer = document.querySelector('#profile');
const pageTitle = document.querySelector('#page-title');
const navFeed = document.querySelector('#nav-feed');
const navMessages = document.querySelector('#nav-messages');
const navProfile = document.querySelector('#nav-profile');
const btnLogout = document.querySelector('#btn-logout');
const pageSections = document.querySelectorAll('.page-section');
const postText = document.querySelector('#post-text');
const postImage = document.querySelector('#post-image');
const postFile = document.querySelector('#post-file');
const btnPostCreate = document.querySelector('#btn-post-create');
const messageText = document.querySelector('#message-text');
const btnSendMessage = document.querySelector('#btn-send-message');
const backToContacts = document.querySelector('#back-to-contacts');
const searchUsersInput = document.querySelector('#search-users');
const searchResults = document.querySelector('#search-results');
const searchPeopleList = document.querySelector('#search-people');
const navSearch = document.querySelector('#nav-search');
const navSettings = document.querySelector('#nav-settings');
const settingsPanels = document.querySelector('#settings-panels');
const userProfileModal = document.querySelector('#user-profile-modal');
const userProfileContent = document.querySelector('#user-profile-content');
const chatHeader = document.querySelector('#chat-header');
const navStand = document.querySelector('#nav-stand');
const groupModal = document.querySelector('#group-modal');
const btnSearchExact = document.querySelector('#btn-search-exact');
const btnMediaUpload = document.querySelector('#btn-media-upload');
const btnVoiceRecord = document.querySelector('#btn-voice-record');
const btnVideoRecord = document.querySelector('#btn-video-record');

const USERNAME_REGEX = /^[a-z0-9_]{5,32}$/;

let currentChat = null;
let currentChatType = 'dm';
let currentGroupId = null;
let searchTimeout = null;
let currentUser = null;
let appSettings = null;
let feedPage = 1;
let feedHasMore = true;
let feedLoading = false;
window.appLang = localStorage.getItem('dio_lang') || 'ru';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme !== 'light');
}

function applyLanguage(lang) {
  window.appLang = lang === 'en' ? 'en' : 'ru';
  localStorage.setItem('dio_lang', window.appLang);
  document.documentElement.lang = window.appLang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (text) el.textContent = text;
  });
  const searchInput = document.querySelector('#search-users');
  if (searchInput) searchInput.placeholder = t('search_placeholder');
}

function playMessageSound() {
  if (!appSettings?.notifications?.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (_) { /* ignore */ }
}

function showSection(section) {
  pageSections.forEach(sec => sec.classList.toggle('hidden', sec.dataset.section !== section));
  const titles = {
    feed: t('title_feed'),
    messages: t('title_messages'),
    search: t('title_search'),
    profile: t('title_profile'),
    settings: t('title_settings'),
    stand: 'Stand'
  };
  pageTitle.textContent = titles[section] || titles.feed;
  navFeed.classList.toggle('active', section === 'feed');
  navMessages.classList.toggle('active', section === 'messages');
  navSearch?.classList.toggle('active', section === 'search');
  navProfile.classList.toggle('active', section === 'profile');
  navSettings?.classList.toggle('active', section === 'settings');
  navStand?.classList.toggle('active', section === 'stand');

  if (section === 'messages') {
    loadContacts();
    currentChat = null;
    chatArea.classList.add('hidden');
    contactsList.classList.remove('hidden');
  }
  if (section === 'settings') {
    renderSettingsUI();
  }
  document.body.classList.toggle('on-stand', section === 'stand');
}

function setStatus(text) {
  if (!apiStatus) return;
  apiStatus.textContent = text;
}

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.message || 'Ошибка сети');
  }
  return json;
}

async function loadUser() {
  try {
    const user = await request('/api/user');
    if (!user.loggedIn) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = user.username;
    appSettings = user.settings || null;
    if (appSettings) {
      applyTheme(appSettings.theme);
      applyLanguage(appSettings.language);
    } else {
      applyTheme(localStorage.getItem('dio_theme') || 'dark');
      applyLanguage(window.appLang);
    }
    setStatus(`Добро пожаловать, @${user.username}! 🔥`);
    feedPage = 1;
    feedHasMore = true;
    loadFeed();
    loadProfile();
    applyLanguage(appSettings?.language || window.appLang);
    initEmojiPickers();
    window.currentUser = currentUser;
  } catch (error) {
    console.error(error);
    window.location.href = '/login.html';
  }
}

function renderPost(post) {
  const card = document.createElement('article');
  card.className = 'post-card';
  card.innerHTML = `
    <div class="post-body">
      <div class="post-meta">
        <strong>${post.avatar} @${post.author}</strong>
        <small>${new Date(post.timestamp).toLocaleString('ru-RU')}</small>
      </div>
      <p>${post.text}</p>
      ${post.image ? `<img src="${post.image}" alt="Пост" style="width:100%; border-radius: 12px; margin: 12px 0;">` : ''}
      <div class="post-actions">
        <button class="like-btn" data-id="${post.id}">❤ ${post.likes.length}</button>
        <button class="favorite-btn ${post.isFavorite ? 'favorite-active' : ''}" data-id="${post.id}">⭐ ${post.favorites?.length || 0}</button>
        <button class="comment-toggle-btn" data-id="${post.id}">💬 ${post.comments?.length || 0}</button>
        <button class="share-btn" data-id="${post.id}">🔗 ${post.shares || 0}</button>
        <button class="repost-btn" data-id="${post.id}">↻ ${post.reposts || 0}</button>
        ${post.author !== currentUser ? `<button class="follow-btn" data-author="${post.author}">${post.isFollowing ? 'Подписано' : 'Подписаться'}</button>` : ''}
        ${post.author === currentUser ? `<button class="delete-btn" data-id="${post.id}">🗑️</button>` : ''}
      </div>
      <div class="post-comments hidden" id="comments-${post.id}">
        ${post.comments?.map(comment => `
          <div class="comment-item">
            <strong>@${comment.author}</strong>
            <p>${comment.text}</p>
            <small>${new Date(comment.timestamp).toLocaleString('ru-RU')}</small>
          </div>
        `).join('') || '<p style="color: #a5b4fc;">Нет комментариев</p>'}
        <div class="comment-input-row">
          <input class="comment-input" type="text" placeholder="Написать комментарий..." data-id="${post.id}">
          <button class="btn-primary comment-send-btn" data-id="${post.id}">Отправить</button>
        </div>
      </div>
    </div>
  `;
  
  const likeBtn = card.querySelector('.like-btn');
  const favoriteBtn = card.querySelector('.favorite-btn');
  const commentToggleBtn = card.querySelector('.comment-toggle-btn');
  const shareBtn = card.querySelector('.share-btn');
  const repostBtn = card.querySelector('.repost-btn');
  const followBtn = card.querySelector('.follow-btn');
  const commentSendBtn = card.querySelector('.comment-send-btn');
  const commentInput = card.querySelector('.comment-input');
  const commentsBlock = card.querySelector('.post-comments');
  const deleteBtn = card.querySelector('.delete-btn');
  
  favoriteBtn?.addEventListener('click', () => favoritePost(post.id, card));
  commentToggleBtn?.addEventListener('click', () => commentsBlock.classList.toggle('hidden'));
  shareBtn?.addEventListener('click', () => sharePost(post.id, card));
  repostBtn?.addEventListener('click', () => repostPost(post.id));
  likeBtn?.addEventListener('click', () => likePost(post.id, card));
  followBtn?.addEventListener('click', () => followUser(post.author, followBtn));
  commentSendBtn?.addEventListener('click', () => submitComment(post.id, commentInput, card));
  deleteBtn?.addEventListener('click', () => deletePost(post.id, card));
  
  return card;
}

async function loadFeed() {
  feedLoading = true;
  try {
    const data = await request(`/api/feed?page=${feedPage}&limit=6`);
    if (feedPage === 1) {
      feedContainer.innerHTML = '';
    }
    data.posts.forEach(post => feedContainer.appendChild(renderPost(post)));
    feedHasMore = data.hasMore;
  } catch (error) {
    setStatus(error.message);
  } finally {
    feedLoading = false;
  }
}

async function likePost(postId, element) {
  try {
    const data = await request(`/api/posts/${postId}/like`, { method: 'POST' });
    const likeBtn = element.querySelector('.like-btn');
    if (likeBtn) {
      likeBtn.textContent = `❤ ${data.likes.length}`;
    }
  } catch (error) {
    setStatus(error.message);
  }
}

async function deletePost(postId, element) {
  if (!confirm('Удалить пост?')) return;
  try {
    await request(`/api/posts/${postId}`, { method: 'DELETE' });
    element.remove();
    loadFeed();
  } catch (error) {
    setStatus(error.message);
  }
}

async function favoritePost(postId, card) {
  try {
    const data = await request(`/api/posts/${postId}/favorite`, { method: 'POST' });
    const favoriteBtn = card.querySelector('.favorite-btn');
    favoriteBtn.textContent = `⭐ ${data.favorites.length}`;
    favoriteBtn.classList.toggle('favorite-active', data.favorites.includes(currentUser));
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitComment(postId, input, card) {
  if (!input?.value.trim()) return;
  try {
    const data = await request(`/api/posts/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text: input.value })
    });
    input.value = '';
    const commentsBlock = card.querySelector('.post-comments');
    if (commentsBlock) {
      const comment = data.comments[data.comments.length - 1];
      const commentItem = document.createElement('div');
      commentItem.className = 'comment-item';
      commentItem.innerHTML = `
        <strong>@${comment.author}</strong>
        <p>${comment.text}</p>
        <small>${new Date(comment.timestamp).toLocaleString('ru-RU')}</small>
      `;
      commentsBlock.insertBefore(commentItem, commentsBlock.querySelector('.comment-input-row'));
    }
    const commentToggleBtn = card.querySelector('.comment-toggle-btn');
    commentToggleBtn.textContent = `💬 ${data.comments.length}`;
  } catch (error) {
    setStatus(error.message);
  }
}

async function sharePost(postId, card) {
  try {
    const data = await request(`/api/posts/${postId}/share`, { method: 'POST' });
    const shareBtn = card.querySelector('.share-btn');
    shareBtn.textContent = `🔗 ${data.shares}`;
    setStatus('Пост готов к шарингу!');
  } catch (error) {
    setStatus(error.message);
  }
}

async function repostPost(postId) {
  try {
    await request(`/api/posts/${postId}/repost`, { method: 'POST' });
    loadFeed();
    setStatus('Пост репостнут друзьям!');
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitPost() {
  try {
    if (!postText.value.trim()) {
      setStatus('Напишите текст поста');
      return;
    }

    let imageData = null;
    if (postFile?.files?.length > 0) {
      const file = postFile.files[0];
      imageData = await readFileAsDataURL(file);
    }

    const data = await request('/api/posts/create', {
      method: 'POST',
      body: JSON.stringify({
        text: postText.value,
        image: imageData || postImage.value || null
      })
    });

    postText.value = '';
    postImage.value = '';
    if (postFile) postFile.value = '';
    feedPage = 1;
    feedHasMore = true;
    loadFeed();
    setStatus('Пост опубликован!');
  } catch (error) {
    setStatus(error.message);
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initEmojiPickers() {
  attachEmojiPicker({
    toggleBtn: document.querySelector('#post-emoji-toggle'),
    panel: document.querySelector('#post-emoji-panel'),
    input: postText
  });
  attachEmojiPicker({
    toggleBtn: document.querySelector('#msg-emoji-toggle'),
    panel: document.querySelector('#msg-emoji-panel'),
    input: messageText
  });
}

async function loadContacts() {
  try {
    const data = await request('/api/messages');
    contactsList.innerHTML = '';
    if (!data.contacts || data.contacts.length === 0) {
      contactsList.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">Нет чатов. Найдите @username в поиске или создайте группу.</p>';
      return;
    }

    data.contacts.forEach(contact => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      const icon = contact.type === 'channel' ? '📢' : contact.type === 'group' ? '👥' : '👤';
      item.innerHTML = `
        <div class="contact-info">
          <div class="contact-avatar">${icon}</div>
          <div class="contact-text">
            <strong>${contact.displayName || contact.name}</strong>
            <small>${contact.lastMessage?.substring(0, 40) || 'Нет сообщений'}</small>
          </div>
          ${contact.unread ? '<div class="contact-unread"></div>' : ''}
        </div>
      `;
      item.addEventListener('click', () => {
        if (contact.type === 'group' || contact.type === 'channel') {
          openGroupChat(contact.id, contact.displayName);
        } else {
          openDmChat(contact.name);
        }
      });
      contactsList.appendChild(item);
    });
  } catch (error) {
    setStatus(error.message);
  }
}

function renderSearchUserItem(user, container, { compact = false } = {}) {
  const item = document.createElement('div');
  item.className = compact ? 'search-result-item' : 'contact-item';
  item.innerHTML = `
    <div class="contact-info" style="flex:1">
      <div class="contact-avatar">${user.avatar || '👤'}</div>
      <div class="contact-text">
        <strong>@${user.username}</strong>
        <small>${user.profileVisible === false ? t('profile_hidden') : user.bio}</small>
      </div>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn-primary btn-view-profile" data-username="${user.username}">${t('view_profile')}</button>
      <button type="button" class="btn-primary btn-chat-user" data-username="${user.username}" ${user.canMessage ? '' : 'disabled title="Нельзя написать (настройки приватности)"'}>${t('write_message')}</button>
    </div>
  `;
  item.querySelector('.btn-view-profile')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openUserProfile(user.username);
  });
  item.querySelector('.btn-chat-user')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!user.canMessage) {
      setStatus('Пользователь ограничил входящие сообщения');
      return;
    }
    startDmChat(user.username);
  });
  container.appendChild(item);
}

async function lookupExactUsername(username) {
  const q = normalizeUsername(username);
  if (!USERNAME_REGEX.test(q)) {
    setStatus(t('username_hint'));
    return;
  }
  try {
    const user = await request(`/api/users/lookup/${encodeURIComponent(q)}`);
    searchResults.innerHTML = '';
    renderSearchUserItem(user, searchResults, { compact: true });
    searchResults.classList.remove('hidden');
    setStatus(`Найден @${user.username}`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function searchUsers(query) {
  const q = normalizeUsername(query);
  if (!q) {
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
    return;
  }

  try {
    const data = await request(`/api/users/search?q=${encodeURIComponent(q)}`);
    searchResults.innerHTML = '';

    if (!data.users || data.users.length === 0) {
      searchResults.innerHTML = `<p style="padding: 10px; color: var(--text-muted);">—</p>`;
      searchResults.classList.remove('hidden');
      return;
    }

    data.users.forEach(user => renderSearchUserItem(user, searchResults, { compact: true }));
    searchResults.classList.remove('hidden');
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadSearchPeople() {
  try {
    const data = await request('/api/users/search?q=');
    searchPeopleList.innerHTML = '';
    data.users.forEach(user => renderSearchUserItem(user, searchPeopleList));
  } catch (error) {
    setStatus(error.message);
  }
}

async function followUser(username, item) {
  try {
    await request(`/api/users/${username}/follow`, { method: 'POST' });
    if (item instanceof HTMLButtonElement) {
      item.textContent = 'Подписано';
    } else if (item instanceof HTMLElement) {
      const btn = item.querySelector('.follow-btn');
      if (btn) btn.textContent = 'Подписано';
    } else if (item?.textContent !== undefined) {
      item.textContent = 'Подписано';
    }
  } catch (error) {
    setStatus(error.message);
  }
}

async function startDmChat(username) {
  showSection('messages');
  searchResults?.classList.add('hidden');
  if (searchUsersInput) searchUsersInput.value = '';
  userProfileModal?.classList.add('hidden');
  await openDmChat(username);
}

async function openDmChat(username) {
  currentChatType = 'dm';
  currentGroupId = null;
  currentChat = normalizeUsername(username);
  const data = await request(`/api/chat/dm/${encodeURIComponent(currentChat)}`);
  renderChatMessages(data.messages);
  if (chatHeader) {
    chatHeader.innerHTML = `<strong>@${data.withUser}</strong> <button type="button" class="btn-sm btn-primary" id="chat-profile-btn">Профиль</button>`;
    document.querySelector('#chat-profile-btn')?.addEventListener('click', () => openUserProfile(data.withUser));
  }
  contactsList.classList.add('hidden');
  chatArea.classList.remove('hidden');
}

async function openGroupChat(groupId, title) {
  currentChatType = 'group';
  currentGroupId = groupId;
  currentChat = groupId;
  const data = await request(`/api/chat/group/${encodeURIComponent(groupId)}`);
  renderChatMessages(data.messages, true);
  if (chatHeader) {
    chatHeader.innerHTML = `<strong>${title || data.group?.title || 'Чат'}</strong>`;
  }
  contactsList.classList.add('hidden');
  chatArea.classList.remove('hidden');
}

function renderChatMessages(messages, isGroup = false) {
  chatMessages.innerHTML = '';
  messages.forEach(msg => {
    const msgEl = document.createElement('div');
    const mine = msg.from === currentUser;
    msgEl.className = `message ${mine ? 'sent' : 'received'}`;
    let content = '';
    if (isGroup && !mine) {
      content += `<small>@${msg.from}</small><br>`;
    }
    // Текст
    if (msg.text) {
      content += escapeHtml(msg.text);
    }
    // Медиа (фото/видео)
    if (msg.media && msg.mediaType === 'image') {
      content += `<br><img src="${msg.media}" class="msg-media" loading="lazy">`;
    }
    if (msg.media && msg.mediaType === 'video') {
      content += `<br><video src="${msg.media}" class="msg-media" controls playsinline></video>`;
    }
    // Голосовое
    if (msg.voice) {
      content += `<br><audio src="${msg.voice}" class="msg-voice" controls></audio>`;
    }
    msgEl.innerHTML = content || '(пусто)';
    chatMessages.appendChild(msgEl);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// Скрытый input для загрузки медиа в чат
const chatMediaInput = document.createElement('input');
chatMediaInput.type = 'file';
chatMediaInput.accept = 'image/*,video/*';
chatMediaInput.style.display = 'none';
document.body.appendChild(chatMediaInput);

// Флаг отправки медиа (ставим перед отправкой)
let pendingMedia = null; // { data, type }

btnMediaUpload?.addEventListener('click', () => {
  chatMediaInput.click();
});

chatMediaInput.addEventListener('change', async () => {
  const file = chatMediaInput.files?.[0];
  if (!file) return;
  const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
  const data = await readFileAsDataURL(file);
  pendingMedia = { data, mediaType };
  setStatus(`📎 ${file.name} прикреплён. Отправьте сообщение.`);
  chatMediaInput.value = '';
});

async function sendMessage() {
  try {
    if (!currentChat) return;
    const text = messageText.value.trim();
    const hasMedia = pendingMedia?.data;
    if (!text && !hasMedia) return;

    const body = {
      text: text || '',
      ...(pendingMedia ? { media: pendingMedia.data, mediaType: pendingMedia.mediaType } : {})
    };
    if (currentChatType === 'group') {
      body.groupId = currentGroupId;
    } else {
      body.to = currentChat;
    }

    await request('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    messageText.value = '';
    pendingMedia = null;
    if (currentChatType === 'group') {
      await openGroupChat(currentGroupId);
    } else {
      await openDmChat(currentChat);
    }
    playMessageSound();
  } catch (error) {
    setStatus(error.message);
  }
}

async function openUserProfile(username) {
  try {
    const data = await request(`/api/users/${encodeURIComponent(username)}/profile`);
    userProfileContent.innerHTML = `
      <div class="user-profile-view">
        <div style="font-size:3rem">${data.avatar || '👤'}</div>
        <div class="handle-badge">@${data.username}</div>
        <p>${data.profileVisible === false ? t('profile_hidden') : data.bio}</p>
        ${data.profileVisible !== false ? `
          <div class="profile-meta">
            <div><strong>${data.posts ?? 0}</strong> ${t('posts')}</div>
            <div><strong>${data.followers ?? 0}</strong> ${t('followers')}</div>
            <div><strong>${data.following ?? 0}</strong> ${t('following_count')}</div>
          </div>
        ` : ''}
        <div class="profile-actions">
          ${data.username !== currentUser ? `
            <button type="button" class="btn-primary" id="modal-follow-btn">${data.isFollowing ? t('following') : t('follow')}</button>
          ` : ''}
          ${data.canMessage ? `<button type="button" class="btn-primary" id="modal-chat-btn">${t('write_message')}</button>` : ''}
        </div>
      </div>
    `;
    document.querySelector('#modal-follow-btn')?.addEventListener('click', async (e) => {
      await followUser(data.username, e.target);
      openUserProfile(data.username);
    });
    document.querySelector('#modal-chat-btn')?.addEventListener('click', () => {
      userProfileModal.classList.add('hidden');
      showSection('messages');
      startDmChat(data.username);
    });
    userProfileModal.classList.remove('hidden');
  } catch (error) {
    setStatus(error.message);
  }
}

function closeUserProfileModal() {
  userProfileModal?.classList.add('hidden');
}

async function saveSettings(partial) {
  appSettings = {
    notifications: { enabled: true, sound: true, messagePreview: true, posts: true, ...appSettings?.notifications },
    privacy: { profileVisible: true, allowMessages: 'everyone', showLastSeen: true, ...appSettings?.privacy },
    language: window.appLang,
    theme: document.body.classList.contains('theme-light') ? 'light' : 'dark',
    ...appSettings,
    ...partial,
    notifications: { ...appSettings?.notifications, ...partial?.notifications },
    privacy: { ...appSettings?.privacy, ...partial?.privacy }
  };
  const result = await request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings: appSettings })
  });
  appSettings = result.settings;
  applyTheme(appSettings.theme);
  applyLanguage(appSettings.language);
  localStorage.setItem('dio_theme', appSettings.theme);
  setStatus(t('settings_saved'));
}

function renderSettingsUI() {
  if (!settingsPanels) return;
  const s = appSettings || {
    notifications: { enabled: true, sound: true, messagePreview: true, posts: true },
    privacy: { profileVisible: true, allowMessages: 'everyone', showLastSeen: true },
    language: window.appLang,
    theme: 'dark'
  };

  settingsPanels.innerHTML = `
    <div class="settings-panel" data-panel="notifications">
      <div class="settings-group">
        ${settingsToggleRow('notif_enabled', 'set-notif-enabled', s.notifications.enabled)}
        ${settingsToggleRow('notif_sound', 'set-notif-sound', s.notifications.sound)}
        ${settingsToggleRow('notif_preview', 'set-notif-preview', s.notifications.messagePreview)}
        ${settingsToggleRow('notif_posts', 'set-notif-posts', s.notifications.posts)}
      </div>
    </div>
    <div class="settings-panel hidden" data-panel="privacy">
      <div class="settings-group">
        ${settingsToggleRow('privacy_profile', 'set-privacy-profile', s.privacy.profileVisible)}
        <div class="settings-row">
          <label for="set-privacy-messages">${t('privacy_messages')}</label>
          <select id="set-privacy-messages">
            <option value="everyone" ${s.privacy.allowMessages === 'everyone' ? 'selected' : ''}>${t('privacy_everyone')}</option>
            <option value="followers" ${s.privacy.allowMessages === 'followers' ? 'selected' : ''}>${t('privacy_followers')}</option>
            <option value="nobody" ${s.privacy.allowMessages === 'nobody' ? 'selected' : ''}>${t('privacy_nobody')}</option>
          </select>
        </div>
        ${settingsToggleRow('privacy_lastseen', 'set-privacy-lastseen', s.privacy.showLastSeen)}
      </div>
    </div>
    <div class="settings-panel hidden" data-panel="data">
      <div class="settings-group">
        <p class="settings-hint" id="account-stats-text">${t('data_stats')}...</p>
        <button type="button" class="btn-primary" id="btn-clear-local">${t('data_clear')}</button>
        <p class="settings-hint">${t('data_clear_hint')}</p>
      </div>
    </div>
    <div class="settings-panel hidden" data-panel="appearance">
      <div class="settings-group">
        ${settingsToggleRow('theme_dark', 'set-theme-dark', s.theme !== 'light')}
        <div class="settings-row">
          <label for="set-language">${t('language')}</label>
          <select id="set-language">
            <option value="ru" ${s.language === 'ru' ? 'selected' : ''}>Русский</option>
            <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
          </select>
        </div>
      </div>
    </div>
    <div class="settings-panel hidden" data-panel="account">
      <div class="settings-group">
        <label for="set-username">${t('username_label')}</label>
        <input id="set-username" type="text" value="${currentUser || ''}" maxlength="32" autocomplete="off" spellcheck="false">
        <p class="settings-hint">${t('username_hint')}</p>
        <label for="set-bio">Bio</label>
        <textarea id="set-bio" rows="3" maxlength="200"></textarea>
        <button type="button" class="btn-primary" id="btn-save-account">${t('save')}</button>
      </div>
    </div>
  `;

  bindSettingsToggles();
  loadAccountStats();
  request('/api/profile').then(p => {
    const bioEl = document.querySelector('#set-bio');
    if (bioEl) bioEl.value = p.bio || '';
  }).catch(() => {});

  document.querySelector('#btn-clear-local')?.addEventListener('click', () => {
    localStorage.removeItem('dio_theme');
    localStorage.removeItem('dio_lang');
    setStatus('OK');
  });

  document.querySelector('#set-privacy-messages')?.addEventListener('change', (e) => {
    saveSettings({ privacy: { allowMessages: e.target.value } });
  });

  document.querySelector('#set-language')?.addEventListener('change', (e) => {
    saveSettings({ language: e.target.value });
  });

  document.querySelector('#set-theme-dark')?.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    applyTheme(theme);
    saveSettings({ theme });
  });

  document.querySelector('#btn-save-account')?.addEventListener('click', async () => {
    const username = normalizeUsername(document.querySelector('#set-username')?.value);
    const bio = document.querySelector('#set-bio')?.value || '';
    if (!USERNAME_REGEX.test(username)) {
      setStatus(t('username_hint'));
      return;
    }
    try {
      const result = await request('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username, bio })
      });
      currentUser = result.username;
      setStatus(result.message);
      loadProfile();
    } catch (error) {
      setStatus(error.message);
    }
  });
}

function settingsToggleRow(i18nKey, id, checked) {
  return `
    <div class="settings-row">
      <label for="${id}">${t(i18nKey)}</label>
      <label class="toggle">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

function bindSettingsToggles() {
  const map = [
    ['set-notif-enabled', 'notifications', 'enabled'],
    ['set-notif-sound', 'notifications', 'sound'],
    ['set-notif-preview', 'notifications', 'messagePreview'],
    ['set-notif-posts', 'notifications', 'posts'],
    ['set-privacy-profile', 'privacy', 'profileVisible'],
    ['set-privacy-lastseen', 'privacy', 'showLastSeen']
  ];
  map.forEach(([id, section, key]) => {
    document.querySelector(`#${id}`)?.addEventListener('change', (e) => {
      saveSettings({ [section]: { [key]: e.target.checked } });
    });
  });
}

async function loadAccountStats() {
  try {
    const stats = await request('/api/account/stats');
    const el = document.querySelector('#account-stats-text');
    if (el) {
      el.textContent = `${t('data_stats')}: ${stats.messagesCount} сообщ., ${stats.postsCount} ${t('posts')}.`;
    }
  } catch (_) { /* ignore */ }
}

async function loadProfile() {
  try {
    const data = await request('/api/profile');
    appSettings = data.settings || appSettings;
    profileContainer.innerHTML = `
      <div class="profile-card">
        <div class="header">
          <div>
            <div style="font-size: 3rem; margin-bottom: 12px;">${data.avatar}</div>
            <strong class="handle-badge">@${data.username}</strong>
            <p>${data.bio}</p>
          </div>
        </div>
        <div class="profile-meta">
          <div><strong>${data.posts}</strong> ${t('posts')}</div>
          <div><strong>${data.followers}</strong> ${t('followers')}</div>
          <div><strong>${data.following}</strong> ${t('following_count')}</div>
        </div>
        <button type="button" class="btn-primary" id="btn-open-settings">${t('nav_settings')}</button>
        <div class="status">DIO 🔥</div>
      </div>
    `;
    document.querySelector('#btn-open-settings')?.addEventListener('click', () => showSection('settings'));
  } catch (error) {
    setStatus(error.message);
  }
}

async function logout() {
  try {
    await request('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  } catch (error) {
    setStatus(error.message);
  }
}

// ========== ГОЛОСОВЫЕ И ВИДЕОСООБЩЕНИЯ ==========

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingType = null; // 'audio' | 'video'

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function startRecording(type) {
  try {
    if (!currentChat) {
      setStatus('Сначала откройте чат');
      return;
    }
    if (isRecording) return;

    const constraints = type === 'audio'
      ? { audio: true }
      : { audio: true, video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 480 } } };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    recordedChunks = [];
    recordingType = type;
    isRecording = true;

    mediaRecorder = new MediaRecorder(stream, { mimeType: type === 'audio' ? 'audio/webm' : 'video/webm' });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      isRecording = false;
      stream.getTracks().forEach(t => t.stop());

      if (recordedChunks.length === 0) {
        setStatus('Запись прервана');
        return;
      }

      const blob = new Blob(recordedChunks, { type: type === 'audio' ? 'audio/webm' : 'video/webm' });
      const data = await blobToBase64(blob);

      recordedChunks = [];
      setStatus('Отправка...');

      const body = { text: '' };
      if (type === 'audio') {
        body.voice = data;
      } else {
        body.media = data;
        body.mediaType = 'video';
      }
      if (currentChatType === 'group') {
        body.groupId = currentGroupId;
      } else {
        body.to = currentChat;
      }

      await request('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (currentChatType === 'group') {
        await openGroupChat(currentGroupId);
      } else {
        await openDmChat(currentChat);
      }
      setStatus(type === 'audio' ? '🎤 Голосовое отправлено' : '📹 Видео отправлено');
      playMessageSound();
    };

    mediaRecorder.start();
    setStatus(type === 'audio' ? '🎤 Запись... Нажмите 🎤 ещё раз для остановки' : '📹 Запись видео... Нажмите 📹 ещё раз');
  } catch (err) {
    setStatus('Ошибка доступа к микрофону/камере: ' + err.message);
    isRecording = false;
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
  }
}

btnVoiceRecord?.addEventListener('click', () => {
  if (isRecording && recordingType === 'audio') {
    stopRecording();
  } else {
    startRecording('audio');
  }
});

btnVideoRecord?.addEventListener('click', () => {
  if (isRecording && recordingType === 'video') {
    stopRecording();
  } else {
    startRecording('video');
  }
});

// Заглушка для stories - готово для будущей реализации  
async function createStory(mediaData) {
  // TODO: Реализовать создание stories
  // await request('/api/stories/create', {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     media: mediaData,
  //     duration: 10
  //   })
  // });
  setStatus('Stories в разработке 🎬');
}

async function loadStories() {
  // TODO: Загрузить stories после реализации
  // try {
  //   const data = await request('/api/stories/feed');
  //   console.log('Stories:', data.stories);
  // } catch (error) {
  //   setStatus(error.message);
  // }
}

btnPostCreate?.addEventListener('click', submitPost);
btnSendMessage?.addEventListener('click', sendMessage);
messageText?.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());
btnLogout?.addEventListener('click', logout);
navFeed?.addEventListener('click', () => showSection('feed'));
navMessages?.addEventListener('click', () => showSection('messages'));
navSearch?.addEventListener('click', () => { showSection('search'); loadSearchPeople(); });
navProfile?.addEventListener('click', () => showSection('profile'));
navSettings?.addEventListener('click', () => showSection('settings'));
navStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });

// Нижняя навигация для мобильных
document.querySelector('#bnav-feed')?.addEventListener('click', () => showSection('feed'));
document.querySelector('#bnav-messages')?.addEventListener('click', () => showSection('messages'));
document.querySelector('#bnav-stand')?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });
document.querySelector('#bnav-search')?.addEventListener('click', () => { showSection('search'); loadSearchPeople(); });
document.querySelector('#bnav-profile')?.addEventListener('click', () => showSection('profile'));

// Синхронизация активной кнопки в нижней навигации
const origShowSection = window.showSection || showSection;
showSection = function(section) {
  origShowSection(section);
  document.querySelectorAll('.bnav-btn').forEach(btn => btn.classList.remove('active'));
  const map = { feed: 'bnav-feed', messages: 'bnav-messages', stand: 'bnav-stand', search: 'bnav-search', profile: 'bnav-profile' };
  const activeId = map[section];
  if (activeId) document.querySelector('#' + activeId)?.classList.add('active');
};

document.querySelector('#settings-nav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.settings-nav-btn');
  if (!btn) return;
  const panel = btn.dataset.settingsPanel;
  document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.settings-panel').forEach(p => {
    p.classList.toggle('hidden', p.dataset.panel !== panel);
  });
});

document.querySelectorAll('[data-close-modal]').forEach(el => {
  el.addEventListener('click', closeUserProfileModal);
});
backToContacts?.addEventListener('click', () => {
  currentChat = null;
  currentGroupId = null;
  chatArea.classList.add('hidden');
  contactsList.classList.remove('hidden');
  loadContacts();
});

btnSearchExact?.addEventListener('click', () => lookupExactUsername(searchUsersInput?.value));
searchUsersInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    lookupExactUsername(searchUsersInput.value);
  }
});

document.querySelector('#btn-new-group')?.addEventListener('click', () => {
  groupModal?.classList.remove('hidden');
});
document.querySelectorAll('[data-close-group-modal]').forEach(el => {
  el.addEventListener('click', () => groupModal?.classList.add('hidden'));
});
document.querySelector('#btn-group-create')?.addEventListener('click', async () => {
  try {
    const title = document.querySelector('#group-title')?.value;
    const type = document.querySelector('#group-type')?.value;
    const slug = document.querySelector('#group-slug')?.value;
    const result = await request('/api/groups/create', {
      method: 'POST',
      body: JSON.stringify({ title, type, slug: slug || undefined })
    });
    groupModal?.classList.add('hidden');
    setStatus('Группа создана');
    showSection('messages');
    await openGroupChat(result.group.id, result.group.title);
    loadContacts();
  } catch (error) {
    setStatus(error.message);
  }
});
window.addEventListener('scroll', () => {
  if (!feedHasMore || feedLoading) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
    feedPage += 1;
    loadFeed();
  }
});
searchUsersInput?.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const value = normalizeUsername(e.target.value);
  if (e.target.value !== value) e.target.value = value.replace(/[^a-z0-9_]/g, '');
  searchTimeout = setTimeout(() => searchUsers(e.target.value), 300);
});

applyTheme(localStorage.getItem('dio_theme') || 'dark');
applyLanguage(window.appLang);
showSection('feed');
loadUser();

// Глобальные экспорты функций для stand.js
window.request = request;
window.setStatus = setStatus;
window.readFileAsDataURL = readFileAsDataURL;
window.attachEmojiPicker = attachEmojiPicker;
