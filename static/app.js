const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const chatWindow = $('#chatWindow');
const messageInput = $('#messageInput');
const chatForm = $('#chatForm');
const sendButton = $('#sendButton');
const CHAT_STORAGE_KEY = 'axo_conversations_v1';
const SETTINGS_STORAGE_KEY = 'axo_preferences_v1';
let conversations = [];
let activeConversation = null;
let busy = false;
let activeMaps = [];
let apiCatalog = [];
let settings = { theme: 'dark', enterToSend: true, voiceReplies: false, voiceLanguage: 'en-IN',
  name: '', address: 'name', customAddress: '', greetShow: true, greetSpeak: true, greetChime: true,
  accent: '#3989f6', fontSize: '100', compactMode: false, reduceMotion: false,
  voiceName: 'en-GB-RyanNeural', voiceRate: -5, autoOpen: true, openTarget: 'new_tab',
  notifications: true, platform: 'youtube', videoPlatform: 'youtube', searchEngine: 'google',
  ai: { provider: 'auto', url: '', key: '', model: '', agent: true },
  gmail: { email: '', password: '' }, github: { token: '' }, firebase: { service_account: '' }, telegram: { token: '', chat: '' }, contactsText: '' };
const ACCENTS = ['#3989f6', '#a3e635', '#f472b6', '#f59e0b', '#a78bfa', '#22d3ee', '#ef4444'];
const LOGO_URL = '/static/logo.png';
let voiceRecognition = null;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}

