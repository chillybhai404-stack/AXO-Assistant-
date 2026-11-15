/* AXO v18: greeting (Ryan/Sonia only), tutorials, workflows, sheet/doc maker, quick actions, palette, checklist. */
(function () {
  const VERSION = 'v18';
  const GV = { 'en-GB-RyanNeural': 'Ryan', 'en-GB-SoniaNeural': 'Sonia' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const aiPayload = () => ({ provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key });

  /* ================= greeting voice: Ryan / Sonia only, neural only ================= */
  function greetVoice() {
    const v = settings.greetVoice;
    if (GV[v]) return v;
    if (v === 'random') return Math.floor(Date.now() / 864e5) % 2 ? 'en-GB-SoniaNeural' : 'en-GB-RyanNeural';
    return GV[settings.voiceName] ? settings.voiceName : 'en-GB-RyanNeural';
  }
  async function fetchVoice(text, voice) {            // retries so the first cold request never drops to Chrome's voice
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 640), voice, rate: -3 }) });
        if (r.ok) { const b = await r.blob(); if (b.size > 500) return URL.createObjectURL(b); }
      } catch { /* retry */ }
      await sleep(900 * (i + 1));
    }
    return null;
  }
  let pendingUnlock = null;
  async function playUrl(url) {
    if (axuAudio) { try { axuAudio.pause(); } catch { } }
    const a = axuAudio = new Audio(url);
    return new Promise(res => {
      a.onended = () => { URL.revokeObjectURL(url); res('ok'); };
      a.onerror = () => res('fail');
      a.play().catch(() => {                              // autoplay blocked: audio is already loaded, play on first tap
        const go = () => { a.play().catch(() => res('fail')); };
        ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, go, { once: true }));
      });
    });
  }
  const greetSay = async text => { const u = await fetchVoice(text, greetVoice()); if (!u) { toast('Greeting voice is unavailable right now.'); return 'fail'; } return playUrl(u); };
  function greetLine() {
    const a = addressName(), h = new Date().getHours(), style = settings.greetStyle || 'full';
    if (style === 'short') return `${h >= 5 && h < 12 ? 'Morning' : h >= 12 && h < 17 ? 'Afternoon' : h >= 17 && h < 22 ? 'Evening' : 'Hello'}, ${a || 'there'}.`;
    if (h >= 5 && h < 12) return `Good morning, ${a || 'there'}. Ready when you are.`;
    if (h >= 12 && h < 17) return `Good afternoon, ${a || 'there'}. How is the day going?`;
    if (h >= 17 && h < 22) return `Good evening, ${a || 'there'}. How can I help?`;
    return `Burning the midnight oil, ${a || 'there'}? I'm here.`;
  }
  async function briefingText() {
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'daily briefing', history: [], prefs: { city: settings.city || '', contacts: contactsMap() }, ai: { ...aiPayload(), address: addressName() }, integrations: integrationsPayload() }) });
      const d = await r.json(); return d.ok ? String(d.reply || '').replace(/https?:\/\/\S+/g, '').replace(/[*#_`]/g, '').replace(/\s+/g, ' ').slice(0, 420) : '';
    } catch { return ''; }
  }
  const style = () => settings.greetStyle || 'full';
  playGreeting = function () { playWelcomeChime(); if (settings.greetSpeak) greetSay(greetLine()); };
  startGreeting = function () {
    if (!settings.name || greetingPlayedThisView) return; greetingPlayedThisView = true;
    if (style() === 'silent' || !(settings.greetChime || settings.greetSpeak)) return;
    (async () => {
      const line = greetLine(), vUrl = settings.greetSpeak ? fetchVoice(line, greetVoice()) : Promise.resolve(null);   // start fetching immediately
      const bPromise = style() === 'full' && settings.greetSpeak ? briefingText() : Promise.resolve('');
      playWelcomeChime();
      const u = await vUrl; if (u) await playUrl(u); else if (settings.greetSpeak) toast('Greeting voice is unavailable right now.');
      const b = await bPromise; if (b && settings.greetSpeak) greetSay(b);
    })();
  };
  const $$$ = id => document.getElementById(id);
  const gv = $$$('greetVoiceSetting'), gs = $$$('greetStyleSetting'), wo = $$$('wfOpenSetting');
  if (gv) { gv.value = settings.greetVoice || greetVoice(); gv.addEventListener('change', () => { settings.greetVoice = gv.value; settings.greetVoiceSet = true; saveSettings(); greetSay(`Hi, I'm ${GV[greetVoice()]}.`); }); }
  if (gs) { gs.value = style(); gs.addEventListener('change', () => { settings.greetStyle = gs.value; saveSettings(); }); }
  if (wo) { wo.value = settings.wfOpen || 'window'; wo.addEventListener('change', () => { settings.wfOpen = wo.value; saveSettings(); }); }
  $$$('obVoices')?.addEventListener('click', () => setTimeout(() => { if (GV[settings.voiceName]) { settings.greetVoice = settings.voiceName; settings.greetVoiceSet = true; saveSettings(); } }, 0));

  /* ================= interrupt: voice stops when you speak / type ================= */
  const stopTalk = () => { try { axuAudio && axuAudio.pause(); } catch { } try { speechSynthesis.cancel(); } catch { } };
  $$$('voiceButton')?.addEventListener('click', stopTalk); $$$('messageInput')?.addEventListener('input', stopTalk); $$$('vmClose')?.addEventListener('click', stopTalk);
  const SR0 = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR0) { const Wrap = function () { const r = new SR0(); r.addEventListener('speechstart', () => { if (!r.continuous) stopTalk(); }); return r; }; Wrap.prototype = SR0.prototype; window.SpeechRecognition = Wrap; window.webkitSpeechRecognition = Wrap; }

  /* ================= tours & tutorials ================= */
  const BASIC = [
    ['#messageInput', 'This is where you talk to me', 'Type anything — “play a song”, “weather in Delhi”, “build me a workflow chart for mails”.'],
    ['#voiceButton', 'This is voice input', 'Tap the mic and speak. Tap it again any time and I stop talking.'],
    ['#suggestions', 'These are quick starters', 'One tap to try weather, news, maps and more.'],
    ['#modeBar', 'This switches my modes', 'Assistant is chat. Bots lets you build helper bots. Node shows the live 3D map.'],
    ['#newChat', 'This starts a new chat', 'Your old chats stay saved. Star ☆ pins one to the top, 📁 files it in a folder.'],
    ['#historySearch', 'This searches old chats', 'Find anything you asked before.'],
    ['#mobileMenu', 'This opens your menu', 'Chats, tools and settings live here.'],
    ['#openSettings', 'This is Settings', 'Add your AI key, connect email, change voices, replay tutorials.'],
  ];
  const TUTS = {
    basics: ['Chat basics', BASIC],
    voice: ['Voice & greeting', [['#voiceButton', 'Voice input', 'Tap to speak. Starting to type or tapping again stops my voice.'], [null, 'Greeting voice', 'Settings → Profile: pick Ryan, Sonia or Random each day, and Short, Full (with your briefing) or Silent.'], [null, 'Wake word', 'Turn on “Hey AXO” in Settings → Voice and just say it.']]],
    workflow: ['Workflow charts', [['#messageInput', 'Ask for a chart', 'Type “build me a workflow chart for mails”. A chart opens and builds itself.'], [null, 'Edit it', 'Drag steps, tap one to rename it or set its email, time or condition. Or tell me in chat: “add a Slack step after the email”.'], [null, 'It really runs', 'Press Run: emails, Telegram, sheet rows and webhooks actually happen. Failed steps show a ⚠ and a reason.'], [null, 'Save & schedule', 'Save keeps it under “Saved”. In a step panel set a daily time (works while AXO is open). PNG exports an image.']]],
    files: ['Sheets & documents', [['#messageInput', 'Say what you need', 'Try “make me an expense sheet for November” or “write a document about our refund policy”.'], [null, 'It downloads', 'I build a real .xlsx or .docx file and it downloads right away. It needs your AI key in Settings.']]],
    connect: ['Connect email & apps', [['#openSettings', 'Open Settings', 'Go to Integrations.'], [null, 'Email', 'Enter your address and an APP PASSWORD (not your normal one). Workflows then send and read real mail.'], [null, 'Telegram & Sheets', 'Add a bot token + chat id for Telegram, or an Apps Script link to add sheet rows.']]],
    sidebar: ['Sidebar & shortcuts', [['#newChat', 'New chat', 'Starts fresh.'], ['#historySearch', 'Search', 'Searches titles, folders and messages.'], [null, 'Pins & folders', '☆ pins a chat to the top, 📁 puts it in a named folder.'], [null, 'Command palette', 'Press Ctrl+K (or ⌘K) to jump anywhere: settings, tutorials, saved workflows.']]],
    whatsnew: ['What’s new in ' + VERSION, [[null, 'Workflow editor', 'Drag, rename, add and delete steps. Chat can edit it live.'], [null, 'Real actions', 'Workflow emails really send. Ask for a sheet or document and it downloads.'], [null, 'Greeting upgrade', 'Ryan/Sonia only, three styles, daily briefing.'], [null, 'Command palette & pins', 'Ctrl+K, starred chats, folders, quick actions under answers.']]],
  };
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  let tour, ti = 0, steps = [], tourKey = 'basics';
  function drawTour() {
    const [sel, title, text] = steps[ti], el = sel ? document.querySelector(sel) : null;
    tour.querySelectorAll('.tip,svg').forEach(n => n.remove());
    const hole = tour.querySelector('.hole'), tip = document.createElement('div'); tip.className = 'tip';
    tip.innerHTML = `<b>${title}</b><span>${text}</span><div class="row"><em>${ti + 1} / ${steps.length}</em><button type="button" data-a="skip">Skip</button><button type="button" class="go" data-a="next">${ti === steps.length - 1 ? 'Done' : 'Next'}</button></div>`;
    tour.append(tip); const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (!el) { Object.assign(hole.style, { left: innerWidth / 2 + 'px', top: innerHeight / 2 + 'px', width: '0px', height: '0px' }); tip.style.left = Math.max(12, (innerWidth - tw) / 2) + 'px'; tip.style.top = Math.max(12, (innerHeight - th) / 2) + 'px'; return; }
    el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, below = r.bottom + 90 + th < innerHeight, above = r.top - 90 - th > 0;
    let tx, ty; if (below && (cy < innerHeight * .55 || !above)) ty = r.bottom + 70; else if (above) ty = r.top - 70 - th; else ty = Math.max(12, innerHeight / 2 - th / 2);
    tx = Math.min(Math.max(12, cx - tw / 2 + (cx < innerWidth / 2 ? tw * .25 : -tw * .25)), innerWidth - tw - 12);
    if (!below && !above) tx = r.left > innerWidth / 2 ? Math.max(12, r.left - tw - 60) : Math.min(innerWidth - tw - 12, r.right + 60);
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    const tipTop = ty < r.top, sx = Math.min(Math.max(tx + tw / 2, tx + 20), tx + tw - 20), sy = tipTop ? ty + th : ty, sideways = !below && !above;
    const ax = sideways ? (tx > r.left ? tx : tx + tw) : sx, ay = sideways ? ty + th / 2 : sy;
    const ex = sideways ? (tx > r.left ? r.right + pad + 4 : r.left - pad - 4) : cx, ey = sideways ? cy : (tipTop ? r.top - pad - 4 : r.bottom + pad + 4);
    const mx = (ax + ex) / 2 + (ey - ay) * .25, my = (ay + ey) / 2 - (ex - ax) * .25, ang = Math.atan2(ey - my, ex - mx), hs = 11;
    const pts = [[ex, ey], [ex - hs * Math.cos(ang - .45), ey - hs * Math.sin(ang - .45)], [ex - hs * Math.cos(ang + .45), ey - hs * Math.sin(ang + .45)]].map(p => p.join(',')).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.innerHTML = `<path d="M${ax} ${ay} Q${mx} ${my} ${ex} ${ey}"/><polygon points="${pts}"/>`; tour.append(svg);
  }
  const next = () => { ti++; ti >= steps.length ? endTour() : drawTour(); };
  function endTour() { tour.classList.remove('on'); window.removeEventListener('resize', onRs); if (tourKey === 'basics') settings.toured = true; settings.seenVersion = VERSION; saveSettings(); }
  const onRs = () => tour && tour.classList.contains('on') && drawTour();
  function startTour(key = 'basics') {
    try { closeSettings(); } catch { }
    if (!tour) { tour = document.createElement('div'); tour.id = 'tour'; tour.innerHTML = '<div class="hole"></div>'; document.body.append(tour); tour.addEventListener('click', e => { const a = e.target.dataset?.a; if (a === 'next') next(); else if (a === 'skip') endTour(); }); }
    tourKey = key; steps = TUTS[key][1].filter(s => !s[0] || visible(document.querySelector(s[0]))); if (!steps.length) return;
    ti = 0; tour.classList.add('on'); window.addEventListener('resize', onRs); setTimeout(drawTour, 120);
  }
  window.axoTour = startTour;
  const tl = $$$('tutList');
  if (tl) Object.entries(TUTS).forEach(([k, [name, st]]) => { const row = document.createElement('div'); row.className = 'setting-row'; row.innerHTML = `<span><strong>${name}</strong><small>${st.length} short steps</small></span>`; const b = document.createElement('button'); b.className = 'pill-button'; b.type = 'button'; b.textContent = 'Start'; b.onclick = () => setTimeout(() => startTour(k), 350); row.append(b); tl.append(row); });
  $$$('tourReplay')?.addEventListener('click', () => setTimeout(() => startTour('basics'), 350));
  const _fo = finishOnboarding; finishOnboarding = function () { _fo.apply(this, arguments); if (!settings.toured) setTimeout(() => startTour('basics'), 1200); };

  /* ================= workflows (window or side panel) ================= */
  let wfWin = null, drawer = null;
  function openWorkflow(qs = '', sync) {
    if (settings.wfOpen === 'panel') {
      if (!drawer) { drawer = document.createElement('div'); drawer.className = 'wf-drawer'; drawer.innerHTML = '<button type="button" class="wf-x">✕ Close</button><iframe></iframe>'; document.body.append(drawer); drawer.querySelector('.wf-x').onclick = () => { drawer.classList.remove('on'); drawer.querySelector('iframe').src = 'about:blank'; }; }
      drawer.querySelector('iframe').src = '/workflow?embed=1&t=' + Date.now() + qs; drawer.classList.add('on'); return true;
    }
    wfWin = sync || window.open('/workflow?t=' + Date.now() + qs, '_blank'); if (sync) { try { sync.location.href = '/workflow?t=' + Date.now() + qs; } catch { } } return !!wfWin;
  }
  const wfOpen = () => (drawer && drawer.classList.contains('on')) || (wfWin && !wfWin.closed);
  window.axoOpenWorkflow = openWorkflow;

  /* ================= chat interception ================= */
  const WF = /\b(work ?flow|flow ?chart|flow ?diagram|automation (chart|flow|diagram))\b/i, VERB = /\b(build|make|create|design|draw|generate|show|plan|map)\b/i;
  const FILE = /\b(make|create|build|generate|prepare|write|draft|give me)\b[^.?!]*\b(spread ?sheet|sheet|excel|xlsx|document|docx|word doc|doc)\b/i;
  const EDIT = /^(add|remove|delete|rename)\b.*\b(step|node|action)\b/i;
  function say(role, text, btn) {
    const chat = currentChat(), h = addMessage(role, text);
    if (btn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'wf-open'; b.textContent = btn[0]; b.onclick = btn[1]; (h.richHost || h.bubble.parentElement).append(b); }
    chat.messages.push({ role: role === 'user' ? 'user' : 'assistant', content: text, createdAt: Date.now() }); chat.updatedAt = Date.now();
    if (role === 'user' && chat.messages.filter(i => i.role === 'user').length === 1) chat.title = titleFromMessage(text);
    persistConversations(); return h;
  }
  const download = (name, mime, b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([u], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000); return url; };
  async function makeFile(msg) {
    const kind = /\b(spread ?sheet|sheet|excel|xlsx)\b/i.test(msg) ? 'sheet' : 'doc';
    say('user', msg); const h = say('assistant', `Building your ${kind === 'sheet' ? 'spreadsheet' : 'document'}…`);
    try {
      const r = await fetch('/api/make-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, prompt: msg, ai: aiPayload() }) }); const d = await r.json();
      if (!d.ok) throw new Error(d.error); download(d.name, d.mime, d.b64);
      h.bubble.textContent = `Done — “${d.name}” was created and downloaded.`; h.richHost.innerHTML = '';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wf-open'; b.textContent = 'Download again'; b.onclick = () => download(d.name, d.mime, d.b64); h.richHost.append(b);
      settings.triedFile = true; saveSettings();
    } catch (e) { h.bubble.textContent = `I couldn't build that. ${e.message}`; }
  }
  const _send = sendMessage;
  sendMessage = function (raw) {
    const msg = (raw || '').trim(); if (!msg || busy) return _send.apply(this, arguments);
    const clear = () => { messageInput.value = ''; messageInput.style.height = 'auto'; };
    if (WF.test(msg) && VERB.test(msg)) {
      let win = null; if (settings.wfOpen !== 'panel') { try { win = window.open('about:blank', '_blank'); } catch { } }
      try { localStorage.setItem('axo_wf_req', JSON.stringify({ prompt: msg })); } catch { }
      clear(); const ok = openWorkflow('', win); settings.triedWorkflow = true; saveSettings();
      say('user', msg); say('assistant', ok ? 'Opened your workflow chart — watch it build. Drag steps, tap one to edit, press Run to really run it. Tell me “add a Slack step after the email” to change it live.' : 'Your browser blocked the window. Tap below to open it.', ['Open workflow', () => openWorkflow()]);
      if (settings.voiceReplies) speak('Opened your workflow chart.'); return;
    }
    if (EDIT.test(msg) && wfOpen()) { clear(); try { localStorage.setItem('axo_wf_cmd', JSON.stringify({ text: msg, ts: Date.now() })); } catch { } say('user', msg); say('assistant', 'Updating the workflow chart…'); return; }
    if (/^(my |show |open )?(saved )?workflows?$/i.test(msg.replace(/[.!?]/g, ''))) { clear(); say('user', msg); say('assistant', 'Opening your workflows.', ['Open', () => openWorkflow()]); openWorkflow(); return; }
    if (FILE.test(msg) && !WF.test(msg)) { clear(); return makeFile(msg); }
    return _send.apply(this, arguments);
  };

  /* ================= quick actions under every answer ================= */
  const qaCss = document.createElement('style'); qaCss.textContent = '.message-content:has(.bubble.thinking) .qa{display:none}';
  document.head.append(qaCss);
  function addQA(wrap) {
    if (wrap.dataset.qa || !wrap.classList.contains('assistant-message')) return; wrap.dataset.qa = '1';
    const c = wrap.querySelector('.message-content'), bub = wrap.querySelector('.bubble'), row = document.createElement('div'); row.className = 'qa';
    const act = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => fn(b); row.append(b); };
    const txt = () => bub.textContent.trim();
    act('Copy', b => { navigator.clipboard?.writeText(txt()); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1200); });
    act('Speak', () => speak(txt().slice(0, 600)));
    act('Retry', () => { const us = [...document.querySelectorAll('.user-message .bubble')]; const last = us[us.length - 1]; if (last) _send(last.textContent); });
    act('Save note', async b => { try { await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt().slice(0, 480) }) }); b.textContent = 'Saved'; } catch { b.textContent = 'Failed'; } setTimeout(() => b.textContent = 'Save note', 1400); });
    c.append(row);
  }
  const cw = $$$('chatWindow'); if (cw) { new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && addQA(n)))).observe(cw, { childList: true }); }

  /* ================= command palette (Ctrl/Cmd+K) ================= */
  const pal = document.createElement('div'); pal.id = 'palette'; pal.innerHTML = '<div class="pl-box"><input placeholder="Type a command…" autocomplete="off"><div class="pl-list"></div></div>'; document.body.append(pal);
  const pin = pal.querySelector('input'), plist = pal.querySelector('.pl-list'); let pItems = [], pSel = 0;
  function commands() {
    const c = [['New chat', () => $$$('newChat')?.click()], ['Settings', () => openSettings()], ['Build a workflow chart', () => { messageInput.value = 'build me a workflow chart for '; messageInput.focus(); }], ['Saved workflows', () => openWorkflow()], ['Make a spreadsheet', () => { messageInput.value = 'make me a spreadsheet for '; messageInput.focus(); }], ['Write a document', () => { messageInput.value = 'write a document about '; messageInput.focus(); }]];
    document.querySelectorAll('#spNav button').forEach(b => c.push(['Settings → ' + b.textContent, () => { openSettings(); showSettingsSection(b.dataset.sec); }]));
    document.querySelectorAll('.side-tool[data-panel]').forEach(b => c.push(['Open ' + b.textContent.trim(), () => b.click()]));
    Object.entries(TUTS).forEach(([k, [n]]) => c.push(['Tutorial: ' + n, () => startTour(k)]));
    AXOWF.list().forEach(w => c.push(['Workflow: ' + w.title, () => openWorkflow('&open=' + w.id)]));
    return c;
  }
  function pRender() { const q = pin.value.toLowerCase(); pItems = commands().filter(x => x[0].toLowerCase().includes(q)).slice(0, 12); pSel = Math.min(pSel, Math.max(0, pItems.length - 1)); plist.innerHTML = ''; pItems.forEach((x, i) => { const d = document.createElement('div'); d.className = i === pSel ? 'on' : ''; d.textContent = x[0]; d.onclick = () => run(i); plist.append(d); }); }
  const run = i => { const x = pItems[i]; closePal(); if (x) setTimeout(x[1], 60); };
  const closePal = () => pal.classList.remove('on');
  pin.addEventListener('input', () => { pSel = 0; pRender(); });
  pin.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { pSel = Math.min(pItems.length - 1, pSel + 1); pRender(); e.preventDefault(); } else if (e.key === 'ArrowUp') { pSel = Math.max(0, pSel - 1); pRender(); e.preventDefault(); } else if (e.key === 'Enter') run(pSel); else if (e.key === 'Escape') closePal(); });
  pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.add('on'); pin.value = ''; pSel = 0; pRender(); pin.focus(); } });

  /* ================= home checklist ================= */
  function checklist() {
    const scr = $$$('welcomeScreen'); if (!scr) return; scr.querySelector('.checklist')?.remove(); if (settings.checkDone || !settings.name) return;
    const items = [
      ['Add your AI key', !!(settings.ai || {}).key, () => { openSettings(); showSettingsSection('ai'); }],
      ['Connect email', !!(settings.gmail || {}).email, () => { openSettings(); showSettingsSection('integrations'); }],
      ['Try a workflow chart', !!settings.triedWorkflow || AXOWF.list().length > 0, () => sendMessage('build me a workflow chart for my mails')],
      ['Make a sheet or document', !!settings.triedFile, () => { messageInput.value = 'make me a spreadsheet for monthly expenses'; messageInput.focus(); }],
      ['Set your greeting voice', !!settings.greetVoiceSet, () => { openSettings(); showSettingsSection('profile'); }],
    ];
    const done = items.filter(i => i[1]).length; if (done === items.length) { settings.checkDone = true; saveSettings(); return; }
    const box = document.createElement('div'); box.className = 'checklist';
    box.innerHTML = `<div class="cl-h"><b>Get set up</b><span>${done}/${items.length}</span><button type="button" title="Hide">✕</button></div><div class="cl-bar"><i style="width:${done / items.length * 100}%"></i></div>`;
    items.forEach(([t, ok, fn]) => { const r = document.createElement('div'); r.className = 'cl-i' + (ok ? ' ok' : ''); r.textContent = (ok ? '✔ ' : '○ ') + t; if (!ok) r.onclick = fn; box.append(r); });
    box.querySelector('button').onclick = () => { settings.checkDone = true; saveSettings(); box.remove(); };
    scr.append(box);
  }
  const _rw2 = renderWelcome; renderWelcome = function () { _rw2(); checklist(); }; renderWelcome();

  /* ================= schedules & what's new ================= */
  setInterval(() => AXOWF.tick(), 30000);
  window.addEventListener('storage', e => { if (e.key === 'axo_wf_saved') renderWelcome(); });
  if (settings.onboarded && settings.name) setTimeout(() => {
    if (document.getElementById('onboard')?.classList.contains('open')) return;
    if (!settings.toured) startTour('basics'); else if (settings.seenVersion !== VERSION) startTour('whatsnew');
  }, 3000);

  if (window.__axuBoot) window.__axuBoot();
})();
