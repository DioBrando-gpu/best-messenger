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
  toggleBottomNav(section);
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
    // Heartbeat — обновлять lastSeen каждые 2 минуты
    setInterval(() => {
      request('/api/user/heartbeat', { method: 'POST' }).catch(() => {});
    }, 120000);
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
  card.querySelectorAll('img[src="' + (post.image || '---') + '"]').forEach(img => {
    img.classList.add('photo-clickable');
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => openPhotoFullscreen(img.src));
  });
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

// Глобальное состояние предпросмотра медиа в форме поста
let postPendingMedia = null; // { data, type, name }

function updatePostMediaPreview() {
  const preview = document.querySelector('#post-media-preview');
  if (!preview) return;
  if (postPendingMedia?.data) {
    preview.classList.remove('hidden');
    if (postPendingMedia.type === 'video') {
      preview.innerHTML = `<video src="${postPendingMedia.data}" controls playsinline muted></video><button type="button" class="media-preview-remove" id="btn-post-media-remove" title="Убрать">×</button>`;
    } else {
      preview.innerHTML = `<img src="${postPendingMedia.data}" alt=""><button type="button" class="media-preview-remove" id="btn-post-media-remove" title="Убрать">×</button>`;
    }
    preview.querySelector('#btn-post-media-remove')?.addEventListener('click', () => {
      postPendingMedia = null;
      if (postFile) postFile.value = '';
      updatePostMediaPreview();
    });
  } else {
    preview.classList.add('hidden');
    preview.innerHTML = '';
  }
}

