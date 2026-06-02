window.STANDARD_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
  '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
  '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫',
  '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
  '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
  '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸',
  '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲',
  '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
  '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
  '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻',
  '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀',
  '😿', '😾', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
  '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲',
  '🤝', '🙏', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '🤚', '🖐️',
  '✋', '🖖', '👌', '🤌', '🤏', '✍️', '💪', '🦾', '🦿', '🦵',
  '🔥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎈', '🎁', '🏆',
  '⚽', '🏀', '🎮', '🎯', '🎵', '🎶', '📱', '💻', '📷', '🎬'
];

window.attachEmojiPicker = function attachEmojiPicker({ toggleBtn, panel, input, onPick }) {
  if (!toggleBtn || !panel) return;
  panel.innerHTML = '';
  panel.className = 'emoji-panel hidden';
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  window.STANDARD_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      if (input) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
      }
      onPick?.(emoji);
      panel.classList.add('hidden');
    });
    grid.appendChild(btn);
  });
  panel.appendChild(grid);
  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    panel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== toggleBtn) {
      panel.classList.add('hidden');
    }
  });
};
