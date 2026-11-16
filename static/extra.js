/* AXO extras: charts, voice mode, 3D bots / node / sheet, onboarding, neural greeting. */
window.__axuExtra = true;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PALETTE = ['#4f9dff', '#34d399', '#f5c542', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#ef4444'];

/* ================= charts ================= */
function renderChart(c, host) {
  const labels = c.labels || [], vals = (c.values || []).map(Number);
  if (!labels.length || !vals.length) return;
  const card = document.createElement('div'); card.className = 'chart-card';
  const W = 320, H = 190, pad = { l: 30, r: 8, t: 14, b: 34 };
  const max = Math.max(...vals, 1), iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  let svg = '';
  if (c.type === 'pie') {
    const total = vals.reduce((a, b) => a + Math.max(b, 0), 0) || 1; let ang = -Math.PI / 2;
    svg = `<svg viewBox="0 0 ${W} 170">` + vals.map((v, i) => {
      const a2 = ang + (Math.max(v, 0) / total) * Math.PI * 2, large = a2 - ang > Math.PI ? 1 : 0, cx = 160, cy = 85, r = 70;
      const p = `M${cx} ${cy}L${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)}A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}Z`;
      ang = a2; return `<path d="${p}" fill="${PALETTE[i % 8]}" stroke="var(--surface)" stroke-width="1.5"/>`;
    }).join('') + '</svg>';
    card.innerHTML = `<h4>${esc(c.title)}</h4>${svg}<div class="chart-legend">${labels.map((l, i) => `<span><i style="background:${PALETTE[i % 8]}"></i>${esc(l)} · ${vals[i]}</span>`).join('')}</div>`;
  } else {
    const n = labels.length, bw = iw / n;
    let body = '';
    for (let g = 0; g <= 3; g++) { const y = pad.t + ih - (ih * g) / 3; body += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pad.l - 4}" y="${y + 3}" text-anchor="end">${Math.round((max * g) / 3)}</text>`; }
    if (c.type === 'line') {
      const pts = vals.map((v, i) => [pad.l + bw * i + bw / 2, pad.t + ih - (v / max) * ih]);
      body += `<polyline fill="none" stroke="var(--blue)" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--blue)"/>`).join('');
    } else {
      body += vals.map((v, i) => { const h = Math.max(1, (v / max) * ih); return `<rect x="${pad.l + bw * i + bw * .15}" y="${pad.t + ih - h}" width="${bw * .7}" height="${h}" rx="4" fill="${PALETTE[i % 8]}"/><text x="${pad.l + bw * i + bw / 2}" y="${pad.t + ih - h - 3}" text-anchor="middle">${v}</text>`; }).join('');
    }
    body += labels.map((l, i) => `<text x="${pad.l + bw * i + bw / 2}" y="${H - 18}" text-anchor="middle">${esc(l.length > 9 ? l.slice(0, 8) + '…' : l)}</text>`).join('');
    card.innerHTML = `<h4>${esc(c.title)}</h4><svg viewBox="0 0 ${W} ${H}">${body}</svg>`;
  }
  host.append(card);
}
const _ri = renderIntelligence;
renderIntelligence = function (data, host) { _ri(data, host); if (host) (data.charts || []).forEach(c => renderChart(c, host)); };
const _rc = renderConfirm;
renderConfirm = function (c, host) {
  _rc(c, host);
  if (c.kind !== 'email') return;
  const row = host.lastElementChild?.querySelector('.confirm-actions'); if (!row) return;
  const p = c.payload || {};
  const a = document.createElement('a'); a.textContent = 'Open in mail app';
  a.href = `mailto:${encodeURIComponent(p.to || '')}?subject=${encodeURIComponent(p.subject || '')}&body=${encodeURIComponent(p.body || '')}`;
  a.style.cssText = 'padding:8px 14px;border:1px solid var(--line);border-radius:18px;font-size:12px;color:var(--text);text-decoration:none';
  row.append(a);
};

/* ================= modes ================= */
const MODE_OF = { chat: 'assistant', bots: 'bots', node: 'node' };
const _sp = showPanel;
showPanel = function (name) {
  _sp(name);
  $$('#modeBar button').forEach(b => b.classList.toggle('on', MODE_OF[name] === b.dataset.mode));
  if (name === 'bots') openBots();
  if (name === 'node') openNode();
};
$$('#modeBar button').forEach(b => b.addEventListener('click', () => showPanel({ assistant: 'chat', bots: 'bots', node: 'node' }[b.dataset.mode])));

/* ================= 3D ================= */
let threeP = null;
function loadThree() {
  if (window.THREE) return Promise.resolve();
  return threeP || (threeP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => res(); s.onerror = () => { threeP = null; rej(new Error('3D engine could not load. Check your internet.')); };
    document.head.append(s);
  }));
}
function makeBot(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: .35 });
  const shade = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.78), roughness: .6 });
  const head = new THREE.Group(); head.position.y = 1.62;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.78, 32, 24), mat); skull.scale.set(1, .9, .95); head.add(skull);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), mat); knob.position.set(-.14, .86, 0); knob.scale.set(1, 1.15, 1); head.add(knob);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.6, .022, 8, 48), shade); band.rotation.x = Math.PI / 2 + .3; band.position.set(0, .5, .05); head.add(band);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), dark); e.scale.set(.07, .26, .05); e.position.set(s * .27, .02, .72); e.rotation.z = -.5; head.add(e); });
  g.add(head);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.6, 28, 20), mat); body.scale.set(.95, 1.05, .8); body.position.y = .62; g.add(body);
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * .62, .85, 0); const a = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), mat); a.scale.set(.85, 1.8, .85); a.position.y = -.28; p.add(a); p.rotation.z = s * .35; p.userData.base = s * .35; g.add(p); return p; });
  [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), mat); l.scale.set(1, 1.15, 1); l.position.set(s * .27, .08, 0); g.add(l); });
  g.userData = { head, arms, phase: Math.random() * 6 };
  return g;
}
function animBot(g, t, talk) {
  const u = g.userData; const k = talk ? 3.2 : 1.3;
  g.position.y = (g.userData.baseY || 0) + Math.sin(t * k + u.phase) * (talk ? .09 : .045);
  u.head.rotation.z = Math.sin(t * 1.1 + u.phase) * .05; u.head.rotation.y = Math.sin(t * .7 + u.phase) * .15;
  u.arms.forEach((a, i) => { a.rotation.z = a.userData.base + Math.sin(t * k * 1.4 + i * Math.PI) * (talk ? .45 : .09); });
}
const scenes = []; let loopOn = false;
function loop(t) {
  requestAnimationFrame(loop);
  scenes.forEach(s => { if (s.el.offsetParent === null) return; s.resize(); s.tick(t / 1000); s.renderer.render(s.scene, s.camera); });
}
function makeStage(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.querySelector('.stage-note')?.remove(); el.append(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.05));
  const d = new THREE.DirectionalLight(0xffffff, .9); d.position.set(3, 5, 6); scene.add(d);
  const st = { el, renderer, scene, camera, tick() {}, resize() { const w = el.clientWidth, h = el.clientHeight; if (st.w !== w || st.h !== h) { st.w = w; st.h = h; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } } };
  scenes.push(st); if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
  return st;
}
function labelSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 80; const x = c.getContext('2d');
  x.font = '600 34px sans-serif'; x.textAlign = 'center'; x.fillStyle = 'rgba(15,15,20,.78)';
  const w = Math.min(300, x.measureText(text).width + 40); x.beginPath(); x.roundRect ? x.roundRect(160 - w / 2, 12, w, 54, 27) : x.rect(160 - w / 2, 12, w, 54); x.fill();
  x.fillStyle = color; x.beginPath(); x.arc(160 - w / 2 + 22, 39, 8, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.fillText(text.slice(0, 14), 168, 51);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(2.4, .6, 1); return sp;
}

