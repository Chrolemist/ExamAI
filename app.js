// Minimal frontend logic to wire the existing UI to the Flask backend /chat

const els = {
  copilotFab: document.getElementById('copilotFab'),
  copilotPanel: document.getElementById('copilotPanel'),
  copilotClose: document.getElementById('copilotClose'),
  menuFab: document.getElementById('menuFab'),
  menuPanel: document.getElementById('menuPanel'),
  menuClose: document.getElementById('menuClose'),
  messages: document.getElementById('messages'),
  composer: document.getElementById('composer'),
  userInput: document.getElementById('userInput'),
  modelSelect: document.getElementById('modelSelect'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  deleteKeyBtn: document.getElementById('deleteKeyBtn'),
  keyStatus: document.getElementById('keyStatus'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  copilotNameInput: document.getElementById('copilotNameInput'),
  copilotName: document.getElementById('copilotName'),
  hexAvatar: document.getElementById('hexAvatar'),
  hexNotifications: document.getElementById('hexNotifications'),
  maxTokens: document.getElementById('maxTokens'),
  maxTokensValue: document.getElementById('maxTokensValue'),
  typingSpeed: document.getElementById('typingSpeed'),
  typingSpeedValue: document.getElementById('typingSpeedValue'),
  renderMode: document.getElementById('renderMode'),
  // Exam modal elements
  btnCreateExam: document.getElementById('btnCreateExam'),
  filePickerModal: document.getElementById('filePickerModal'),
  filePickerClose: document.getElementById('filePickerClose'),
  dzLectures: document.getElementById('dzLectures'),
  dzExams: document.getElementById('dzExams'),
  filesLectures: document.getElementById('filesLectures'),
  filesExams: document.getElementById('filesExams'),
  listLectures: document.getElementById('listLectures'),
  listExams: document.getElementById('listExams'),
  confirmBuildExam: document.getElementById('confirmBuildExam'),
  examModal: document.getElementById('examModal'),
  examClose: document.getElementById('examClose'),
  examViewer: document.getElementById('examViewer'),
  examTitle: document.getElementById('examTitle'),
  // Saved chats UI
  clearChatBtn: document.getElementById('clearChatBtn'),
  savedChatsSelect: document.getElementById('savedChatsSelect'),
  loadChatBtn: document.getElementById('loadChatBtn'),
  // Resize handle
  copilotResize: document.getElementById('copilotResize'),
  menuResize: document.getElementById('menuResize'),
};

// In-memory chat history for the current page session
let chatHistory = [];
// Track whether server provides an API key via .env
let hasServerKey = false;

// Constants and helpers needed during init
const COPILOT_MIN = 280;
const COPILOT_MAX = Math.floor(window.innerWidth * 0.92);
function setCopilotWidth(px) {
  const clamped = Math.max(COPILOT_MIN, Math.min(COPILOT_MAX, px));
  if (els.copilotPanel) {
    els.copilotPanel.style.width = clamped + 'px';
  }
}

// Drawer helpers
function toggleDrawer(panel, from) {
  const isHidden = panel.classList.contains('hidden') || !panel.classList.contains('show');
  panel.classList.add('from-' + from);
  panel.classList.remove('hidden');
  if (isHidden) {
    panel.classList.add('show');
  } else {
    panel.classList.remove('show');
    setTimeout(() => panel.classList.add('hidden'), 250);
  }
}

els.copilotFab?.addEventListener('click', () => toggleDrawer(els.copilotPanel, 'right'));
els.copilotClose?.addEventListener('click', () => toggleDrawer(els.copilotPanel, 'right'));
els.menuFab?.addEventListener('click', () => toggleDrawer(els.menuPanel, 'left'));
els.menuClose?.addEventListener('click', () => toggleDrawer(els.menuPanel, 'left'));

// Toggle file picker modal
function showModal(modal, show) {
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
}

els.btnCreateExam?.addEventListener('click', () => showModal(els.filePickerModal, true));
els.filePickerClose?.addEventListener('click', () => showModal(els.filePickerModal, false));

function wireDropzone(el) {
  if (!el) return;
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag');
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    toast(`${files.length} fil(er) tillagda.`);
  });
}

wireDropzone(els.dzLectures);
wireDropzone(els.dzExams);

