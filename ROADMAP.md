# Планы развития DIO Messenger

## 🎯 Этап 2: Голосовые сообщения (Low Priority)

### Требуемые пакеты
```bash
npm install wavesurfer.js
```

### Пример реализации на клиенте

```javascript
// В app.js добавить:

let mediaRecorder = null;
let audioChunks = [];

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      await sendVoiceMessage(audioBlob);
    };

    mediaRecorder.start();
    setStatus('🎤 Запись началась...');
  } catch (error) {
    setStatus('❌ Ошибка доступа к микрофону: ' + error.message);
  }
}

function stopVoiceRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    setStatus('🎤 Запись остановлена');
  }
}

async function sendVoiceMessage(audioBlob) {
  try {
    const reader = new FileReader();
    reader.onload = async () => {
      const audioData = reader.result;
      
      await request('/api/voice/send', {
        method: 'POST',
        body: JSON.stringify({
          to: currentChat,
          audioData: audioData
        })
      });
      
      setStatus('🎤 Голосовое сообщение отправлено!');
      openChat(currentChat);
    };
    reader.readAsDataURL(audioBlob);
  } catch (error) {
    setStatus('❌ Ошибка отправки: ' + error.message);
  }
}
```

### Обновление HTML

```html
<div class="chat-input">
  <input id="message-text" type="text" placeholder="Написать сообщение...">
  <button id="btn-voice-record" class="btn-voice">🎤</button>
  <button id="btn-send-message" class="btn-primary">Отправить</button>
</div>
```

### Обработчик событий

```javascript
let isRecording = false;
const btnVoiceRecord = document.querySelector('#btn-voice-record');

btnVoiceRecord?.addEventListener('click', () => {
  if (!isRecording) {
    startVoiceRecording();
    isRecording = true;
    btnVoiceRecord.classList.add('recording');
  } else {
    stopVoiceRecording();
    isRecording = false;
    btnVoiceRecord.classList.remove('recording');
  }
});
```

---

## 🎬 Этап 3: Stories (Medium Priority)

### Требуемые пакеты
```bash
npm install sharp  # Для обработки изображений
```

### Пример реализации на клиенте

```javascript
async function createStoryFromCamera() {
  try {
    const video = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' } 
    });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    await createStory(imageData);
    setStatus('📸 История создана!');
  } catch (error) {
    setStatus('❌ Ошибка доступа к камере: ' + error.message);
  }
}

async function loadStoriesFeed() {
  try {
    const data = await request('/api/stories/feed');
    
    const storiesContainer = document.querySelector('#stories-container');
    storiesContainer.innerHTML = '';
    
    data.stories.forEach(story => {
      const storyEl = document.createElement('div');
      storyEl.className = 'story-item';
      storyEl.innerHTML = `
        <img src="${story.media}" alt="История от ${story.author}">
        <div class="story-info">
          <strong>${story.avatar} @${story.author}</strong>
        </div>
      `;
      storyEl.addEventListener('click', () => viewStory(story));
      storiesContainer.appendChild(storyEl);
    });
  } catch (error) {
    console.error(error);
  }
}

function viewStory(story) {
  const storyViewer = document.querySelector('#story-viewer');
  storyViewer.innerHTML = `
    <img src="${story.media}" alt="История">
    <div class="story-progress"></div>
  `;
  
  // Автоматически закрыть через duration секунд
  setTimeout(() => {
    storyViewer.classList.add('hidden');
  }, (story.duration || 10) * 1000);
}
```

### Стили для stories

```css
#stories-container {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 12px 0;
  margin-bottom: 20px;
}

.story-item {
  flex-shrink: 0;
  width: 80px;
  height: 140px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 2px solid rgba(139, 92, 246, 0.5);
}

.story-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.story-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.8));
  color: white;
  padding: 8px;
  font-size: 0.75rem;
  text-align: center;
}

#story-viewer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: black;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

#story-viewer img {
  max-width: 100%;
  max-height: 100%;
}
```

---

## 🔐 Этап 4: Сквозное шифрование E2E (High Priority)

### Требуемые пакеты
```bash
npm install tweetnacl@1.0.3 tweetnacl-util
```

### Архитектура шифрования