/* ================= bots data ================= */
const BOT_KEY = 'axu_bots_v1', BOT_TOOLS = ['send_email', 'read_emails', 'web_search', 'read_url', 'wikipedia', 'lookup', 'show_chart', 'firebase_overview', 'firebase_read', 'github_repos', 'github_issues', 'github_create_issue', 'get_weather', 'get_news', 'play_music', 'open_app', 'call_contact', 'save_note', 'set_reminder', 'telegram_send'];
let bots = [], selBot = null, botTalking = false; const botChats = {};
function loadBots() {
  try { bots = JSON.parse(localStorage.getItem(BOT_KEY) || 'null'); } catch { bots = null; }
  if (!Array.isArray(bots) || !bots.length) {
    bots = [
      { id: 'ceo', name: 'Atlas', color: '#f5c542', role: 'CEO. Break goals into tasks, delegate to your team with the delegate tool, check the internet when needed, then report back in a few clear lines.', reportsTo: '', tools: [], link: '' },
      { id: 'mailer', name: 'Mailer', color: '#4f9dff', role: 'You write and send emails. Draft clear, friendly, short emails and prepare them for sending.', reportsTo: 'ceo', tools: ['send_email', 'read_emails'], link: '' },
      { id: 'scout', name: 'Scout', color: '#34d399', role: 'Researcher. Search the internet and Wikipedia, read pages, and summarise with sources.', reportsTo: 'ceo', tools: ['web_search', 'read_url', 'wikipedia', 'lookup'], link: '' },
      { id: 'analyst', name: 'Analyst', color: '#f472b6', role: 'Data analyst. Read Firebase and other data, then show charts and explain what is going on.', reportsTo: 'ceo', tools: ['firebase_overview', 'firebase_read', 'show_chart'], link: '' },
    ];
    saveBots();
  }
  if (!selBot || !bots.find(b => b.id === selBot)) selBot = bots[0].id;
}
function saveBots() { try { localStorage.setItem(BOT_KEY, JSON.stringify(bots)); } catch { /* ignore */ } }
const botById = id => bots.find(b => b.id === id);
const bossName = id => botById(id)?.name || '—';

