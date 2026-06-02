const apiStatus = document.querySelector('#api-status');
const feedContainer = document.querySelector('#feed');
const messagesContainer = document.querySelector('#messages');
const profileContainer = document.querySelector('#profile');
const pageTitle = document.querySelector('#page-title');
const refreshButton = document.querySelector('#refresh-feed');
const navFeed = document.querySelector('#nav-feed');
const navMessages = document.querySelector('#nav-messages');
const navProfile = document.querySelector('#nav-profile');
const btnLogout = document.querySelector('#btn-logout');
const pageSections = document.querySelectorAll('.page-section');

function showSection(section) {
  pageSections.forEach(sec => sec.classList.toggle('hidden', sec.dataset.section !== section));
  pageTitle.textContent = section === 'feed' ? 'Лента' : section === 'messages' ? 'Сообщения' : 'Профиль';
  navFeed.classList.toggle('active', section === 'feed');
  navMessages.classList.toggle('active', section === 'messages');
  navProfile.classList.toggle('active', section === 'profile');
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
    setStatus(`Привет, ${user.username}! Добро пожаловать.`);
    loadFeed();
    loadMessages();
    loadProfile();
  } catch (error) {
    console.error(error);
    window.location.href = '/login.html';
  }
}

function createPost(post) {
  const card = document.createElement('article');
  card.className = 'post-card';
  card.innerHTML = `
    <img src="${post.image}" alt="Пост ${post.id}">
    <div class="post-body">
      <div class="post-meta">
        <strong>@${post.username}</strong>
        <small>${post.time}</small>
      </div>
      <p>${post.description}</p>
      <div class="post-footer">
        <span class="status">${post.likes} ❤</span>
        <button class="like-btn" data-id="${post.id}">Лайк</button>
      </div>
    </div>
  `;
  const likeBtn = card.querySelector('button');
  likeBtn.addEventListener('click', () => {
    post.likes += 1;
    card.querySelector('.status').textContent = `${post.likes} ❤`;
    likeBtn.textContent = '🧡 Нравится';
  });
  return card;
}

async function loadFeed() {
  try {
    const data = await request('/api/feed');
    feedContainer.innerHTML = '';
    data.posts.forEach(post => feedContainer.appendChild(createPost(post)));
  } catch (error) {
    setStatus(error.message);
  }
}

function createMessage(item) {
  const row = document.createElement('div');
  row.className = 'message-row';
  row.innerHTML = `
    <div>
      <strong>${item.contact}</strong>
      <small>${item.text}</small>
    </div>
    <span>${item.unread ? '●' : ''}</span>
  `;
  return row;
}

async function loadMessages() {
  try {
    const data = await request('/api/messages');
    messagesContainer.innerHTML = '';
    data.messages.forEach(item => messagesContainer.appendChild(createMessage(item)));
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
            <strong>@${data.username}</strong>
            <p>${data.bio}</p>
          </div>
          <button class="btn-primary" id="theme-toggle">Тема</button>
        </div>
        <div class="profile-meta">
          <div><strong>${data.posts}</strong> посты</div>
          <div><strong>${data.followers}</strong> подписчики</div>
          <div><strong>${data.following}</strong> подписки</div>
        </div>
        <div class="status">Локальный тестовый профиль</div>
      </div>
    `;
    document.querySelector('#theme-toggle').addEventListener('click', toggleTheme);
  } catch (error) {
    setStatus(error.message);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  if (current === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
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

refreshButton?.addEventListener('click', loadFeed);
btnLogout?.addEventListener('click', logout);
navFeed?.addEventListener('click', () => showSection('feed'));
navMessages?.addEventListener('click', () => showSection('messages'));
navProfile?.addEventListener('click', () => showSection('profile'));

showSection('feed');
loadUser();