async function submitPost() {
  try {
    if (!postText.value.trim() && !postPendingMedia) {
      setStatus('Напишите текст или добавьте фото/видео');
      return;
    }

    const data = await request('/api/posts/create', {
      method: 'POST',
      body: JSON.stringify({
        text: postText.value,
        image: postPendingMedia?.type === 'image' ? postPendingMedia.data : (postImage.value || null),
        video: postPendingMedia?.type === 'video' ? postPendingMedia.data : null,
        media: postPendingMedia?.data || null,
        mediaType: postPendingMedia?.type || null
      })
    });

    postText.value = '';
    postImage.value = '';
    if (postFile) postFile.value = '';
    postPendingMedia = null;
    updatePostMediaPreview();
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

// Обработчик выбора фото/видео в форме поста — показываем предпросмотр
postFile?.addEventListener('change', async () => {
  const file = postFile.files?.[0];
  if (!file) return;
  setStatus('Обработка...');
  const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
  try {
    const data = await compressMedia(file, mediaType);
    postPendingMedia = { data, type: mediaType, name: file.name };
    updatePostMediaPreview();
    setStatus(`📎 ${file.name} прикреплён. Можно публиковать.`);
  } catch (e) {
    setStatus('Ошибка обработки файла: ' + e.message);
    if (postFile) postFile.value = '';
  }
});

// ========== Универсальный предпросмотр медиа (модалка) ==========
let mediaPreviewResolver = null;

function openMediaPreviewModal({ title, data, type, withCaption }) {
  const modal = document.querySelector('#media-preview-modal');
  const content = document.querySelector('#media-preview-content');
  const captionEl = document.querySelector('#media-preview-caption');
  const titleEl = document.querySelector('#media-preview-title');
  if (!modal || !content) return Promise.resolve(null);

  titleEl.textContent = title || 'Предпросмотр';
  content.innerHTML = '';
  if (type === 'image') {
    content.innerHTML = `<img src="${data}" alt="">`;
  } else if (type === 'video') {
    content.innerHTML = `<video src="${data}" autoplay loop muted playsinline></video>`;
  } else if (type === 'audio') {
    content.innerHTML = `<audio src="${data}" controls autoplay></audio>`;
  }

  if (withCaption) {
    captionEl.classList.remove('hidden');
    captionEl.value = '';
  } else {
    captionEl.classList.add('hidden');
    captionEl.value = '';
  }

  modal.classList.remove('hidden');

  return new Promise((resolve) => {
    mediaPreviewResolver = resolve;
  });
}

function closeMediaPreviewModal(result) {
  const modal = document.querySelector('#media-preview-modal');
  if (modal) modal.classList.add('hidden');
  if (mediaPreviewResolver) {
    const resolve = mediaPreviewResolver;
    mediaPreviewResolver = null;
    resolve(result);
  }
}

document.querySelectorAll('[data-close-media-preview]').forEach(el => {
  el.addEventListener('click', () => closeMediaPreviewModal(null));
});
document.querySelector('#btn-media-preview-confirm')?.addEventListener('click', () => {
  const captionEl = document.querySelector('#media-preview-caption');
  closeMediaPreviewModal({ confirmed: true, caption: captionEl?.value || '' });
});


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
    if (msg.text) {
      content += escapeHtml(msg.text);
    }
    if (msg.media && msg.mediaType === 'image') {
      content += `<br><img src="${msg.media}" class="msg-media photo-clickable" loading="lazy">`;
    }
    if (msg.media && msg.mediaType === 'video') {
      // Видеосообщение — кружок (как в Telegram)
      content += `<br><video src="${msg.media}" class="msg-video-bubble" controls playsinline></video>`;
    }
    if (msg.voice) {
      content += `<br><audio src="${msg.voice}" class="msg-voice" controls></audio>`;
    }
    msgEl.innerHTML = content || '(пусто)';

    chatMessages.appendChild(msgEl);
  });
  // Клик по фото — полноэкранный просмотр
  chatMessages.querySelectorAll('.photo-clickable').forEach(img => {
    img.addEventListener('click', () => openPhotoFullscreen(img.src));
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openPhotoFullscreen(src) {
  const overlay = document.createElement('div');
  overlay.className = 'photo-fullscreen';
  overlay.innerHTML = `<img src="${src}" alt="">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function toggleBottomNav(section) {
  const bottomNav = document.querySelector('.bottom-nav');
  if (!bottomNav) return;
  const hideSections = ['messages', 'search'];
  bottomNav.style.display = (hideSections.includes(section)) ? 'none' : '';
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
  setStatus('Обработка медиа...');
  const data = await compressMedia(file, mediaType);
  pendingMedia = { data, mediaType, name: file.name };
  updateMediaPreview();
  setStatus(`📎 ${file.name} прикреплён. Отправьте сообщение.`);
  chatMediaInput.value = '';
});

// Сжатие изображений
async function compressMedia(file, mediaType) {
  if (mediaType === 'image') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  return readFileAsDataURL(file);
}

function updateMediaPreview() {
  const preview = document.querySelector('#chat-media-preview');
  if (!preview) return;
  if (pendingMedia?.data) {
    preview.classList.remove('hidden');
    if (pendingMedia.mediaType === 'video') {
      preview.innerHTML = '<video src="' + pendingMedia.data + '" class="chat-preview-media" controls playsinline></video><button type="button" class="chat-preview-remove" title="Убрать">×</button>';
    } else {
      preview.innerHTML = '<img src="' + pendingMedia.data + '" class="chat-preview-media" alt=""><button type="button" class="chat-preview-remove" title="Убрать">×</button>';
    }
    preview.querySelector('.chat-preview-remove').addEventListener('click', () => {
      pendingMedia = null;
      updateMediaPreview();
    });
  } else {
    preview.classList.add('hidden');
    preview.innerHTML = '';
  }
}

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
    updateMediaPreview();
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
        ${data.lastSeenText ? `<p style="font-size:.8rem;color:var(--text-muted)">🕐 ${data.lastSeenText}</p>` : ''}
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
        <h3 style="margin:0 0 8px;font-size:1rem;">${t('username_label')}</h3>
        <p class="settings-hint" id="account-current-username">@${currentUser || ''}</p>
        <label for="set-username">${t('username_new')}</label>
        <input id="set-username" type="text" placeholder="@username" maxlength="32" autocomplete="off" spellcheck="false">
        <p class="settings-hint">${t('username_hint')}</p>
        <p class="settings-hint" id="username-availability" style="min-height:1em;"></p>
        <button type="button" class="btn-primary" id="btn-save-username">${t('change_username')}</button>
      </div>

      <div class="settings-group">
        <h3 style="margin:0 0 8px;font-size:1rem;">${t('email_label')}</h3>
        <p class="settings-hint" id="account-current-email">—</p>
        <label for="set-email">${t('email_label')}</label>
        <input id="set-email" type="email" placeholder="user@example.com" maxlength="120" autocomplete="off" spellcheck="false">
        <p class="settings-hint">${t('email_hint')}</p>
        <button type="button" class="btn-primary" id="btn-save-email">${t('change_email')}</button>
      </div>

      <div class="settings-group">
        <h3 style="margin:0 0 8px;font-size:1rem;">${t('change_password')}</h3>
        <label for="set-old-password">${t('password_current')}</label>
        <input id="set-old-password" type="password" placeholder="••••••" autocomplete="current-password" maxlength="128">
        <label for="set-new-password">${t('password_new')}</label>
        <input id="set-new-password" type="password" placeholder="••••••" autocomplete="new-password" maxlength="128">
        <label for="set-confirm-password">${t('password_confirm')}</label>
        <input id="set-confirm-password" type="password" placeholder="••••••" autocomplete="new-password" maxlength="128">
        <p class="settings-hint">${t('password_hint')}</p>
        <button type="button" class="btn-primary" id="btn-save-password">${t('change_password')}</button>
      </div>

      <div class="settings-group">
        <h3 style="margin:0 0 8px;font-size:1rem;">Bio</h3>
        <label for="set-bio">Bio</label>
        <textarea id="set-bio" rows="3" maxlength="200"></textarea>
        <button type="button" class="btn-primary" id="btn-save-bio">${t('save')}</button>
      </div>
    </div>
  `;

  bindSettingsToggles();
  loadAccountStats();
  loadAccountEmail();
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

  let usernameCheckTimer = null;
  const usernameInput = document.querySelector('#set-username');
  usernameInput?.addEventListener('input', () => {
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(() => checkUsernameAvailability(), 350);
  });
  usernameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      checkUsernameAvailability();
    }
  });

  document.querySelector('#btn-save-username')?.addEventListener('click', async () => {
    const username = normalizeUsername(document.querySelector('#set-username')?.value);
    if (!USERNAME_REGEX.test(username)) {
      setStatus(t('username_hint'));
      return;
    }
    if (username === currentUser) {
      setStatus('Username не изменился');
      return;
    }
    try {
      const result = await request('/api/settings/change-username', {
        method: 'POST',
        body: JSON.stringify({ newUsername: username })
      });
      currentUser = result.username;
      const display = document.querySelector('#account-current-username');
      if (display) display.textContent = '@' + result.username;
      const input = document.querySelector('#set-username');
      if (input) input.value = '';
      window.currentUser = currentUser;
      setStatus(result.message);
      loadProfile();
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector('#btn-save-email')?.addEventListener('click', async () => {
    const email = String(document.querySelector('#set-email')?.value || '').trim();
    if (!email) {
      setStatus('Введите email');
      return;
    }
    try {
      const result = await request('/api/settings/update-email', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      const display = document.querySelector('#account-current-email');
      if (display) display.textContent = result.email || t('email_empty');
      const input = document.querySelector('#set-email');
      if (input) input.value = '';
      setStatus(result.message);
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector('#btn-save-password')?.addEventListener('click', async () => {
    const oldPassword = document.querySelector('#set-old-password')?.value || '';
    const newPassword = document.querySelector('#set-new-password')?.value || '';
    const confirm = document.querySelector('#set-confirm-password')?.value || '';
    if (!oldPassword || !newPassword) {
      setStatus('Заполните все поля пароля');
      return;
    }
    if (newPassword.length < 5) {
      setStatus('Новый пароль: минимум 5 символов');
      return;
    }
    if (newPassword !== confirm) {
      setStatus('Пароли не совпадают');
      return;
    }
    try {
      const result = await request('/api/settings/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword })
      });
      setStatus(result.message);
      document.querySelector('#set-old-password').value = '';
      document.querySelector('#set-new-password').value = '';
      document.querySelector('#set-confirm-password').value = '';
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector('#btn-save-bio')?.addEventListener('click', async () => {
    const bio = document.querySelector('#set-bio')?.value || '';
    try {
      const result = await request('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ bio })
      });
      setStatus(result.message);
      loadProfile();
    } catch (error) {
      setStatus(error.message);
    }
  });
}

async function loadAccountEmail() {
  try {
    const data = await request('/api/settings');
    const display = document.querySelector('#account-current-email');
    if (display) {
      display.textContent = data.email ? data.email : `(${t('email_empty')})`;
    }
    const input = document.querySelector('#set-email');
    if (input && data.email) input.placeholder = data.email;
  } catch (_) { /* ignore */ }
}

function checkUsernameAvailability() {
  const input = document.querySelector('#set-username');
  const hint = document.querySelector('#username-availability');
  if (!input || !hint) return;
  const username = normalizeUsername(input.value);
  if (!username) {
    hint.textContent = '';
    hint.style.color = '';
    return;
  }
  if (username === currentUser) {
    hint.textContent = '— это ваш текущий @username';
    hint.style.color = 'var(--text-muted)';
    return;
  }
  if (!USERNAME_REGEX.test(username)) {
    hint.textContent = t('username_hint');
    hint.style.color = 'var(--text-muted)';
    return;
  }
  request(`/api/users/lookup/${encodeURIComponent(username)}`)
    .then(() => {
      hint.textContent = t('username_taken');
      hint.style.color = '#ef4444';
    })
    .catch((err) => {
      if (err.message && /не найден/i.test(err.message)) {
        hint.textContent = '✓ свободен';
        hint.style.color = '#22c55e';
      } else {
        hint.textContent = '';
        hint.style.color = '';
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
let recordingStream = null;
let recordingVideoEl = null;
let recordingStartTime = 0;
let recordingTimer = null;
let recordingBubbleEl = null;
let recordingIndicatorEl = null;

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function formatRecordingTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

function showVoiceIndicator() {
  hideRecordingUI();
  const el = document.createElement('div');
  el.className = 'voice-recording-indicator';
  el.id = 'voice-recording-indicator';
  el.innerHTML = `
    <span class="voice-recording-dot"></span>
    <span class="voice-recording-time" id="voice-recording-time">0:00</span>
    <span>Идёт запись...</span>
  `;
  document.body.appendChild(el);
  recordingIndicatorEl = el;
  recordingStartTime = Date.now();
  if (recordingTimer) clearInterval(recordingTimer);
  const timeEl = el.querySelector('#voice-recording-time');
  recordingTimer = setInterval(() => {
    if (timeEl) timeEl.textContent = formatRecordingTime(Date.now() - recordingStartTime);
  }, 250);
}

function showVideoBubble(stream) {
  hideRecordingUI();
  const el = document.createElement('div');
  el.className = 'video-bubble recording';
  el.id = 'video-bubble-recording';
  el.innerHTML = `
    <video id="video-bubble-video" autoplay muted playsinline></video>
    <div class="video-bubble-time" id="video-bubble-time">0:00</div>
    <button type="button" class="video-bubble-stop" id="video-bubble-stop" title="Стоп">СТОП</button>
  `;
  document.body.appendChild(el);
  recordingBubbleEl = el;
  recordingVideoEl = el.querySelector('#video-bubble-video');
  if (recordingVideoEl && stream) {
    recordingVideoEl.srcObject = stream;
  }
  recordingStartTime = Date.now();
  if (recordingTimer) clearInterval(recordingTimer);
  const timeEl = el.querySelector('#video-bubble-time');
  recordingTimer = setInterval(() => {
    if (timeEl) timeEl.textContent = formatRecordingTime(Date.now() - recordingStartTime);
  }, 250);
  el.querySelector('#video-bubble-stop')?.addEventListener('click', () => stopRecording());
}

function hideRecordingUI() {
  if (recordingIndicatorEl) {
    recordingIndicatorEl.remove();
    recordingIndicatorEl = null;
  }
  if (recordingBubbleEl) {
    if (recordingVideoEl) {
      recordingVideoEl.pause();
      recordingVideoEl.srcObject = null;
      recordingVideoEl = null;
    }
    recordingBubbleEl.remove();
    recordingBubbleEl = null;
  }
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
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
      : { audio: true, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    recordingStream = stream;
    recordedChunks = [];
    recordingType = type;
    isRecording = true;

    if (type === 'audio') {
      showVoiceIndicator();
    } else {
      showVideoBubble(stream);
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: type === 'audio' ? 'audio/webm' : 'video/webm' });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      isRecording = false;
      hideRecordingUI();
      if (recordingStream) {
        recordingStream.getTracks().forEach(t => t.stop());
        recordingStream = null;
      }

      if (recordedChunks.length === 0) {
        setStatus('Запись прервана');
        return;
      }

      const blob = new Blob(recordedChunks, { type: type === 'audio' ? 'audio/webm' : 'video/webm' });
      const data = await blobToBase64(blob);
      recordedChunks = [];

      // Показываем модалку предпросмотра перед отправкой
      const previewResult = await openMediaPreviewModal({
        title: type === 'audio' ? '🎤 Голосовое сообщение' : '📹 Видеосообщение',
        data,
        type,
        withCaption: false
      });
      if (!previewResult || !previewResult.confirmed) {
        setStatus('Запись отменена');
        return;
      }

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
      setStatus(type === 'audio' ? '🎤 Голосовое отправлено' : '📹 Видеосообщение отправлено');
      playMessageSound();
    };

    mediaRecorder.start();
    setStatus(type === 'audio' ? '🎤 Запись... Нажмите 🎤 ещё раз для остановки' : '📹 Запись видео... Нажмите 📹 ещё раз');
  } catch (err) {
    hideRecordingUI();
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