/* ---- Studio ---- */
let studio = null, studioBot = null, formTools = new Set();
async function openBots() {
  loadBots(); renderStrip(); fillForm(); renderSheet(); renderBotMsgs();
  if (studio) { rebuildStudioBot(); return; }
  const stage = $('#botStage');
  try {
    await loadThree(); studio = makeStage(stage); studio.camera.position.set(0, 1.6, 6.2); studio.camera.lookAt(0, 1.3, 0);
    studio.tick = t => { if (studioBot) { studioBot.rotation.y = Math.sin(t * .5) * .6; animBot(studioBot, t, botTalking); } };
    let drag = null; stage.addEventListener('pointerdown', e => { drag = e.clientX; }); window.addEventListener('pointerup', () => { drag = null; });
    rebuildStudioBot();
  } catch (e) { stage.innerHTML = `<span class="stage-note">${esc(e.message)}</span>`; }
}
function rebuildStudioBot(colorOverride) {
  if (!studio) return;
  if (studioBot) studio.scene.remove(studioBot);
  const b = botById(selBot); studioBot = makeBot(colorOverride || b?.color || '#ffffff'); studio.scene.add(studioBot);
}
function renderStrip() {
  const strip = $('#botStrip'); strip.innerHTML = '';
  bots.forEach(b => { const c = document.createElement('button'); c.type = 'button'; c.className = 'bot-chip' + (b.id === selBot ? ' on' : ''); c.innerHTML = `<i style="background:${esc(b.color)}"></i>${esc(b.name)}`; c.onclick = () => { selBot = b.id; renderStrip(); fillForm(); rebuildStudioBot(); renderBotMsgs(); }; strip.append(c); });
}
function fillForm(newBot) {
  const b = newBot ? { id: '', name: '', role: '', color: PALETTE[bots.length % 8], reportsTo: '', tools: [], link: '' } : botById(selBot); if (!b) return;
  $('#bfName').value = b.name; $('#bfRole').value = b.role; $('#bfColor').value = b.color; $('#bfLink').value = b.link || ''; $('#bfKnow').value = b.knowledge || '';
  const sel = $('#bfBoss'); sel.innerHTML = '<option value="">Nobody (top level)</option>' + bots.filter(x => x.id !== b.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join(''); sel.value = b.reportsTo || '';
  formTools = new Set(b.tools || []); const box = $('#bfTools'); box.innerHTML = '';
  const all = document.createElement('button'); all.type = 'button'; all.textContent = 'Everything'; all.className = formTools.size ? '' : 'on'; all.onclick = () => { formTools.clear(); fillToolsUI(); }; box.append(all);
  BOT_TOOLS.forEach(t => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t.replace(/_/g, ' '); x.dataset.t = t; x.className = formTools.has(t) ? 'on' : ''; x.onclick = () => { formTools.has(t) ? formTools.delete(t) : formTools.add(t); fillToolsUI(); }; box.append(x); });
  $('#botForm').dataset.new = newBot ? '1' : '';
}
function fillToolsUI() { const kids = $$('#bfTools button'); kids[0].classList.toggle('on', !formTools.size); kids.slice(1).forEach(k => k.classList.toggle('on', formTools.has(k.dataset.t))); }
$('#bfColor')?.addEventListener('input', e => rebuildStudioBot(e.target.value));
$('#botForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const data = { name: $('#bfName').value.trim().slice(0, 24), role: $('#bfRole').value.trim(), color: $('#bfColor').value, reportsTo: $('#bfBoss').value, tools: [...formTools], link: $('#bfLink').value.trim(), knowledge: $('#bfKnow').value.slice(0, 4000) };
  if (!data.name) return;
  if ($('#botForm').dataset.new) { const id = 'b' + Date.now().toString(36); bots.push({ id, ...data }); selBot = id; }
  else Object.assign(botById(selBot), data);
  // avoid reporting cycles
  const b = botById(selBot); let cur = b, n = 0; while (cur?.reportsTo && n++ < 20) cur = botById(cur.reportsTo); if (n >= 20) b.reportsTo = '';
  saveBots(); renderStrip(); fillForm(); rebuildStudioBot(); renderSheet(); toast('Bot saved.');
});
$('#bfNew')?.addEventListener('click', () => { fillForm(true); rebuildStudioBot($('#bfColor').value); });
$('#bfDelete')?.addEventListener('click', () => {
  if (bots.length <= 1 || !confirm('Delete this bot?')) return;
  const id = selBot; bots = bots.filter(b => b.id !== id); bots.forEach(b => { if (b.reportsTo === id) b.reportsTo = ''; });
  delete botChats[id]; selBot = bots[0].id; saveBots(); renderStrip(); fillForm(); rebuildStudioBot(); renderSheet(); renderBotMsgs();
});
$$('#botsTabs button[data-bt]').forEach(b => b.addEventListener('click', () => {
  $$('#botsTabs button[data-bt]').forEach(x => x.classList.toggle('on', x === b));
  $('#botsStudio').hidden = b.dataset.bt !== 'studio'; $('#botsSheet').hidden = b.dataset.bt !== 'sheet'; if (b.dataset.bt === 'sheet') renderSheet();
}));
function renderSheet() {
  const t = $('#botSheet'); if (!t) return;
  t.innerHTML = '<tr><th>Bot</th><th>Role</th><th>Reports to</th><th>Can use</th><th>Link</th><th></th></tr>';
  bots.forEach(b => {
    const tr = document.createElement('tr');
    const link = b.link && /^https?:\/\//i.test(b.link) ? `<a href="${esc(b.link)}" target="_blank" rel="noopener">Open</a>` : '—';
    tr.innerHTML = `<td><i style="background:${esc(b.color)}"></i><b>${esc(b.name)}</b></td><td>${esc(b.role).slice(0, 140)}</td><td>${esc(bossName(b.reportsTo))}</td><td>${b.tools?.length ? esc(b.tools.map(x => x.replace(/_/g, ' ')).join(', ')) : 'Everything'}</td><td>${link}</td><td><button class="pill-button" type="button">Chat</button></td>`;
    tr.querySelector('button').onclick = () => { selBot = b.id; $$('#botsTabs button')[0].click(); renderStrip(); fillForm(); rebuildStudioBot(); renderBotMsgs(); };
    t.append(tr);
  });
}
function renderBotMsgs() {
  const box = $('#botMsgs'); box.innerHTML = '';
  const hist = botChats[selBot] || [];
  if (!hist.length) { const d = document.createElement('div'); d.className = 'bmsg trace'; d.textContent = `Talk to ${botById(selBot)?.name || 'this bot'}. Managers can hand work to their team.`; box.append(d); }
  hist.forEach(m => addBotBubble(m.role === 'user' ? 'u' : 'b', m.content, m.extras, true));
}
function addBotBubble(cls, text, extras, noStore) {
  const box = $('#botMsgs'); const d = document.createElement('div'); d.className = 'bmsg ' + cls; d.textContent = text; box.append(d);
  if (extras) { const host = document.createElement('div'); d.append(host); renderIntelligence(extras, host); }
  box.scrollTop = box.scrollHeight; return d;
}
$('#botChatForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#botInput'); const message = input.value.trim(); if (!message) return; input.value = '';
  const bot = botById(selBot); if (!bot) return;
  const hist = botChats[bot.id] = botChats[bot.id] || [];
  if (!hist.length) $('#botMsgs').innerHTML = '';
  addBotBubble('u', message); hist.push({ role: 'user', content: message });
  const wait = addBotBubble('b', 'Working…'); botTalking = true; nodeActive[bot.id] = Date.now() + 90000;
  try {
    const res = await fetch('/api/bot-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      message, bot, bots, history: hist.slice(-7, -1).map(m => ({ role: m.role, content: m.content })),
      prefs: { platform: settings.platform, contacts: contactsMap() },
      ai: { provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key, agent: true, address: addressName() }, integrations: integrationsPayload() }) });
    const d = await res.json(); if (!res.ok || !d.ok) throw new Error(d.error || 'Failed');
    wait.remove(); nodeActive[bot.id] = Date.now() + 8000;
    (d.trace || []).forEach(t => { const tb = bots.find(x => x.name === t.bot); if (tb) nodeActive[tb.id] = Date.now() + 8000; });
    (d.trace || []).forEach(t => addBotBubble('trace', `↳ ${t.bot}: ${t.task}`));
    const extras = {}; ['action', 'actions', 'confirms', 'images', 'map', 'cards', 'charts', 'invoice', 'news', 'intent'].forEach(k => { if (d[k] !== undefined) extras[k] = d[k]; });
    addBotBubble('b', d.reply || 'Done.', extras); hist.push({ role: 'assistant', content: d.reply || 'Done.', extras });
    (d.reminders || []).forEach(scheduleReminder);
    const app = (d.actions || []).find(a => a.type === 'open_app'); if (app) setTimeout(() => launchApp(app), 250);
  } catch (err) { wait.textContent = 'Error: ' + err.message; }
  botTalking = false;
});