function renderFileList(target, files) {
  if (!target) return;
  target.innerHTML = '';
  for (const f of files) {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.textContent = `${f.name} (${Math.round(f.size/1024)} KB)`;
    target.appendChild(chip);
  }
}

els.filesLectures?.addEventListener('change', (e) => {
  renderFileList(els.listLectures, e.target.files || []);
});
els.filesExams?.addEventListener('change', (e) => {
  renderFileList(els.listExams, e.target.files || []);
});

els.confirmBuildExam?.addEventListener('click', async () => {
  const form = new FormData();
  const title = (els.examTitle?.value || '').trim();
  if (title) form.append('examTitle', title);

  const lec = els.filesLectures?.files || [];
  for (const f of lec) form.append('lectures', f, f.name);
  const ex = els.filesExams?.files || [];
  for (const f of ex) form.append('exams', f, f.name);

  try {
    const res = await fetch('/build-exam', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Kunde inte skapa tenta', 'error');
      return;
    }
    els.examViewer.innerHTML = data.html || '';
    showModal(els.examModal, true);
    toast(`Skapade tenta. Föreläsningar: ${data.counts.lectures}, Tenta: ${data.counts.exams}`);
  } catch (e) {
    toast('Nätverksfel vid skapande av tenta', 'error');
  }
});

els.examClose?.addEventListener('click', () => showModal(els.examModal, false));

// Key handling (stored in localStorage; never sent unless user chooses per call)
const KEY_STORAGE = 'examai.openai.key';
const NAME_STORAGE = 'examai.copilot.name';
const MAXTOK_STORAGE = 'examai.max_tokens';
const TYPESPD_STORAGE = 'examai.typing_speed';
const RENDER_MODE_STORAGE = 'examai.render_mode'; // 'raw' | 'md'

function loadKey() {
  const key = localStorage.getItem(KEY_STORAGE) || '';
  if (key) {
    els.apiKeyInput.value = '•••• •••• ••••';
  els.apiKeyInput.setAttribute('readonly', 'true');
    els.keyStatus.textContent = 'Nyckel sparad';
    els.keyStatus.classList.remove('badge-error');
    els.keyStatus.classList.add('badge-ok');
  } else {
    els.apiKeyInput.value = '';
  els.apiKeyInput.removeAttribute('readonly');
    els.keyStatus.textContent = 'Ingen nyckel';
    els.keyStatus.classList.remove('badge-ok');
    els.keyStatus.classList.add('badge-error');
  }
}

function loadMaxTokens() {
  let v = parseInt(localStorage.getItem(MAXTOK_STORAGE) || '1000', 10);
  // Clamp to new slider range 1000-30000
  if (Number.isNaN(v)) v = 1000;
  v = Math.max(1000, Math.min(30000, v));
  if (els.maxTokens) els.maxTokens.value = String(v);
  if (els.maxTokensValue) els.maxTokensValue.textContent = String(v);
  // Persist clamped value
  localStorage.setItem(MAXTOK_STORAGE, String(v));
  return v;
}

function saveMaxTokens(v) {
  localStorage.setItem(MAXTOK_STORAGE, String(v));
}

function getStoredName() {
  return localStorage.getItem(NAME_STORAGE) || 'Copilot';
}

function setStoredName(name) {
  if (name) localStorage.setItem(NAME_STORAGE, name);
}

els.deleteKeyBtn?.addEventListener('click', () => {
  // If server manages the key, block deletion and warn
  if (hasServerKey) {
    toast('Nyckeln hanteras via servern (.env) och kan inte tas bort här.', 'warn');
    return;
  }
  const ok = confirm('Ta bort sparad API-nyckel?');
  if (!ok) return;
  localStorage.removeItem(KEY_STORAGE);
  loadKey();
  toast('API-nyckel borttagen.');
});

els.globalKeyToggle?.addEventListener('change', (e) => {
  setGlobalFlag(e.target.checked);
});

els.copilotNameInput?.addEventListener('input', (e) => {
  const name = e.target.value.trim();
  els.copilotName.textContent = name || 'Copilot';
  setStoredName(name);
});

els.settingsToggle?.addEventListener('click', () => {
  els.settingsPanel?.classList.toggle('collapsed');
});

// Debounce saving/toast so rapid sliding doesn't spam confirmations
let maxTokensSaveTimer = null;
els.maxTokens?.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  if (els.maxTokensValue) els.maxTokensValue.textContent = String(v);
  if (maxTokensSaveTimer) clearTimeout(maxTokensSaveTimer);
  maxTokensSaveTimer = setTimeout(() => {
    saveMaxTokens(v);
    toast('Max tokens sparat.');
  }, 500);
});