function setCoreState(state, label) {
  const mode = $('#modeHint');
  if (mode) {
    const labels = { idle: 'Chats are saved on this device', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' };
    mode.textContent = label || labels[state] || labels.idle;
  }
}

function makeId() {
  return (window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
}
function currentChat() {
  if (!activeConversation) activeConversation = { id: makeId(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  return activeConversation;
}
function persistConversations() {
  const chat = activeConversation;
  if (chat && chat.messages.length > 100) chat.messages = chat.messages.slice(-100);
  if (chat && chat.messages.length && !conversations.some(item => item.id === chat.id)) conversations.push(chat);
  if (chat && conversations.some(item => item.id === chat.id)) {
    const index = conversations.findIndex(item => item.id === chat.id);
    conversations[index] = chat;
  }
  conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  conversations = conversations.slice(0, 40);
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations));
  } catch (error) {
    conversations = conversations.slice(0, 20);
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); }
    catch { toast('Browser storage is full. Remove a few older chats to save more.'); }
  }
  renderChatHistory($('#historySearch')?.value || '');
}
function readSavedData() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
    conversations = Array.isArray(saved) ? saved.filter(item => item && typeof item.id === 'string' && Array.isArray(item.messages)) : [];
  } catch { conversations = []; }
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    settings = { ...settings, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch { /* keep defaults */ }
  settings.ai = { provider: 'auto', url: '', key: '', model: '', agent: true, ...(settings.ai || {}) };
  applySettings();
  renderChatHistory();
  if (conversations.length) loadConversation(conversations[0].id);
  else newChat(false);
}
function titleFromMessage(message) {
  const compact = String(message || '').replace(/\s+/g, ' ').trim();
  return compact.length > 38 ? `${compact.slice(0, 38).trim()}…` : (compact || 'New chat');
}
function renderChatHistory(query = '') {
  const host = $('#chatHistoryList');
  if (!host) return;
  const search = query.trim().toLowerCase();
  host.innerHTML = '';
  const matches = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).filter(item => {
    if (!search) return true;
    return (item.title || '').toLowerCase().includes(search) || item.messages.some(message => String(message.content || '').toLowerCase().includes(search));
  });
  if (!matches.length) {
    host.innerHTML = `<div class="history-empty">${search ? 'No matching conversations.' : 'Your saved chats will appear here.'}</div>`;
    return;
  }
  matches.forEach(item => {
    const row = document.createElement('div');
    row.className = `history-item${activeConversation?.id === item.id ? ' active' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'history-item-title';
    select.textContent = item.title || 'New chat';
    select.title = item.title || 'New chat';
    select.addEventListener('click', () => loadConversation(item.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-delete';
    remove.title = 'Delete conversation';
    remove.setAttribute('aria-label', `Delete ${item.title || 'conversation'}`);
    remove.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>';
    remove.addEventListener('click', event => { event.stopPropagation(); deleteConversation(item.id); });
    row.append(select, remove);
    host.append(row);
  });
}
function clearActiveMaps() {
  activeMaps.forEach(map => { try { map.remove(); } catch {} });
  activeMaps = [];
}
function newChat(closeMenu = true) {
  clearActiveMaps();
  activeConversation = { id: makeId(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  chatWindow.innerHTML = '';
  $('#welcomeScreen')?.classList.remove('hidden');
  showPanel('chat');
  if (closeMenu) closeSidebar();
  messageInput.value = '';
  messageInput.style.height = 'auto';
  setCoreState('idle');
  renderChatHistory($('#historySearch')?.value || '');
  messageInput.focus();
}
function loadConversation(id) {
  const found = conversations.find(item => item.id === id);
  if (!found) return;
  clearActiveMaps();
  activeConversation = found;
  chatWindow.innerHTML = '';
  $('#welcomeScreen')?.classList.toggle('hidden', found.messages.length > 0);
  found.messages.forEach(message => {
    const handle = addMessage(message.role, message.content || '', message.extras || null);
    if (message.role === 'assistant' && message.extras) renderIntelligence(message.extras, handle.richHost);
  });
  renderChatHistory($('#historySearch')?.value || '');
  showPanel('chat');
  closeSidebar();
}
function deleteConversation(id) {
  conversations = conversations.filter(item => item.id !== id);
  if (activeConversation?.id === id) {
    activeConversation = null;
    clearActiveMaps();
    if (conversations.length) loadConversation(conversations[0].id);
    else newChat();
  }
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); } catch { /* ignore */ }
  renderChatHistory($('#historySearch')?.value || '');
  toast('Conversation deleted.');
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); }
  catch { toast('Could not save preferences in this browser.'); }
}
function applySettings() {
  let theme = settings.theme || 'dark';
  if (theme === 'system') theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const themeInput = $('#themeSetting');
  const enterInput = $('#enterSendSetting');
  const voiceInput = $('#voiceReplySetting');
  const langInput = $('#voiceLanguageSetting');
  if (themeInput) themeInput.value = settings.theme || 'dark';
  if (enterInput) enterInput.checked = settings.enterToSend !== false;
  if (voiceInput) voiceInput.checked = !!settings.voiceReplies;
  if (langInput) langInput.value = settings.voiceLanguage || 'en-IN';
  if (voiceRecognition) voiceRecognition.lang = settings.voiceLanguage || 'en-IN';
  const set = (id, key, isCheck) => { const el = $(id); if (el) { if (isCheck) el.checked = !!settings[key]; else el.value = settings[key] ?? ''; } };
  set('#nameSetting', 'name'); set('#addressSetting', 'address'); set('#customAddressSetting', 'customAddress');
  set('#greetShowSetting', 'greetShow', true); set('#greetSpeakSetting', 'greetSpeak', true); set('#greetChimeSetting', 'greetChime', true);
  set('#fontSizeSetting', 'fontSize'); set('#voiceNameSetting', 'voiceName'); set('#voiceRateSetting', 'voiceRate');
  set('#compactSetting', 'compactMode', true); set('#reduceMotionSetting', 'reduceMotion', true);
  set('#autoOpenSetting', 'autoOpen', true); set('#platformSetting', 'platform');
  set('#videoPlatformSetting', 'videoPlatform'); set('#searchEngineSetting', 'searchEngine'); set('#openTargetSetting', 'openTarget');
  set('#notificationsSetting', 'notifications', true);
  const cr = $('#customAddressRow'); if (cr) cr.style.display = settings.address === 'custom' ? '' : 'none';
  const rl = $('#rateLabel'); if (rl) { const r = Number(settings.voiceRate) || 0; rl.textContent = r === 0 ? 'Normal' : (r > 0 ? `Faster (+${r}%)` : `Slower (${r}%)`); }
  document.documentElement.style.setProperty('--blue', settings.accent || '#3989f6');
  document.documentElement.style.setProperty('--blue-2', settings.accent || '#67a7ff');
  document.documentElement.style.fontSize = ((Number(settings.fontSize) || 100) / 100 * 16) + 'px';
  $$('#accentSwatches button').forEach(b => b.classList.toggle('on', b.dataset.c === settings.accent));
  const gp = $('#greetPreview'); if (gp) gp.textContent = greetingText() + '.';
  const an = $('#accountName'); if (an) an.textContent = settings.name ? settings.name : 'AXO Assistant';
  const ai = settings.ai || {}, gm = settings.gmail || {}, gh = settings.github || {};
  const v = (id, val) => { const el = $(id); if (el && document.activeElement !== el) el.value = val ?? ''; };
  v('#aiProvider', ai.provider); v('#aiUrl', ai.url); v('#aiKey', ai.key); v('#aiModel', ai.model);
  const ag = $('#aiAgent'); if (ag) ag.checked = ai.agent !== false;
  const ur = $('#aiUrlRow'); if (ur) ur.style.display = ai.provider === 'custom' ? '' : 'none';
  document.documentElement.classList.toggle('compact-mode', !!settings.compactMode);
  document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
  const status = $('#apiStatus'); if (status) status.textContent = ai.key ? 'AI KEY SAVED' : 'LOCAL CORE';
  v('#fbJson', (settings.firebase || {}).service_account); v('#tgToken', (settings.telegram || {}).token); v('#tgChat', (settings.telegram || {}).chat); v('#contactsText', settings.contactsText);
  v('#gmEmail', gm.email); v('#gmPass', gm.password); v('#ghToken', gh.token);
  renderWelcome();
}
function addressName() {
  const n = (settings.name || '').trim();
  switch (settings.address) {
    case 'Sir': return 'Sir';
    case 'Madam': return 'Madam';
    case 'Boss': return 'Boss';
    case 'namesir': return n ? `${n} Sir` : 'Sir';
    case 'custom': return (settings.customAddress || '').trim() || n;
    default: return n;
  }
}
function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Hello';
}
function greetingText() { const a = addressName(); return a ? `${timeGreeting()}, ${a}` : timeGreeting(); }
function renderWelcome() {
  const h = $('#welcomeTitle'); if (!h) return;
  if (settings.name && settings.greetShow) { h.textContent = greetingText(); h.classList.add('greeting'); }
  else { h.textContent = 'What can I help with?'; h.classList.remove('greeting'); }
}
function openSettings() {
  const modal = $('#settingsModal');
  closeSidebar();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  applySettings();
  refreshLibraryCounts();
}
function showSettingsSection(name) {
  $$('#spNav button').forEach(b => b.classList.toggle('active', b.dataset.sec === name));
  $$('.sp-sec').forEach(sec => sec.classList.toggle('active', sec.id === `sec-${name}`));
  $('.sp-content')?.scrollTo(0, 0);
}
function closeSettings() {
  const modal = $('#settingsModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
function closeSidebar() {
  $('#sidebar')?.classList.remove('open');
  $('#sidebarScrim')?.classList.remove('visible');
}

function addMessage(role, text, extras = null) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (role === 'user') avatar.textContent = ((settings.name || 'U').trim()[0] || 'U').toUpperCase();
  else { avatar.classList.add('logo-avatar'); const img = document.createElement('img'); img.src = LOGO_URL; img.alt = 'AXO logo'; img.draggable = false; avatar.append(img); }
  const content = document.createElement('div');
  content.className = 'message-content';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text || '';
  content.append(bubble);
  const richHost = document.createElement('div');
  richHost.className = 'chat-rich-content';
  if (role === 'assistant') content.append(richHost);
  wrap.append(avatar, content);
  chatWindow.append(wrap);
  $('#welcomeScreen')?.classList.add('hidden');
  wrap.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return { wrap, bubble, richHost };
}

let axuAudio = null;
async function speak(text) {
  if (!text) { setCoreState('idle'); return; }
  const spoken = String(text).replace(/https?:\/\/\S+/g, 'link').replace(/[*_`#]/g, '').slice(0, 650);
  try {
    if (axuAudio) { axuAudio.pause(); axuAudio = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const response = await fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: spoken, voice: settings.voiceName, rate: Number(settings.voiceRate) || 0 })
    });
    if (!response.ok) throw new Error('Neural voice unavailable');
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    axuAudio = new Audio(audioUrl);
    axuAudio.onplay = () => setCoreState('speaking');
    axuAudio.onended = () => { setCoreState('idle'); URL.revokeObjectURL(audioUrl); axuAudio = null; };
    axuAudio.onerror = () => { URL.revokeObjectURL(audioUrl); axuAudio = null; fallbackSpeak(spoken); };
    await axuAudio.play();
  } catch (_) { fallbackSpeak(spoken); }
}
function fallbackSpeak(text) {
  if (!('speechSynthesis' in window)) { setCoreState('idle'); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const chosenVoice = String(settings.voiceName || 'en-GB-RyanNeural');
  const chosenLocale = chosenVoice.split('-').slice(0, 2).join('-');
  utterance.lang = chosenLocale || settings.voiceLanguage || 'en-IN';
  utterance.rate = Math.max(0.7, Math.min(1.3, 0.94 + (Number(settings.voiceRate) || 0) / 100));
  utterance.pitch = 0.88;
  const chooseVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const wantedName = chosenVoice.replace(/Neural$/i, '').toLowerCase();
    const preferred = voices.find(v => v.name.toLowerCase().includes(wantedName.split('-').slice(2).join('-').toLowerCase()) && v.lang.toLowerCase().startsWith(chosenLocale.toLowerCase()));
    const localeMatch = voices.find(v => v.lang.toLowerCase() === chosenLocale.toLowerCase());
    const british = voices.find(v => /^en-GB/i.test(v.lang));
    if (preferred || localeMatch || british) utterance.voice = preferred || localeMatch || british;
    utterance.onstart = () => setCoreState('speaking');
    utterance.onend = () => setCoreState('idle');
    utterance.onerror = () => setCoreState('idle');
    window.speechSynthesis.speak(utterance);
  };
  chooseVoice();
}