/* ================= Node ================= */
let nodeActive = {}; let node = null, nodeGroup = null, nodeSel = null, nodeBots = {};
async function openNode() {
  loadBots(); const stage = $('#nodeStage');
  try {
    await loadThree();
    if (!node) {
      node = makeStage(stage); node.camera.position.set(0, 0, 11);
      let rotY = 0, rotX = 0, down = null, moved = 0, pts = new Map(), pinch = 0;
      const el = node.renderer.domElement; el.style.touchAction = 'none';
      el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); down = { x: e.clientX, y: e.clientY }; moved = 0; });
      el.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId); pts.set(e.pointerId, e);
        if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) node.camera.position.z = Math.min(26, Math.max(4, node.camera.position.z * (pinch / d))); pinch = d; moved = 99; return; }
        rotY += (e.clientX - prev.clientX) * .008; rotX += (e.clientY - prev.clientY) * .004; rotX = Math.max(-.5, Math.min(.5, rotX)); rotY = Math.max(-1.2, Math.min(1.2, rotY)); moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      });
      el.addEventListener('pointerup', e => {
        pts.delete(e.pointerId); pinch = 0;
        if (moved < 6 && down) pickNode(e);
      });
      el.addEventListener('wheel', e => { e.preventDefault(); node.camera.position.z = Math.min(26, Math.max(4, node.camera.position.z + e.deltaY * .01)); }, { passive: false });
      node.tick = t => { if (!nodeGroup) return; nodeGroup.rotation.y += (rotY - nodeGroup.rotation.y) * .1; nodeGroup.rotation.x += (rotX - nodeGroup.rotation.x) * .1; Object.entries(nodeBots).forEach(([id, g]) => { g.userData.baseY = g.userData.y0; animBot(g, t, id === nodeSel || (nodeActive[id] || 0) > Date.now()); g.scale.setScalar(id === nodeSel ? 1.12 : 1); }); };
    }
    buildNode();
  } catch (e) { stage.innerHTML = `<span class="stage-note">${esc(e.message)}</span>`; }
}
function buildNode() {
  if (nodeGroup) node.scene.remove(nodeGroup);
  nodeGroup = new THREE.Group(); nodeBots = {}; node.scene.add(nodeGroup);
  const kids = id => bots.filter(b => (b.reportsTo || '') === id && b.id !== id);
  const roots = bots.filter(b => !b.reportsTo || !botById(b.reportsTo));
  let leaf = 0; const pos = {};
  (function lay(b, depth, seen) {
    if (seen.has(b.id)) return; seen.add(b.id);
    const ch = kids(b.id);
    if (!ch.length) { pos[b.id] = { x: leaf++ * 2.6, d: depth }; return; }
    ch.forEach(c => lay(c, depth + 1, seen));
    const xs = ch.map(c => pos[c.id]?.x).filter(v => v !== undefined); pos[b.id] = { x: (Math.min(...xs) + Math.max(...xs)) / 2, d: depth };
  });
  const seen = new Set(); roots.forEach(r => { (function lay(b, depth) { if (seen.has(b.id)) return; seen.add(b.id); const ch = kids(b.id); if (!ch.length) { pos[b.id] = { x: leaf++ * 2.6, d: depth }; return; } ch.forEach(c => lay(c, depth + 1)); const xs = ch.map(c => pos[c.id]?.x).filter(v => v !== undefined); pos[b.id] = { x: xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : leaf++ * 2.6, d: depth }; })(r, 0); });
  const xs = Object.values(pos).map(p => p.x), cx = (Math.min(...xs) + Math.max(...xs)) / 2, maxD = Math.max(...Object.values(pos).map(p => p.d));
  const width = Math.max(...xs) - Math.min(...xs) + 3.5; node.camera.position.z = Math.max(8, width * .95, (maxD + 1) * 4.2);
  bots.forEach(b => {
    const p = pos[b.id]; if (!p) return;
    const g = makeBot(b.color); g.scale.setScalar(.9); const x = p.x - cx, y = -p.d * 3.4 + maxD * 1.5; g.position.set(x, y, 0); g.userData.y0 = y; g.userData.id = b.id;
    g.traverse(m => { if (m.isMesh) m.userData.botId = b.id; });
    const lab = labelSprite(b.name, b.color); lab.position.set(x, y + 3.15, 0); nodeGroup.add(g, lab); nodeBots[b.id] = g;
    if (b.reportsTo && pos[b.reportsTo]) {
      const q = pos[b.reportsTo], qy = -q.d * 3.4 + maxD * 1.5;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(q.x - cx, qy - .4, 0), new THREE.Vector3(x, y + 2.7, 0)]);
      nodeGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(b.color) })));
    }
  });
}
function pickNode(e) {
  const el = node.renderer.domElement, r = el.getBoundingClientRect();
  const mouse = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, node.camera);
  const meshes = []; nodeGroup.traverse(m => { if (m.isMesh) meshes.push(m); });
  const hit = ray.intersectObjects(meshes)[0]; const card = $('#nodeCard');
  if (!hit) { nodeSel = null; card.hidden = true; return; }
  nodeSel = hit.object.userData.botId; const b = botById(nodeSel); if (!b) return;
  card.hidden = false;
  card.innerHTML = `<h4><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(b.color)};margin-right:7px"></i>${esc(b.name)}</h4><p>${esc((b.role || '').slice(0, 160))}<br>Reports to: ${esc(bossName(b.reportsTo))}</p><div class="bf-actions"><button class="pill-button go" type="button" id="ncChat">Open chat</button><button class="pill-button" type="button" id="ncClose">Close</button></div>`;
  $('#ncChat').onclick = () => { selBot = b.id; card.hidden = true; showPanel('bots'); renderStrip(); fillForm(); rebuildStudioBot(); renderBotMsgs(); };
  $('#ncClose').onclick = () => { card.hidden = true; nodeSel = null; };
}

