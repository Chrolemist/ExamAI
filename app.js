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
  attachmentsBar: document.getElementById('attachmentsBar'),
  globalUserNameInput: document.getElementById('globalUserNameInput'),
  pauseFlowBtn: document.getElementById('pauseFlowBtn'),
};

// In-memory chat history for the current page session
let chatHistory = [];
// Track whether server provides an API key via .env
let hasServerKey = false;
// Staged file attachments awaiting upload on next send
let stagedFiles = [];

// Constants and helpers needed during init
const COPILOT_MIN = 280;
const COPILOT_MAX = Math.floor(window.innerWidth * 0.92);
function setCopilotWidth(px) {
  const clamped = Math.max(COPILOT_MIN, Math.min(COPILOT_MAX, px));
  if (els.copilotPanel) {
    els.copilotPanel.style.width = clamped + 'px';
  }
}

// ===== Global Pause/Resume manager =====
const FLOW_PAUSED_KEY = 'examai.flow.paused';
const PauseManager = (() => {
  let paused = (localStorage.getItem(FLOW_PAUSED_KEY) || 'false') === 'true';
  // queue for independent (non-linked) messages while paused
  const pendingIndependent = [];
  function isPaused() { return paused; }
  function updatePauseButton() {
    const btn = els.pauseFlowBtn;
    if (!btn) return;
    btn.textContent = paused ? 'Återuppta flöde' : 'Pausa flöde';
    btn.classList.toggle('paused', paused);
    document.body.classList.toggle('flow-paused', paused);
  }
  function setPaused(v) {
    const next = !!v;
    if (next === paused) return;
    paused = next;
    try { localStorage.setItem(FLOW_PAUSED_KEY, String(paused)); } catch {}
    updatePauseButton();
    window.dispatchEvent(new CustomEvent('examai:flowPausedChanged', { detail: { paused } }));
    if (!paused) {
      try { ConversationManager.resumeAll?.(); } catch {}
      flushIndependent();
    }
  }
  function toggle() { setPaused(!paused); }
  function queueIndependent(copilotId, msg) {
    pendingIndependent.push({ copilotId, msg, ts: Date.now() });
  }
  async function flushIndependent() {
    if (!pendingIndependent.length) return;
    // Process FIFO
    while (pendingIndependent.length) {
      const item = pendingIndependent.shift();
      const inst = CopilotManager.instances.get(item.copilotId);
      if (!inst) continue;
      try { await inst.sendQueued(item.msg); }
      catch { inst.addAssistant('Fel vid upplockning av köat meddelande.'); }
    }
  }
  // init UI
  updatePauseButton();
  return { isPaused, setPaused, toggle, queueIndependent };
})();

// Wire pause/resume button
els.pauseFlowBtn?.addEventListener('click', () => PauseManager.toggle());

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

// Hook global user name input (set before adding copilots)
(() => {
  const KEY = 'examai.user.name';
  const get = () => localStorage.getItem(KEY) || 'Du';
  const set = (v) => { localStorage.setItem(KEY, (v || '').trim() || 'Du'); window.dispatchEvent(new CustomEvent('examai:userNameChanged', { detail: { name: localStorage.getItem(KEY) } })); };
  if (els.globalUserNameInput) {
    els.globalUserNameInput.value = get();
    let t = null;
    const save = () => { set(els.globalUserNameInput.value || ''); };
    els.globalUserNameInput.addEventListener('input', () => { if (t) clearTimeout(t); t = setTimeout(save, 350); });
    els.globalUserNameInput.addEventListener('blur', save);
  }
})();

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

// Global user display name helpers (used across all copilots)
const USER_NAME_KEY = 'examai.user.name';
function getGlobalUserName() {
  try { return localStorage.getItem(USER_NAME_KEY) || 'Du'; } catch { return 'Du'; }
}
function setGlobalUserName(name) {
  const v = (name || '').trim() || 'Du';
  try { localStorage.setItem(USER_NAME_KEY, v); } catch {}
  window.dispatchEvent(new CustomEvent('examai:userNameChanged', { detail: { name: v } }));
}

// Simple HTML escape for author labels
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  if (PauseManager.isPaused()) {
    // render locally and queue for later
    addBubble(msg, 'user');
    // queue into a temporary buffer on main thread (treated as independent)
    // no copilot id in the main drawer, just store in local history
    chatHistory.push({ role: 'user', content: msg });
    els.userInput.value = '';
    els.userInput.style.height = INPUT_MIN_H + 'px';
    toast('Flöde pausat – meddelandet köades.', 'warn');
    return;
  }
  addBubble(msg, 'user');
  els.userInput.value = '';
  // Reset height after sending
  els.userInput.style.height = INPUT_MIN_H + 'px';

  // If we have staged files, upload them first and append to history
  if (stagedFiles.length) {
    const form = new FormData();
    for (const f of stagedFiles) form.append('files', f, f.name);
    form.append('maxChars', '60000');
    setAvatarBusy(true);
    try {
      const resU = await fetch('/upload', { method: 'POST', body: form });
      const dataU = await resU.json();
      if (!resU.ok) {
        toast(dataU.error || 'Kunde inte läsa bilagor', 'error');
      } else {
        const count = dataU.count || (dataU.items ? dataU.items.length : 0);
        const names = (dataU.items || []).map(it => it.name).join(', ');
        addBubble(`(Läste ${count} bilaga(or): ${names})`, 'bot');
        for (const it of (dataU.items || [])) {
          const label = `Innehåll från ${it.name}${it.truncated ? ' (trunkerad)' : ''}`;
          chatHistory.push({ role: 'system', content: `${label}:
\n${it.text || ''}` });
        }
      }
    } catch (e) {
      console.error(e);
      toast('Nätverksfel vid bilagor', 'error');
    } finally {
      setAvatarBusy(false);
      // Clear staged UI regardless of success so user can re-stage if needed
      stagedFiles = [];
      renderAttachments();
    }
  }

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
  body.max_tokens = maxTok;

    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let data = null; let rawText = '';
    try { data = await res.json(); }
    catch { try { rawText = await res.text(); } catch {} }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.';
      addBubble(msg, 'bot');
      // More red warning when tokens too low or truncated
      const warn = /max_?completion_?tokens|max_?tokens|too small|minimum|length/i.test(String((data && data.hint) || msg))
        ? 'Öka Max tokens i inställningarna och försök igen.'
        : msg;
      toast(warn, 'warn');
      return;
    }

    const mode = loadRenderMode();
    if (data && data.reply) {
      if (mode === 'md' && md) {
        addAssistantMarkdown(data.reply);
      } else {
        renderAssistantTyping(data.reply, false);
      }
    } else {
      addBubble('(inget svar)');
    }
    if (data && data.truncated) {
      toast('Svaret kapades av Max tokens. Öka i inställningarna.', 'warn');
    }
  // Persist messages in memory for follow-ups
  chatHistory.push({ role: 'user', content: msg });
  if (data && data.reply) chatHistory.push({ role: 'assistant', content: data.reply });
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
      const newOnes = [];
      for (const f of files) {
        // Avoid duplicates by name+size
        if (!stagedFiles.find(x => x.name === f.name && x.size === f.size)) {
          stagedFiles.push(f);
          newOnes.push(f.name);
        }
      }
      if (newOnes.length) {
        toast(`${newOnes.length} fil(er) tillagda. Skicka för att läsa.`);
        renderAttachments();
      }
    });
  });
}