async function sendMessage(rawText) {
  const message = (rawText || '').trim();
  if (!message || busy) return;
  busy = true;
  sendButton.disabled = true;
  messageInput.value = '';
  messageInput.style.height = 'auto';
  const chat = currentChat();
  addMessage('user', message);
  chat.messages.push({ role: 'user', content: message, createdAt: Date.now() });
  if (chat.messages.filter(item => item.role === 'user').length === 1) chat.title = titleFromMessage(message);
  chat.updatedAt = Date.now();
  persistConversations();
  const contextHistory = chat.messages.slice(0, -1).filter(item => ['user', 'assistant'].includes(item.role)).slice(-8).map(item => ({ role: item.role, content: item.content }));
  // Open a tab inside the click gesture so the browser doesn't block the redirect later.
  let preWin = null;
  if (settings.autoOpen !== false && /^\s*(play|watch|listen|open|search|google)\b/i.test(message)) {
    try { preWin = window.open('about:blank', '_blank'); } catch { preWin = null; }
  }
  const assistantHandle = addMessage('assistant', 'Thinking…');
  assistantHandle.bubble.classList.add('thinking');
  setCoreState('thinking');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: contextHistory, prefs: { platform: settings.platform, video_platform: settings.videoPlatform, search_engine: settings.searchEngine || 'google', contacts: contactsMap() },
        ai: { provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key, agent: (settings.ai || {}).agent !== false, address: addressName() }, integrations: integrationsPayload() })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'The request failed.');
    const reply = data.reply || 'Done.';
    assistantHandle.bubble.textContent = reply;
    assistantHandle.bubble.classList.remove('thinking');
    const extras = {};
    ['action', 'actions', 'confirms', 'reminders', 'news', 'images', 'map', 'cards', 'charts', 'trace', 'source', 'intent'].forEach(key => {
      if (data[key] !== undefined) extras[key] = (key === 'images' ? data[key].slice(0, 12) : key === 'news' ? data[key].slice(0, 10) : data[key]);
    });
    chat.messages.push({ role: 'assistant', content: reply, extras, createdAt: Date.now() });
    chat.updatedAt = Date.now();
    persistConversations();
    renderIntelligence(extras, assistantHandle.richHost);
    (data.reminders || []).forEach(scheduleReminder);
    const actions = Array.isArray(data.actions) && data.actions.length ? data.actions : (data.action ? [data.action] : []);
    const autoAction = actions.find(x => x && x.auto === true);
    if (settings.autoOpen !== false && autoAction) {
      if (autoAction.type === 'open_app') {
        if (preWin && !preWin.closed) { try { preWin.close(); } catch { /* ignore */ } }
        preWin = null;
        setTimeout(() => { if (!launchApp(autoAction)) toast('This app could not be opened here.'); }, 180);
      } else {
        const targetUrl = safeHttpUrl(autoAction.url);
        if (targetUrl) {
          let opened = false;
          if (settings.openTarget === 'same_tab') {
            if (preWin && !preWin.closed) { try { preWin.close(); } catch { /* ignore */ } }
            preWin = null;
            window.location.assign(targetUrl);
            opened = true;
          } else {
            if (preWin && !preWin.closed) { try { preWin.location.href = targetUrl; opened = true; } catch { opened = false; } }
            if (!opened) { const w = window.open(targetUrl, '_blank', 'noopener,noreferrer'); opened = !!w; }
            preWin = null;
          }
          if (!opened) toast('Your browser blocked the new tab — tap the link shown below.');
        }
      }
    } else if (actions.some(a => a?.url)) {
      toast('Link ready.');
    }
    if (preWin && !preWin.closed) { try { preWin.close(); } catch { /* ignore */ } }
    if (settings.voiceReplies) speak(reply);
    else setCoreState('idle');
    setCoreState('idle');
  } catch (error) {
    const failedReply = `I couldn't complete that request. ${error.message}`;
    assistantHandle.bubble.textContent = failedReply;
    assistantHandle.bubble.classList.remove('thinking');
    if (preWin && !preWin.closed) { try { preWin.close(); } catch { /* ignore */ } }
    chat.messages.push({ role: 'assistant', content: failedReply, createdAt: Date.now() });
    chat.updatedAt = Date.now();
    persistConversations();
    setCoreState('idle');
  } finally {
    busy = false;
    sendButton.disabled = false;
    messageInput.focus();
    messageInput.style.height = 'auto';
  }
}

function resultBlock(label, meta = '') {
  const block = document.createElement('section');
  block.className = 'result-block';
  const header = document.createElement('div');
  header.className = 'result-header';
  const title = document.createElement('span');
  title.className = 'result-label';
  title.textContent = label;
  const note = document.createElement('span');
  note.className = 'result-meta';
  note.textContent = meta;
  header.append(title, note);
  block.append(header);
  return block;
}
function addText(parent, text, className) {
  const el = document.createElement('div');
  if (className) el.className = className;
  el.textContent = text ?? '';
  parent.append(el);
  return el;
}
function contactsMap() {
  const out = {};
  String(settings.contactsText || '').split('\n').forEach(line => { const i = line.indexOf(':'); if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim(); if (k && v) out[k] = v; } });
  return out;
}
function integrationsPayload() {
  return { gmail: settings.gmail || {}, github: settings.github || {}, firebase: settings.firebase || {}, telegram: settings.telegram || {}, contacts: contactsMap() };
}
const SAFE_SCHEME = /^(intent|tel|sms|mailto|geo|https?|whatsapp|tg|vnd\.youtube|fb|instagram|twitter|spotify|googlegmail|comgooglemaps|nflx|snapchat|linkedin|reddit|snssdk1233|clock-alarm|calshow|photos-redirect|music|github|googlechrome|App-Prefs):/i;
function appTarget(a) {
  const ua = navigator.userAgent;
  let t = /Android/i.test(ua) ? a.uri : (/iPhone|iPad|iPod/i.test(ua) ? (a.ios || a.web) : a.web);
  if (/^(tel|sms|whatsapp|https):/i.test(a.uri) && !/^intent/i.test(a.uri)) t = a.uri;
  return SAFE_SCHEME.test(t || '') ? t : '';
}
function launchApp(a) {
  const t = appTarget(a); if (!t) return false;
  if (/^https?:/i.test(t)) { return !!window.open(t, '_blank'); }
  window.location.href = t; return true;
}
function appLogo(a) {
  const box = document.createElement('span'); box.className = 'app-logo';
  const icon = a.icon || '';
  if (/^[a-z0-9]+$/i.test(icon) && icon.length > 2) {
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
    img.src = `https://cdn.simpleicons.org/${icon}/${a.color || 'ffffff'}`;
    img.onerror = () => { box.textContent = (a.name || '?')[0]; };
    box.append(img);
  } else box.textContent = icon || (a.name || '?')[0];
  return box;
}
function renderConfirm(c, host) {
  const card = document.createElement('div'); card.className = 'confirm-card';
  const title = document.createElement('strong'); title.textContent = c.summary || 'Confirm action';
  const pre = document.createElement('pre');
  const p = c.payload || {};
  pre.textContent = c.kind === 'telegram' ? (p.text || '') : c.kind === 'email' ? `To: ${p.to}\nSubject: ${p.subject}\n\n${p.body}` : `${p.title}\n\n${p.body || ''}`;
  const row = document.createElement('div'); row.className = 'confirm-actions';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.textContent = c.kind === 'github_issue' ? 'Create' : 'Send';
  const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Cancel';
  go.addEventListener('click', async () => {
    go.disabled = no.disabled = true; go.textContent = 'Working…';
    try {
      const res = await fetch('/api/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: c.kind, payload: p, integrations: integrationsPayload() }) });
      const d = await res.json(); if (!res.ok || !d.ok) throw new Error(d.error || 'Failed');
      row.textContent = '✓ ' + d.message; toast(d.message);
    } catch (error) { row.textContent = '✗ ' + error.message; }
  });
  no.addEventListener('click', () => { row.textContent = 'Cancelled.'; });
  row.append(go, no); card.append(title, pre, row); host.append(card);
}
function scheduleReminder(r) {
  const ms = Math.max(1000, Number(r.minutes) * 60000);
  if (settings.notifications) {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
  }
  setTimeout(() => {
    toast(`⏰ ${r.text}`);
    try { if (settings.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification('AXO reminder', { body: r.text, icon: LOGO_URL }); } catch { /* ignore */ }
    speak(`Reminder: ${r.text}`);
  }, ms);
}
function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''), window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch { return ''; }
}
function addLink(parent, url, text) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return;
  const a = document.createElement('a');
  a.className = 'result-link';
  a.href = safeUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = `${text || 'OPEN SOURCE'} ↗`;
  parent.append(a);
}
function statGrid(parent, entries) {
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  entries.forEach(([label, value]) => {
    const stat = document.createElement('div');
    stat.className = 'stat';
    const val = document.createElement('b');
    val.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    const key = document.createElement('span');
    key.textContent = label;
    stat.append(val, key);
    grid.append(stat);
  });
  parent.append(grid);
}
function itemList(parent, items, formatter) {
  const list = document.createElement('div');
  list.className = 'item-list';
  (items || []).slice(0, 8).forEach(item => {
    const row = document.createElement('article');
    row.className = 'item-row';
    const title = document.createElement('strong');
    title.textContent = formatter.title(item);
    row.append(title);
    if (formatter.description) addText(row, formatter.description(item), '');
    if (formatter.url) addLink(row, formatter.url(item), 'OPEN');
    list.append(row);
  });
  parent.append(list);
}
function renderIntelligence(data, host) {
  if (!host) return;
  host.innerHTML = '';
  let blocks = 0;
  if (data.map) { renderMapBlock(data.map, host); blocks++; }
  if (Array.isArray(data.images) && data.images.length) { renderImageBlock(data.images, host); blocks++; }
  (data.cards || []).forEach(card => { renderDataCard(card, host); blocks++; });
  if (Array.isArray(data.news) && data.news.length) { renderNewsBlock(data.news, host); blocks++; }
  const acts = Array.isArray(data.actions) && data.actions.length ? data.actions : (data.action ? [data.action] : []);
  if (acts.length && (!blocks || acts.length > 1)) {
    const block = resultBlock('LINK', data.intent || 'ACTION');
    const body = document.createElement('div'); body.className = 'result-body';
    addText(body, acts.length > 1 ? 'Opened / ready links:' : 'Open this link:', 'result-text');
    acts.forEach(a => {
      if (a?.type === 'open_app') {
        const t = appTarget(a); if (!t) return;
        const el = document.createElement('a'); el.className = 'result-link app-link'; el.href = t;
        el.append(appLogo(a), document.createTextNode(a.label || 'OPEN'));
        el.addEventListener('click', ev => { ev.preventDefault(); launchApp(a); });
        body.append(el);
      } else if (a?.url) addLink(body, a.url, a.label || 'OPEN');
    });
    block.append(body); host.append(block); blocks++;
  }
  (data.confirms || []).forEach(c => renderConfirm(c, host));
}