/* ================= Voice mode ================= */
const VM = { open: false, state: 'idle', level: 0, rec: null, ctx: null, an: null, data: null, raf: 0, audio: null, hist: [], paused: false, soundOn: false, pts: null };
const vmEl = $('#voiceMode'), vmCanvas = $('#vmCanvas');
function vmSet(state, label) { VM.state = state; $('#vmStatus').textContent = label || { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking', paused: 'Paused' }[state] || ''; }
function openVoiceMode() {
  if (VM.open) return; VM.open = true; VM.paused = false; vmEl.classList.add('open'); vmEl.setAttribute('aria-hidden', 'false');
  try { VM.ctx = VM.ctx || new (window.AudioContext || window.webkitAudioContext)(); VM.ctx.resume?.(); } catch { /* ignore */ }
  if (!VM.pts) { VM.pts = []; const N = 720, ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i; VM.pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, ph: Math.random() * 6.28, sz: .6 + Math.random() * 1.1 }); } }
  vmCanvas.width = vmCanvas.height = 1000; vmDraw(0); vmListen();
}
function closeVoiceMode() {
  VM.open = false; cancelAnimationFrame(VM.raf); try { VM.rec?.abort(); } catch { /* ignore */ } VM.rec = null;
  if (VM.audio) { VM.audio.pause(); VM.audio = null; } window.speechSynthesis?.cancel();
  vmEl.classList.remove('open'); vmEl.setAttribute('aria-hidden', 'true'); $('#vmCaption').textContent = '';
}
$('#vmClose')?.addEventListener('click', closeVoiceMode);
vmCanvas?.addEventListener('click', () => {
  if (VM.state === 'speaking') { if (VM.audio) VM.audio.pause(); VM.audio = null; window.speechSynthesis?.cancel(); vmListen(); }
  else if (VM.state === 'listening') { VM.paused = true; try { VM.rec?.abort(); } catch { /* ignore */ } vmSet('paused'); }
  else if (VM.state === 'paused') { VM.paused = false; vmListen(); }
});
function vmListen() {
  if (!VM.open) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { vmSet('idle', 'Voice input is not supported in this browser'); return; }
  vmSet('listening'); $('#vmCaption').textContent = '';
  const rec = new SR(); VM.rec = rec; rec.lang = settings.voiceLanguage || 'en-IN'; rec.interimResults = true; rec.continuous = false;
  let finalText = '';
  rec.onsoundstart = () => { VM.soundOn = true; }; rec.onsoundend = () => { VM.soundOn = false; };
  rec.onresult = ev => { let t = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { t += ev.results[i][0].transcript; if (ev.results[i].isFinal) finalText = t; } $('#vmCaption').textContent = t; VM.level = Math.max(VM.level, .5); };
  rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { vmSet('idle', 'Allow microphone access'); VM.rec = null; } };
  rec.onend = () => {
    VM.soundOn = false; if (!VM.open || VM.rec !== rec) return;
    if (finalText.trim()) vmAsk(finalText.trim()); else if (!VM.paused && VM.state === 'listening') setTimeout(() => { if (VM.open && !VM.paused && VM.state === 'listening') vmListen(); }, 250);
  };
  try { rec.start(); } catch { setTimeout(vmListen, 400); }
}
async function vmAsk(text) {
  vmSet('thinking'); $('#vmCaption').textContent = text;
  let data;
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      message: text, history: VM.hist.slice(-6), prefs: { platform: settings.platform, video_platform: settings.videoPlatform, search_engine: settings.searchEngine || 'google', contacts: contactsMap() },
      ai: { provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key, agent: (settings.ai || {}).agent !== false, address: addressName() }, integrations: integrationsPayload() }) });
    data = await res.json(); if (!data.ok) throw new Error(data.error || 'failed');
  } catch (e) { data = { reply: 'Sorry, I could not reach the server.' }; }
  VM.hist.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply || '' });
  // mirror into the chat so drafts, charts and images are there when you close voice mode
  try {
    const chat = currentChat(); addMessage('user', text); chat.messages.push({ role: 'user', content: text, createdAt: Date.now() });
    const h = addMessage('assistant', data.reply || 'Done.'); const extras = {};
    ['action', 'actions', 'confirms', 'reminders', 'news', 'images', 'map', 'cards', 'charts', 'invoice', 'source', 'intent'].forEach(k => { if (data[k] !== undefined) extras[k] = data[k]; });
    renderIntelligence(extras, h.richHost); chat.messages.push({ role: 'assistant', content: data.reply || 'Done.', extras, createdAt: Date.now() }); chat.updatedAt = Date.now(); persistConversations();
  } catch { /* ignore */ }
  (data.reminders || []).forEach(scheduleReminder);
  const app = (data.actions || (data.action ? [data.action] : [])).find(a => a.type === 'open_app'); if (app) setTimeout(() => launchApp(app), 400);
  let say = data.reply || 'Done.'; if ((data.confirms || []).length) say += ' I prepared it in the chat for you to confirm.';
  if (!VM.open) return;
  $('#vmCaption').textContent = (data.reply || '').slice(0, 220);
  await vmSpeak(say);
  if (VM.open && !VM.paused) vmListen();
}
async function vmSpeak(text) {
  vmSet('speaking'); const spoken = String(text).replace(/https?:\/\/\S+/g, 'link').replace(/[*_`#]/g, '').slice(0, 600);
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: spoken, voice: settings.voiceName, rate: Number(settings.voiceRate) || 0 }) });
    if (!r.ok) throw new Error('tts'); const url = URL.createObjectURL(await r.blob());
    const a = new Audio(url); VM.audio = a;
    try { if (VM.ctx) { const src = VM.ctx.createMediaElementSource(a); VM.an = VM.ctx.createAnalyser(); VM.an.fftSize = 256; VM.data = new Uint8Array(VM.an.frequencyBinCount); src.connect(VM.an); VM.an.connect(VM.ctx.destination); } } catch { VM.an = null; }
    await new Promise(res => { a.onended = res; a.onerror = res; a.onpause = res; a.play().catch(res); });
    VM.an = null; URL.revokeObjectURL(url);
  } catch {
    await new Promise(res => { if (!('speechSynthesis' in window)) return res(); const u = new SpeechSynthesisUtterance(spoken); u.onend = res; u.onerror = res; VM.fake = true; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); });
    VM.fake = false;
  }
}
function vmDraw(ts) {
  if (!VM.open) return; VM.raf = requestAnimationFrame(vmDraw);
  const t = ts / 1000, ctx = vmCanvas.getContext('2d'), S = 1000, R = 330;
  let target = 0;
  if (VM.state === 'speaking') { if (VM.an) { VM.an.getByteFrequencyData(VM.data); let s = 0; for (let i = 0; i < 40; i++) s += VM.data[i]; target = Math.min(1, s / 40 / 150); } else target = .35 + .3 * Math.abs(Math.sin(t * 7)); }
  else if (VM.state === 'listening') target = VM.soundOn ? .3 + .25 * Math.abs(Math.sin(t * 9)) : .04;
  else if (VM.state === 'thinking') target = .12 + .08 * Math.sin(t * 4);
  VM.level += (target - VM.level) * .22;
  ctx.clearRect(0, 0, S, S);
  VM.ang = (VM.ang || 0) + .004 + VM.level * .0015; const ang = VM.ang, ca = Math.cos(ang), sa = Math.sin(ang), tilt = .35, ct = Math.cos(tilt), st = Math.sin(tilt);
  const HUES = { mint: '205,235,225', white: '235,235,240', blue: '165,200,255', pink: '255,190,225', gold: '255,225,150' }, hue = HUES[settings.sphereColor] || HUES.mint, K = settings.sphereMove === undefined ? .08 : Number(settings.sphereMove);
  const out = VM.pts.map(p => {
    const bump = 1 + K * VM.level * (.5 * Math.sin(p.ph + t * 3 + p.y * 4) + .25 * Math.sin(p.x * 5 + t * 2)) + K * VM.level * .35;
    let x = p.x * bump, y = p.y * bump, z = p.z * bump;
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
    const k = 1.8 / (1.8 + z2 * .6); return { sx: S / 2 + x1 * R * k, sy: S / 2 + y2 * R * k, z: z2, sz: p.sz, k };
  }).sort((a, b) => a.z - b.z);
  out.forEach(d => { const dp = (d.z + 1) / 2; ctx.globalAlpha = .18 + .82 * dp; ctx.fillStyle = `rgb(${hue})`; ctx.beginPath(); ctx.arc(d.sx, d.sy, (1.6 + 4.2 * dp) * d.sz * d.k * (1 + VM.level * K * .8), 0, 6.283); ctx.fill(); });
  ctx.globalAlpha = 1;
}

/* ================= Onboarding ================= */
const VOICES = [['en-GB-RyanNeural', 'Ryan', 'UK · male'], ['en-GB-SoniaNeural', 'Sonia', 'UK · female'], ['en-IN-PrabhatNeural', 'Prabhat', 'India · male'], ['en-IN-NeerjaNeural', 'Neerja', 'India · female'], ['en-US-GuyNeural', 'Guy', 'US · male'], ['en-US-JennyNeural', 'Jenny', 'US · female'], ['hi-IN-MadhurNeural', 'Madhur', 'Hindi · male'], ['hi-IN-SwaraNeural', 'Swara', 'Hindi · female'], ['ur-PK-AsadNeural', 'Asad', 'Urdu · male'], ['ur-PK-UzmaNeural', 'Uzma', 'Urdu · female']];
const INTERESTS = [['music', 'Music & videos'], ['mail', 'Email'], ['code', 'Coding & GitHub'], ['biz', 'Business data'], ['social', 'Social apps'], ['calls', 'Calls & messages'], ['study', 'Study & research'], ['bots', 'Bots & automation']];
const CONNECTS = {
  mail: { t: 'Email', d: 'Read and write mail', sec: 'integrations' }, code: { t: 'GitHub', d: 'Repos, issues, notifications', sec: 'integrations' },
  biz: { t: 'Firebase', d: 'Live data with graphs', sec: 'integrations' }, calls: { t: 'Contacts', d: 'Call people by name', sec: 'contacts' },
  bots: { t: 'Telegram', d: 'Message from your bots', sec: 'integrations' }, social: { t: 'Apps', d: 'Open any app by voice', sec: null },
};
let obStep = 1, obInterests = new Set(), obSection = null;
function buildOnboarding() {
  const vbox = $('#obVoices'); if (!vbox || vbox.dataset.built) return; vbox.dataset.built = '1';
  VOICES.forEach(([id, name, meta]) => {
    const row = document.createElement('div'); row.className = 'ob-voice' + (settings.voiceName === id ? ' on' : ''); row.dataset.v = id;
    row.innerHTML = `<span>${name} <small style="color:#888">· ${meta}</small></span><button type="button">Hear</button>`;
    row.addEventListener('click', () => { settings.voiceName = id; saveSettings(); $$('.ob-voice').forEach(r => r.classList.toggle('on', r === row)); });
    row.querySelector('button').addEventListener('click', ev => { ev.stopPropagation(); settings.voiceName = id; saveSettings(); $$('.ob-voice').forEach(r => r.classList.toggle('on', r === row)); neuralSay(`Hi, I'm ${name}. I can be your voice.`); });
    vbox.append(row);
  });
  const ibox = $('#obInterests'); INTERESTS.forEach(([id, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { obInterests.has(id) ? obInterests.delete(id) : obInterests.add(id); b.classList.toggle('on'); }; ibox.append(b); });
}
function obShow(n) {
  obStep = n; $$('.ob-step').forEach(s => s.classList.toggle('on', Number(s.dataset.step) === n));
  $$('#obDots i').forEach((d, i) => d.classList.toggle('on', i + 1 === n)); $('#onboardGo').textContent = n === 5 ? 'Download & start' : 'Next';
  const skip = $('#onboardSkip'); if (skip) skip.hidden = n === 5;
  if (n === 5) loadOnboardingModels();
  if (n === 4) {
    const box = $('#obConnect'); box.innerHTML = '';
    [...obInterests].filter(i => CONNECTS[i]).forEach(i => {
      const c = CONNECTS[i], row = document.createElement('div'); row.className = 'ob-card'; row.innerHTML = `<span>${c.t}<small>${c.d}</small></span>${c.sec ? '<button type="button">Connect now</button>' : ''}`;
      row.querySelector('button')?.addEventListener('click', () => { obSection = c.sec; obShow(5); }); box.append(row);
    });
    if (!box.children.length) box.innerHTML = '<div class="ob-card"><span>You can connect Email, GitHub, Firebase and more later in Settings → Integrations.</span></div>';
  }
}
async function loadOnboardingModels() {
  const select = $('#obModelSelect');
  const info = $('#obModelInfo');
  if (!select || select.dataset.loaded === '1') return;
  select.dataset.loaded = '1';
  try {
    const response = await fetch('/api/model-library/featured');
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not load starter models.');
    const models = data.models || [];
    select.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option'); option.value = model.id;
      option.textContent = `${model.name} · ${model.quantization || 'GGUF'}`;
      select.append(option);
    });
    const defaultModel = models.find(m => m.id === 'qwen25-05b-instruct') || models[0];
    if (defaultModel) select.value = defaultModel.id;
    const update = () => {
      const chosen = models.find(m => m.id === select.value);
      if (info && chosen) info.textContent = `${chosen.parameters} · ${chosen.description || 'Local model'} ${chosen.device_note || ''}`;
    };
    select.addEventListener('change', update); update();
  } catch (error) {
    if (info) info.textContent = `Model list unavailable: ${error.message}. Check your internet connection and retry.`;
    select.dataset.loaded = '0';
  }
}

