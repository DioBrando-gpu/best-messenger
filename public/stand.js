const standFeed = document.querySelector('#stand-feed');
const standFab = document.querySelector('#stand-fab');

let standPage = 1;
let standHasMore = true;
let standLoading = false;

// Скрытый input для выбора видео
const standFileInput = document.createElement('input');
standFileInput.type = 'file';
standFileInput.accept = 'video/*,image/*';
standFileInput.style.display = 'none';
document.body.appendChild(standFileInput);

// ========== ЗАГРУЗКА ЛЕНТЫ ==========

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
    if (data && data.stands) data.stands.forEach(stand => standFeed.appendChild(renderStandSlide(stand)));
    standHasMore = data.hasMore;
    standPage += 1;
    initStandObserver();
  } catch (error) {
    setStatus(error.message);
  } finally {
    standLoading = false;
  }
}

// ========== РЕНДЕР СЛАЙДА (Reels/TikTok стиль) ==========

function renderStandSlide(stand) {
  const slide = document.createElement('article');
  slide.className = 'stand-slide';
  slide.dataset.id = stand.id;
  slide.innerHTML = `
    <video class="stand-video" src="${stand.video}" loop playsinline muted preload="metadata"></video>
    <div class="stand-overlay">
      <div class="stand-side-actions">
        <div class="stand-avatar-wrap" style="position:absolute;bottom:120px;left:16px;z-index:10;display:flex;flex-direction:column;align-items:center;gap:4px;">
        ${stand.avatarImage ? `<img src="${stand.avatarImage}" class="stand-avatar-img" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4);cursor:pointer;" data-author="${stand.author}">` : `<div class="stand-avatar-placeholder" style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:1.3rem;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4);color:white;" data-author="${stand.author}">${stand.avatar || '\u{1F464}'}</div>`}
        ${stand.author !== window.currentUser ? `<button type="button" class="stand-follow-btn" style="width:24px;height:24px;border-radius:50%;background:#8b5cf6;border:2px solid #fff;color:white;font-size:1.1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;" data-author="${stand.author}" title="\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F">+</button>` : ''}
      </div>
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

  // Автоплей при попадании в зону видимости - улучшенная версия
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    });
  }, { threshold: 0.5 });
  observer.observe(slide);

  return slide;
}

// ========== ДЕЙСТВИЯ ==========

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
  try {
    const data = await request(`/api/stand/${id}/like`, { method: 'POST' });
    if (data && slide) {
      const likeBtn = slide.querySelector('.like-btn');
      if (likeBtn) {
        likeBtn.classList.toggle('like-active', data.likes && data.likes.includes(window.currentUser));
        const span = likeBtn.querySelector('span');
        if (span) span.textContent = data.likes ? data.likes.length : 0;
      }
    }
  } catch (e) { console.error(e); }
}

async function standFavorite(id, slide) {
  try {
    const data = await request(`/api/stand/${id}/favorite`, { method: 'POST' });
    if (data && slide) {
      const btn = slide.querySelector('.favorite-btn');
      if (btn) {
        const span = btn.querySelector('span');
        if (span) span.textContent = data.favorites ? data.favorites.length : 0;
        btn.classList.toggle('favorite-active', data.favorites && data.favorites.includes(window.currentUser));
      }
    }
  } catch (e) { console.error(e); }
}

async function standShare(id, slide) {
  const data = await request(`/api/stand/${id}/share`, { method: 'POST' });
  slide.querySelector('.share-btn span').textContent = data.shares;
  setStatus('Ссылка скопирована в буфер');
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

// ========== БЕСКОНЕЧНЫЙ СКРОЛЛ ==========

function initStandObserver() {
  if (!standFeed) return;
  standFeed.addEventListener('scroll', () => {
    if (!standHasMore || standLoading) return;
    if (standFeed.scrollTop + standFeed.clientHeight >= standFeed.scrollHeight - 120) {
      loadStandFeed(false);
    }
  }, { once: false });
}

// ========== ЗАГРУЗКА ВИДЕО (через FAB) ==========

// При клике на FAB (+) — открываем галерею с опцией сжатия
standFab?.addEventListener('click', () => {
  standFileInput.click();
});

// Функция сжатия видео перед отправкой
async function compressVideo(file, maxBytes = 100 * 1024 * 1024) {
  // Если файл меньше лимита, просто читаем как есть
  if (file.size <= maxBytes) {
    return await readFileAsDataURL(file);
  }
  
  // Для больших файлов пытаемся уменьшить качество
  // Используем canvas для создания превью если это изображение
  if (file.type.startsWith('image/')) {
    return await compressMedia(file, 'image');
  }
  
  // Для видео просто читаем и надеемся что сервер примет
  // В будущем можно добавить сжатие через FFmpeg.wasm
  setStatus('Видео большого размера, загрузка может быть долгой...');
  return await readFileAsDataURL(file);
}

// Когда файл выбран — загружаем с проверкой размера и сжатием
standFileInput.addEventListener('change', async () => {
  const file = standFileInput.files?.[0];
  if (!file) return;

  const MAX_SIZE = 100 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    setStatus('Файл слишком большой (макс. 100 МБ)');
    standFileInput.value = '';
    return;
  }

  setStatus('Подготовка видео...');

  try {
    // Сжимаем/уменьшаем видео на клиенте (через canvas + MediaRecorder)
    const videoData = await compressVideoForUpload(file, 25 * 1024 * 1024);
    setStatus('Отправка на сервер...');

    // Используем прямой fetch с увеличенным таймаутом
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 минут
    let resp;
    try {
      resp = await fetch('/api/stand/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video: videoData, caption: '' }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new Error(json?.message || 'Ошибка отправки (' + resp.status + ')');
    }
    standFileInput.value = '';
    loadStandFeed(true);
    setStatus('Видео опубликовано в Stand!');
  } catch (error) {
    if (error.name === 'AbortError') {
      setStatus('Превышено время ожидания (5 мин). Попробуйте более короткое видео.');
    } else {
      setStatus('Ошибка: ' + error.message);
    }
    standFileInput.value = '';
  }
});

// Сжимает видео до целевого размера через canvas + MediaRecorder.
// Если сжатие не удалось или файл уже меньше лимита — возвращает как data URL.
async function compressVideoForUpload(file, targetBytes) {
  // Если файл уже меньше лимита и не видео — просто читаем
  if (file.size <= targetBytes && !file.type.startsWith('video/')) {
    return await readFileAsDataURL(file);
  }

  // Если видео меньше 30 МБ — не сжимаем (экономия времени)
  if (file.size <= 30 * 1024 * 1024) {
    return await readFileAsDataURL(file);
  }

  // Пробуем сжать через canvas + MediaRecorder
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Не удалось загрузить видео'));
      setTimeout(() => reject(new Error('Таймаут загрузки видео')), 10000);
    });

    // Уменьшаем до 540p
    const targetWidth = 540;
    const ratio = video.videoWidth / video.videoHeight || 16/9;
    const w = Math.min(video.videoWidth, targetWidth);
    const h = Math.round(w / ratio);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Выбираем битрейт в зависимости от длительности
    const duration = video.duration || 10;
    const targetBitsPerSec = Math.min(800_000, Math.max(250_000, (targetBytes * 8) / duration));

    const stream = canvas.captureStream(24);
    let mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        URL.revokeObjectURL(url);
        return await readFileAsDataURL(file); // fallback
      }
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: targetBitsPerSec });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const recordingDone = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    // Запускаем запись пока играет видео
    let drawHandle;
    function draw() {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, w, h);
      drawHandle = requestAnimationFrame(draw);
    }

    video.currentTime = 0;
    await video.play();
    recorder.start(200);
    draw();

    await new Promise((resolve) => {
      video.onended = resolve;
    });
    cancelAnimationFrame(drawHandle);
    recorder.stop();
    video.pause();
    URL.revokeObjectURL(url);

    await recordingDone;
    const blob = new Blob(chunks, { type: 'video/webm' });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Video compression failed, using original:', e);
    setStatus('Не удалось сжать видео, отправляю как есть...');
    return await readFileAsDataURL(file);
  }
}

// Экспорт для app.js
window.loadStandFeed = loadStandFeed;