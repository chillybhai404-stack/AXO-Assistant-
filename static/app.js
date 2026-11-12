const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const chatWindow = $('#chatWindow');
const messageInput = $('#messageInput');
const chatForm = $('#chatForm');
const sendButton = $('#sendButton');
const chatHistory = [];
let busy = false;
let activeMaps = [];
let apiCatalog = [];
let apiFilter = 'all';
let currentMode = localStorage.getItem('axo-mode') === 'node' ? 'node' : 'chat';
let nodeMicStream = null;
let nodeAudioContext = null;
let nodeAnalyser = null;
let nodeLevel = 0;
let activeRecognition = null;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}

function setCoreState(state, label) {
  const stage = $('#hologramStage');
  if (!stage) return;
  stage.dataset.state = state;
  const labels = {
    idle: 'SYSTEM STANDING BY',
    listening: 'VOICE INPUT ACTIVE',
    thinking: 'PROCESSING REQUEST',
    speaking: 'RESPONSE TRANSMITTING'
  };
  $('#orbStatus').textContent = label || labels[state] || 'SYSTEM STANDING BY';
}

function renderAssistantText(node, value) {
  const escaped = escapeHtml(String(value ?? ''));
  const html = escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\n)\s*[-•]\s+/g, '$1<span class="chat-bullet">•</span> ')
    .replace(/\n/g, '<br>');
  node.innerHTML = html;
}

function addMessage(role, text, extras = {}) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'user' ? 'U' : 'A';
  const content = document.createElement('div'); content.className = 'message-content';
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = role === 'user' ? 'YOU' : 'AXO';
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  if (role === 'assistant') renderAssistantText(bubble, text); else bubble.textContent = text;
  content.append(meta, bubble); wrap.append(avatar, content); chatWindow.append(wrap);
  if (role === 'assistant' && extras && (extras.map || extras.images || extras.cards || extras.news || extras.action)) {
    const attachments = document.createElement('div'); attachments.className = 'message-attachments';
    content.append(attachments); renderIntelligence(extras, attachments);
  }
  const scroller = $('#chatScrollArea'); if (scroller) scroller.scrollTop = scroller.scrollHeight;
  return wrap;
}

function updateAssistantMessage(wrap, text, extras = {}) {
  if (!wrap) return addMessage('assistant', text, extras);
  wrap.classList.remove('thinking-message');
  const bubble = wrap.querySelector('.bubble');
  if (bubble) renderAssistantText(bubble, text);
  const oldAttachments = wrap.querySelector('.message-attachments');
  if (oldAttachments) oldAttachments.remove();
  if (extras && (extras.map || extras.images || extras.cards || extras.news || extras.action)) {
    const content = wrap.querySelector('.message-content');
    const attachments = document.createElement('div'); attachments.className = 'message-attachments';
    content.append(attachments); renderIntelligence(extras, attachments);
  }
  const scroller = $('#chatScrollArea'); if (scroller) scroller.scrollTop = scroller.scrollHeight;
  return wrap;
}

function addThinkingMessage() {
  const wrap = addMessage('assistant', 'Checking connected sources…');
  wrap.classList.add('thinking-message');
  const bubble = wrap.querySelector('.bubble');
  if (bubble) {
    bubble.textContent = '';
    const label = document.createElement('span'); label.className = 'thinking-label'; label.textContent = 'Thinking';
    const dots = document.createElement('span'); dots.className = 'thinking-dots'; dots.setAttribute('aria-label', 'Processing');
    for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
    bubble.append(label, dots);
  }
  return wrap;
}