async function onboardDownloadModel() {
  const select = $('#obModelSelect');
  const status = $('#obModelReady');
  const button = $('#onboardGo');
  if (!window.AXOModels?.downloadFeaturedModel) {
    if (status) status.textContent = 'Model downloader is unavailable. Refresh the page and retry.';
    return;
  }
  const modelId = select?.value;
  if (!modelId) { if (status) status.textContent = 'Choose a starter model first.'; return; }
  button.disabled = true; button.textContent = 'Preparing…';
  if (status) status.textContent = 'Downloading and loading your first model…';
  try {
    await window.AXOModels.downloadFeaturedModel(modelId, true);
    localStorage.setItem('axo_onboarding_model_ready', '1');
    if (status) status.textContent = 'Model ready. Finishing setup…';
    button.textContent = 'Starting…';
    onboardFinish();
  } catch (error) {
    if (status) status.textContent = `Could not prepare this model: ${error.message}. Choose a smaller model or retry.`;
    button.disabled = false; button.textContent = 'Retry download';
  }
}

function onboardNext() {
  buildOnboarding();
  if (obStep === 1) { if (!$('#onboardName').value.trim()) { $('#onboardName').focus(); return; } obShow(2); return; }
  if (obStep < 5) { obShow(obStep + 1); return; }
  onboardDownloadModel();
}
function onboardFinish() {
  const key = ($('#obKey')?.value || '').trim();
  if (key) { settings.ai = { ...(settings.ai || {}), key, provider: (settings.ai || {}).provider === 'custom' ? 'custom' : 'auto' }; }
  settings.interests = [...obInterests]; saveSettings();
  finishOnboarding();
  if (obSection) { const s = obSection; obSection = null; setTimeout(() => { openSettings(); showSettingsSection(s); }, 400); }
}
$('#onboardSkip')?.addEventListener('click', () => { if (!$('#onboardName').value.trim()) { $('#onboardName').focus(); return; } obShow(5); });
const _oo = openOnboarding; openOnboarding = function () { _oo(); buildOnboarding(); obShow(1); };

/* ================= Neural greeting (uses the voice you picked) ================= */
async function neuralSay(text) {
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: settings.voiceName, rate: Number(settings.voiceRate) || 0 }) });
    if (!r.ok) throw new Error('tts'); const url = URL.createObjectURL(await r.blob());
    if (axuAudio) axuAudio.pause(); axuAudio = new Audio(url); axuAudio.onended = () => URL.revokeObjectURL(url);
    try { await axuAudio.play(); return 'ok'; } catch { return 'blocked'; }
  } catch { if (!neuralSay.retried) { neuralSay.retried = true; setTimeout(() => { neuralSay.retried = false; }, 15000); return neuralSay(text); } toast('Voice service is unavailable right now.'); return 'fail'; }
}
playGreeting = function () { playWelcomeChime(); if (settings.greetSpeak) neuralSay(`${greetingText()}. How can I help?`); };
startGreeting = function () {
  if (!settings.name || greetingPlayedThisView) return; greetingPlayedThisView = true;
  if (!(settings.greetChime || settings.greetSpeak)) return;
  (async () => {
    const chimed = playWelcomeChime(); const res = settings.greetSpeak ? await neuralSay(`${greetingText()}. How can I help?`) : 'ok';
    if (res === 'blocked' || (!chimed && settings.greetChime)) {
      const unlock = () => { playWelcomeChime(); if (res === 'blocked' && settings.greetSpeak) neuralSay(`${greetingText()}. How can I help?`); };
      ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlock, { once: true }));
    }
  })();
};