// Autosave API key on blur if editable (avoid saving masked value)
els.apiKeyInput?.addEventListener('blur', () => {
  if (els.apiKeyInput.hasAttribute('readonly')) return;
  const candidate = (els.apiKeyInput.value || '').trim();
  if (!candidate || candidate.startsWith('••')) return;
  localStorage.setItem(KEY_STORAGE, candidate);
  loadKey();
  toast('API-nyckel sparad.');
});

function initSettings() {
  loadKey();
  const name = getStoredName();
  els.copilotName.textContent = name;
  els.copilotNameInput.value = name;
  loadMaxTokens();
  // Load persisted copilot width
  const w = parseInt(localStorage.getItem('examai.copilot.width') || '360', 10);
  setCopilotWidth(isNaN(w) ? 360 : w);
  // Load typing speed
  const spd = loadTypingSpeed();
  if (els.typingSpeed) els.typingSpeed.value = String(spd);
  updateTypingSpeedLabel(spd);
  // Load render mode and apply UI
  const mode = loadRenderMode();
  if (els.renderMode) els.renderMode.value = mode;
  applyRenderModeUI(mode);
}

// Messaging UI
function addBubble(text, who = 'bot') {
  const div = document.createElement('div');
  if (who === 'user') {
    div.className = 'bubble user';
  } else {
    div.className = 'assistant';
  }
  div.textContent = text;
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function setAvatarBusy(busy) {
  const icon = document.getElementById('hexIcon');
  if (!icon) return;
  icon.classList.toggle('hex-spin', busy);
}

function toast(msg, kind = 'info') {
  const b = document.createElement('div');
  b.className = 'hex-bubble ' + (kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : '');
  b.textContent = msg;
  els.hexNotifications.appendChild(b);
  setTimeout(() => b.classList.add('fade-out'), 1800);
  setTimeout(() => b.remove(), 2200);
}

// Auto-resize the input textarea while typing
const INPUT_MIN_H = 40; // px
const INPUT_MAX_H = 300; // px
function autoResizeInput() {
  if (!els.userInput) return;
  els.userInput.style.height = 'auto';
  const next = Math.max(INPUT_MIN_H, Math.min(INPUT_MAX_H, els.userInput.scrollHeight));
  els.userInput.style.height = next + 'px';
}
els.userInput?.addEventListener('input', autoResizeInput);
// Initialize on load
autoResizeInput();

async function sendMessage() {
  const msg = els.userInput.value.trim();
  if (!msg) return;
  addBubble(msg, 'user');
  els.userInput.value = '';
  // Reset height after sending
  els.userInput.style.height = INPUT_MIN_H + 'px';

  // Use saved max tokens
  let maxTok = parseInt(localStorage.getItem(MAXTOK_STORAGE) || '1000', 10);
  if (Number.isNaN(maxTok)) maxTok = 1000;
  maxTok = Math.max(1000, Math.min(30000, maxTok));

  setAvatarBusy(true);
  try {
    // Append the user message to history for this turn
    const messages = [...chatHistory, { role: 'user', content: msg }];
    const body = {
      message: msg, // kept for backwards-compat, server will prefer messages[]
      messages,
      model: els.modelSelect.value || 'gpt-5-mini',
      // NOTE: API key is sent only if stored; backend also supports env var key
      apiKey: localStorage.getItem(KEY_STORAGE) || undefined,
    };

    // Token parameter depends on model family
    const m = (body.model || '').toLowerCase();
    if (m.startsWith('gpt-5') || m === '3o') body.max_completion_tokens = maxTok;
    else body.max_tokens = maxTok;

    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.error || data.message || 'Fel vid förfrågan.';
      addBubble(msg, 'bot');
      // More red warning when tokens too low or truncated
      const warn = /max_?completion_?tokens|max_?tokens|too small|minimum|length/i.test(String(data.hint || msg))
        ? 'Öka Max tokens i inställningarna och försök igen.'
        : msg;
      toast(warn, 'warn');
      return;
    }

    const mode = loadRenderMode();
    if (data.reply) {
      if (mode === 'md' && md) {
        addAssistantMarkdown(data.reply);
      } else {
        renderAssistantTyping(data.reply, false);
      }
    } else {
      addBubble('(inget svar)');
    }
    if (data.truncated) {
      toast('Svaret kapades av Max tokens. Öka i inställningarna.', 'warn');
    }
  // Persist messages in memory for follow-ups
  chatHistory.push({ role: 'user', content: msg });
  if (data.reply) chatHistory.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    console.error(err);
    addBubble('Nätverksfel. Säkerställ att servern körs.', 'bot');
    toast('Nätverksfel. Är servern igång på /chat?', 'error');
  } finally {
    setAvatarBusy(false);
  }
}

