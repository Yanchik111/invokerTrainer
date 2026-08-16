// ==================== CONFIG ====================

const SPELLS = [
  { combo: 'qqq', name: 'Cold Snap',       icon: 'img/invoker_cold_snap.png' },
  { combo: 'qqw', name: 'Ghost Walk',      icon: 'img/invoker_ghost_walk.png' },
  { combo: 'eqq', name: 'Ice Wall',        icon: 'img/invoker_ice_wall.png' },
  { combo: 'qww', name: 'Tornado',         icon: 'img/invoker_tornado.png' },
  { combo: 'www', name: 'EMP',             icon: 'img/invoker_emp.png' },
  { combo: 'eww', name: 'Alacrity',        icon: 'img/invoker_alacrity.png' },
  { combo: 'eqw', name: 'Deafening Blast', icon: 'img/invoker_deafening_blast.png' },
  { combo: 'eeq', name: 'Forge Spirit',    icon: 'img/invoker_forge_spirit.png' },
  { combo: 'eew', name: 'Chaos Meteor',    icon: 'img/invoker_chaos_meteor.png' },
  { combo: 'eee', name: 'Sun Strike',      icon: 'img/invoker_sun_strike.png' },
];

SPELLS.forEach(s => {
  s.counts = { q: 0, w: 0, e: 0 };
  for (const ch of s.combo) s.counts[ch]++;
});

// стартовые параметры и пределы разгона сложности (режим "Одиночный")
const DIFFICULTY = {
  single: { spawnMs: 1900, fallMs: 5200 },
  minSpawnMs: 480,
  minFallMs: 1400,
  decayPerHit: 0.045, // ускорение на каждое попадание
};

// уровни сложности режима "Цепочка": сколько способностей в последовательности
const CHAIN_LEVELS = {
  easy:   { count: 3, label: 'Лёгкий' },
  medium: { count: 6, label: 'Средний' },
  hard:   { count: 9, label: 'Сложный' },
};
const CHAIN_ROUNDS = 3; // сколько раз подряд повторяем последовательность (каждый раз новую)

// ранги по итоговому счёту цепочки (чем выше счёт, тем выше ранг)
const RANKS = [
  { name: 'Herald',   min: 0,    icon: 'img/Herald.png' },
  { name: 'Guardian', min: 250,  icon: 'img/Guardian.png' },
  { name: 'Crusader', min: 500,  icon: 'img/Crusader.png' },
  { name: 'Archon',   min: 800,  icon: 'img/Archon.png' },
  { name: 'Legend',   min: 1100, icon: 'img/Legend.png' },
  { name: 'Ancient',  min: 1400, icon: 'img/Ancient.png' },
  { name: 'Divine',   min: 1650, icon: 'img/Divine.png' },
  { name: 'Immortal', min: 1900, icon: 'img/Immortal.png' },
];

function rankForScore(score) {
  let result = RANKS[0];
  for (const r of RANKS) {
    if (score >= r.min) result = r;
  }
  return result;
}

// ==================== STATE ====================

const state = {
  mode: 'single',           // 'single' | 'chain'
  chainDifficulty: null,    // выбирается на экране выбора сложности
  invokeRequired: false,    // тумблер в настройках, по умолчанию выключен
  running: false,
  score: 0,
  misses: 0,
  streak: 0,
  fallSpeedLevel: 4,        // множитель от слайдера настроек (1..10)
  rampFactor: 1,            // авто-разгон в одиночном режиме
  spawnTimer: null,
  activeItems: [],          // { el, spell, resolved } — только для single
  pressedCounts: { q: 0, w: 0, e: 0 },
  pressedSequence: [],

  // состояние цепочки
  chainSequence: [],        // массив spell на этот раунд
  chainStep: 0,             // текущая позиция в последовательности
  chainRound: 0,            // текущий раунд (0..CHAIN_ROUNDS-1)
  chainHits: 0,             // верных прокастов за всё прохождение
  chainAttempts: 0,         // всего попыток (для точности)
  chainStartTime: 0,
  chainTimerInterval: null,
};

// ==================== DOM ====================

const gameField = document.getElementById('gameField');
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const scoreValue = document.getElementById('scoreValue');
const missValue = document.getElementById('missValue');
const streakValue = document.getElementById('streakValue');
const orbTracker = document.getElementById('orbTracker');
const invokeBtn = document.getElementById('invokeBtn');
const chainPanel = document.getElementById('chainPanel');
const chainSequenceEl = document.getElementById('chainSequence');
const chainRoundLabel = document.getElementById('chainRoundLabel');
const chainTimerEl = document.getElementById('chainTimer');