setupChatDrop();

function renderAttachments() {
  const bar = els.attachmentsBar;
  if (!bar) return;
  if (!stagedFiles.length) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = '';
  stagedFiles.forEach((f, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${f.name} (${Math.round(f.size/1024)} KB)`;
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.type = 'button';
    rm.title = 'Ta bort';
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      stagedFiles.splice(idx, 1);
      renderAttachments();
    });
    chip.appendChild(name);
    chip.appendChild(rm);
    bar.appendChild(chip);
  });
}

// ================= Multi-copilot instances =================
// Connection rendering layer (SVG lines beneath flyouts)
const ConnectionLayer = (() => {
  let svg = null;
  function ensure() {
    if (svg) return svg;
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'connLayer');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'fixed';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
    return svg;
  }
  function pathFor(a, b) {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const c = Math.max(30, Math.min(200, Math.max(dx, dy) * 0.5));
    return `M ${a.x},${a.y} C ${a.x + c},${a.y} ${b.x - c},${b.y} ${b.x},${b.y}`;
  }
  function draw(id, a, b) {
    const root = ensure();
    let el = root.querySelector(`path[data-id="${id}"]`);
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('data-id', id);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', 'url(#gradLine)');
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-linecap', 'round');
      // gradient def once
      if (!root.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', 'gradLine');
        grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '1'); grad.setAttribute('y2', '1');
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','#7c5cff');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','#00d4ff');
        grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); root.appendChild(defs);
      }
      root.appendChild(el);
    }
    el.setAttribute('d', pathFor(a, b));
  }
  function remove(id) {
    if (!svg) return;
    const el = svg.querySelector(`path[data-id="${id}"]`);
    if (el) el.remove();
  }
  return { draw, remove };
})();

// Create a stable path id for links between two copilots
function stableLinkId(aId, bId) {
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  return `link_${x}_${y}`;
}

// Conversation manager: link multiple copilots to share history and enforce turn-taking
const ConversationManager = (() => {
  const conversations = new Map(); // convId -> { members:Set<number>, history:[], turnIdx:number, pending:[], busy:boolean }

  function ensureConv(convId) {
    if (conversations.has(convId)) return conversations.get(convId);
    const conv = { members: new Set(), history: [], turnIdx: 0, pending: [], busy: false };
    conversations.set(convId, conv);
    return conv;
  }
  function create() {
    const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    ensureConv(id);
    return id;
  }
  function addMember(convId, copilot) {
    const conv = ensureConv(convId);
    conv.members.add(copilot.id);
    copilot._convId = convId;
  }
  function link(a, b) {
    const convId = a._convId || b._convId || create();
    addMember(convId, a);
    addMember(convId, b);
    return convId;
  }
  function getMembers(convId) {
    const conv = conversations.get(convId);
    return conv ? Array.from(conv.members) : [];
  }
  function getHistory(convId) {
    const conv = conversations.get(convId);
    return conv ? conv.history : null;
  }
  function recordAssistant(convId, assistantMsg) {
    const conv = conversations.get(convId);
    if (!conv) return;
    conv.history.push({ role: 'assistant', content: assistantMsg });
  }

  function renderUserInMembers(convId, msg, senderId) {
    const ids = getMembers(convId);
  const authorName = getGlobalUserName();
    ids.forEach(id => {
      const inst = CopilotManager.instances.get(id);
      if (!inst) return;
      if (id === senderId) {
        // sender usually already rendered; ensure at least once
        // no-op
      } else {
        inst.addUser(msg, authorName);
      }
    });
  }
  function renderAssistantInMembers(convId, msg, authorName) {
    const ids = getMembers(convId);
    ids.forEach(id => {
      const inst = CopilotManager.instances.get(id);
      if (!inst) return;
      if ((inst.renderMode || 'raw') === 'md') inst.addAssistant(msg, authorName); else inst.addAssistant(msg, authorName);
    });
  }

  async function process(convId) {
    const conv = conversations.get(convId);
    if (!conv || conv.busy) return;
    if (PauseManager.isPaused()) return; // globally paused
    if (!conv.pending.length) return;
    conv.busy = true;
    // round-robin select next responder
    const ids = getMembers(convId);
    if (!ids.length) { conv.busy = false; return; }
    conv.turnIdx = (conv.turnIdx + 1) % ids.length;
  const nextId = ids[conv.turnIdx];
  const responder = CopilotManager.instances.get(nextId) || CopilotManager.instances.values().next().value;
    // highlight
    CopilotManager.instances.forEach(inst => inst.panel.classList.remove('active-speaking'));
    if (responder) responder.panel.classList.add('active-speaking');
    // Use full shared history as context
    const messages = conv.history.slice();
    try {
  const reply = await responder.generateReply(messages);
      const text = reply || '(inget svar)';
  recordAssistant(convId, text);
  renderAssistantInMembers(convId, text, responder ? responder.name : undefined);
    } catch (e) {
  renderAssistantInMembers(convId, 'Nätverksfel.', responder ? responder.name : undefined);
    } finally {
      if (responder) responder.panel.classList.remove('active-speaking');
      conv.busy = false;
      if (conv.pending.length) {
        // slight delay to keep UI smooth
        setTimeout(() => process(convId), 20);
      }
    }
  }

  function enqueueUser(sender, msg) {
    const conv = conversations.get(sender._convId);
    if (!conv) return;
    if (PauseManager.isPaused()) {
      // still record user and render, but don't start processing
      conv.history.push({ role: 'user', content: msg });
      renderUserInMembers(sender._convId, msg, sender.id);
      conv.pending.push({ from: sender.id, msg });
      toast('Flöde pausat – meddelandet köades.', 'warn');
      return;
    }
    // record user message in shared history and render in all members
    conv.history.push({ role: 'user', content: msg });
    renderUserInMembers(sender._convId, msg, sender.id);
    // queue a turn
    conv.pending.push({ from: sender.id, msg });
    if (!conv.busy) process(sender._convId);
  }

  function resumeAll() {
    // Attempt to process any conversations with pending items
    conversations.forEach((conv, id) => {
      if (conv.pending.length && !conv.busy) process(id);
    });
  }

  function removeMember(convId, copilot) {
    const conv = conversations.get(convId);
    if (!conv) return;
    conv.members.delete(copilot.id);
    const size = conv.members.size;
    if (size <= 0) {
      conversations.delete(convId);
      return;
    }
    conv.turnIdx = conv.turnIdx % size;
  }

  return { link, addMember, getMembers, getHistory, recordAssistant, enqueueUser, removeMember, resumeAll };
})();

class CopilotInstance {
  constructor(id, opts = {}) {
    this.id = id;
    this.name = opts.name || `Copilot ${id}`;
    this.model = opts.model || (document.getElementById('modelSelect')?.value || 'gpt-5-mini');
    // Load stored overrides early so UI and messages use the latest values immediately
    try {
      const storedName = localStorage.getItem(`examai.copilot.${id}.name`);
      if (storedName) this.name = storedName;
      const storedModel = localStorage.getItem(`examai.copilot.${id}.model`);
      if (storedModel) this.model = storedModel;
    } catch {}
    this.history = [];
  this.renderMode = (localStorage.getItem(`examai.copilot.${id}.render_mode`) || localStorage.getItem('examai.render_mode') || 'raw');
  this.maxTokens = parseInt(localStorage.getItem(`examai.copilot.${id}.max_tokens`) || localStorage.getItem('examai.max_tokens') || '1000', 10) || 1000;
  this.typingSpeed = parseInt(localStorage.getItem(`examai.copilot.${id}.typing_speed`) || localStorage.getItem('examai.typing_speed') || '10', 10) || 10;
  this.topic = localStorage.getItem(`examai.copilot.${id}.topic`) || '';
  this.role = localStorage.getItem(`examai.copilot.${id}.role`) || '';
  this.useRole = (localStorage.getItem(`examai.copilot.${id}.use_role`) ?? 'true') === 'true';
  // Track last drag end to avoid immediate click-open after dragging
  this._lastDragAt = 0;
    this.fab = this.#createFab();
    this.panel = this.#createFlyout();
  this.msgEl = this.panel.querySelector('[data-role="messages"]');
    this.formEl = this.panel.querySelector('[data-role="composer"]');
    this.inputEl = this.panel.querySelector('[data-role="input"]');
  this.authorEl = this.panel.querySelector('[data-role="author"]');
  this.settingsEl = this.panel.querySelector('[data-role="settings"]');
  this.modelEl = this.panel.querySelector('[data-role="model"]');
  this.nameEl = this.panel.querySelector('[data-role="name"]');
  this.tokensEl = this.panel.querySelector('[data-role="maxTokens"]');
  this.tokensLabelEl = this.panel.querySelector('[data-role="maxTokensValue"]');
  this.speedEl = this.panel.querySelector('[data-role="typingSpeed"]');
  this.speedLabelEl = this.panel.querySelector('[data-role="typingSpeedValue"]');
  this.renderModeEl = this.panel.querySelector('[data-role="renderMode"]');
  this.apiKeyEl = this.panel.querySelector('[data-role="apiKey"]');
  this.keyBadgeEl = this.panel.querySelector('[data-role="keyStatus"]');
  this.topicEl = this.panel.querySelector('[data-role="topic"]');
  this.roleEl = this.panel.querySelector('[data-role="role"]');
  this.roleBadgeEl = this.panel.querySelector('[data-role="roleBadge"]');
  this.useRoleEl = this.panel.querySelector('[data-role="useRole"]');
  this.userNameEl = this.panel.querySelector('[data-role="userName"]');
  // connection points
  this.connPoints = Array.from(this.panel.querySelectorAll('.conn-point'));
  // track visual connections (for unlink)
  this.connections = new Map(); // otherId -> { lineId, updateLine }
  this.#wireConnections();
    this.#wireDrag();
    this.#wireToggle();
    this.#wireSubmit();
  this.#wireSettings();
  this.#wireResize();
  this.#initInputAutoResize();
  this.#wirePanelDrag();
  this.updateKeyStatusBadge();
  // re-evaluate after possible async server key check
  setTimeout(() => this.updateKeyStatusBadge(), 1200);
  // Initialize author label to global user name and react to changes
  this.userName = getGlobalUserName();
  if (this.authorEl) this.authorEl.textContent = `Skriver som: ${this.userName}`;
  window.addEventListener('examai:userNameChanged', (e) => {
    this.userName = e.detail?.name || getGlobalUserName();
    if (this.authorEl) this.authorEl.textContent = `Skriver som: ${this.userName}`;
  });
  }
  #createFab() {
    const b = document.createElement('button');
    b.className = 'fab';
    b.title = this.name;
    b.setAttribute('data-copilot-id', String(this.id));
    b.innerHTML = `<svg class="hex-mini" viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
      <defs><linearGradient id="hexGradFab${this.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs>
      <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#hexGradFab${this.id})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
    </svg>`;
  // Random spawn position each time
  const vw = Math.max(320, window.innerWidth || 320);
  const vh = Math.max(240, window.innerHeight || 240);
  const margin = 18; // keep away from edges
  const fabSize = 56; // approx size including padding/shadow
  const minY = margin + 60; // avoid app bar
  const maxX = Math.max(margin, vw - fabSize - margin);
  const maxY = Math.max(minY, vh - fabSize - margin);
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const rx = rand(margin, maxX);
  const ry = rand(minY, maxY);
  b.style.left = rx + 'px';
  b.style.top = ry + 'px';
  b.style.right = 'auto';
  b.style.bottom = 'auto';
  b.style.position = 'fixed';
    document.body.appendChild(b);
    return b;
  }
  #createFlyout() {
    const sec = document.createElement('section');
    sec.className = 'panel-flyout hidden';
    sec.setAttribute('aria-hidden', 'true');
    sec.setAttribute('data-copilot-id', String(this.id));
    sec.innerHTML = `
      <header class="drawer-head" data-role="dragHandle">
        <div class="hex-avatar" title="${this.name}">
          <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
            <defs><linearGradient id="hexGradF${this.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs>
            <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#hexGradF${this.id})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
        </div>
  <div class="meta"><div class="name">${this.name}</div></div>
  <span class="badge" data-role="roleBadge" title="Roll (klicka för att toggla)">Roll</span>
        <span class="badge badge-error" data-role="keyStatus">Ingen nyckel</span>
        <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
        <button class="icon-btn" data-action="close">✕</button>
      </header>
      <div class="settings collapsed" data-role="settings">
        <label>Modell
          <select data-role="model">
            <option value="gpt-5">gpt-5</option>
            <option value="gpt-5-mini" selected>gpt-5-mini</option>
            <option value="gpt-5-nano">gpt-5-nano</option>
            <option value="3o">3o</option>
          </select>
        </label>
        <label>Copilot-namn
          <input type="text" placeholder="Namn" data-role="name" />
        </label>
        <label>Ditt namn (visas som avsändare)
          <input type="text" placeholder="Ex: Alex" data-role="userName" />
        </label>
        <label>Topic (fokus)
          <input type="text" placeholder="Ex: Frontend UX" data-role="topic" />
        </label>
        <label>Roll (instruktion)
          <input type="text" placeholder="T.ex. du är en pedagogisk lärare med erfarenhet inom programmering" data-role="role" />
        </label>
        <label>
          <input type="checkbox" data-role="useRole" /> Inkludera roll i prompt
        </label>
        <label>Max tokens
          <input type="range" min="1000" max="30000" step="64" value="1000" data-role="maxTokens" />
          <div class="subtle"><span data-role="maxTokensValue">1000</span></div>
        </label>
        <label>Skrivhastighet
          <input type="range" min="0" max="100" step="1" value="10" data-role="typingSpeed" />
          <div class="subtle">(<span data-role="typingSpeedValue">Snabb</span>)</div>
        </label>
        <label>Visningsläge
          <select data-role="renderMode">
            <option value="raw">Rå text</option>
            <option value="md">Snyggt (Markdown)</option>
          </select>
        </label>
        <label>API-nyckel (denna copilot)
          <input type="password" placeholder="Valfri – annars används global" data-role="apiKey" />
        </label>
      </div>
  <div class="messages" data-role="messages"></div>
  <div class="author-label" data-role="author">Skriver som: ${this.name}</div>
      <form class="composer" data-role="composer">
        <textarea placeholder="Skriv här..." rows="2" data-role="input"></textarea>
        <button class="send-btn" title="Skicka">➤</button>
  </form>
  <div class="flyout-resize br" data-resize="br" title="Ändra storlek"></div>
  <div class="flyout-resize t" data-resize="t" title="Dra för höjd"></div>
  <div class="flyout-resize b" data-resize="b" title="Dra för höjd"></div>
  <div class="flyout-resize l" data-resize="l" title="Dra för bredd"></div>
  <div class="flyout-resize r" data-resize="r" title="Dra för bredd"></div>`;
    // Add connection points (t,b,l,r)
    ['t','b','l','r'].forEach(side => {
      const p = document.createElement('div');
      p.className = 'conn-point';
      p.setAttribute('data-side', side);
      sec.appendChild(p);
    });
    document.body.appendChild(sec);
    sec.querySelector('[data-action="close"]').addEventListener('click', () => this.hide());
    sec.querySelector('[data-action="settings"]').addEventListener('click', () => {
      this.settingsEl.classList.toggle('collapsed');
    });
    return sec;
  }
  #wireConnections() {
    const points = this.connPoints;
  let dragging = false; let start = null; let ghostId = null; let overPoint = null; let startPointEl = null;
    const getCenter = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    };
    const pickPointAt = (x, y) => {
      const all = document.querySelectorAll('.panel-flyout .conn-point');
      for (const p of all) {
        const r = p.getBoundingClientRect();
        if (x >= r.left-6 && x <= r.right+6 && y >= r.top-6 && y <= r.bottom+6) return p;
      }
      return null;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const a = start;
      const b = { x: p.clientX, y: p.clientY };
      ConnectionLayer.draw(ghostId, a, b);
      const hit = pickPointAt(b.x, b.y);
      if (overPoint && overPoint !== hit) overPoint.classList.remove('hover');
      overPoint = hit;
      if (overPoint) overPoint.classList.add('hover');
      e.preventDefault();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      if (overPoint) overPoint.classList.remove('hover');
      const endPt = overPoint;
      if (ghostId) ConnectionLayer.remove(ghostId);
      ghostId = null;
  // If dropped on another copilot's point, link conversations
      if (endPt) {
        const otherPanel = endPt.closest('.panel-flyout');
        if (otherPanel && otherPanel !== this.panel) {
          const otherId = parseInt(otherPanel.getAttribute('data-copilot-id'), 10);
          const other = CopilotManager.instances.get(otherId);
          if (other) {
            const convId = ConversationManager.link(this, other);
            // Draw a persistent line between the actual connection points
    const startPtEl = startPointEl || this.panel; // starting point on this panel
            const endPtEl = endPt; // drop target point on other panel
            const aCenter = getCenter(startPtEl);
            const bCenter = getCenter(endPtEl);
            const lineId = stableLinkId(this.id, other.id);
            ConnectionLayer.draw(lineId, aCenter, bCenter);
            // Keep line updated on movement/resize/scroll
            const updateLine = () => {
              ConnectionLayer.draw(lineId, getCenter(startPtEl), getCenter(endPtEl));
            };
            // register listeners
            this.panel.addEventListener('mousemove', updateLine);
            other.panel.addEventListener('mousemove', updateLine);
            window.addEventListener('resize', updateLine);
            window.addEventListener('scroll', updateLine, { passive: true });
            // observe size/position changes
            const roA = new ResizeObserver(updateLine);
            const roB = new ResizeObserver(updateLine);
            roA.observe(this.panel);
            roB.observe(other.panel);
            // Initial ensure after drop settles
            setTimeout(updateLine, 0);
            // Track connection for unlink
            this.connections.set(other.id, { lineId, updateLine, ro: [roA, roB] });
            other.connections.set(this.id, { lineId, updateLine, ro: [roB, roA] });
          }
        }
      }
    };
    points.forEach(pt => {
      // Hover menu to unlink
      let hoverTimer = null;
      const showMenu = () => {
        if (!this._convId) return;
        const members = ConversationManager.getMembers(this._convId) || [];
        if (members.length <= 1) return;
        let menu = document.querySelector('.conn-menu');
        if (!menu) {
          menu = document.createElement('div');
          menu.className = 'conn-menu';
          menu.innerHTML = '<button data-action="unlink" title="Koppla isär">Unlink</button>';
          document.body.appendChild(menu);
        }
        const r = pt.getBoundingClientRect();
        menu.style.left = `${r.left + window.scrollX + 8}px`;
        menu.style.top = `${r.top + window.scrollY + 8}px`;
        menu.classList.add('show');
        const onDocClick = (ev) => {
          if (!menu.contains(ev.target)) {
            menu.classList.remove('show');
            document.removeEventListener('mousedown', onDocClick);
          }
        };
        document.addEventListener('mousedown', onDocClick);
        const btn = menu.querySelector('[data-action="unlink"]');
        btn.onclick = (ev) => {
          ev.stopPropagation();
          menu.classList.remove('show');
          this.unlinkSelf();
          document.removeEventListener('mousedown', onDocClick);
        };
      };
      pt.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(showMenu, 600);
      });
      pt.addEventListener('mouseleave', () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      });
      pt.addEventListener('mousedown', (e) => {
        dragging = true; overPoint = null;
        const c = getCenter(pt);
        start = c; startPointEl = pt; ghostId = `ghost_${this.id}_${Date.now()}`;
        document.addEventListener('mousemove', onMove, { passive:false });
        document.addEventListener('mouseup', onUp, { passive:false });
        e.preventDefault(); e.stopPropagation();
      });
      pt.addEventListener('touchstart', (e) => {
        dragging = true; overPoint = null;
        const c = getCenter(pt);
        start = c; startPointEl = pt; ghostId = `ghost_${this.id}_${Date.now()}`;
        document.addEventListener('touchmove', onMove, { passive:false });
        document.addEventListener('touchend', onUp, { passive:false });
        e.preventDefault(); e.stopPropagation();
      }, { passive:false });
    });
  }

  unlinkSelf() {
    if (!this._convId) { toast('Inte länkad.', 'warn'); return; }
    for (const [otherId, { lineId, updateLine, ro }] of this.connections.entries()) {
      ConnectionLayer.remove(lineId);
      this.panel.removeEventListener('mousemove', updateLine);
      const other = CopilotManager.instances.get(otherId);
      if (other) {
        other.panel.removeEventListener('mousemove', updateLine);
        other.connections.delete(this.id);
      }
      window.removeEventListener('resize', updateLine);
      window.removeEventListener('scroll', updateLine);
      if (ro && Array.isArray(ro)) {
        try { ro[0]?.disconnect(); } catch {}
        try { ro[1]?.disconnect(); } catch {}
      }
    }
    this.connections.clear();
    ConversationManager.removeMember(this._convId, this);
    this._convId = null;
    this.panel.classList.remove('active-speaking');
    toast('Urkopplad.');
  }
  #wireDrag() {
    const fab = this.fab;
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    const onDown = (e) => {
      dragging = true; moved = false;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      const r = fab.getBoundingClientRect();
      ox = r.left; oy = r.top;
      document.addEventListener('mousemove', onMove, { passive: false });
      document.addEventListener('mouseup', onUp, { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp, { passive: false });
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - sx;
      const dy = p.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return; // small threshold to avoid jitter
      moved = true;
      const nx = ox + dx;
      const ny = oy + dy;
      fab.style.left = nx + 'px';
      fab.style.top = ny + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
  // If we actually moved, mark drag timestamp to debounce click toggle
  if (moved) this._lastDragAt = Date.now();
      const r = fab.getBoundingClientRect();
      localStorage.setItem(`examai.fab.${this.id}.pos`, JSON.stringify({ x: r.left, y: r.top }));
    };
    fab.addEventListener('mousedown', onDown, { passive: false });
    fab.addEventListener('touchstart', onDown, { passive: false });
    // Restore pos
    try {
      const saved = localStorage.getItem(`examai.fab.${this.id}.pos`);
      if (saved) {
        const { x, y } = JSON.parse(saved);
        if (typeof x === 'number' && typeof y === 'number') {
          fab.style.left = x + 'px'; fab.style.top = y + 'px';
          fab.style.right = 'auto'; fab.style.bottom = 'auto';
        }
      }
    } catch {}
  }
  #wireToggle() {
    this.fab.addEventListener('click', (e) => {
      // Ignore clicks that occur too soon after a drag-end
      const now = Date.now();
      if (now - (this._lastDragAt || 0) < 300) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.panel.classList.contains('hidden')) this.show(); else this.hide();
    });
  }
  #wireSettings() {
    // Initialize values
    this.modelEl.value = localStorage.getItem(`examai.copilot.${this.id}.model`) || this.model;
    this.nameEl.value = localStorage.getItem(`examai.copilot.${this.id}.name`) || this.name;
  if (this.userNameEl) this.userNameEl.value = getGlobalUserName();
  if (this.topicEl) this.topicEl.value = this.topic;
  if (this.roleEl) this.roleEl.value = this.role;
  if (this.useRoleEl) this.useRoleEl.checked = !!this.useRole;
    this.tokensEl.value = String(this.maxTokens);
    this.tokensLabelEl.textContent = String(this.maxTokens);
    this.speedEl.value = String(this.typingSpeed);
    this.#updateSpeedLabel(this.typingSpeed);
    this.renderModeEl.value = (this.renderMode === 'md' ? 'md' : 'raw');
    const instKey = localStorage.getItem(`examai.copilot.${this.id}.key`) || '';
    if (instKey) this.apiKeyEl.value = '•••• •••• ••••';

    // Listeners
    this.modelEl.addEventListener('change', () => {
      this.model = this.modelEl.value;
      localStorage.setItem(`examai.copilot.${this.id}.model`, this.model);
      toast(`Modell uppdaterad: ${this.model}`);
    });
    let tmrName = null;
    this.nameEl.addEventListener('input', () => {
      this.name = this.nameEl.value.trim() || `Copilot ${this.id}`;
      // Update header label
      const nm = this.panel.querySelector('.meta .name');
      if (nm) nm.textContent = this.name;
  if (this.authorEl) this.authorEl.textContent = `Skriver som: ${getGlobalUserName()}`;
  if (this.fab) this.fab.title = this.name;
      if (tmrName) clearTimeout(tmrName);
      tmrName = setTimeout(() => {
        localStorage.setItem(`examai.copilot.${this.id}.name`, this.name);
        toast('Namn uppdaterat.');
      }, 400);
    });
    this.nameEl.addEventListener('blur', () => {
      if (tmrName) { clearTimeout(tmrName); tmrName = null; }
      localStorage.setItem(`examai.copilot.${this.id}.name`, this.name);
      toast('Namn uppdaterat.');
    });
    if (this.topicEl) {
      let tmrTopic = null;
      this.topicEl.addEventListener('input', () => {
        this.topic = this.topicEl.value.trim();
        if (tmrTopic) clearTimeout(tmrTopic);
        tmrTopic = setTimeout(() => {
          localStorage.setItem(`examai.copilot.${this.id}.topic`, this.topic);
          toast('Topic sparad.');
        }, 400);
      });
    }
    if (this.userNameEl) {
      let tU = null;
      const saveUser = () => { setGlobalUserName(this.userNameEl.value || ''); toast('Användarnamn sparat.'); };
      this.userNameEl.addEventListener('input', () => {
        if (tU) clearTimeout(tU);
        tU = setTimeout(saveUser, 400);
      });
      this.userNameEl.addEventListener('blur', saveUser);
    }
    if (this.roleEl) {
      // Autosave on every change
      this.roleEl.addEventListener('input', () => {
        this.role = this.roleEl.value;
        localStorage.setItem(`examai.copilot.${this.id}.role`, this.role);
        this.updateRoleBadge();
      });
      // Confirm and normalize on blur
      this.roleEl.addEventListener('blur', () => {
        this.role = (this.roleEl.value || '').trim();
        localStorage.setItem(`examai.copilot.${this.id}.role`, this.role);
        this.updateRoleBadge();
        // Visual confirmation on badge
        if (this.roleBadgeEl) {
          this.roleBadgeEl.classList.add('saved');
          setTimeout(() => this.roleBadgeEl.classList.remove('saved'), 1200);
        }
        toast('Roll sparad.');
      });
    }
    if (this.useRoleEl) {
      this.useRoleEl.addEventListener('change', () => {
        this.useRole = !!this.useRoleEl.checked;
        localStorage.setItem(`examai.copilot.${this.id}.use_role`, String(this.useRole));
        this.updateRoleBadge();
        toast(this.useRole ? 'Roll kommer användas i prompt.' : 'Roll används inte i prompt.');
      });
    }
    // Badge click toggles useRole
    if (this.roleBadgeEl) {
      this.roleBadgeEl.style.cursor = 'pointer';
      this.roleBadgeEl.addEventListener('click', () => {
        this.useRole = !this.useRole;
        if (this.useRoleEl) this.useRoleEl.checked = this.useRole;
        localStorage.setItem(`examai.copilot.${this.id}.use_role`, String(this.useRole));
        this.updateRoleBadge();
  toast(this.useRole ? 'Roll kommer användas i prompt.' : 'Roll används inte i prompt.');
      });
    }
    // Initial badge state
    this.updateRoleBadge();
    let tmrTok = null;
    this.tokensEl.addEventListener('input', () => {
      this.maxTokens = parseInt(this.tokensEl.value, 10);
      this.tokensLabelEl.textContent = String(this.maxTokens);
      if (tmrTok) clearTimeout(tmrTok);
      tmrTok = setTimeout(() => {
        localStorage.setItem(`examai.copilot.${this.id}.max_tokens`, String(this.maxTokens));
        toast('Max tokens sparat.');
      }, 400);
    });
    let tmrSpd = null;
    this.speedEl.addEventListener('input', () => {
      this.typingSpeed = parseInt(this.speedEl.value, 10);
      this.#updateSpeedLabel(this.typingSpeed);
      if (tmrSpd) clearTimeout(tmrSpd);
      tmrSpd = setTimeout(() => {
        localStorage.setItem(`examai.copilot.${this.id}.typing_speed`, String(this.typingSpeed));
        toast('Skrivhastighet sparad.');
      }, 400);
    });
    this.renderModeEl.addEventListener('change', () => {
      this.renderMode = (this.renderModeEl.value === 'md' ? 'md' : 'raw');
      localStorage.setItem(`examai.copilot.${this.id}.render_mode`, this.renderMode);
      toast(`Visningsläge: ${this.renderMode === 'md' ? 'Markdown' : 'Rå text'}.`);
    });
    this.apiKeyEl.addEventListener('blur', () => {
      const v = (this.apiKeyEl.value || '').trim();
      if (!v || v.startsWith('••')) return;
      localStorage.setItem(`examai.copilot.${this.id}.key`, v);
      this.apiKeyEl.value = '•••• •••• ••••';
  this.updateKeyStatusBadge();
      toast('API-nyckel sparad.');
    });
  }
  #updateSpeedLabel(v) {
    let label = 'Snabb';
    if (v <= 5) label = 'Mycket långsam';
    else if (v <= 20) label = 'Långsam';
    else if (v <= 60) label = 'Medel';
    else if (v <= 90) label = 'Snabb';
    else label = 'Omedelbar';
    this.speedLabelEl.textContent = label;
  }
  updateKeyStatusBadge() {
    if (!this.keyBadgeEl) return;
    const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
    const globalKey = localStorage.getItem('examai.openai.key');
    // hasServerKey is a global set by checkKeyStatus()
    if (perKey) {
      this.keyBadgeEl.textContent = 'Nyckel sparad';
      this.keyBadgeEl.classList.remove('badge-error');
      this.keyBadgeEl.classList.add('badge-ok');
    } else if (typeof hasServerKey !== 'undefined' && hasServerKey) {
      this.keyBadgeEl.textContent = 'Nyckel i server (.env)';
      this.keyBadgeEl.classList.remove('badge-error');
      this.keyBadgeEl.classList.add('badge-ok');
    } else if (globalKey) {
      this.keyBadgeEl.textContent = 'Nyckel sparad';
      this.keyBadgeEl.classList.remove('badge-error');
      this.keyBadgeEl.classList.add('badge-ok');
    } else {
      this.keyBadgeEl.textContent = 'Ingen nyckel';
      this.keyBadgeEl.classList.remove('badge-ok');
      this.keyBadgeEl.classList.add('badge-error');
    }
  }
  updateRoleBadge() {
    if (!this.roleBadgeEl) return;
    const hasRole = !!(this.role && this.role.trim());
    if (!hasRole) {
      this.roleBadgeEl.style.display = 'none';
      return;
    }
    this.roleBadgeEl.style.display = '';
  const short = (this.role || '').trim().slice(0, 24) || 'Roll';
  this.roleBadgeEl.textContent = `${this.useRole ? 'Roll: På' : 'Roll: Av'} · ${short}${(this.role||'').length>24?'…':''}`;
  this.roleBadgeEl.title = this.role || 'Roll';
    this.roleBadgeEl.classList.toggle('badge-ok', !!this.useRole);
    this.roleBadgeEl.classList.toggle('badge-error', !this.useRole);
  }
  #wirePanelDrag() {
    const handle = this.panel.querySelector('[data-role="dragHandle"]');
    if (!handle) return;
    let dragging = false, moved=false, sx=0, sy=0, sl=0, st=0;
    const onDown = (e) => {
      // don't start drag when clicking buttons/inputs/selects
      const target = e.target;
      if (target.closest('button,select,input,textarea')) return;
      dragging = true; moved = false;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      const r = this.panel.getBoundingClientRect();
      sl = r.left; st = r.top;
      document.addEventListener('mousemove', onMove, { passive:false });
      document.addEventListener('mouseup', onUp, { passive:false });
      document.addEventListener('touchmove', onMove, { passive:false });
      document.addEventListener('touchend', onUp, { passive:false });
      e.preventDefault();
    };
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - sx;
      const dy = p.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      const w = this.panel.offsetWidth;
      const h = this.panel.offsetHeight;
      const nl = clamp(sl + dx, 4, window.innerWidth - w - 4);
      const nt = clamp(st + dy, 4, window.innerHeight - h - 4);
      this.panel.style.left = nl + 'px';
      this.panel.style.top = nt + 'px';
      // move FAB to follow under panel
      const fabRect = this.fab.getBoundingClientRect();
      const fx = clamp(nl, 4, window.innerWidth - fabRect.width - 4);
      const fy = clamp(nt + h + 12, 4, window.innerHeight - fabRect.height - 4);
      this.fab.style.left = fx + 'px';
      this.fab.style.top = fy + 'px';
      this.fab.style.right = 'auto';
      this.fab.style.bottom = 'auto';
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      if (!moved && e && e.type === 'mouseup') {
        // treat as click-through: toggle if minimal movement? keep as-is to avoid conflicts
      }
  // mark drag end to debounce fab click-open after moving the panel
  if (moved) this._lastDragAt = Date.now();
      // persist panel and fab positions
      const l = parseInt((this.panel.style.left || '0').replace('px',''), 10) || 0;
      const t = parseInt((this.panel.style.top || '0').replace('px',''), 10) || 0;
      localStorage.setItem(`examai.copilot.${this.id}.pos`, JSON.stringify({ x: l, y: t }));
      const r = this.fab.getBoundingClientRect();
      localStorage.setItem(`examai.fab.${this.id}.pos`, JSON.stringify({ x: r.left, y: r.top }));
    };
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive:false });
  }
  #initInputAutoResize() {
    const MIN = 40, MAX = 300;
    const resize = () => {
      this.inputEl.style.height = 'auto';
      const next = Math.max(MIN, Math.min(MAX, this.inputEl.scrollHeight));
      this.inputEl.style.height = next + 'px';
    };
    this.inputEl.addEventListener('input', resize);
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendFromInput();
      }
    });
    resize();
  }
  #wireResize() {
    const handles = this.panel.querySelectorAll('[data-resize]');
    const MIN_W = 280, MAX_W = Math.min(window.innerWidth * 0.92, 1000);
    const MIN_H = 220, MAX_H = Math.min(window.innerHeight * 0.85, 900);
    let dir = null, sx=0, sy=0, sw=0, sh=0, sl=0, st=0, resizing=false;
    const onDown = (e) => {
      const target = e.currentTarget;
      dir = target.getAttribute('data-resize');
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      const r = this.panel.getBoundingClientRect();
      sx = p.clientX; sy = p.clientY; sw = r.width; sh = r.height; sl = r.left; st = r.top; resizing = true;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive:false });
      document.addEventListener('touchend', onUp);
    };
    const onMove = (e) => {
      if (!resizing) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - sx;
      const dy = p.clientY - sy;
      let newW = sw, newH = sh, newL = sl, newT = st;
      if (dir === 'br' || dir === 'r') {
        newW = Math.max(MIN_W, Math.min(MAX_W, sw + dx));
      }
      if (dir === 'br' || dir === 'b') {
        newH = Math.max(MIN_H, Math.min(MAX_H, sh + dy));
      }
      if (dir === 'l') {
        // expand/shrink from left edge
        const rawW = sw - dx;
        newW = Math.max(MIN_W, Math.min(MAX_W, rawW));
        const maxDx = sw - newW; // how much left can move rightwards
        newL = sl + Math.min(Math.max(dx, -10000), maxDx);
      }
      if (dir === 't') {
        const rawH = sh - dy;
        newH = Math.max(MIN_H, Math.min(MAX_H, rawH));
        const maxDy = sh - newH;
        newT = st + Math.min(Math.max(dy, -10000), maxDy);
      }
      this.panel.style.width = newW + 'px';
      this.panel.style.height = newH + 'px';
      if (dir === 'l' || dir === 't') {
        this.panel.style.left = newL + 'px';
        this.panel.style.top = newT + 'px';
      }
    };
    const onUp = () => {
      if (!resizing) return;
      resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      const w = parseInt((this.panel.style.width || '0').replace('px',''), 10) || 0;
      const h = parseInt((this.panel.style.height || '0').replace('px',''), 10) || 0;
      if (w && h) localStorage.setItem(`examai.copilot.${this.id}.size`, JSON.stringify({ w, h }));
      const l = parseInt((this.panel.style.left || '0').replace('px',''), 10) || 0;
      const t = parseInt((this.panel.style.top || '0').replace('px',''), 10) || 0;
      localStorage.setItem(`examai.copilot.${this.id}.pos`, JSON.stringify({ x: l, y: t }));
    };
    handles.forEach(h => {
      h.addEventListener('mousedown', onDown);
      h.addEventListener('touchstart', onDown, { passive:false });
    });
    // Restore size
    try {
      const s = localStorage.getItem(`examai.copilot.${this.id}.size`);
      if (s) {
        const { w, h } = JSON.parse(s);
        if (w) this.panel.style.width = w + 'px';
        if (h) this.panel.style.height = h + 'px';
      }
      const p = localStorage.getItem(`examai.copilot.${this.id}.pos`);
      if (p) {
        const { x, y } = JSON.parse(p);
        if (Number.isFinite(x)) this.panel.style.left = x + 'px';
        if (Number.isFinite(y)) this.panel.style.top = y + 'px';
      }
    } catch {}
  }
  #wireSubmit() {
    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendFromInput();
    });
  }
  show() {
    const r = this.fab.getBoundingClientRect();
    const px = Math.min(window.innerWidth - 20, r.left);
    const py = Math.max(10, r.top - (this.panel.offsetHeight || 320) - 12);
    this.panel.style.left = px + 'px';
    this.panel.style.top = py + 'px';
    this.panel.classList.remove('hidden');
    requestAnimationFrame(() => this.panel.classList.add('show'));
  }
  hide() {
    this.panel.classList.remove('show');
    setTimeout(() => this.panel.classList.add('hidden'), 180);
  }
  addUser(text, author) {
    const div = document.createElement('div');
    div.className = 'bubble user';
  const name = (author && author.trim()) ? author : getGlobalUserName();
    div.innerHTML = `<div class="msg-author">${escapeHtml(name)}</div><div class="msg-text"></div>`;
    const msgEl = div.querySelector('.msg-text');
    msgEl.textContent = text;
    this.msgEl.appendChild(div);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
  }
  addAssistant(text, author) {
    const el = document.createElement('div');
    el.className = 'assistant';
  const name = (author && author.trim()) ? author : this.name;
    el.innerHTML = `<div class="msg-author">${escapeHtml(name)}</div><div class="msg-text"></div>`;
    const msgEl = el.querySelector('.msg-text');
    if ((this.renderMode || 'raw') === 'md' && window.markdownit) {
      const mdloc = window.markdownit({ html:false, linkify:true, breaks:true });
      msgEl.innerHTML = mdloc.render(text || '');
    } else {
      msgEl.textContent = text || '';
    }
    this.msgEl.appendChild(el);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
  }
  #renderTyping(text) {
    // typing effect influenced by this.typingSpeed
    const el = document.createElement('div');
    el.className = 'assistant typing';
  el.innerHTML = `<div class="msg-author">${escapeHtml(this.name)}</div><div class="msg-text"></div>`;
    const msgEl = el.querySelector('.msg-text');
    this.msgEl.appendChild(el);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
    const len = (text || '').length;
    if (len === 0) { el.classList.remove('typing'); return; }
    const targetMs = Math.max(0, 4000 - Math.round((Math.max(0, Math.min(100, this.typingSpeed)) / 100) * 4000));
    const frameMs = 16; const frames = Math.max(1, Math.round(targetMs / frameMs));
    const chunk = Math.max(1, Math.ceil(len / frames));
    let i = 0; const timer = setInterval(() => {
      i = Math.min(len, i + chunk);
      msgEl.textContent = text.slice(0, i);
      this.msgEl.scrollTop = this.msgEl.scrollHeight;
      if (i >= len) { clearInterval(timer); el.classList.remove('typing'); if ((this.renderMode||'raw')==='md' && window.markdownit) { const mdloc = window.markdownit({html:false,linkify:true,breaks:true}); msgEl.innerHTML = mdloc.render(text||''); } else { msgEl.textContent = text||''; } }
    }, frameMs);
  }
  async sendFromInput() {
    const msg = (this.inputEl.value || '').trim();
    if (!msg) return;
    // If globally paused, handle queueing behavior
    if (PauseManager.isPaused()) {
      // Always render the user message immediately
      this.addUser(msg);
      this.inputEl.value = '';
      if (this._convId) {
        // linked conv: let ConversationManager enqueue (it will detect pause)
        ConversationManager.enqueueUser(this, msg);
      } else {
        // independent: queue in PauseManager
        PauseManager.queueIndependent(this.id, msg);
      }
      toast('Flöde pausat – meddelandet köades.', 'warn');
      return;
    }
    if (this._convId) {
      // shared conversation; enqueue and let manager handle turn-taking and rendering across members
      this.addUser(msg); // render on sender immediately
      ConversationManager.enqueueUser(this, msg);
      this.inputEl.value = '';
      return;
    }
    // Independent instance flow
    this.addUser(msg);
    this.inputEl.value = '';
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
    const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '1000', 10) || 1000)));
    try {
  let messages = [...this.history, { role: 'user', content: msg }];
  if (this.useRole && (this.role || '').trim()) {
        messages = [{ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` }, ...messages];
      } else if (!this.useRole && (this.role || '').trim()) {
        messages = [{ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' }, ...messages];
      }
      // If linked, include shared history so any member can reply with context
      if (this._convId) {
        const shared = ConversationManager.getHistory(this._convId) || [];
        messages = [...shared];
      }
      const model = this.model || 'gpt-5-mini';
      const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
      const body = { message: msg, messages, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined) };
      const m = (model || '').toLowerCase();
  body.max_tokens = maxTok;
      const res = await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = null; let rawText = '';
      try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
      if (!res.ok) { this.addAssistant((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); return; }
      const reply = data.reply || '(inget svar)';
      if ((this.renderMode||'raw') === 'md') {
        // show directly in md (no typing) for markdown mode
        this.addAssistant(reply);
      } else {
        this.#renderTyping(reply);
      }
      if (!this._convId) {
        this.history.push({ role: 'user', content: msg });
        if (data && data.reply) this.history.push({ role: 'assistant', content: data.reply });
      } else {
        // record assistant in shared conv; update visual speaking state reset
        if (data && data.reply) ConversationManager.recordAssistant(this._convId, data.reply);
        // Remove speaking highlight after reply lands
        this.panel.classList.remove('active-speaking');
      }
    } catch (e) {
      this.addAssistant('Nätverksfel.');
    }
  }

  // Used by PauseManager to flush a queued independent message
  async sendQueued(msg) {
    // Render already happened at enqueue time, so only perform the network call and assistant rendering
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
    const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '1000', 10) || 1000)));
    try {
      let messages = [...this.history, { role: 'user', content: msg }];
      if (this.useRole && (this.role || '').trim()) {
        messages = [{ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` }, ...messages];
      } else if (!this.useRole && (this.role || '').trim()) {
        messages = [{ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' }, ...messages];
      }
      const model = this.model || 'gpt-5-mini';
      const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
      const body = { message: msg, messages, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined) };
      body.max_tokens = maxTok;
      const res = await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = null; let rawText = '';
      try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
      if (!res.ok) { this.addAssistant((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); return; }
      const reply = data.reply || '(inget svar)';
      if ((this.renderMode||'raw') === 'md') this.addAssistant(reply); else this.#renderTyping(reply);
      this.history.push({ role: 'user', content: msg });
      if (data && data.reply) this.history.push({ role: 'assistant', content: data.reply });
    } catch {
      this.addAssistant('Nätverksfel.');
    }
  }

  async generateReply(messages) {
    // Build request using this instance's settings
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
    const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '1000', 10) || 1000)));
    const model = this.model || 'gpt-5-mini';
    const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
    // If part of linked conversation, include all members' topics as system prompts
    let finalMsgs = messages;
    if (this._convId) {
      const sys = [];
      // Responderns egna roll och Topic (ingen referens till andra copiloter)
      if (this.useRole && (this.role || '').trim()) {
        sys.push({ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` });
      } else if (!this.useRole && (this.role || '').trim()) {
        sys.push({ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' });
      }
      const myTopic = (this.topic || '').trim();
      if (myTopic) sys.push({ role: 'system', content: `Håll dig till ämnet: ${myTopic}.` });
      finalMsgs = [...sys, ...messages];
    }
    const body = { message: finalMsgs[finalMsgs.length-1]?.content || '', messages: finalMsgs, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined) };
    const m = (model || '').toLowerCase();
  body.max_tokens = maxTok;
  const res = await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null; let rawText = '';
  try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.');
  return (data && data.reply) || '(inget svar)';
  }
}

// Manager and plus button
const CopilotManager = (() => {
  let nextId = 1;
  const instances = new Map();
  function add() {
    const id = nextId++;
    const cp = new CopilotInstance(id, {});
    instances.set(id, cp);
    return cp;
  }
  return { add, instances };
})();

document.getElementById('addCopilotBtn')?.addEventListener('click', () => {
  CopilotManager.add();
});