els.composer?.addEventListener('submit', async (e) => {
  e.preventDefault();
  sendMessage();
});

// Typing speed handling
function loadTypingSpeed() {
  // 0 = mycket långsam, 100 = omedelbar
  const v = parseInt(localStorage.getItem(TYPESPD_STORAGE) || '10', 10);
  return Math.max(0, Math.min(100, Number.isNaN(v) ? 10 : v));
}
function saveTypingSpeed(v) {
  localStorage.setItem(TYPESPD_STORAGE, String(v));
}
function updateTypingSpeedLabel(v) {
  if (!els.typingSpeedValue) return;
  let label = 'Snabb';
  if (v <= 5) label = 'Mycket långsam';
  else if (v <= 20) label = 'Långsam';
  else if (v <= 60) label = 'Medel';
  else if (v <= 90) label = 'Snabb';
  else label = 'Omedelbar';
  els.typingSpeedValue.textContent = label;
}
let typingSpeedSaveTimer = null;
els.typingSpeed?.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  updateTypingSpeedLabel(v);
  if (typingSpeedSaveTimer) clearTimeout(typingSpeedSaveTimer);
  typingSpeedSaveTimer = setTimeout(() => {
    saveTypingSpeed(v);
    toast('Skrivhastighet sparad.');
  }, 500);
});

els.userInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Check if server has env key so we can display OK even if no local storage key
async function checkKeyStatus() {
  try {
    const res = await fetch('/key-status');
    if (!res.ok) return;
    const data = await res.json();
    hasServerKey = !!data.hasKey;
    if (hasServerKey) {
      els.keyStatus.textContent = 'Nyckel i server (.env)';
      els.keyStatus.classList.remove('badge-error');
      els.keyStatus.classList.add('badge-ok');
      els.apiKeyInput.value = '•••• •••• ••••';
      els.apiKeyInput.setAttribute('readonly', 'true');
      // Inform user via tooltip; actual warning shown on click
      if (els.deleteKeyBtn) {
        els.deleteKeyBtn.title = 'Nyckeln hanteras via servern (.env)';
      }
    } else if (!localStorage.getItem(KEY_STORAGE)) {
      els.keyStatus.textContent = 'Ingen nyckel';
      els.keyStatus.classList.remove('badge-ok');
      els.keyStatus.classList.add('badge-error');
      els.apiKeyInput.removeAttribute('readonly');
    }
    if (!hasServerKey && els.deleteKeyBtn) {
      els.deleteKeyBtn.removeAttribute('title');
    }
  } catch {}
}

initSettings();
checkKeyStatus();

// --- Saved chats: localStorage management ---
const SAVED_CHATS_KEY = 'examai.saved.chats';

