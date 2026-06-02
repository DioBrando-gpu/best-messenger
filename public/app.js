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
const btnPostCreate = document.querySelector('#btn-post-create');
const messageText = document.querySelector('#message-text');
const btnSendMessage = document.querySelector('#btn-send-message');
const backToContacts = document.querySelector('#back-to-contacts');
const searchUsersInput = document.querySelector('#search-users');
const searchResults = document.querySelector('#search-results');

let currentChat = null;
let searchTimeout = null;

function showSection(section) {
  pageSections.forEach(sec => sec.classList.toggle('hidden', sec.dataset.section !== section));
  pageTitle.textContent = section === 'feed' ? 'Лента' : section === 'messages' ? 'Сообщения' : 'Профиль';
  navFeed.classList.toggle('active', section === 'feed');
  navMessages.classList.toggle('active', section === 'messages');
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
    setStatus(`Добро пожаловать, ${user.username}! 🔥`);
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
      <div class="post-footer">
        <span class="status">${post.likes.length} ❤</span>
        <button class="like-btn" data-id="${post.id}">Лайк</button>
        <button class="delete-btn" data-id="${post.id}">🗑️</button>
      </div>
    </div>
  `;
  
  const likeBtn = card.querySelector('.like-btn');
  const deleteBtn = card.querySelector('.delete-btn');
  
  likeBtn.addEventListener('click', () => likePost(post.id, card));
  deleteBtn.addEventListener('click', () => deletePost(post.id, card));
  
  return card;
}

async function loadFeed() {
  try {
    const data = await request('/api/feed');
    feedContainer.innerHTML = '';
    data.posts.forEach(post => feedContainer.appendChild(renderPost(post)));
  } catch (error) {
    setStatus(error.message);
  }
}

async function likePost(postId, element) {
  try {
    const data = await request(`/api/posts/${postId}/like`, { method: 'POST' });
    element.querySelector('.status').textContent = `${data.likes.length} ❤`;
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

async function submitPost() {
  try {
    if (!postText.value.trim()) {
      setStatus('Напишите текст поста');
      return;
    }

    const data = await request('/api/posts/create', {
      method: 'POST',
      body: JSON.stringify({
        text: postText.value,
        image: postImage.value || null
      })
    });

    postText.value = '';
    postImage.value = '';
    loadFeed();
    setStatus('Пост опубликован!');
  } catch (error) {
    setStatus(error.message);
  }
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
navProfile?.addEventListener('click', () => showSection('profile'));
backToContacts?.addEventListener('click', () => {
  currentChat = null;
  chatArea.classList.add('hidden');
  contactsList.classList.remove('hidden');
});
searchUsersInput?.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchUsers(e.target.value), 300);
});

showSection('feed');
loadUser();
