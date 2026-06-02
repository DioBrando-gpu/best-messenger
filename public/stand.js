const standFeed = document.querySelector('#stand-feed');
const standFile = document.querySelector('#stand-file');
const standCaption = document.querySelector('#stand-caption');
const btnStandUpload = document.querySelector('#btn-stand-upload');
const navStand = document.querySelector('#nav-stand');
const standFab = document.querySelector('#stand-fab');
const standUploadModal = document.querySelector('#stand-upload-modal');
const standFileLabelText = document.querySelector('#stand-file-label-text');

let standPage = 1;
let standHasMore = true;
let standLoading = false;

async function loadStandFeed(reset = false) {
  if (!standFeed || standLoading) return;
  if (reset) {
    standPage = 1;
    standHasMore = true;
    standFeed.innerHTML = '';
  }
  if (!standHasMore) return;
  standLoading = true;
  try {
    const data = await request(`/api/stand/feed?page=${standPage}&limit=5`);
    data.stands.forEach(stand => standFeed.appendChild(renderStandSlide(stand)));
    standHasMore = data.hasMore;
    standPage += 1;
    initStandObserver();
  } catch (error) {
    setStatus(error.message);
  } finally {
    standLoading = false;
  }
}

function renderStandSlide(stand) {
  const slide = document.createElement('article');
  slide.className = 'stand-slide';
  slide.dataset.id = stand.id;
  slide.innerHTML = `
    <video class="stand-video" src="${stand.video}" loop playsinline muted></video>
    <div class="stand-overlay">
      <div class="stand-side-actions">
        <button type="button" class="stand-action like-btn" data-id="${stand.id}">❤<span>${stand.likes?.length || 0}</span></button>
        <button type="button" class="stand-action favorite-btn ${stand.isFavorite ? 'favorite-active' : ''}" data-id="${stand.id}">⭐<span>${stand.favorites?.length || 0}</span></button>
        <button type="button" class="stand-action comment-btn" data-id="${stand.id}">💬<span>${stand.comments?.length || 0}</span></button>
        <button type="button" class="stand-action share-btn" data-id="${stand.id}">🔗<span>${stand.shares || 0}</span></button>
        <button type="button" class="stand-action repost-btn" data-id="${stand.id}">↻<span>${stand.reposts || 0}</span></button>
        ${stand.author === window.currentUser ? `<button type="button" class="stand-action delete-stand-btn" data-id="${stand.id}">🗑</button>` : ''}
      </div>
      <div class="stand-info">
        <strong>@${stand.author}</strong>
        <p>${stand.caption || ''}</p>
      </div>
      <div class="stand-comments hidden" id="stand-comments-${stand.id}"></div>
    </div>
  `;

  const video = slide.querySelector('.stand-video');
  slide.querySelector('.like-btn')?.addEventListener('click', () => standLike(stand.id, slide));
  slide.querySelector('.favorite-btn')?.addEventListener('click', () => standFavorite(stand.id, slide));
  slide.querySelector('.comment-btn')?.addEventListener('click', () => toggleStandComments(stand, slide));
  slide.querySelector('.share-btn')?.addEventListener('click', () => standShare(stand.id, slide));
  slide.querySelector('.repost-btn')?.addEventListener('click', () => standRepost(stand.id));
  slide.querySelector('.delete-stand-btn')?.addEventListener('click', () => standDelete(stand.id, slide));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.6 });
  observer.observe(slide);

  return slide;
}

function toggleStandComments(stand, slide) {
  const block = slide.querySelector('.stand-comments');
  block.classList.toggle('hidden');
  if (block.classList.contains('hidden')) return;
  block.innerHTML = `
    ${(stand.comments || []).map(c => `<div class="comment-item"><strong>@${c.author}</strong><p>${c.text}</p></div>`).join('') || '<p class="settings-hint">Нет комментариев</p>'}
    <div class="comment-input-row">
      <input type="text" class="stand-comment-input" placeholder="Комментарий...">
      <button type="button" class="btn-primary stand-comment-send">OK</button>
    </div>
  `;
  block.querySelector('.stand-comment-send')?.addEventListener('click', async () => {
    const input = block.querySelector('.stand-comment-input');
    if (!input?.value.trim()) return;
    const data = await request(`/api/stand/${stand.id}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text: input.value })
    });
    stand.comments = data.comments;
    slide.querySelector('.comment-btn span').textContent = data.comments.length;
    toggleStandComments(stand, slide);
    block.classList.remove('hidden');
  });
}

async function standLike(id, slide) {
  const data = await request(`/api/stand/${id}/like`, { method: 'POST' });
  slide.querySelector('.like-btn span').textContent = data.likes.length;
}

async function standFavorite(id, slide) {
  const data = await request(`/api/stand/${id}/favorite`, { method: 'POST' });
  const btn = slide.querySelector('.favorite-btn');
  btn.querySelector('span').textContent = data.favorites.length;
  btn.classList.toggle('favorite-active', data.favorites.includes(window.currentUser));
}

async function standShare(id, slide) {
  const data = await request(`/api/stand/${id}/share`, { method: 'POST' });
  slide.querySelector('.share-btn span').textContent = data.shares;
  setStatus('Ссылка скопирована в буфер (шаринг)');
  const url = `${location.origin}/?stand=${id}`;
  navigator.clipboard?.writeText(url).catch(() => {});
}

async function standRepost(id) {
  await request(`/api/stand/${id}/repost`, { method: 'POST' });
  loadStandFeed(true);
  setStatus('Репост в Stand');
}

async function standDelete(id, slide) {
  if (!confirm('Удалить видео?')) return;
  await request(`/api/stand/${id}`, { method: 'DELETE' });
  slide.remove();
}

function initStandObserver() {
  if (!standFeed) return;
  standFeed.addEventListener('scroll', () => {
    if (!standHasMore || standLoading) return;
    if (standFeed.scrollTop + standFeed.clientHeight >= standFeed.scrollHeight - 120) {
      loadStandFeed(false);
    }
  }, { once: false });
}

function openStandUploadModal() {
  standUploadModal?.classList.remove('hidden');
}

function closeStandUploadModal() {
  standUploadModal?.classList.add('hidden');
}

standFab?.addEventListener('click', openStandUploadModal);
document.querySelectorAll('[data-close-stand-modal]').forEach(el => {
  el.addEventListener('click', closeStandUploadModal);
});

standFile?.addEventListener('change', () => {
  const name = standFile.files?.[0]?.name;
  if (standFileLabelText) {
    standFileLabelText.textContent = name ? name : 'Выбрать видео';
  }
});

async function publishStandVideo() {
  if (!standFile?.files?.length) {
    setStatus('Выберите видео');
    return;
  }
  const file = standFile.files[0];
  if (file.size > 25 * 1024 * 1024) {
    setStatus('Видео до 25 МБ');
    return;
  }
  const video = await readFileAsDataURL(file);
  await request('/api/stand/create', {
    method: 'POST',
    body: JSON.stringify({ video, caption: standCaption?.value || '' })
  });
  standFile.value = '';
  if (standCaption) standCaption.value = '';
  if (standFileLabelText) standFileLabelText.textContent = 'Выбрать видео';
  closeStandUploadModal();
  loadStandFeed(true);
  setStatus('Опубликовано в Stand');
}

btnStandUpload?.addEventListener('click', async () => {
  try {
    await publishStandVideo();
  } catch (error) {
    setStatus(error.message);
  }
});

navStand?.addEventListener('click', () => {
  showSection('stand');
  loadStandFeed(true);
});


window.loadStandFeed = loadStandFeed;