/* ================= Welcome: connect strip ================= */
function renderConnectStrip() {
  const scr = $('#welcomeScreen'); if (!scr) return; let strip = $('#connectStrip');
  if (!strip) { strip = document.createElement('div'); strip.id = 'connectStrip'; strip.className = 'connect-strip'; scr.append(strip); }
  strip.innerHTML = ''; const items = [['sun|Daily briefing', '__brief']];
  if (window.__installEvt) items.push(['download|Install app', '__install']);
  if (!(settings.ai || {}).key) items.push(['sparkles|Add AI key to unlock the agent', 'ai']);
  const want = new Set(settings.interests || []);
  if (want.has('mail') && !(settings.gmail || {}).email) items.push(['mail|Connect email', 'integrations']);
  if (want.has('code') && !(settings.github || {}).token) items.push(['github|Connect GitHub', 'integrations']);
  if (want.has('biz') && !(settings.firebase || {}).service_account) items.push(['flame|Connect Firebase', 'integrations']);
  if (want.has('calls') && !settings.contactsText) items.push(['phone|Add contacts', 'contacts']);
  items.slice(0, 4).forEach(([label, sec]) => { const b = document.createElement('button'); b.type = 'button'; b.append(iconLabel(label)); b.onclick = () => { if (sec === '__brief') sendMessage('daily briefing'); else if (sec === '__install') installApp(); else { openSettings(); showSettingsSection(sec); } }; strip.append(b); });
}
const _rw = renderWelcome; renderWelcome = function () { _rw(); renderConnectStrip(); };

/* ================= boot ================= */

/* ================= v12: memory, schedules, wake word, backup, install ================= */
const _fetch0 = window.fetch.bind(window);
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const isChat = /\/api\/(chat|bot-chat)$/.test(url);
  if (isChat && init && typeof init.body === 'string') {
    try { const b = JSON.parse(init.body); b.ai = { ...(b.ai || {}), memory: (settings.memory || []).slice(-15), city: settings.city || '' }; b.prefs = { ...(b.prefs || {}), city: settings.city || '' }; init = { ...init, body: JSON.stringify(b) }; } catch { /* ignore */ }
  }
  const r = await _fetch0(input, init);
  if (isChat) r.clone().json().then(d => { (d.memory_add || []).forEach(addMemory); (d.schedules || []).forEach(s => addSchedule(s.time, s.prompt, s.repeat)); }).catch(() => {});
  return r;
};
function addMemory(fact) {
  fact = String(fact || '').trim().slice(0, 160); if (!fact) return;
  settings.memory = settings.memory || []; if (settings.memory.some(m => m.toLowerCase() === fact.toLowerCase())) return;
  settings.memory.push(fact); settings.memory = settings.memory.slice(-40); saveSettings(); renderMemory(); toast('Remembered.');
}
function renderMemory() {
  const box = $('#memList'); if (!box) return; box.innerHTML = '';
  if (!(settings.memory || []).length) box.innerHTML = '<div class="empty-state">Nothing yet.</div>';
  (settings.memory || []).forEach((m, i) => {
    const row = document.createElement('div'); row.className = 'setting-row'; row.innerHTML = `<span><strong style="font-weight:500">${esc(m)}</strong></span>`;
    const x = document.createElement('button'); x.className = 'pill-button'; x.type = 'button'; x.textContent = 'Forget'; x.onclick = () => { settings.memory.splice(i, 1); saveSettings(); renderMemory(); }; row.append(x); box.append(row);
  });
}
$('#memForm')?.addEventListener('submit', ev => { ev.preventDefault(); addMemory($('#memInput').value); $('#memInput').value = ''; });

function addSchedule(time, prompt, repeat) {
  if (!/^\d\d:\d\d$/.test(time || '') || !prompt) return;
  settings.schedules = settings.schedules || []; settings.schedules.push({ id: 's' + Date.now().toString(36), time, prompt: String(prompt).slice(0, 200), repeat: repeat === 'once' ? 'once' : 'daily', last: '' });
  saveSettings(); renderSchedules(); toast(`Scheduled for ${time}.`);
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
}
function renderSchedules() {
  const box = $('#schList'); if (!box) return; box.innerHTML = '';
  if (!(settings.schedules || []).length) box.innerHTML = '<div class="empty-state">No schedules yet.</div>';
  (settings.schedules || []).forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'setting-row'; row.innerHTML = `<span><strong>${esc(s.time)} · ${s.repeat === 'once' ? 'once' : 'daily'}</strong><small>${esc(s.prompt)}</small></span>`;
    const x = document.createElement('button'); x.className = 'pill-button'; x.type = 'button'; x.textContent = 'Remove'; x.onclick = () => { settings.schedules.splice(i, 1); saveSettings(); renderSchedules(); }; row.append(x); box.append(row);
  });
}
$('#schForm')?.addEventListener('submit', ev => { ev.preventDefault(); addSchedule($('#schTime').value, $('#schPrompt').value.trim(), 'daily'); });
let schBusy = false;
async function runSchedule(s) {
  try {
    let d;
    const mode = settings.ai?.mode || 'auto';
    const useLocal = mode === 'local' || (mode === 'auto' && window.AXOModels?.isReady());
    if (useLocal) {
      if (!window.AXOModels?.isReady()) return;
      d = await window.AXOModels.chat(s.prompt, []);
    } else {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        message: s.prompt, history: [], prefs: { platform: settings.platform, contacts: contactsMap() },
        ai: { provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key, agent: (settings.ai || {}).agent !== false, address: addressName() }, integrations: integrationsPayload() }) });
      d = await res.json();
    }
    if (!d?.ok) return;
    try {
      const chat = currentChat(); addMessage('user', `Scheduled: ${s.prompt}`); chat.messages.push({ role: 'user', content: `Scheduled: ${s.prompt}`, createdAt: Date.now() });
      const h = addMessage('assistant', d.reply || 'Done.'); const extras = {};
      ['action', 'actions', 'confirms', 'news', 'images', 'map', 'cards', 'charts', 'invoice', 'source', 'intent'].forEach(k => { if (d[k] !== undefined) extras[k] = d[k]; });
      renderIntelligence(extras, h.richHost); chat.messages.push({ role: 'assistant', content: d.reply || 'Done.', extras, createdAt: Date.now() }); chat.updatedAt = Date.now(); persistConversations();
    } catch { /* ignore */ }
    (d.reminders || []).forEach(scheduleReminder);
    toast(`Scheduled: ${(d.reply || '').slice(0, 80)}`);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AXO', { body: (d.reply || '').slice(0, 140), icon: LOGO_URL }); } catch { /* ignore */ }
    if (settings.voiceReplies || settings.greetSpeak) neuralSay(String(d.reply || '').replace(/https?:\/\/\S+/g, 'link').slice(0, 500));
  } catch (error) { console.warn('AXO scheduled task failed:', error); }
}
function tickSchedules() {
  if (schBusy || !(settings.schedules || []).length) return;
  const n = new Date(), today = n.toDateString(), hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
  const due = settings.schedules.find(s => s.time <= hm && s.last !== today); if (!due) return;
  schBusy = true; due.last = today;
  if (due.repeat === 'once') settings.schedules = settings.schedules.filter(s => s !== due);
  saveSettings(); renderSchedules(); runSchedule(due).finally(() => { schBusy = false; });
}
setInterval(tickSchedules, 20000); setTimeout(tickSchedules, 4000);