1. **Генерация ключей при регистрации:**
   - Каждый пользователь получает пару ключей (публичный + приватный)
   - Публичный ключ хранится на сервере
   - Приватный ключ хранится только на клиенте (в localStorage, защищённо)

2. **Обмен сообщениями:**
   - Клиент получает публичный ключ получателя
   - Шифрует сообщение на основе публичного ключа получателя
   - Отправляет зашифрованное сообщение на сервер
   - Получатель расшифровывает на клиенте с помощью своего приватного ключа

### Пример реализации

```javascript
// Криптография в app.js

const nacl = require('tweetnacl');
const utils = require('tweetnacl-util');

// Генерация ключей при регистрации (на сервере при POST /api/register)
function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: utils.encodeBase64(keyPair.publicKey),
    secretKey: utils.encodeBase64(keyPair.secretKey)
  };
}

// Шифрование сообщения на клиенте
async function encryptMessage(message, recipientPublicKey) {
  try {
    const publicKey = utils.decodeBase64(recipientPublicKey);
    const ephemeralKeyPair = nacl.box.keyPair();
    
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(
      utils.decodeUTF8(message),
      nonce,
      publicKey,
      ephemeralKeyPair.secretKey
    );
    
    return {
      nonce: utils.encodeBase64(nonce),
      ciphertext: utils.encodeBase64(encrypted),
      ephemeralPublicKey: utils.encodeBase64(ephemeralKeyPair.publicKey)
    };
  } catch (error) {
    console.error('Ошибка шифрования:', error);
    throw error;
  }
}

// Расшифровка сообщения на клиенте
function decryptMessage(encryptedData, userSecretKey) {
  try {
    const { nonce, ciphertext, ephemeralPublicKey } = encryptedData;
    
    const decrypted = nacl.box.open(
      utils.decodeBase64(ciphertext),
      utils.decodeBase64(nonce),
      utils.decodeBase64(ephemeralPublicKey),
      utils.decodeBase64(userSecretKey)
    );
    
    return utils.encodeUTF8(decrypted);
  } catch (error) {
    console.error('Ошибка расшифровки:', error);
    throw error;
  }
}

// Переопределение sendMessage с шифрованием
async function sendSecureMessage() {
  try {
    if (!currentChat || !messageText.value.trim()) return;

    // Получаем публичный ключ получателя
    const userSecretKey = localStorage.getItem('userSecretKey');
    // TODO: Получить публичный ключ другого пользователя
    
    const encrypted = await encryptMessage(messageText.value, recipientPublicKey);
    
    await request('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        to: currentChat,
        encrypted: encrypted  // Отправляем зашифрованные данные
      })
    });

    messageText.value = '';
    openChat(currentChat);
  } catch (error) {
    setStatus(error.message);
  }
}
```

### Обновление backend (server.js)

```javascript
// При регистрации генерировать ключи:
app.post('/api/register', (req, res) => {
  // ... существующий код ...
  
  const keyPair = generateKeyPair();
  const newUser = {
    username,
    password,
    publicKey: keyPair.publicKey,  // Сохраняем публичный ключ
    // secretKey НЕ сохраняем на сервер!
    // ...
  };
  
  // ... остальной код ...
});

// Получение публичного ключа пользователя:
app.get('/api/user/:username/publickey', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.username === req.params.username);
  
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }
  
  res.json({ publicKey: user.publicKey });
});
```

---

## 🚀 План внедрения

### Приоритет реализации
1. **High (Сейчас):** ✅ Поиск пользователей и чаты
2. **High (Неделя 1):** 🔐 Базовое E2E шифрование
3. **Medium (Неделя 2):** 🎤 Голосовые сообщения
4. **Medium (Неделя 3):** 🎬 Stories
5. **Low:** 👥 Подписки и подписчики

### Временные сроки (примерные)
- **Шифрование:** 4-6 часов
- **Голосовые:** 3-4 часа
- **Stories:** 5-6 часов
- **Полная интеграция:** 1-2 недели

---

## 📚 Дополнительные ресурсы

- [TweetNaCl.js Documentation](https://tweetnacl.js.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

---

Удачи в развитии мессенджера! 🚀
