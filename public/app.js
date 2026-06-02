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

let currentChat = null;
let searchTimeout = null;
let currentUser = null;
let feedPage = 1;
let feedHasMore = true;
let feedLoading = false;

function showSection(section) {
  pageSections.forEach(sec => sec.classList.toggle('hidden', sec.dataset.section !== section));
  pageTitle.textContent = section === 'feed' ? 'Лента' : section === 'messages' ? 'Сообщения' : section === 'search' ? 'Поиск' : 'Профиль';
  navFeed.classList.toggle('active', section === 'feed');
  navMessages.classList.toggle('active', section === 'messages');
  navSearch?.classList.toggle('active', section === 'search');
  navProfile.classList.toggle('active', section === 'profile');
  
  if (section === 'messages') {
    loadContacts();
    currentChat = null;
    chatArea.classList.add('hidden');
    contactsList.classList.remove('hidden');
  }
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
    setStatus(`Добро пожаловать, ${user.username}! 🔥`);
    feedPage = 1;
    feedHasMore = true;
    loadFeed();
    loadProfile();
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

async function loadContacts() {
  try {
    const data = await request('/api/messages');
    contactsList.innerHTML = '';
    if (!data.contacts || data.contacts.length === 0) {
      contactsList.innerHTML = '<p style="color: #a5b4fc; padding: 20px;">Нет сообщений. Начните общение!</p>';
      return;
    }

    data.contacts.forEach(contact => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-info">
          <div class="contact-avatar">👤</div>
          <div class="contact-text">
            <strong>${contact.name}</strong>
            <small>${contact.lastMessage?.substring(0, 40) || 'Нет сообщений'}</small>
          </div>
          ${contact.unread ? '<div class="contact-unread"></div>' : ''}
        </div>
      `;
      item.addEventListener('click', () => openChat(contact.name));
      contactsList.appendChild(item);
    });
  } catch (error) {
    setStatus(error.message);
  }
}

async function searchUsers(query) {
  if (!query.trim()) {
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
    return;
  }

  try {
    const data = await request(`/api/users/search?q=${encodeURIComponent(query)}`);
    searchResults.innerHTML = '';
    
    if (!data.users || data.users.length === 0) {
      searchResults.innerHTML = '<p style="padding: 10px; color: #a5b4fc;">Пользователей не найдено</p>';
      searchResults.classList.remove('hidden');
      return;
    }

    data.users.forEach(user => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="font-size: 1.5rem;">${user.avatar}</div>
          <div>
            <strong>@${user.username}</strong>
            <small style="display: block; color: #a5b4fc;">${user.bio}</small>
          </div>
        </div>
      `;
      item.addEventListener('click', () => startChat(user.username));
      searchResults.appendChild(item);
    });
    
    searchResults.classList.remove('hidden');
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadSearchPeople() {
  try {
    const data = await request('/api/users/search?q=');
    searchPeopleList.innerHTML = '';
    data.users.forEach(user => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-info">
          <div class="contact-avatar">${user.avatar}</div>
          <div class="contact-text">
            <strong>@${user.username}</strong>
            <small>${user.bio}</small>
          </div>
        </div>
        <button class="btn-primary follow-btn" data-username="${user.username}">Подписаться</button>
      `;
      item.querySelector('.follow-btn')?.addEventListener('click', () => followUser(user.username, item));
      item.addEventListener('click', () => startChat(user.username));
      searchPeopleList.appendChild(item);
    });
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

async function startChat(username) {
  try {
    currentChat = username;
    searchResults.classList.add('hidden');
    searchUsersInput.value = '';
    await openChat(username);
  } catch (error) {
    setStatus(error.message);
  }
}

async function openChat(username) {
  try {
    currentChat = username;
    const data = await request(`/api/chat/${username}`);
    chatMessages.innerHTML = '';
    
    data.messages.forEach(msg => {
      const msgEl = document.createElement('div');
      msgEl.className = msg.from === JSON.parse(sessionStorage.getItem('user') || '{}').username ? 'message sent' : 'message received';
      msgEl.textContent = msg.text;
      chatMessages.appendChild(msgEl);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
    contactsList.classList.add('hidden');
    chatArea.classList.remove('hidden');
  } catch (error) {
    setStatus(error.message);
  }
}

async function sendMessage() {
  try {
    if (!currentChat || !messageText.value.trim()) return;

    await request('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        to: currentChat,
        text: messageText.value
      })
    });

    messageText.value = '';
    openChat(currentChat);
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadProfile() {
  try {
    const data = await request('/api/profile');
    profileContainer.innerHTML = `
      <div class="profile-card">
        <div class="header">
          <div>
            <div style="font-size: 3rem; margin-bottom: 12px;">${data.avatar}</div>
            <strong>@${data.username}</strong>
            <p>${data.bio}</p>
          </div>
        </div>
        <div class="profile-meta">
          <div><strong>${data.posts}</strong> постов</div>
          <div><strong>${data.followers}</strong> подписчиков</div>
          <div><strong>${data.following}</strong> подписок</div>
        </div>
        <div class="status">Добро пожаловать в DIO! 🔥</div>
      </div>
    `;
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

// Заглушка для голосовых сообщений - готово для будущей реализации
async function sendVoiceMessage(audioBlob) {
  // TODO: Реализовать отправку голосовых сообщений
  // const audioData = await blobToBase64(audioBlob);
  // await request('/api/voice/send', {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     to: currentChat,
  //     audioData: audioData
  //   })
  // });
  setStatus('Голосовые сообщения в разработке 🎤');
}

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
backToContacts?.addEventListener('click', () => {
  currentChat = null;
  chatArea.classList.add('hidden');
  contactsList.classList.remove('hidden');
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
  searchTimeout = setTimeout(() => searchUsers(e.target.value), 300);
});

showSection('feed');
loadUser();