/* settings fields for the new options */
function bindField(id, get, set, check) {
  const el = $(id); if (!el) return null;
  el.addEventListener(check ? 'change' : 'input', () => { set(check ? el.checked : el.value.trim()); saveSettings(); });
  return () => { if (document.activeElement !== el) { if (check) el.checked = !!get(); else el.value = get() || ''; } };
}
const syncs = [
  bindField('#citySetting', () => settings.city, v => { settings.city = v; }),
  bindField('#wakeWordSetting', () => settings.wakeWord, v => { settings.wakeWord = v; }, true),
  bindField('#calIcs', () => (settings.calendar || {}).ics, v => { settings.calendar = { ...(settings.calendar || {}), ics: v }; }),
  bindField('#sheetHook', () => (settings.sheets || {}).webhook, v => { settings.sheets = { ...(settings.sheets || {}), webhook: v }; }),
  bindField('#waToken', () => (settings.wabiz || {}).token, v => { settings.wabiz = { ...(settings.wabiz || {}), token: v }; }),
  bindField('#waPhone', () => (settings.wabiz || {}).phone, v => { settings.wabiz = { ...(settings.wabiz || {}), phone: v }; }),
].filter(Boolean);
const _as = applySettings; applySettings = function () { _as(); syncs.forEach(f => f()); renderMemory(); renderSchedules(); };

/* wake word: "Hey AXO" */
let wakeRec = null;
function startWake() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR || wakeRec) return;
  const r = new SR(); wakeRec = r; r.continuous = true; r.interimResults = true; r.lang = 'en-IN';
  r.onresult = ev => { const t = Array.from(ev.results).slice(-2).map(x => x[0].transcript).join(' ').toLowerCase(); if (/\b(hey|hay|hi|ok|okay)[ ,]+(axo|ax o|aexo|exo|acho|axle|aks)\b/.test(t)) { stopWake(); openVoiceMode(); } };
  r.onend = () => { if (wakeRec === r) wakeRec = null; };
  r.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { settings.wakeWord = false; saveSettings(); applySettings(); toast('Allow the microphone to use the wake word.'); } };
  try { r.start(); } catch { wakeRec = null; }
}
function stopWake() { const r = wakeRec; wakeRec = null; try { r?.abort(); } catch { /* ignore */ } }
setInterval(() => { if (settings.wakeWord && !VM.open && !document.hidden) startWake(); else if (wakeRec) stopWake(); }, 3000);

/* backup */
const SECRETS = [['ai', 'key'], ['gmail', 'password'], ['github', 'token'], ['firebase', 'service_account'], ['telegram', 'token'], ['wabiz', 'token'], ['sheets', 'webhook']];
$('#bkExport')?.addEventListener('click', () => {
  const s = JSON.parse(JSON.stringify(settings)); SECRETS.forEach(([g, k]) => { if (s[g]) s[g][k] = ''; });
  const blob = new Blob([JSON.stringify({ axo: 1, settings: s, bots: JSON.parse(localStorage.getItem(BOT_KEY) || 'null') }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'axo-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Backup saved (keys left out).');
});
$('#bkImport')?.addEventListener('click', () => $('#bkFile').click());
$('#bkFile')?.addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const b = JSON.parse(await f.text()); if (b.axo !== 1 || typeof b.settings !== 'object') throw new Error('Not an AXO backup.');
    const keep = SECRETS.map(([g, k]) => [g, k, (settings[g] || {})[k] || '']);
    settings = { ...settings, ...b.settings }; keep.forEach(([g, k, v]) => { settings[g] = { ...(settings[g] || {}), [k]: v || (settings[g] || {})[k] || '' }; });
    saveSettings(); if (Array.isArray(b.bots) && b.bots.length) localStorage.setItem(BOT_KEY, JSON.stringify(b.bots));
    applySettings(); toast('Backup restored. Re-enter any API keys.');
  } catch (err) { toast(err.message || 'Could not read that file.'); }
});

/* install as app */
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); window.__installEvt = ev; const r = $('#installRow'); if (r) r.hidden = false; renderConnectStrip(); });
window.addEventListener('appinstalled', () => { window.__installEvt = null; const r = $('#installRow'); if (r) r.hidden = true; renderConnectStrip(); });
async function installApp() { const ev = window.__installEvt; if (!ev) { toast('Use your browser menu → “Add to Home screen”.'); return; } ev.prompt(); try { await ev.userChoice; } catch { /* ignore */ } window.__installEvt = null; renderConnectStrip(); }
$('#installBtn')?.addEventListener('click', installApp);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

/* bots: knowledge files, export / import team */
$('#bfFile')?.addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  const text = (await f.text()).slice(0, 3000); const box = $('#bfKnow');
  box.value = (box.value + `\n[${f.name}]\n${text}`).trim().slice(0, 4000); toast('Added to knowledge. Tap Save bot.');
});
$('#botExport')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ axoBots: 1, bots }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'axo-bot-team.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#botImport')?.addEventListener('click', () => $('#botImportFile').click());
$('#botImportFile')?.addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!Array.isArray(d.bots) || !d.bots.length) throw new Error('Not a bot team file.');
    bots = d.bots.slice(0, 20).map(b => ({ id: String(b.id || 'b' + Math.random().toString(36).slice(2, 7)), name: String(b.name || 'Bot').slice(0, 24), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#4f9dff', role: String(b.role || '').slice(0, 500), reportsTo: String(b.reportsTo || ''), tools: Array.isArray(b.tools) ? b.tools.filter(t => BOT_TOOLS.includes(t)) : [], link: String(b.link || '').slice(0, 300), knowledge: String(b.knowledge || '').slice(0, 4000) }));
    selBot = bots[0].id; saveBots(); renderStrip(); fillForm(); rebuildStudioBot(); renderSheet(); renderBotMsgs(); toast('Team imported.');
  } catch (err) { toast(err.message); }
});

/* boot */
renderWelcome();
/* boot now happens in boost.js so the greeting uses the Ryan/Sonia voice */