let axuAudio = null;
async function speak(text) {
  if (!text) { setCoreState('idle'); return; }
  const spoken = String(text).replace(/https?:\/\/\S+/g, 'link').replace(/[*_`#]/g, '').slice(0, 650);
  try {
    if (axuAudio) { axuAudio.pause(); axuAudio = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spoken })
    });
    if (!response.ok) throw new Error('Neural voice unavailable');
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    axuAudio = new Audio(audioUrl);
    axuAudio.onplay = () => setCoreState('speaking');
    axuAudio.onended = () => { setCoreState('idle'); URL.revokeObjectURL(audioUrl); axuAudio = null; };
    axuAudio.onerror = () => { URL.revokeObjectURL(audioUrl); axuAudio = null; fallbackSpeak(spoken); };
    await axuAudio.play();
  } catch (_) {
    fallbackSpeak(spoken);
  }
}

function fallbackSpeak(text) {
  if (!('speechSynthesis' in window)) { setCoreState('idle'); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.94;
  utterance.pitch = 0.88;
  const chooseVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const britishMale = voices.find(v => /^en-GB/i.test(v.lang) && /male|daniel|george|ryan|arthur/i.test(v.name));
    const british = voices.find(v => /^en-GB/i.test(v.lang));
    if (britishMale || british) utterance.voice = britishMale || british;
    utterance.onstart = () => setCoreState('speaking');
    utterance.onend = () => setCoreState('idle');
    utterance.onerror = () => setCoreState('idle');
    window.speechSynthesis.speak(utterance);
  };
  chooseVoice();
}


async function sendMessage(rawText, options = {}) {
  const message = (rawText || '').trim();
  if (!message || busy) return;
  const voiceOnly = options.voiceOnly === true || currentMode === 'node';
  const shouldSpeak = voiceOnly || options.voice === true;
  busy = true;
  if (sendButton) sendButton.disabled = true;
  let assistantPlaceholder = null;
  if (!voiceOnly) {
    addMessage('user', message);
    assistantPlaceholder = addThinkingMessage();
  }
  const contextHistory = chatHistory.slice(-8);
  if (messageInput) { messageInput.value = ''; messageInput.style.height = 'auto'; }
  setCoreState('thinking');
  setNodeState('thinking', 'PROCESSING COMMAND', 'Checking connected sources…');
  if ($('#modeHint')) $('#modeHint').textContent = 'ROUTING REQUEST';
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: contextHistory })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'The request failed.');
    const reply = data.reply || 'Done.';
    if (!voiceOnly) updateAssistantMessage(assistantPlaceholder, reply, data);
    chatHistory.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    if ($('#modeHint')) $('#modeHint').textContent = data.source === 'api' ? 'AI PROVIDER' : 'PUBLIC DATA / LOCAL CORE';
    setNodeState('speaking', 'SPEAKING RESPONSE', 'AXU Voice is delivering the result.');
    if (shouldSpeak) await speak(reply);
    else setCoreState('idle');
  } catch (error) {
    const failure = `I couldn't complete that request. ${error.message}`;
    if (!voiceOnly) updateAssistantMessage(assistantPlaceholder, failure);
    toast(voiceOnly ? 'The request could not be completed.' : error.message);
    setNodeState('idle', 'REQUEST FAILED', 'Try speaking again.');
    if (voiceOnly) await speak('I could not complete that request. Please try again.');
    else setCoreState('idle');
  } finally {
    busy = false;
    if (sendButton) sendButton.disabled = false;
    if (!voiceOnly && messageInput) messageInput.focus();
    if (!busy && currentMode === 'node') setNodeState('idle', 'AXO is listening.', 'Tap the microphone and speak naturally.');
  }
}

function showIntelLoading() { /* Chat responses now render inline. */ }
function renderIntelError(message) { toast(message || 'Request failed.'); }

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
  let blocks = 0;

  if (data.map) {
    renderMapBlock(data.map, host);
    blocks++;
  }
  if (Array.isArray(data.images) && data.images.length) {
    renderImageBlock(data.images, host);
    blocks++;
  }
  (data.cards || []).forEach(card => {
    renderDataCard(card, host);
    blocks++;
  });
  if (Array.isArray(data.news) && data.news.length) {
    renderNewsBlock(data.news, host);
    blocks++;
  }
  if (data.action?.url && !blocks) {
    const block = resultBlock('ACTION READY', data.intent || 'LOCAL COMMAND');
    const body = document.createElement('div'); body.className = 'result-body';
    addText(body, 'This command is ready to open in a new tab.', 'result-text');
    addLink(body, data.action.url, data.action.label || 'OPEN');
    block.append(body); host.append(block); blocks++;
  }
  // The assistant's reply already appears in the message bubble; avoid duplicating it in a card.

  if (blocks) renderSourceBadges(data, host);
}