function renderImageBlock(images, host) {
  const block = resultBlock('IMAGE SEARCH', `${images.length} RESULTS · OPEN MEDIA`);
  const body = document.createElement('div'); body.className = 'result-body';
  const grid = document.createElement('div'); grid.className = 'image-gallery';
  images.forEach(item => {
    const tile = document.createElement('article'); tile.className = 'image-tile';
    const link = document.createElement('a'); link.href = safeHttpUrl(item.url || item.image) || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const imageUrl = safeHttpUrl(item.image);
    if (!imageUrl) return;
    const img = document.createElement('img'); img.src = imageUrl; img.alt = item.title || 'Search result'; img.loading = 'lazy';
    img.onerror = () => tile.remove();
    link.append(img);
    const caption = document.createElement('div'); caption.className = 'image-caption'; caption.textContent = item.title || 'Untitled image';
    link.append(caption);
    const license = document.createElement('div'); license.className = 'image-license'; license.textContent = `${item.source || 'Image source'} · ${item.license || 'Check source licence'}`;
    tile.append(link, license); grid.append(tile);
  });
  body.append(grid); block.append(body); host.append(block);
}

function renderMapBlock(place, host) {
  const block = resultBlock('GEOSPATIAL VIEW', 'SATELLITE IMAGERY');
  const body = document.createElement('div'); body.className = 'result-body';
  const top = document.createElement('div'); top.className = 'map-top';
  const name = document.createElement('div'); name.className = 'result-text'; name.textContent = place.display_name || place.name;
  const toggles = document.createElement('div'); toggles.className = 'map-toggle';
  const sat = document.createElement('button'); sat.type = 'button'; sat.className = 'active'; sat.textContent = 'SATELLITE';
  const street = document.createElement('button'); street.type = 'button'; street.textContent = 'STREET';
  toggles.append(sat, street); top.append(name, toggles);
  const mapNode = document.createElement('div'); mapNode.className = 'map-view'; mapNode.id = `jarvis-map-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  const attribution = document.createElement('div'); attribution.className = 'map-attribution';
  attribution.innerHTML = 'Satellite imagery: Esri and contributors. Street map: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>. Imagery availability and zoom depend on provider coverage.';
  body.append(top, mapNode, attribution); block.append(body); host.append(block);
  if (!window.L) {
    mapNode.textContent = 'Map library could not load. Check your internet connection.';
    mapNode.style.padding = '20px';
    return;
  }
  const map = L.map(mapNode.id, { zoomControl: true, scrollWheelZoom: true }).setView([place.lat, place.lon], 12);
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  });
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors'
  });
  satellite.addTo(map);
  L.marker([place.lat, place.lon]).addTo(map).bindPopup(escapeHtml(place.display_name || place.name)).openPopup();
  sat.addEventListener('click', () => {
    map.removeLayer(streets); satellite.addTo(map);
    sat.classList.add('active'); street.classList.remove('active');
  });
  street.addEventListener('click', () => {
    map.removeLayer(satellite); streets.addTo(map);
    street.classList.add('active'); sat.classList.remove('active');
  });
  activeMaps.push(map);
  setTimeout(() => map.invalidateSize(), 120);
}
function renderDataCard(card, host) {
  const types = {
    weather: 'WEATHER CONDITIONS', wiki: 'WIKIPEDIA RESEARCH', github: 'GITHUB REPOSITORIES',
    books: 'BOOK DISCOVERY', recipes: 'RECIPE SEARCH', dictionary: 'DICTIONARY',
    holidays: 'PUBLIC HOLIDAYS', earthquakes: 'EARTHQUAKE MONITOR',
    iss: 'ISS TRACKING', currency: 'CURRENCY CONVERSION', country: 'COUNTRY PROFILE',
    world_bank: 'GLOBAL DEVELOPMENT DATA', sun_times: 'SUN & DAYLIGHT',
    natural_events: 'EARTH OBSERVATION', pokemon: 'POKÉDEX', trivia: 'TRIVIA',
    word_relations: 'WORD EXPLORER', species: 'BIODIVERSITY'
  };
  const block = resultBlock(types[card.type] || 'DATA RESULT', card.location || card.title || '');
  const body = document.createElement('div'); body.className = 'result-body';

  if (card.type === 'weather') {
    const top = document.createElement('div'); top.className = 'weather-top';
    const temp = addText(top, `${card.temperature ?? '—'}°`, 'weather-temp');
    const condition = addText(top, `${card.condition || ''}\n${card.location || ''}`, 'weather-condition');
    body.append(top);
    statGrid(body, [
      ['FEELS LIKE', `${card.feels_like ?? '—'}°C`], ['HIGH / LOW', `${card.high ?? '—'}° / ${card.low ?? '—'}°`],
      ['HUMIDITY', `${card.humidity ?? '—'}%`], ['WIND', `${card.wind ?? '—'} km/h`],
      ['RAIN CHANCE', `${card.rain_chance ?? '—'}%`], ['SUNRISE', card.sunrise ? card.sunrise.slice(-5) : '—']
    ]);
    addText(body, `Updated: ${card.updated || 'latest available'} · Weather data by Open-Meteo`, 'map-attribution');
  } else if (card.type === 'wiki') {
    if (card.image) {
      const img = document.createElement('img'); img.src = safeHttpUrl(card.image); img.alt = card.title; img.loading = 'lazy';
      img.style.cssText = 'width:100%;max-height:160px;object-fit:cover;border-radius:6px;margin-bottom:10px'; body.append(img);
    }
    addText(body, card.title || 'Wikipedia', 'result-title');
    if (card.description) addText(body, card.description, 'result-meta');
    addText(body, card.extract || '', 'result-text');
    addLink(body, card.url, 'READ WIKIPEDIA ARTICLE');
  } else if (card.type === 'currency') {
    addText(body, `${card.amount} ${card.from} → ${card.converted} ${card.to}`, 'result-title');
    statGrid(body, [['EXCHANGE RATE', card.rate], ['RATE DATE', card.date || 'Latest working day']]);
    addText(body, 'Rates from Frankfurter. Indicative reference rate, not a guaranteed transaction quote.', 'map-attribution');
  } else if (card.type === 'iss') {
    statGrid(body, [['LATITUDE', `${Number(card.latitude).toFixed(2)}°`], ['LONGITUDE', `${Number(card.longitude).toFixed(2)}°`],
      ['ALTITUDE', `${Number(card.altitude_km).toFixed(0)} km`], ['SPEED', `${Number(card.velocity_kmh).toFixed(0)} km/h`]]);
    addLink(body, card.url, 'TRACK THE ISS');
  } else if (card.type === 'country') {
    if (safeHttpUrl(card.flag)) { const img = document.createElement('img'); img.src = safeHttpUrl(card.flag); img.alt = `${card.name} flag`; img.style.cssText = 'width:100%;max-height:90px;object-fit:contain;margin-bottom:10px'; body.append(img); }
    addText(body, card.name, 'result-title');
    statGrid(body, [['CAPITAL', card.capital], ['REGION', card.region], ['POPULATION', Number(card.population || 0).toLocaleString()], ['AREA', `${Number(card.area || 0).toLocaleString()} km²`]]);
    addLink(body, card.map, 'OPEN COUNTRY MAP');
  } else if (card.type === 'dictionary') {
    addText(body, `${card.word} ${card.phonetic || ''}`, 'result-title');
    itemList(body, card.meanings || [], { title: x => x.part || 'Meaning', description: x => (x.definitions || []).join(' · ') });
    addLink(body, card.audio, 'PLAY PRONUNCIATION');
  } else if (card.type === 'world_bank') {
    addText(body, card.indicator || 'Indicator', 'result-title');
    statGrid(body, [['VALUE', Number(card.value).toLocaleString(undefined,{maximumFractionDigits:2})], ['YEAR', card.year], ['COUNTRY', card.country]]);
    addLink(body, card.url, 'WORLD BANK DATA');
  } else if (card.type === 'sun_times') {
    addText(body, card.location || '', 'result-text');
    statGrid(body, [['SUNRISE (UTC)', card.sunrise ? new Date(card.sunrise).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : '—'],
      ['SUNSET (UTC)', card.sunset ? new Date(card.sunset).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : '—'],
      ['SOLAR NOON', card.solar_noon ? new Date(card.solar_noon).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : '—'],
      ['DAY LENGTH', card.day_length ? `${Math.floor(card.day_length/3600)}h ${Math.floor((card.day_length%3600)/60)}m` : '—']]);
    addText(body, 'Sunrise-Sunset data is returned in UTC.', 'map-attribution');
  } else if (card.type === 'natural_events') {
    itemList(body, card.items || [], {
      title: x => x.title || 'Natural event',
      description: x => [x.description, x.date].filter(Boolean).join(' · '),
      url: x => x.url
    });
    addLink(body, 'https://eonet.gsfc.nasa.gov/', 'NASA EONET');
  } else if (card.type === 'pokemon') {
    if (card.image) { const img = document.createElement('img'); img.src = card.image; img.alt = card.name; img.style.cssText = 'display:block;width:100%;max-height:170px;object-fit:contain;margin-bottom:10px'; body.append(img); }
    addText(body, card.name, 'result-title');
    statGrid(body, [['TYPE', card.types], ['HEIGHT', card.height], ['WEIGHT', card.weight], ['ABILITIES', card.abilities]]);
    if (card.stats?.length) itemList(body, card.stats, { title: x => x.name, description: x => `Base stat: ${x.value}` });
  } else if (card.type === 'trivia') {
    addText(body, card.category || 'General knowledge', 'result-meta');
    addText(body, card.question || 'Trivia question', 'result-title');
    itemList(body, (card.options || []).map((option, i) => ({title: `${String.fromCharCode(65+i)}. ${decodeEntities(option)}`})), {title: x => x.title});
    const answer = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Reveal answer';
    const answerText = document.createElement('p'); answerText.className = 'result-text'; answerText.textContent = decodeEntities(card.answer || '');
    answer.append(summary, answerText); body.append(answer);
  } else if (card.type === 'word_relations') {
    itemList(body, card.items || [], { title: x => x.title || x.word, description: x => x.description || '' });
  } else if (card.type === 'species') {
    addText(body, card.title || card.scientific_name, 'result-title');
    statGrid(body, [['SCIENTIFIC NAME', card.scientific_name], ['RANK', card.rank], ['KINGDOM', card.kingdom], ['CLASS', card.class], ['PHYLUM', card.phylum], ['STATUS', card.status]]);
    addLink(body, card.url, 'GBIF SPECIES RECORD');
  } else if (card.type === 'earthquakes') {
    itemList(body, card.items || [], {
      title: x => `M ${Number(x.magnitude || 0).toFixed(1)} · ${x.title}`,
      description: x => x.time ? new Date(x.time).toLocaleString() : 'Recent event',
      url: x => x.url
    });
  } else if (card.type === 'holidays') {
    itemList(body, card.items || [], {
      title: x => `${x.date} · ${x.localName || x.name}`,
      description: x => x.name || '',
      url: () => 'https://date.nager.at/'
    });
  } else {
    const items = card.items || [];
    if (card.type === 'books' || card.type === 'recipes') {
      const grid = document.createElement('div'); grid.className = 'image-gallery';
      items.forEach(x => {
        const tile = document.createElement('article'); tile.className = 'image-tile';
        const a = document.createElement('a'); a.href = x.url || '#'; a.target = '_blank'; a.rel = 'noopener';
        if (safeHttpUrl(x.image)) { const img = document.createElement('img'); img.src = safeHttpUrl(x.image); img.alt = x.title || ''; img.loading = 'lazy'; img.onerror = () => img.remove(); a.append(img); }
        addText(a, x.title || '', 'image-caption');
        if (x.description) addText(a, x.description, 'image-license');
        tile.append(a); grid.append(tile);
      });
      body.append(grid);
    } else {
      itemList(body, items, {
        title: x => x.title || x.full_name || 'Result',
        description: x => [x.description || '', x.language || '', x.stars !== undefined ? `${Number(x.stars).toLocaleString()} stars` : ''].filter(Boolean).join(' · '),
        url: x => x.url
      });
    }
  }
  block.append(body); host.append(block);
}
function renderNewsBlock(articles, host) {
  const block = resultBlock('NEWS BRIEF', `${articles.length} STORIES`);
  const body = document.createElement('div'); body.className = 'result-body item-list';
  articles.slice(0, 7).forEach(item => {
    const row = document.createElement('article'); row.className = 'item-row';
    if (safeHttpUrl(item.image)) { const img = document.createElement('img'); img.src = safeHttpUrl(item.image); img.loading = 'lazy'; img.alt = ''; img.style.cssText = 'width:100%;max-height:100px;object-fit:cover;border-radius:5px;margin-bottom:8px'; img.onerror = () => img.remove(); row.append(img); }
    addText(row, item.title, 'result-text');
    addText(row, `${item.source || 'News'} · ${item.published || ''}`, 'result-meta');
    addLink(row, item.url, 'READ STORY');
    body.append(row);
  });
  block.append(body); host.append(block);
}

chatForm.addEventListener('submit', event => { event.preventDefault(); sendMessage(messageInput.value); });
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + 'px';
});
messageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && settings.enterToSend !== false) {
    event.preventDefault(); chatForm.requestSubmit();
  }
});

function showPanel(name) {
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${name}`));
  $$('.side-tool').forEach(button => button.classList.toggle('active', button.dataset.panel === name));
  $('#sidebar')?.classList.remove('open');
  $('#sidebarScrim')?.classList.remove('visible');
  if (name === 'news') loadNews('general');
  if (name === 'apis') loadApis();
  if (name === 'apps') loadApps();
  if (name === 'music') loadLibrary('music');
  if (name === 'videos') loadLibrary('videos');
  if (name === 'notes') loadNotes();
}
$$('.side-tool').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));
$$('.suggestions button').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
$('#newChat').addEventListener('click', () => newChat());
$('#clearChat').addEventListener('click', () => newChat());
$('#homeButton').addEventListener('click', () => { if (typeof openVoiceMode === 'function') openVoiceMode(); else showPanel('chat'); });
$('#mobileMenu').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#sidebarScrim').classList.toggle('visible', $('#sidebar').classList.contains('open'));
});
$('#closeSidebar').addEventListener('click', closeSidebar);
$('#sidebarScrim').addEventListener('click', closeSidebar);
$('#historySearch').addEventListener('input', event => renderChatHistory(event.target.value));
$('#openSettings').addEventListener('click', openSettings);
$('#openSettingsTop').addEventListener('click', openSettings);
$('#closeSettings').addEventListener('click', closeSettings);
$('#settingsModal').addEventListener('click', event => { if (event.target.id === 'settingsModal') closeSettings(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeSettings(); closeSidebar(); } });
$('#themeSetting').addEventListener('change', event => { settings.theme = event.target.value; applySettings(); saveSettings(); });
$('#enterSendSetting').addEventListener('change', event => { settings.enterToSend = event.target.checked; saveSettings(); });
$('#voiceReplySetting').addEventListener('change', event => { settings.voiceReplies = event.target.checked; saveSettings(); });
$('#voiceLanguageSetting').addEventListener('change', event => { settings.voiceLanguage = event.target.value; applySettings(); saveSettings(); });
$('#clearAllHistory').addEventListener('click', () => {
  if (!confirm('Clear every conversation saved in this browser? This cannot be undone.')) return;
  conversations = [];
  activeConversation = null;
  try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
  clearActiveMaps();
  closeSettings();
  newChat();
  toast('Chat history cleared.');
});

