/* AXO UI layer: custom dropdowns (no browser picker), extra display options, reply style. */
(function () {
  const menu = document.createElement('div'); menu.className = 'cs-sheet'; menu.innerHTML = '<div class="cs-scrim"></div><div class="cs-list" role="listbox"></div>'; document.body.append(menu);
  const list = menu.querySelector('.cs-list');
  const close = () => menu.classList.remove('open');
  menu.querySelector('.cs-scrim').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  function open(sel) {
    list.innerHTML = '';
    [...sel.options].forEach((o, i) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'cs-opt' + (i === sel.selectedIndex ? ' on' : '');
      row.innerHTML = `<span>${esc(o.textContent)}</span><i></i>`;
      row.addEventListener('click', () => { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); close(); });
      list.append(row);
    });
    menu.classList.add('open'); list.querySelector('.on')?.scrollIntoView({ block: 'center' });
  }
  function enhance(sel) {
    if (sel.dataset.cs) return; sel.dataset.cs = '1'; sel.classList.add('cs-native');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cs-btn';
    btn.innerHTML = '<span></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    sel.after(btn);
    const sync = () => { const o = sel.options[sel.selectedIndex]; btn.firstChild.textContent = o ? o.textContent : ''; };
    sync(); sel._csSync = sync; btn.addEventListener('click', () => open(sel)); sel.addEventListener('change', sync);
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true });
  }
  const scan = root => { if (root.tagName === 'SELECT') enhance(root); root.querySelectorAll && root.querySelectorAll('select').forEach(enhance); };
  scan(document.body);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)))).observe(document.body, { childList: true, subtree: true });
  setInterval(() => document.querySelectorAll('select[data-cs]').forEach(s => s._csSync && s._csSync()), 1200);
})();

/* extra options */
const syncs3 = [
  bindField('#compactSetting', () => settings.compact, v => { settings.compact = v; }, true),
  bindField('#motionSetting', () => settings.reduceMotion, v => { settings.reduceMotion = v; }, true),
  bindField('#hapticSetting', () => settings.haptics, v => { settings.haptics = v; }, true),
  bindField('#lengthSetting', () => settings.replyLength, v => { settings.replyLength = v; }),
  bindField('#toneSetting', () => settings.tone, v => { settings.tone = v; }),
  bindField('#sphereMoveSetting', () => String(settings.sphereMove === undefined ? '0.08' : settings.sphereMove), v => { settings.sphereMove = Number(v); }),
  bindField('#sphereColorSetting', () => settings.sphereColor || 'mint', v => { settings.sphereColor = v; }),
].filter(Boolean);
const _as3 = applySettings;
applySettings = function () {
  _as3(); syncs3.forEach(f => f());
  document.body.classList.toggle('compact', !!settings.compact); document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
};
const _fetch3 = window.fetch;
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const chat = /\/api\/(chat|bot-chat)$/.test(url);
  if (chat && init && typeof init.body === 'string') {
    try {
      const b = JSON.parse(init.body), parts = [];
      if (settings.replyLength === 'short') parts.push('Keep answers very short.'); if (settings.replyLength === 'detailed') parts.push('Give detailed, thorough answers.');
      if (settings.tone) parts.push(`Tone: ${settings.tone}.`);
      if (parts.length) { b.ai = { ...(b.ai || {}), style: parts.join(' ') }; init = { ...init, body: JSON.stringify(b) }; }
    } catch { /* ignore */ }
    if (settings.haptics) { try { navigator.vibrate?.(10); } catch { /* ignore */ } }
  }
  const r = await _fetch3.call(window, input, init);
  if (chat && settings.haptics) { try { navigator.vibrate?.(14); } catch { /* ignore */ } }
  return r;
};
applySettings();

if ($('#trSwap')) $('#trSwap').innerHTML = axIcon('swap', 18);
if ($('#trMic') && !$('#trMic').querySelector('svg')) $('#trMic').innerHTML = axIcon('mic', 20) + ' Tap to speak';