const chainSetupOverlay = document.getElementById('chainSetupOverlay');
const chainResultOverlay = document.getElementById('chainResultOverlay');
const chainResultRank = document.getElementById('chainResultRank');
const chainResultScore = document.getElementById('chainResultScore');
const chainResultStats = document.getElementById('chainResultStats');
const chainRetryBtn = document.getElementById('chainRetryBtn');

const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const themeToggle = document.getElementById('themeToggle');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const invokeToggle = document.getElementById('invokeToggle');

// ==================== INIT ====================

function init() {
  bindUI();
  applyTheme(document.documentElement.getAttribute('data-theme'));
}

function bindUI() {
  startBtn.addEventListener('click', startGame);

  document.querySelectorAll('.modeBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      resetGame();
    });
  });

  document.querySelectorAll('.chainDiffCard').forEach(card => {
    card.addEventListener('click', () => {
      state.chainDifficulty = card.dataset.diff;
      chainSetupOverlay.classList.add('hidden');
      beginChain();
    });
  });

  chainRetryBtn.addEventListener('click', () => {
    chainResultOverlay.classList.add('hidden');
    showChainSetup();
  });

  settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
  closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  speedSlider.addEventListener('input', () => {
    state.fallSpeedLevel = Number(speedSlider.value);
    speedValue.textContent = state.fallSpeedLevel;
  });

  invokeToggle.addEventListener('click', () => {
    state.invokeRequired = !state.invokeRequired;
    renderInvokeToggle();
    invokeBtn.classList.toggle('hidden', !state.invokeRequired);
  });

  invokeBtn.addEventListener('click', tryInvoke);

  document.addEventListener('keydown', onKeyDown);
}

function renderInvokeToggle() {
  invokeToggle.textContent = state.invokeRequired ? 'Включено' : 'Выключено';
  invokeToggle.classList.toggle('on', state.invokeRequired);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '🌙 Тёмная' : '☀️ Светлая';
}

// ==================== GAME FLOW ====================

function startGame() {
  startOverlay.classList.add('hidden');
  state.running = true;
  resetGame();
}

function resetGame() {
  clearTimeout(state.spawnTimer);
  clearInterval(state.chainTimerInterval);
  state.activeItems.forEach(i => i.el.remove());
  state.activeItems = [];
  state.score = 0;
  state.misses = 0;
  state.streak = 0;
  state.rampFactor = 1;
  clearPressed();
  updateScoreboard();
  gameField.querySelectorAll('.falling-item').forEach(el => el.remove());
  chainResultOverlay.classList.add('hidden');

  if (!state.running) return;

  if (state.mode === 'single') {
    chainPanel.classList.add('hidden');
    chainSetupOverlay.classList.add('hidden');
    invokeBtn.classList.toggle('hidden', !state.invokeRequired);
    scheduleSpawn(300);
  } else {
    invokeBtn.classList.add('hidden'); // в цепочке Invoke всегда обязателен по смыслу режима
    showChainSetup();
  }
}

function showChainSetup() {
  chainPanel.classList.add('hidden');
  chainSetupOverlay.classList.remove('hidden');
}

function clearPressed() {
  state.pressedCounts = { q: 0, w: 0, e: 0 };
  state.pressedSequence = [];
  renderOrbTracker();
}

function updateScoreboard() {
  scoreValue.textContent = state.score;
  missValue.textContent = state.misses;
  streakValue.textContent = state.streak;
}

// множитель от слайдера настроек (0.55x..1.6x к базовому времени)
function sliderMultiplier() {
  const t = (state.fallSpeedLevel - 1) / 9; // 0..1
  return 1.6 - t * (1.6 - 0.55);
}

function currentFallMs() {
  const base = DIFFICULTY.single.fallMs * sliderMultiplier() * state.rampFactor;
  return Math.max(DIFFICULTY.minFallMs, base);
}

function currentSpawnMs() {
  const base = DIFFICULTY.single.spawnMs * sliderMultiplier() * state.rampFactor;
  return Math.max(DIFFICULTY.minSpawnMs, base);
}

function pickRandomSpell() {
  return SPELLS[Math.floor(Math.random() * SPELLS.length)];
}

// ==================== SINGLE MODE: SPAWN / FALL ====================