async function loadStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    $('#connectionText').textContent = data.ok ? 'Ready to chat' : 'Backend unavailable';
    $('#apiStatus').textContent = (settings.ai || {}).key ? 'AI KEY SAVED' : (data.ai_configured ? 'SERVER AI' : 'LOCAL CORE');
  } catch { $('#connectionText').textContent = 'Backend unavailable'; }
}

async function loadApps() {
  const grid = $('#appsGrid'); if (grid.dataset.loaded) return;
  try {
    const d = await (await fetch('/api/apps')).json();
    grid.innerHTML = '';
    d.apps.forEach(a => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'app-tile';
      b.append(appLogo(a), document.createTextNode(a.name));
      b.addEventListener('click', () => { if (!launchApp(a)) toast('Could not open that app here.'); });
      grid.append(b);
    });
    grid.dataset.loaded = '1';
  } catch { grid.innerHTML = '<div class="empty-state">Could not load apps.</div>'; }
}
async function loadLibrary(type) {
  const container = type === 'music' ? $('#musicGrid') : $('#videosGrid');
  container.innerHTML = '<div class="empty-state">Loading library…</div>';
  try {
    const response = await fetch('/api/library');
    const data = await response.json();
    const items = data[type] || {};
    container.innerHTML = '';
    Object.entries(items).forEach(([name, url]) => {
      const card = document.createElement('article'); card.className = 'library-card';
      const symbol = document.createElement('div'); symbol.className = 'library-symbol'; symbol.textContent = type === 'music' ? '♫' : '▷';
      const title = document.createElement('div'); title.className = 'library-title'; title.textContent = name.replaceAll('_', ' ');
      const sub = document.createElement('div'); sub.className = 'library-sub'; sub.textContent = type === 'music' ? 'Saved music link' : 'Saved video link';
      const open = document.createElement('button'); open.className = 'library-open'; open.textContent = type === 'music' ? 'PLAY TRACK ↗' : 'WATCH VIDEO ↗';
      open.addEventListener('click', () => window.open(safeHttpUrl(url), '_blank', 'noopener'));
      const del = document.createElement('button'); del.className = 'lib-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Remove';
      del.addEventListener('click', async () => {
        if (!confirm(`Remove "${name}"?`)) return;
        try { await fetch('/api/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name }) }); loadLibrary(type); toast('Removed.'); }
        catch { toast('Could not remove it.'); }
      });
      card.append(symbol, title, sub, open, del); container.append(card);
    });
    if (!Object.keys(items).length) container.innerHTML = '<div class="empty-state">Nothing here yet. Add a name and link above.</div>';
  } catch (error) { container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

async function loadNews(category) {
  $$('.filter').forEach(button => button.classList.toggle('active', button.dataset.category === category));
  $('#newsGrid').innerHTML = '<div class="empty-state">Fetching latest headlines…</div>';
  try {
    const response = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'News request failed.');
    renderNews(data.articles || []);
  } catch (error) { $('#newsGrid').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

function renderNews(articles) {
  const grid = $('#newsGrid'); if (!grid) return;
  grid.innerHTML = '';
  if (!articles?.length) { grid.innerHTML = '<div class="empty-state">No headlines are available from the feeds right now. Try refreshing or another category.</div>'; return; }
  articles.forEach(article => {
    const card = document.createElement('article'); card.className = 'news-card';
    if (article.image) {
      if (safeHttpUrl(article.image)) {
        const image = document.createElement('img'); image.className = 'news-image'; image.src = safeHttpUrl(article.image);
        image.alt = ''; image.loading = 'lazy'; image.onerror = () => image.remove(); card.append(image);
      }
    }
    const body = document.createElement('div'); body.className = 'news-card-body';
    addText(body, article.source || 'NEWS', 'news-source');
    addText(body, article.title || 'Untitled story', 'news-title');
    addText(body, article.description || 'Open the article to read the full story.', 'news-description');
    if (article.url) {
      const safeArticleUrl = safeHttpUrl(article.url);
      if (safeArticleUrl) {
        const link = document.createElement('a'); link.className = 'news-open'; link.href = safeArticleUrl;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'READ ARTICLE ↗'; body.append(link);
      }
    }
    card.append(body); grid.append(card);
  });
}
$$('.filter').forEach(button => button.addEventListener('click', () => loadNews(button.dataset.category)));

async function loadApis() {
  if (apiCatalog.length) return renderApis(apiCatalog);
  try {
    const response = await fetch('/api/apis');
    const data = await response.json();
    apiCatalog = data.items || [];
    renderApis(apiCatalog);
  } catch { $('#apiGrid').innerHTML = '<div class="empty-state">Could not load the API catalogue.</div>'; }
}
function renderApis(items) {
  const grid = $('#apiGrid'); if (!grid) return;
  grid.innerHTML = '';
  $('#apiCount').textContent = `${items.length} endpoints / capabilities`;
  if (!items.length) { grid.innerHTML = '<div class="empty-state">No matching sources.</div>'; return; }
  items.forEach(item => {
    const card = document.createElement('article'); card.className = 'api-card';
    addText(card, `${item.area} · PUBLIC DATA`, 'api-tag');
    const title = document.createElement('strong'); title.textContent = item.title; card.append(title);
    addText(card, `${item.provider}: ${item.description}`, '');
    const path = addText(card, item.path || '', 'api-path');
    path.style.cssText = 'font:7px var(--mono);color:#687887;margin-top:6px;overflow-wrap:anywhere';
    const link = document.createElement('a'); link.href = item.docs; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'DOCUMENTATION ↗'; card.append(link);
    grid.append(card);
  });
}
$('#apiSearch')?.addEventListener('input', event => {
  const q = event.target.value.toLowerCase();
  renderApis(apiCatalog.filter(x => [x.provider,x.title,x.area,x.description,x.path].join(' ').toLowerCase().includes(q)));
});

async function loadNotes() {
  try {
    const response = await fetch('/api/notes'); const data = await response.json();
    const list = $('#notesList'); list.innerHTML = '';
    if (!data.notes?.length) { list.innerHTML = '<div class="empty-state">No notes saved yet. Add one above or tell AXO “remember …”.</div>'; return; }
    data.notes.forEach(note => {
      const item = document.createElement('div'); item.className = 'note-card';
      addText(item, note.text, '');
      addText(item, note.created || '', 'note-date');
      list.append(item);
    });
  } catch { toast('Could not load notes.'); }
}
$('#noteForm').addEventListener('submit', async event => {
  event.preventDefault(); const text = $('#noteInput').value.trim(); if (!text) return;
  try {
    const response = await fetch('/api/notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save note.');
    $('#noteInput').value = ''; toast('Note saved on this device.'); loadNotes();
  } catch (error) { toast(error.message); }
});
$('#clearNotes').addEventListener('click', async () => {
  if (!confirm('Delete all saved notes from this device?')) return;
  try {
    const response = await fetch('/api/notes', { method: 'DELETE' }); const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not clear notes.');
    loadNotes(); toast('All notes cleared.');
  } catch (error) { toast(error.message); }
});

// Browser speech recognition. Chrome on Android supports microphone input.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceButton = $('#voiceButton');
if (SpeechRecognition) {
  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = settings.voiceLanguage || 'en-IN';
  voiceRecognition.interimResults = true;
  voiceRecognition.maxAlternatives = 1;
  let finalTranscript = '';
  let submittedTranscript = false;
  let listening = false;
  voiceButton.addEventListener('click', () => {
    if (listening) { voiceRecognition.stop(); return; }
    try {
      finalTranscript = ''; submittedTranscript = false;
      voiceRecognition.lang = settings.voiceLanguage || 'en-IN';
      voiceRecognition.start();
      listening = true;
      voiceButton.classList.add('listening');
      setCoreState('listening');
    } catch { toast('Microphone is already active.'); }
  });
  voiceRecognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += `${transcript} `;
      else interim += transcript;
    }
    messageInput.value = (finalTranscript + interim).trim();
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + 'px';
  };
  voiceRecognition.onerror = event => { toast(`Microphone: ${event.error}`); setCoreState('idle'); };
  voiceRecognition.onend = () => {
    listening = false;
    voiceButton.classList.remove('listening');
    setCoreState('idle');
    if (!submittedTranscript && finalTranscript.trim()) {
      submittedTranscript = true;
      sendMessage(finalTranscript.trim());
    }
  };
} else {
  voiceButton.addEventListener('click', () => toast('Voice input is not supported here. Try Chrome on Android.'));
}

function decodeEntities(value) {
  const node = document.createElement('textarea');
  node.innerHTML = String(value ?? '');
  return node.value;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}


// ---------- full-page settings wiring ----------
$$('#spNav button').forEach(b => b.addEventListener('click', () => showSettingsSection(b.dataset.sec)));
$$('[data-go]').forEach(b => b.addEventListener('click', () => { closeSettings(); showPanel(b.dataset.go); }));
const bind = (id, key, opts = {}) => {
  const el = $(id); if (!el) return;
  el.addEventListener(opts.check ? 'change' : 'input', () => {
    settings[key] = opts.check ? el.checked : (opts.num ? Number(el.value) : el.value);
    saveSettings(); applySettings();
  });
};
bind('#nameSetting', 'name'); bind('#addressSetting', 'address'); bind('#customAddressSetting', 'customAddress');
bind('#greetShowSetting', 'greetShow', { check: true }); bind('#greetSpeakSetting', 'greetSpeak', { check: true });
bind('#greetChimeSetting', 'greetChime', { check: true });
bind('#fontSizeSetting', 'fontSize'); bind('#voiceNameSetting', 'voiceName'); bind('#voiceRateSetting', 'voiceRate', { num: true });
bind('#compactSetting', 'compactMode', { check: true }); bind('#reduceMotionSetting', 'reduceMotion', { check: true });
bind('#autoOpenSetting', 'autoOpen', { check: true }); bind('#platformSetting', 'platform');
bind('#videoPlatformSetting', 'videoPlatform'); bind('#searchEngineSetting', 'searchEngine'); bind('#openTargetSetting', 'openTarget');
bind('#notificationsSetting', 'notifications', { check: true });
ACCENTS.forEach(color => {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.c = color; b.style.background = color; b.setAttribute('aria-label', color);
  b.addEventListener('click', () => { settings.accent = color; saveSettings(); applySettings(); });
  $('#accentSwatches')?.append(b);
});
const nested = (id, group, key, check) => {
  const el = $(id); if (!el) return;
  el.addEventListener(check ? 'change' : 'input', () => {
    settings[group] = { ...(settings[group] || {}), [key]: check ? el.checked : el.value.trim() };
    saveSettings(); applySettings();
  });
};
nested('#aiProvider', 'ai', 'provider'); nested('#aiUrl', 'ai', 'url'); nested('#aiKey', 'ai', 'key');
nested('#aiModel', 'ai', 'model'); nested('#aiAgent', 'ai', 'agent', true);
nested('#fbJson', 'firebase', 'service_account'); nested('#tgToken', 'telegram', 'token'); nested('#tgChat', 'telegram', 'chat');
$('#contactsText')?.addEventListener('input', e => { settings.contactsText = e.target.value; saveSettings(); });
nested('#gmEmail', 'gmail', 'email'); nested('#gmPass', 'gmail', 'password'); nested('#ghToken', 'github', 'token');
$$('[data-test]').forEach(b => b.addEventListener('click', async () => {
  const what = b.dataset.test, msgEl = $(`#${what === 'ai' ? 'aiTestMsg' : what + 'TestMsg'}`);
  msgEl.textContent = 'Testing…';
  try {
    const res = await fetch('/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what, ai: settings.ai, gmail: settings.gmail, github: settings.github, firebase: settings.firebase, telegram: settings.telegram }) });
    const d = await res.json(); msgEl.textContent = res.ok && d.ok ? '✓ ' + d.message : '✗ ' + (d.error || 'Failed');
  } catch (error) { msgEl.textContent = '✗ ' + error.message; }
}));
$('#fetchModels')?.addEventListener('click', async () => {
  const button = $('#fetchModels'), label = $('#modelFetchMsg');
  button.disabled = true; label.textContent = 'Fetching…';
  try {
    const response = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai: settings.ai || {} }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not fetch models.');
    const models = data.models || [];
    const list = $('#aiModels');
    if (list) {
      list.innerHTML = '';
      models.forEach(model => { const option = document.createElement('option'); option.value = model; list.append(option); });
    }
    label.textContent = models.length ? `${models.length} model IDs found. Choose from the Model ID field.` : 'No models were returned.';
    const current = String(settings.ai?.model || '').trim();
    if (!current && models.length) {
      const preferred = models.find(x => /openrouter\/free|gpt-oss-20b|gemini-3\.8-flash|gpt-4o-mini/i.test(x)) || models[0];
      settings.ai = { ...(settings.ai || {}), model: preferred };
      saveSettings(); applySettings();
      label.textContent = `${models.length} models found. Selected ${preferred}.`;
    }
    if (models.length) {
      label.title = models.slice(0, 30).join(' · ');
      toast('Model list loaded. Choose a model from the field suggestions.');
    }
  } catch (error) { label.textContent = '✗ ' + error.message; }
  finally { button.disabled = false; }
});
$('#resetSettings')?.addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults? Your name is kept.')) return;
  const keep = { name: settings.name, address: settings.address, customAddress: settings.customAddress, ai: settings.ai, gmail: settings.gmail, github: settings.github, firebase: settings.firebase, telegram: settings.telegram, contactsText: settings.contactsText };
  try { localStorage.removeItem(SETTINGS_STORAGE_KEY); } catch { /* ignore */ }
  settings = { theme: 'dark', enterToSend: true, voiceReplies: false, voiceLanguage: 'en-IN', greetShow: true, greetSpeak: true, greetChime: true,
    accent: '#3989f6', fontSize: '100', compactMode: false, reduceMotion: false,
    voiceName: 'en-GB-RyanNeural', voiceRate: -5, autoOpen: true, openTarget: 'new_tab', notifications: true,
    platform: 'youtube', videoPlatform: 'youtube', searchEngine: 'google', ...keep };
  saveSettings(); applySettings(); toast('Settings reset.');
});
$('#forgetName')?.addEventListener('click', () => {
  settings.name = ''; settings.onboarded = false; saveSettings(); applySettings(); closeSettings(); openOnboarding();
});
async function refreshLibraryCounts() {
  try {
    const d = await (await fetch('/api/library')).json();
    $('#musicCount').textContent = `${Object.keys(d.music || {}).length} saved songs`;
    $('#videoCount').textContent = `${Object.keys(d.videos || {}).length} saved videos`;
  } catch { /* ignore */ }
}
$$('.lib-form').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault();
  const type = form.dataset.type, name = $('.lib-name', form).value.trim(), url = $('.lib-url', form).value.trim();
  if (!name || !url) return;
  try {
    const res = await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name, url }) });
    const d = await res.json(); if (!res.ok || !d.ok) throw new Error(d.error || 'Could not save.');
    form.reset(); toast('Added to your library.'); loadLibrary(type);
  } catch (error) { toast(error.message); }
}));