function loadSavedChats() {
  try {
    const raw = localStorage.getItem(SAVED_CHATS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveSavedChats(list) {
  localStorage.setItem(SAVED_CHATS_KEY, JSON.stringify(list));
}

function summarizeMessages(msgs) {
  const firstUser = (msgs || []).find(m => m.role === 'user');
  const text = firstUser?.content || 'Chat';
  const trimmed = text.length > 40 ? text.slice(0, 37) + '…' : text;
  return trimmed;
}

function refreshSavedChatsUI() {
  if (!els.savedChatsSelect) return;
  const all = loadSavedChats();
  els.savedChatsSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = all.length ? 'Välj en chat…' : 'Inga sparade chattar';
  els.savedChatsSelect.appendChild(placeholder);
  for (const it of all) {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.title || summarizeMessages(it.messages) || `Chat ${new Date(it.ts).toLocaleString()}`;
    els.savedChatsSelect.appendChild(opt);
  }
}

function saveCurrentChatSession() {
  const all = loadSavedChats();
  const id = 'chat_' + Date.now();
  all.unshift({ id, ts: Date.now(), title: summarizeMessages(chatHistory), messages: chatHistory });
  // Keep last 50 sessions
  saveSavedChats(all.slice(0, 50));
  refreshSavedChatsUI();
  return id;
}

function renderChatFromHistory(msgs) {
  els.messages.innerHTML = '';
  for (const m of msgs) addBubble(m.content || '', m.role === 'user' ? 'user' : 'bot');
}

els.clearChatBtn?.addEventListener('click', () => {
  if (!chatHistory.length) {
    toast('Chatten är redan tom.');
    return;
  }
  const ok = confirm('Spara och rensa chatten?');
  if (!ok) return;
  saveCurrentChatSession();
  chatHistory = [];
  els.messages.innerHTML = '';
  toast('Chat sparad och rensad.');
});

els.loadChatBtn?.addEventListener('click', () => {
  const id = els.savedChatsSelect?.value;
  if (!id) {
    toast('Välj en sparad chat först.', 'warn');
    return;
  }
  const all = loadSavedChats();
  const found = all.find(it => it.id === id);
  if (!found) {
    toast('Kunde inte hitta vald chat.', 'error');
    return;
  }
  chatHistory = Array.isArray(found.messages) ? found.messages : [];
  renderChatFromHistory(chatHistory);
  toast('Chat laddad.');
});

// Initialize saved chats UI
refreshSavedChatsUI();

// --- Assistant typing effect (fast) ---
const md = window.markdownit ? window.markdownit({ html: false, linkify: true, breaks: true }) : null;
function renderAssistantTyping(text, useMarkdown) {
  const el = document.createElement('div');
  el.className = 'assistant typing';
  el.textContent = '';
  els.messages.appendChild(el);
  els.messages.scrollTop = els.messages.scrollHeight;

  const len = (text || '').length;
  if (len === 0) {
    el.classList.remove('typing');
    return;
  }
  // Map speed 0..100 => duration (ms). 0 ~ 4000ms, 100 ~ 0ms
  const speed = loadTypingSpeed();
  const targetMs = Math.max(0, 4000 - Math.round((speed / 100) * 4000));
  const frameMs = 16;   // ~60fps
  const frames = Math.max(1, Math.round(targetMs / frameMs));
  const chunkSize = Math.max(1, Math.ceil(len / frames));

  let i = 0;
  const timer = setInterval(() => {
    i = Math.min(len, i + chunkSize);
    el.textContent = text.slice(0, i);
    els.messages.scrollTop = els.messages.scrollHeight;
    if (i >= len) {
      clearInterval(timer);
      el.classList.remove('typing');
      // Finalize content according to render mode
      if (useMarkdown && md) {
        el.innerHTML = md.render(text || '');
      } else {
        el.textContent = text || '';
      }
    }
  }, frameMs);
}

function addAssistantMarkdown(text) {
  const el = document.createElement('div');
  el.className = 'assistant';
  el.innerHTML = md ? md.render(text || '') : (text || '');
  els.messages.appendChild(el);
  els.messages.scrollTop = els.messages.scrollHeight;
}

// Render mode handling
function loadRenderMode() {
  const v = (localStorage.getItem(RENDER_MODE_STORAGE) || 'raw').toLowerCase();
  return v === 'md' ? 'md' : 'raw';
}
function saveRenderMode(v) {
  localStorage.setItem(RENDER_MODE_STORAGE, v);
}
function applyRenderModeUI(mode) {
  // Hide typing speed controls in Markdown mode
  const label = els.typingSpeed ? els.typingSpeed.closest('label') : null;
  if (label) {
    label.style.display = mode === 'md' ? 'none' : '';
  }
}

els.renderMode?.addEventListener('change', (e) => {
  const mode = (e.target.value || 'raw').toLowerCase();
  const normalized = mode === 'md' ? 'md' : 'raw';
  saveRenderMode(normalized);
  applyRenderModeUI(normalized);
  toast(`Visningsläge: ${normalized === 'md' ? 'Markdown' : 'Rå text'}.`);
});

// --- Resizable copilot panel ---
const MENU_MIN = 260;
const MENU_MAX = Math.floor(window.innerWidth * 0.7);

let resizing = false;
let startX = 0;
let startW = 0;
let targetPanel = null; // 'copilot' | 'menu'

function onMove(e) {
  if (!resizing) return;
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  if (targetPanel === 'copilot') {
    const dx = startX - x; // drag leftwards increases width for right drawer
    const next = startW + dx;
    setCopilotWidth(next);
  } else if (targetPanel === 'menu') {
    const dx = x - startX; // drag rightwards increases width for left drawer
    const next = startW + dx;
    setMenuWidth(next);
  }
}

function onUp() {
  if (!resizing) return;
  resizing = false;
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup', onUp);
  document.removeEventListener('touchmove', onMove);
  document.removeEventListener('touchend', onUp);
  // Persist
  if (targetPanel === 'copilot') {
    const w = parseInt((els.copilotPanel?.style.width || '360px').replace('px',''), 10) || 360;
    localStorage.setItem('examai.copilot.width', String(w));
  } else if (targetPanel === 'menu') {
    const w = parseInt((els.menuPanel?.style.width || '300px').replace('px',''), 10) || 300;
    localStorage.setItem('examai.menu.width', String(w));
  }
  targetPanel = null;
}

els.copilotResize?.addEventListener('mousedown', (e) => {
  resizing = true;
  startX = e.clientX;
  startW = parseInt((els.copilotPanel?.style.width || window.getComputedStyle(els.copilotPanel).width || '360px').replace('px',''), 10) || 360;
  targetPanel = 'copilot';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

els.copilotResize?.addEventListener('touchstart', (e) => {
  resizing = true;
  startX = e.touches[0].clientX;
  startW = parseInt((els.copilotPanel?.style.width || window.getComputedStyle(els.copilotPanel).width || '360px').replace('px',''), 10) || 360;
  targetPanel = 'copilot';
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
});

function setMenuWidth(px) {
  const clamped = Math.max(MENU_MIN, Math.min(MENU_MAX, px));
  if (els.menuPanel) {
    els.menuPanel.style.width = clamped + 'px';
  }
}

els.menuResize?.addEventListener('mousedown', (e) => {
  resizing = true;
  startX = e.clientX;
  startW = parseInt((els.menuPanel?.style.width || window.getComputedStyle(els.menuPanel).width || '300px').replace('px',''), 10) || 300;
  targetPanel = 'menu';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

els.menuResize?.addEventListener('touchstart', (e) => {
  resizing = true;
  startX = e.touches[0].clientX;
  startW = parseInt((els.menuPanel?.style.width || window.getComputedStyle(els.menuPanel).width || '300px').replace('px',''), 10) || 300;
  targetPanel = 'menu';
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
});

// Load persisted menu width on init
(() => {
  const w = parseInt(localStorage.getItem('examai.menu.width') || '300', 10);
  if (!isNaN(w)) setMenuWidth(w);
})();

// --- Drag & drop into chat: upload PDFs/TXT/MD and attach text to history ---
function setupChatDrop() {
  const dropTargets = [els.messages, els.userInput];
  const highlight = (on) => {
    dropTargets.forEach(t => { if (t) t.classList.toggle('drag', !!on); });
  };
  dropTargets.forEach(t => {
    if (!t) return;
    t.addEventListener('dragover', (e) => { e.preventDefault(); highlight(true); });
    t.addEventListener('dragleave', () => highlight(false));
    t.addEventListener('drop', async (e) => {
      e.preventDefault();
      highlight(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const form = new FormData();
      for (const f of files) form.append('files', f, f.name);
      form.append('maxChars', '60000');
      setAvatarBusy(true);
      try {
        const res = await fetch('/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || 'Kunde inte läsa filer', 'error');
          return;
        }
        const count = data.count || (data.items ? data.items.length : 0);
        const names = (data.items || []).map(it => it.name).join(', ');
        addBubble(`(Importerade ${count} fil(er): ${names})`, 'bot');
        // Append each file's text as a system content block in history so the model can use it
        for (const it of (data.items || [])) {
          const label = `Innehåll från ${it.name}${it.truncated ? ' (trunkerad)' : ''}`;
          chatHistory.push({ role: 'system', content: `${label}:
\n${it.text || ''}` });
        }
        toast(`Läste ${count} fil(er). Texten används i nästa fråga.`);
      } catch (err) {
        console.error(err);
        toast('Nätverksfel vid filuppladdning', 'error');
      } finally {
        setAvatarBusy(false);
      }
    });
  });
}

setupChatDrop();