function renderSourceBadges(data, host) {
  const sources = new Map();
  const knownDomains = {
    'Open-Meteo':'open-meteo.com','Wikipedia':'wikipedia.org','Openverse':'openverse.org',
    'Wikimedia Commons':'commons.wikimedia.org','NASA':'nasa.gov','Nominatim':'openstreetmap.org',
    'OpenStreetMap':'openstreetmap.org','Esri World Imagery':'esri.com','Frankfurter':'frankfurter.dev',
    'Where the ISS at':'wheretheiss.at','REST Countries':'restcountries.com','USGS':'usgs.gov',
    'NASA EONET':'nasa.gov','GBIF':'gbif.org','Open Library':'openlibrary.org',
    'Gutendex':'gutendex.com','TheMealDB':'themealdb.com','GitHub':'github.com',
    'Free Dictionary API':'dictionaryapi.dev','World Bank':'worldbank.org','NewsAPI':'newsapi.org',
    'Google News RSS':'news.google.com'
  };
  const add = (name, url) => {
    const label = String(name || 'Source').trim();
    if (!label) return;
    let domain = knownDomains[label] || '';
    try { if (url) domain = new URL(url).hostname.replace(/^www\./, '') || domain; } catch (_) {}
    if (!sources.has(label)) sources.set(label, domain);
  };
  if (data.map) { add('OpenStreetMap'); add('Esri World Imagery'); }
  (data.images || []).forEach(item => add(item.source || 'Image source', item.url));
  (data.news || []).forEach(item => add(item.source || 'News', item.url));
  const names = { weather:'Open-Meteo', wiki:'Wikipedia', currency:'Frankfurter', iss:'Where the ISS at', country:'REST Countries', earthquakes:'USGS', natural_events:'NASA EONET', species:'GBIF', books:'Open Library', recipes:'TheMealDB', github:'GitHub', dictionary:'Free Dictionary API', world_bank:'World Bank' };
  (data.cards || []).forEach(card => { if (names[card.type]) add(names[card.type]); });
  if (data.provider) add(data.provider);
  if (data.intent === 'news' && !data.provider) add('News feed');
  if (!sources.size && data.source === 'api') add('Connected AI provider');
  if (!sources.size) return;
  const row = document.createElement('div'); row.className = 'source-badges';
  const label = document.createElement('span'); label.className = 'source-label'; label.textContent = 'SOURCES'; row.append(label);
  [...sources.entries()].slice(0, 7).forEach(([name, domain]) => {
    const chip = document.createElement('span'); chip.className = 'source-chip';
    if (domain) {
      const logo = document.createElement('img'); logo.className = 'source-logo';
      logo.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
      logo.alt = ''; logo.loading = 'lazy'; logo.referrerPolicy = 'no-referrer';
      logo.onerror = () => { const fallback=document.createElement('span'); fallback.className='source-fallback'; fallback.textContent=name.slice(0,1).toUpperCase(); logo.replaceWith(fallback); }; chip.append(logo);
    } else {
      const fallback = document.createElement('span'); fallback.className = 'source-fallback';
      fallback.textContent = name.slice(0, 1).toUpperCase(); chip.append(fallback);
    }
    const text = document.createElement('span'); text.textContent = name; chip.append(text); row.append(chip);
  });
  host.append(row);
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
  const mapNode = document.createElement('div'); mapNode.className = 'map-view'; mapNode.id = `axo-map-${Date.now()}-${Math.floor(Math.random()*10000)}`;
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
  setTimeout(() => map.invalidateSize(), 250);
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
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});
messageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); chatForm.requestSubmit(); }
});