function scheduleSpawn(delay) {
  clearTimeout(state.spawnTimer);
  if (!state.running || state.mode !== 'single') return;
  state.spawnTimer = setTimeout(() => {
    spawnSpell();
    scheduleSpawn(currentSpawnMs());
  }, delay ?? currentSpawnMs());
}

function spawnSpell() {
  if (!state.running || state.mode !== 'single') return;

  const spell = pickRandomSpell();
  const wrap = document.createElement('div');
  wrap.className = 'falling-item';
  const laneWidth = gameField.clientWidth - 76;
  wrap.style.left = Math.max(10, Math.random() * laneWidth) + 'px';
  wrap.style.top = '-70px';
  wrap.innerHTML = `
    <div class="falling-icon" style="background-image:url('${spell.icon}')"></div>
    <div class="falling-label">${spell.name}</div>
  `;
  gameField.appendChild(wrap);

  const item = { el: wrap, spell, resolved: false };
  state.activeItems.push(item);

  const duration = currentFallMs();
  const startTime = performance.now();

  function animate(now) {
    if (item.resolved) return;
    const progress = (now - startTime) / duration;
    if (progress >= 1) {
      onMiss(item);
      return;
    }
    wrap.style.top = (progress * (gameField.clientHeight - 70)) + 'px';
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

function removeItem(item) {
  state.activeItems = state.activeItems.filter(i => i !== item);
  setTimeout(() => item.el.remove(), 260);
}

function onMiss(item) {
  if (item.resolved) return;
  item.resolved = true;
  item.el.classList.add('missed');
  state.misses++;
  state.streak = 0;
  updateScoreboard();
  removeItem(item);
}

function onHit(item) {
  if (item.resolved) return;
  item.resolved = true;
  item.el.classList.add('hit');
  state.score++;
  state.streak++;
  updateScoreboard();
  removeItem(item);

  // авто-разгон сложности с каждым удачным прокастом
  state.rampFactor = Math.max(0.3, state.rampFactor * (1 - DIFFICULTY.decayPerHit));
}

// без Invoke-подтверждения: проверяем сразу как набрано 3 нажатия (single mode)
function autoCheckSingle() {
  const total = state.pressedCounts.q + state.pressedCounts.w + state.pressedCounts.e;
  if (total < 3) return;

  const match = state.activeItems.find(item =>
    !item.resolved &&
    item.spell.counts.q === state.pressedCounts.q &&
    item.spell.counts.w === state.pressedCounts.w &&
    item.spell.counts.e === state.pressedCounts.e
  );

  if (match) {
    onHit(match);
  } else {
    state.misses++;
    state.streak = 0;
    updateScoreboard();
  }
  clearPressed();
}

// ==================== CHAIN MODE ====================

function beginChain() {
  state.score = 0;
  state.misses = 0;
  state.streak = 0;
  state.chainHits = 0;
  state.chainAttempts = 0;
  updateScoreboard();
  chainPanel.classList.remove('hidden');
  state.chainStartTime = performance.now();
  clearInterval(state.chainTimerInterval);
  state.chainTimerInterval = setInterval(updateChainTimer, 100);
  startChainRound(0);
}

function updateChainTimer() {
  const elapsed = (performance.now() - state.chainStartTime) / 1000;
  chainTimerEl.textContent = elapsed.toFixed(1) + 's';
}

function startChainRound(roundIndex) {
  state.chainRound = roundIndex;
  const count = CHAIN_LEVELS[state.chainDifficulty].count;
  state.chainSequence = Array.from({ length: count }, pickRandomSpell);
  state.chainStep = 0;
  clearPressed();
  renderChainSequence();
}

function renderChainSequence() {
  chainRoundLabel.textContent = `Раунд ${state.chainRound + 1} / ${CHAIN_ROUNDS} — ${CHAIN_LEVELS[state.chainDifficulty].label}`;
  chainSequenceEl.innerHTML = state.chainSequence.map((spell, i) => {
    let cls = 'chainStepIcon';
    if (i < state.chainStep) cls += ' done';
    else if (i === state.chainStep) cls += ' current';
    return `<div class="${cls}" style="background-image:url('${spell.icon}')" title="${spell.name}"></div>`;
  }).join('');
}

function advanceChainStep() {
  state.chainStep++;
  if (state.chainStep >= state.chainSequence.length) {
    const nextRound = state.chainRound + 1;
    if (nextRound >= CHAIN_ROUNDS) {
      finishChain();
    } else {
      startChainRound(nextRound);
    }
  } else {
    renderChainSequence();
  }
}

function finishChain() {
  clearInterval(state.chainTimerInterval);
  const totalTimeSec = (performance.now() - state.chainStartTime) / 1000;
  const totalSpells = CHAIN_LEVELS[state.chainDifficulty].count * CHAIN_ROUNDS;
  const accuracy = state.chainAttempts > 0 ? state.chainHits / state.chainAttempts : 0;

  // очки: база за точность (макс 1000) + бонус за скорость (макс ~1000)
  const accuracyScore = Math.round(accuracy * 1000);

  const avgTimePerSpell = totalTimeSec / totalSpells;
  // эталон скорости жёстче на лёгком уровне (там меньше времени "простить" замешательство)
  const targetTimePerSpell = { easy: 0.55, medium: 0.7, hard: 0.85 }[state.chainDifficulty];
  const speedRatio = Math.max(0, Math.min(1, (targetTimePerSpell - avgTimePerSpell + 0.35) / 0.7));
  const speedScore = Math.round(speedRatio * 1000 * Math.pow(accuracy, 2)); // скорость жёстко режется любой неточностью

  const finalScore = Math.max(0, accuracyScore + speedScore);

  state.score = finalScore;
  updateScoreboard();

  const rank = rankForScore(finalScore);
  chainResultRank.innerHTML = `<img src="${rank.icon}" alt="${rank.name}"><div>${rank.name}</div>`;
  chainResultScore.textContent = finalScore;
  chainResultStats.textContent =
    `Точность: ${Math.round(accuracy * 100)}% · Время: ${totalTimeSec.toFixed(1)}с · Прокастов: ${totalSpells}`;

  chainPanel.classList.add('hidden');
  chainResultOverlay.classList.remove('hidden');
}

// ==================== ORB TRACKER ====================

function renderOrbTracker() {
  const slots = orbTracker.querySelectorAll('.orbSlot');

  slots.forEach((slot, i) => {
    const key = state.pressedSequence[i];
    slot.className = 'orbSlot';

    if (key) {
      slot.classList.add('filled-' + key);
      slot.innerHTML = `<img src="img/invoker_${key === 'q' ? 'quas' : key === 'w' ? 'wex' : 'exort'}.png" alt="${key.toUpperCase()}">`;
    } else {
      slot.innerHTML = '';
    }
  });
}

// ==================== INPUT ====================

function onKeyDown(e) {
  if (e.repeat) return;
  if (!state.running) return;

  const codeMap = { KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'invoke' };
  const key = codeMap[e.code] ||
    (['q', 'w', 'e'].includes(e.key?.toLowerCase()) ? e.key.toLowerCase() : null);

  if (key === 'invoke') {
    if (state.mode === 'chain' || state.invokeRequired) tryInvoke();
    return;
  }
  if (!key) return;

  state.pressedCounts[key]++;
  state.pressedSequence.push(key);
  if (state.pressedSequence.length > 3) {
    const dropped = state.pressedSequence.shift();
    state.pressedCounts[dropped]--;
  }
  renderOrbTracker();

  // если Invoke не требуется - проверяем сразу (только в одиночном режиме)
  if (state.mode === 'single' && !state.invokeRequired) {
    autoCheckSingle();
  }
}

// проверка вручную по Invoke (клавиша R или кнопка) - используется в цепочке всегда,
// в одиночном режиме - только если тумблер "Invoke" включён в настройках
function tryInvoke() {
  if (!state.running) return;

  const total = state.pressedCounts.q + state.pressedCounts.w + state.pressedCounts.e;
  if (total === 0) return;

  if (state.mode === 'single') {
    const match = state.activeItems.find(item =>
      !item.resolved &&
      item.spell.counts.q === state.pressedCounts.q &&
      item.spell.counts.w === state.pressedCounts.w &&
      item.spell.counts.e === state.pressedCounts.e
    );
    if (match) {
      onHit(match);
    } else {
      state.misses++;
      state.streak = 0;
      updateScoreboard();
    }
  } else {
    const target = state.chainSequence[state.chainStep];
    const isMatch = target &&
      target.counts.q === state.pressedCounts.q &&
      target.counts.w === state.pressedCounts.w &&
      target.counts.e === state.pressedCounts.e;

    state.chainAttempts++;
    if (isMatch) {
      state.chainHits++;
      state.streak++;
    } else {
      state.misses++;
      state.streak = 0;
    }
    updateScoreboard();
    advanceChainStep();
  }

  clearPressed();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