// ---------- service shortcuts and local data backup ----------
$$('[data-service]').forEach(button => button.addEventListener('click', () => {
  const url = safeHttpUrl(button.dataset.service);
  if (!url) return;
  if (settings.openTarget === 'same_tab') window.location.assign(url);
  else if (!window.open(url, '_blank', 'noopener,noreferrer')) toast('Your browser blocked the new tab.');
}));
function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#exportChats')?.addEventListener('click', () => {
  persistConversations();
  downloadJson(`axo-chats-${new Date().toISOString().slice(0,10)}.json`, { format: 'axo-conversations-v1', exportedAt: new Date().toISOString(), conversations });
  toast('Conversation backup exported.');
});
$('#importChats')?.addEventListener('click', () => $('#importChatsFile')?.click());
$('#importChatsFile')?.addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.conversations;
    if (!Array.isArray(incoming)) throw new Error('This file does not contain an AXO conversations array.');
    const valid = incoming.filter(item => item && typeof item.id === 'string' && Array.isArray(item.messages));
    if (!valid.length) throw new Error('No valid conversations were found in that file.');
    const byId = new Map(conversations.map(item => [item.id, item]));
    valid.forEach(item => byId.set(item.id, item));
    conversations = [...byId.values()].sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,40);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations));
    if (activeConversation) activeConversation = conversations.find(item => item.id === activeConversation.id) || activeConversation;
    renderChatHistory();
    if (conversations.length) loadConversation(conversations[0].id);
    toast(`Imported ${valid.length} conversations.`);
  } catch (error) { toast(error.message || 'Could not import this file.'); }
  finally { event.target.value = ''; }
});
$('#exportPreferences')?.addEventListener('click', () => {
  const safe = JSON.parse(JSON.stringify(settings));
  if (safe.ai) delete safe.ai.key;
  if (safe.gmail) delete safe.gmail.password;
  if (safe.github) delete safe.github.token;
  if (safe.firebase) delete safe.firebase.service_account;
  if (safe.telegram) delete safe.telegram.token;
  downloadJson(`axo-preferences-${new Date().toISOString().slice(0,10)}.json`, { format: 'axo-preferences-v1', settings: safe });
  toast('Preferences exported without credentials.');
});
$('#clearCredentials')?.addEventListener('click', () => {
  if (!confirm('Remove all saved API keys, email passwords and integration tokens from this browser?')) return;
  settings.ai = { provider: settings.ai?.provider || 'auto', url: settings.ai?.url || '', model: settings.ai?.model || '', agent: settings.ai?.agent !== false, key: '' };
  settings.gmail = { email: settings.gmail?.email || '', password: '' };
  settings.github = { token: '' }; settings.firebase = { service_account: '' };
  settings.telegram = { token: '', chat: settings.telegram?.chat || '' };
  saveSettings(); applySettings();
  $('#aiTestMsg').textContent = 'Connection keys cleared.';
  toast('Saved connection keys cleared.');
});