function showPanel(name) {
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${name}`));
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.panel === name));
  const labels = { chat: 'COMMAND CENTRE', news: 'WORLD INTELLIGENCE', apis: 'API ATLAS', music: 'MUSIC', videos: 'VIDEO ARCHIVE', notes: 'MEMORY NOTES' };
  $('#currentSection').textContent = labels[name] || 'COMMAND CENTRE';
  $('#sidebar').classList.remove('open');
  if (name === 'news') loadNews('general');
  if (name === 'apis') loadApis();
  if (name === 'music') loadLibrary('music');
  if (name === 'videos') loadLibrary('videos');
  if (name === 'notes') loadNotes();
}
$$('.nav-item').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));
$$('.profile-row, .side-action').forEach(button => button.addEventListener('click', () => { if (button.dataset.panel) showPanel(button.dataset.panel); }));
window.showPanel = showPanel;
$$('.quick-command').forEach(button => button.addEventListener('click', () => { showPanel('chat'); sendMessage(button.dataset.command); }));
$$('.suggestions button').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#clearChat').addEventListener('click', () => {
  activeMaps.forEach(map => { try { map.remove(); } catch {} }); activeMaps = [];
  chatWindow.innerHTML = '';
  chatHistory.length = 0;
  addMessage('assistant', 'Conversation cleared. AXO is ready.');
  setCoreState('idle');
});

async function loadStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    $('#connectionText').textContent = data.ok ? 'Local core connected' : 'Backend unavailable';
    $('#apiStatus').textContent = data.ai_configured ? 'AI LINKED' : 'PUBLIC DATA';
    $('#modeHint').textContent = data.ai_configured ? 'HYBRID INTELLIGENCE READY' : 'KEYLESS DATA READY';
    $('#newsCount').textContent = data.news_configured ? 'NEWSAPI' : 'RSS';
  } catch { $('#connectionText').textContent = 'Backend unavailable'; }
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
      open.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      card.append(symbol, title, sub, open); container.append(card);
    });
    if (!Object.keys(items).length) container.innerHTML = '<div class="empty-state">No links yet. Add some in the Python library file.</div>';
  } catch (error) { container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

async function loadNews(category) {
  $$('.filter').forEach(button => button.classList.toggle('active', button.dataset.category === category));
  $('#newsGrid').innerHTML = '<div class="empty-state">Fetching latest headlines…</div>';
  try {
    const response = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'News request failed.');
    const providerLabel = $('#newsProvider'); if (providerLabel) { providerLabel.textContent = data.provider || 'NEWS FEED'; providerLabel.title = data.provider_status?.note || ''; }
    const existingNotice = $('#newsProviderNotice'); if (existingNotice) existingNotice.textContent = data.provider_status?.note || '';
    renderNews(data.articles || []);
  } catch (error) {
    const notice=$('#newsProviderNotice'); if(notice) notice.textContent=error.message;
    const provider=$('#newsProvider'); if(provider) provider.textContent='FEED ISSUE';
    $('#newsGrid').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
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
    if (data.directory_url) $('#apiCount').title = `Source: ${data.source || 'local'} · Directory: ${data.directory_url}`;
  } catch { $('#apiGrid').innerHTML = '<div class="empty-state">Could not load the API catalogue.</div>'; }
}
function renderApis(items) {
  const grid = $('#apiGrid'); if (!grid) return;
  grid.innerHTML = '';
  const isKeyless = item => item.keyless === true || ['no','none'].includes(String(item.auth || '').toLowerCase());
  const filtered = items.filter(item => apiFilter === 'all' || (apiFilter === 'keyless' && isKeyless(item)) || (apiFilter === 'key' && !isKeyless(item)));
  const keylessCount = items.filter(isKeyless).length;
  $('#apiCount').textContent = `${filtered.length.toLocaleString()} shown · ${items.length.toLocaleString()} listed · ${keylessCount.toLocaleString()} no-key`;
  if (!filtered.length) { grid.innerHTML = '<div class="empty-state">No matching APIs. Try another search or filter.</div>'; return; }
  const fragment = document.createDocumentFragment();
  filtered.forEach(item => {
    const card = document.createElement('article'); card.className = 'api-card';
    addText(card, `${item.area || 'Public APIs'} · ${isKeyless(item) ? 'NO KEY' : `AUTH: ${item.auth || 'UNKNOWN'}`}`, 'api-tag');
    const title = document.createElement('strong'); title.textContent = item.title || item.provider || 'API'; card.append(title);
    addText(card, `${item.provider && item.provider !== item.title ? item.provider + ': ' : ''}${item.description || 'Public API listing'}`, '');
    if (item.https) addText(card, `HTTPS: ${item.https} · CORS: ${item.cors || 'Unknown'}`, 'api-meta');
    const link = document.createElement('a'); link.href = safeHttpUrl(item.docs) || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'DOCUMENTATION ↗'; card.append(link);
    fragment.append(card);
  });
  grid.append(fragment);
}
$('#apiSearch')?.addEventListener('input', event => {
  const q = event.target.value.toLowerCase();
  renderApis(apiCatalog.filter(x => [x.provider,x.title,x.area,x.description,x.path,x.auth].join(' ').toLowerCase().includes(q)));
});
$$('#apiFilters [data-api-filter]').forEach(button => button.addEventListener('click', () => { apiFilter = button.dataset.apiFilter; $$('#apiFilters .api-filter').forEach(x => x.classList.toggle('active', x === button)); const q = ($('#apiSearch')?.value || '').toLowerCase(); renderApis(apiCatalog.filter(x => [x.provider,x.title,x.area,x.description,x.path,x.auth].join(' ').toLowerCase().includes(q))); }));

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

// Two assistant modes: Chat shows transcripts/results; Node speaks only.
function setNodeState(state, headline, subline) {
  const stage=$('#nodeStage'); if(stage) stage.dataset.state=state||'idle';
  const status=$('#nodeStatus'); if(status) status.textContent=({idle:'STANDING BY',listening:'LISTENING',thinking:'PROCESSING COMMAND',speaking:'SPEAKING'}[state]||'STANDING BY');
  const title=$('#nodeHeadline'); if(title&&headline) title.textContent=headline;
  const detail=$('#nodeSubline'); if(detail&&subline) detail.textContent=subline;
}
function setMode(mode) {
  currentMode=mode==='node'?'node':'chat'; localStorage.setItem('axo-mode',currentMode);
  $('#chatModeView')?.classList.toggle('active',currentMode==='chat'); $('#nodeModeView')?.classList.toggle('active',currentMode==='node');
  $('#nodeModeView')?.setAttribute('aria-hidden',currentMode!=='node');
  $$('.mode-tab').forEach(button=>button.classList.toggle('active',button.dataset.mode===currentMode));
  if($('#modeHint')) $('#modeHint').textContent=currentMode==='chat'?'CHAT · TEXT + VOICE':'NODE · VOICE ONLY';
  if(currentMode==='node') { setNodeState('idle','AXO is listening.','Tap the microphone and speak naturally.'); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }
}
$$('.mode-tab').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));

async function startNodeMeter() {
  if(!navigator.mediaDevices?.getUserMedia) return false;
  try {
    nodeMicStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
    nodeAudioContext=new AC(); if(nodeAudioContext.state==='suspended') await nodeAudioContext.resume(); const source=nodeAudioContext.createMediaStreamSource(nodeMicStream);
    nodeAnalyser=nodeAudioContext.createAnalyser(); nodeAnalyser.fftSize=1024; nodeAnalyser.smoothingTimeConstant=.72; source.connect(nodeAnalyser); return true;
  } catch(error) { console.debug('Mic level analyser unavailable:',error); return false; }
}
function stopNodeMeter() {
  if(nodeMicStream) nodeMicStream.getTracks().forEach(track=>track.stop()); nodeMicStream=null; nodeAnalyser=null;
  if(nodeAudioContext) nodeAudioContext.close().catch(()=>{}); nodeAudioContext=null; nodeLevel=0; updateNodeLevelUI(0);
}
function updateNodeLevelUI(level) {
  const bar=$('#nodeLevelBar'); if(bar) bar.style.width=`${Math.max(0,Math.min(100,level*100))}%`;
  const db=$('#nodeDb'); if(db) db.textContent=level>.001?`${Math.round(20*Math.log10(level))} dBFS`:'— dBFS';
  if($('#nodeStage')) $('#nodeStage').style.setProperty('--voice-level',String(Math.min(1,level*4)));
}
function animateNodeCanvas() {
  const canvas=$('#nodeCanvas'); if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return;
  let w=0,h=0,points=[];
  const resize=()=>{const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);w=r.width;h=r.height;canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);points=Array.from({length:176},()=>{const a=Math.random()*Math.PI*2,r=55+Math.random()*118;return{a,r,base:r,speed:(Math.random()-.5)*.005,phase:Math.random()*6.28,size:.6+Math.random()*1.4};});};
  const draw=()=>{if(!canvas.isConnected)return;if(nodeAnalyser){const arr=new Uint8Array(nodeAnalyser.fftSize);nodeAnalyser.getByteTimeDomainData(arr);let sum=0;for(const v of arr){const n=(v-128)/128;sum+=n*n;}nodeLevel=Math.sqrt(sum/arr.length);}else nodeLevel*=.90;updateNodeLevelUI(nodeLevel);ctx.clearRect(0,0,w,h);const cx=w/2,cy=h/2,e=Math.min(1,nodeLevel*5);
    points.forEach(p=>{p.a+=p.speed*(1+e*24);const r=p.base+Math.sin(performance.now()*.0015+p.phase)*2+e*(9+12*Math.sin(p.phase));const x=cx+Math.cos(p.a)*r,y=cy+Math.sin(p.a)*r*.78;ctx.beginPath();ctx.arc(x,y,p.size+e*1.2,0,Math.PI*2);ctx.fillStyle=`rgba(167,190,255,${.28+Math.min(.65,e*.7)})`;ctx.fill();});
    for(let i=0;i<points.length;i+=5){const p=points[i],x=cx+Math.cos(p.a)*p.base,y=cy+Math.sin(p.a)*p.base*.78;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x,y);ctx.strokeStyle=`rgba(120,158,235,${.025+e*.09})`;ctx.lineWidth=.7;ctx.stroke();}requestAnimationFrame(draw);};resize();window.addEventListener('resize',resize);draw();
}

const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
async function startVoiceCommand(voiceOnly) {
  if(!SpeechRecognition){toast('Voice input needs Chrome on Android.');return;}
  if (activeRecognition) { toast('Voice input is already active.'); return; }
  const recognition=new SpeechRecognition(); activeRecognition=recognition; recognition.lang='en-IN';recognition.interimResults=true;recognition.maxAlternatives=1;
  let finalTranscript='';let submitted=false;const button=voiceOnly?$('#nodeVoiceButton'):$('#voiceButton');const original=button?.innerHTML;
  if(button){button.classList.add('listening');if(voiceOnly)button.innerHTML='<span class="node-mic-icon">●</span><span>Listening…</span>'; }
  setCoreState('listening');setNodeState('listening','I’m listening.','Speak clearly. The points react to your voice.');if(voiceOnly)await startNodeMeter();
  recognition.onresult=event=>{let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const t=event.results[i][0].transcript;if(event.results[i].isFinal)finalTranscript+=t;else interim+=t;}const text=(finalTranscript||interim).trim();if(!voiceOnly&&messageInput){messageInput.value=text;messageInput.style.height='auto';messageInput.style.height=Math.min(messageInput.scrollHeight,100)+'px';}if(finalTranscript.trim()&&!submitted){submitted=true;if(!voiceOnly&&messageInput)messageInput.value='';recognition.stop();sendMessage(finalTranscript.trim(),{voice:true,voiceOnly});}};
  recognition.onerror=event=>{activeRecognition=null;toast(`Voice input: ${event.error}`);setCoreState('idle');setNodeState('idle','AXO is ready.','Tap the microphone and try again.');stopNodeMeter();if(button){button.classList.remove('listening');button.innerHTML=original;}};
  recognition.onend=()=>{activeRecognition=null;if(button){button.classList.remove('listening');button.innerHTML=original;}if(!busy){setCoreState('idle');setNodeState('idle','AXO is listening.','Tap the microphone and speak naturally.');}stopNodeMeter();if(!submitted&&finalTranscript.trim())sendMessage(finalTranscript.trim(),{voice:true,voiceOnly});};
  try{recognition.start();}catch(error){activeRecognition=null;toast('Microphone is already active.');stopNodeMeter();}
}
$('#voiceButton')?.addEventListener('click',()=>startVoiceCommand(false));$('#nodeVoiceButton')?.addEventListener('click',()=>startVoiceCommand(true));

function decodeEntities(value) {
  const node = document.createElement('textarea');
  node.innerHTML = String(value ?? '');
  return node.value;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

loadStatus();
setMode(currentMode);
animateNodeCanvas();
