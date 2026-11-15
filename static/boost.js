/* AXO v17: Ryan/Sonia-only greeting voice, splash, first-time arrow tour, workflow window. */
(function () {
  const GREET_VOICES = { 'en-GB-RyanNeural': 'Ryan', 'en-GB-SoniaNeural': 'Sonia' };
  const greetVoice = () => (GREET_VOICES[settings.greetVoice] ? settings.greetVoice : 'en-GB-RyanNeural');

  /* ---------- greeting voice: only Ryan or Sonia ---------- */
  async function greetSay(text) {
    const voice = greetVoice();
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, rate: -3 }) });
      if (!r.ok) throw new Error('tts');
      const url = URL.createObjectURL(await r.blob());
      if (axuAudio) axuAudio.pause();
      axuAudio = new Audio(url); axuAudio.onended = () => URL.revokeObjectURL(url);
      try { await axuAudio.play(); return 'ok'; } catch { return 'blocked'; }
    } catch {
      // browser fallback, still Ryan (male) or Sonia (female) as closely as the device allows
      try {
        speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = .94; u.pitch = voice.includes('Sonia') ? 1.05 : .88;
        const vs = speechSynthesis.getVoices().filter(v => /^en-GB/i.test(v.lang));
        const want = voice.includes('Sonia') ? /sonia|female|hazel|susan|serena|kate/i : /ryan|male|george|daniel|oliver|thomas/i;
        u.voice = vs.find(v => want.test(v.name)) || vs[0] || null; speechSynthesis.speak(u); return 'ok';
      } catch { return 'fail'; }
    }
  }
  const line = () => `${greetingText()}. How can I help?`;
  playGreeting = function () { playWelcomeChime(); if (settings.greetSpeak) greetSay(line()); };
  startGreeting = function () {
    if (!settings.name || greetingPlayedThisView) return; greetingPlayedThisView = true;
    if (!(settings.greetChime || settings.greetSpeak)) return;
    (async () => {
      const chimed = playWelcomeChime(); const res = settings.greetSpeak ? await greetSay(line()) : 'ok';
      if (res === 'blocked' || (!chimed && settings.greetChime)) {
        const unlock = () => { playWelcomeChime(); if (res === 'blocked' && settings.greetSpeak) greetSay(line()); };
        ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlock, { once: true }));
      }
    })();
  };
  const gv = document.getElementById('greetVoiceSetting');
  if (gv) { gv.value = greetVoice(); gv.addEventListener('change', () => { settings.greetVoice = gv.value; saveSettings(); greetSay(`Hi, I'm ${GREET_VOICES[gv.value]}.`); }); gv._csSync && gv._csSync(); }
  // onboarding "pick my voice" previews the chat voice; greeting voice follows Ryan/Sonia choice there too
  const _ob = document.getElementById('obVoices');
  if (_ob) _ob.addEventListener('click', () => setTimeout(() => { if (GREET_VOICES[settings.voiceName]) { settings.greetVoice = settings.voiceName; saveSettings(); } }, 0));

  /* ---------- splash ---------- */
  const splash = document.getElementById('axoSplash');
  const first = !settings.onboarded && !settings.name;
  const hide = () => splash && splash.classList.add('out');
  setTimeout(hide, first ? 2600 : 1900);
  if (splash) setTimeout(() => splash.remove(), 4000);

  /* ---------- arrow tour ---------- */
  const STEPS = [
    ['#messageInput', 'This is where you talk to me', 'Type anything — “play a song”, “weather in Delhi”, “build me a workflow chart for mails”.'],
    ['#voiceButton', 'This is voice input', 'Tap the mic and just speak. I will answer out loud.'],
    ['#suggestions', 'These are quick starters', 'One tap to try common things like weather, news and maps.'],
    ['#modeBar', 'This switches my modes', 'Assistant is chat. Bots lets you build helper bots. Node shows the live 3D map.'],
    ['#newChat', 'This starts a new chat', 'Your old chats stay saved below it.'],
    ['#historySearch', 'This searches old chats', 'Find anything you asked before.'],
    ['#mobileMenu', 'This opens your menu', 'Chats, tools and settings live here.'],
    ['#openSettings', 'This is Settings', 'Add your AI key, connect email, GitHub, Firebase and change my voice.'],
  ];
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  let tour, ti = 0, steps = [];
  function drawTour() {
    const [sel, title, text] = steps[ti], el = document.querySelector(sel); if (!el) return next();
    el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(), pad = 6;
    const hole = tour.querySelector('.hole'); Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    tour.querySelectorAll('.tip,svg').forEach(n => n.remove());
    const tip = document.createElement('div'); tip.className = 'tip';
    tip.innerHTML = `<b>${title}</b><span>${text}</span><div class="row"><em>${ti + 1} / ${steps.length}</em><button type="button" data-a="skip">Skip</button><button type="button" class="go" data-a="next">${ti === steps.length - 1 ? 'Done' : 'Next'}</button></div>`;
    tour.append(tip);
    const tw = tip.offsetWidth, th = tip.offsetHeight, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const below = r.bottom + 90 + th < innerHeight, above = r.top - 90 - th > 0;
    let tx, ty;
    if (below && (cy < innerHeight * .55 || !above)) { ty = r.bottom + 70; } else if (above) { ty = r.top - 70 - th; } else { ty = Math.max(12, innerHeight / 2 - th / 2); }
    tx = Math.min(Math.max(12, cx - tw / 2 + (cx < innerWidth / 2 ? tw * .25 : -tw * .25)), innerWidth - tw - 12);
    if (!below && !above) tx = r.left > innerWidth / 2 ? Math.max(12, r.left - tw - 60) : Math.min(innerWidth - tw - 12, r.right + 60);
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    // curved arrow from the tip to the target
    const tipTop = ty < r.top, sx = Math.min(Math.max(tx + tw / 2, tx + 20), tx + tw - 20), sy = tipTop ? ty + th : ty;
    const ex = cx, ey = tipTop ? r.top - pad - 4 : r.bottom + pad + 4;
    const sideways = !below && !above; const ax = sideways ? (tx > r.left ? tx : tx + tw) : sx, ay = sideways ? ty + th / 2 : sy;
    const ex2 = sideways ? (tx > r.left ? r.right + pad + 4 : r.left - pad - 4) : ex, ey2 = sideways ? cy : ey;
    const mx = (ax + ex2) / 2 + (ey2 - ay) * .25, my = (ay + ey2) / 2 - (ex2 - ax) * .25;
    const ang = Math.atan2(ey2 - my, ex2 - mx), hs = 11;
    const pts = [[ex2, ey2], [ex2 - hs * Math.cos(ang - .45), ey2 - hs * Math.sin(ang - .45)], [ex2 - hs * Math.cos(ang + .45), ey2 - hs * Math.sin(ang + .45)]].map(p => p.join(',')).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = `<path d="M${ax} ${ay} Q${mx} ${my} ${ex2} ${ey2}"/><polygon points="${pts}"/>`; tour.append(svg);
  }
  function next() { ti++; if (ti >= steps.length) return endTour(); drawTour(); }
  function endTour() { tour.classList.remove('on'); settings.toured = true; saveSettings(); window.removeEventListener('resize', onRs); document.getElementById('sidebar')?.classList.remove('open'); }
  const onRs = () => tour && tour.classList.contains('on') && drawTour();
  function startTour() {
    if (!tour) {
      tour = document.createElement('div'); tour.id = 'tour'; tour.innerHTML = '<div class="hole"></div>'; document.body.append(tour);
      tour.addEventListener('click', e => { const a = e.target.dataset?.a; if (a === 'next') next(); else if (a === 'skip') endTour(); });
    }
    steps = STEPS.filter(s => visible(document.querySelector(s[0]))); if (!steps.length) return;
    ti = 0; tour.classList.add('on'); window.addEventListener('resize', onRs); drawTour();
  }
  window.axoTour = startTour;
  document.getElementById('tourReplay')?.addEventListener('click', () => { document.getElementById('closeSettings')?.click(); try { closeSettings(); } catch { } setTimeout(startTour, 500); });
  const _fo = finishOnboarding;
  finishOnboarding = function () { _fo.apply(this, arguments); if (!settings.toured) setTimeout(startTour, 2600); };

  /* ---------- workflow chart in a new window ---------- */
  const WF = /\b(work ?flow|flow ?chart|flow ?diagram|automation (chart|flow|diagram))\b/i, VERB = /\b(build|make|create|design|draw|generate|show|plan|map)\b/i;
  const _send = sendMessage;
  sendMessage = function (raw) {
    const msg = (raw || '').trim();
    if (!msg || busy || !(WF.test(msg) && VERB.test(msg))) return _send.apply(this, arguments);
    let win = null; try { win = window.open('/workflow', '_blank'); } catch { }
    try { localStorage.setItem('axo_wf_req', JSON.stringify({ prompt: msg, ai: { provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key } })); } catch { }
    if (win) { try { win.location.href = '/workflow?t=' + Date.now(); } catch { } }
    messageInput.value = ''; messageInput.style.height = 'auto';
    const chat = currentChat(); addMessage('user', msg); chat.messages.push({ role: 'user', content: msg, createdAt: Date.now() });
    if (chat.messages.filter(i => i.role === 'user').length === 1) chat.title = titleFromMessage(msg);
    const reply = win ? 'Opened your workflow chart in a new window — watch it build, then press Run.' : 'Your browser blocked the new window. Tap the button below to open the workflow chart.';
    const h = addMessage('assistant', reply);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wf-open'; b.textContent = 'Open workflow window'; b.onclick = () => window.open('/workflow?t=' + Date.now(), '_blank'); (h.richHost || h.bubble.parentElement).append(b);
    chat.messages.push({ role: 'assistant', content: reply, createdAt: Date.now() }); chat.updatedAt = Date.now(); persistConversations();
    if (settings.voiceReplies) speak(reply);
  };

  // existing users who never saw the tour: offer it once on a calm moment
  if (settings.onboarded && !settings.toured && settings.name) setTimeout(() => { if (!document.getElementById('onboard')?.classList.contains('open')) startTour(); }, 3200);
  if (window.__axuBoot) window.__axuBoot();
})();