// ---------- onboarding + spoken greeting ----------
function openOnboarding() {
  const box = $('#onboard'); box.classList.add('open'); box.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#onboardName')?.focus(), 150);
}
let onboardAddress = 'name';
$$('#onboardTitle button').forEach(b => b.addEventListener('click', () => {
  onboardAddress = b.dataset.v; $$('#onboardTitle button').forEach(x => x.classList.toggle('on', x === b));
}));
function playWelcomeChime() {
  if (!settings.greetChime) return false;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    const context = new AudioContextClass();
    if (context.state === 'suspended') { context.close().catch(() => {}); return false; }
    const now = context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.13;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + 0.44);
    });
    setTimeout(() => context.close().catch(() => {}), 850);
    return true;
  } catch { return false; }
}
function playGreeting() {
  const text = `${greetingText()}. How can I help?`;
  playWelcomeChime();
  if (settings.greetSpeak) fallbackSpeak(text);
}
function finishOnboarding() {
  const name = $('#onboardName').value.trim();
  if (!name) { $('#onboardName').focus(); return; }
  settings.name = name.slice(0, 30); settings.address = onboardAddress; settings.onboarded = true;
  saveSettings(); applySettings();
  const box = $('#onboard'); box.classList.remove('open'); box.setAttribute('aria-hidden', 'true');
  playGreeting(); // this happens in the user's Continue tap, so audio is permitted
}
$('#onboardGo')?.addEventListener('click', () => (typeof onboardNext === 'function' ? onboardNext() : finishOnboarding()));
$('#onboardName')?.addEventListener('keydown', e => { if (e.key === 'Enter') (typeof onboardNext === 'function' ? onboardNext() : finishOnboarding()); });
$('#greetTest')?.addEventListener('click', playGreeting);
let greetingPlayedThisView = false;
function startGreeting() {
  if (!settings.name || greetingPlayedThisView) return;
  greetingPlayedThisView = true;
  if (settings.greetChime || settings.greetSpeak) {
    // Browsers may block sound on page load. Try once, then unlock on the
    // first deliberate tap/key without repeatedly greeting during navigation.
    let unlocked = playWelcomeChime();
    if (settings.greetSpeak && 'speechSynthesis' in window) {
      fallbackSpeak(`${greetingText()}. How can I help?`);
    }
    let pending = !unlocked || (settings.greetSpeak && !window.speechSynthesis?.speaking);
    if (pending) {
      const unlock = () => {
        if (!pending) return;
        pending = false;
        playWelcomeChime();
        if (settings.greetSpeak) fallbackSpeak(`${greetingText()}. How can I help?`);
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach(type => document.addEventListener(type, unlock, { once: true }));
    }
  }
}

readSavedData();
loadStatus();
window.__axuBoot = () => { if (!settings.name && !settings.onboarded) openOnboarding(); else startGreeting(); };
if (!document.querySelector('script[src*="extra.js"]')) window.__axuBoot();
