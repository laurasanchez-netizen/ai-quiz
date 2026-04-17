/* =============================================
   PRESENTER.JS — Quiz IA Zamora Company v1.4.0
   Lógica de la pantalla de proyección
   ============================================= */

// ── Leer parámetros de URL ──────────────────────────────────────────────────
const urlParams  = new URLSearchParams(window.location.search);
const PIN        = urlParams.get('pin') || '';
const PASSWORD   = urlParams.get('password') || '';
const SERVER_URL = window.location.origin;

if (!PIN) {
  document.body.innerHTML = '<div style="color:#fff;font-size:32px;display:flex;height:100vh;align-items:center;justify-content:center;font-family:Inter,sans-serif;">⚠️ Falta el parámetro <strong style="color:#C19230;margin:0 8px;">?pin=XXXX</strong> en la URL.</div>';
  throw new Error('PIN no especificado');
}

// ── Variables de estado ────────────────────────────────────────────────────
let currentQuestion     = null;
let currentOptions      = [];
let timerInterval       = null;
let timerSecondsLeft    = 0;
let answeredCount       = 0;
let totalPlayers        = 0;
const ICONS = ['▲', '■', '◆', '⬣'];
let isMuted = localStorage.getItem('p_muted') === 'true';

// ── Gestión de Audio ─────────────────────────────────────────────────────────
const sounds = {
  waiting: document.getElementById('audio-waiting'),
  tick: document.getElementById('audio-tick'),
  correct: document.getElementById('audio-correct'),
  fanfare: document.getElementById('audio-fanfare')
};

function playSound(name) {
  if (isMuted || !sounds[name]) return;
  // Resetear y reproducir
  sounds[name].currentTime = 0;
  sounds[name].play().catch(() => {
    console.log('Autoplay bloqueado: El usuario debe interactuar con la página primero.');
  });
}

function stopSound(name) {
  if (sounds[name]) {
    sounds[name].pause();
    sounds[name].currentTime = 0;
  }
}

function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem('p_muted', isMuted);
  document.getElementById('mute-icon').textContent = isMuted ? '🔇' : '🔊';
  if (isMuted) {
    Object.keys(sounds).forEach(stopSound);
  } else {
    // Si desmutemos y estamos esperando, poner la música
    const currentView = document.querySelector('.p-view.active');
    if (currentView && currentView.id === 'view-waiting') playSound('waiting');
  }
}

// Inicializar icono de mute
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mute-icon').textContent = isMuted ? '🔇' : '🔊';
  // Música ambiente inicial
  setTimeout(() => playSound('waiting'), 1000);
});

// ── Helpers de vista ───────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.p-view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Inicializar PIN y QR ────────────────────────────────────────────────────
document.getElementById('p-pin-display').textContent = PIN;
const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(SERVER_URL)}&margin=8`;
document.getElementById('p-qr-waiting').innerHTML = `<img src="${qrSrc}" alt="QR">`;

// Cargar título del quiz desde la API
fetch(`api/admin/current?password=${encodeURIComponent(PASSWORD)}`)
  .then(r => r.json())
  .then(data => {
    const session = (data.sessions || []).find(s => String(s.pin) === String(PIN));
    if (session) {
      document.getElementById('p-quiz-title-waiting').textContent = session.title || '—';
    }
  }).catch(() => {});

// ── Conectar Socket.io ─────────────────────────────────────────────────────
const socket = io();

socket.on('connect', () => {
  console.log(`📺 Presentador conectado. PIN: ${PIN}`);
  // El presentador se une al room del PIN sin contar como jugador
  socket.emit('presenter_join', { pin: PIN, password: PASSWORD });
});

socket.on('error_message', (msg) => {
  console.error('Error del servidor:', msg);
});

// ── Jugadores en sala ─────────────────────────────────────────────────────
socket.on('player_count', ({ count }) => {
  totalPlayers = count;
  document.getElementById('p-player-count').textContent = count;
  answeredCount = 0;
  document.getElementById('p-answered-count').textContent = '0';
});

// ── Cuenta atrás previa al inicio ─────────────────────────────────────────
socket.on('game_countdown', ({ seconds }) => {
  const row = document.getElementById('p-countdown-row');
  row.style.display = 'flex';
  document.getElementById('p-countdown-num').textContent = seconds;
  if (seconds <= 0) row.style.display = 'none';
});

// ── Nueva pregunta ─────────────────────────────────────────────────────────
socket.on('next_question', ({ text, options, questionNumber, totalQuestions, timeLimit }) => {
  currentQuestion  = { text, timeLimit, questionNumber, totalQuestions };
  currentOptions   = options;
  answeredCount    = 0;

  // Rellena la vista
  document.getElementById('p-qnum').textContent = `${questionNumber} / ${totalQuestions}`;
  document.getElementById('p-question-text').textContent = text;
  document.getElementById('p-answered-count').textContent = '0';

  // Opciones
  const grid = document.getElementById('p-options-grid');
  grid.innerHTML = '';
  options.forEach((opt, i) => {
    const div = document.createElement('div');
    div.className = 'p-option';
    div.dataset.id = opt.id;
    div.innerHTML = `<span class="p-option-icon">${ICONS[i] || '●'}</span><span class="p-option-text">${opt.text}</span>`;
    grid.appendChild(div);
  });

  // Timer visual
  startTimer(timeLimit);
  showView('view-question');
  stopSound('waiting'); // Parar música de espera al empezar
});

// ── Un jugador envió respuesta → incrementar contador (escuchar evento propio)
socket.on('presenter_answer', () => {
  answeredCount = Math.min(answeredCount + 1, totalPlayers);
  document.getElementById('p-answered-count').textContent = answeredCount;
});

// ── Tiempo agotado ─────────────────────────────────────────────────────────
socket.on('time_up', () => {
  stopTimer();
  revealAnswers('⏱ Tiempo agotado');
});

// ── Todos respondieron ─────────────────────────────────────────────────────
socket.on('all_answered', () => {
  stopTimer();
  revealAnswers('✅ ¡Todos han respondido!');
});

// ── Game Over ──────────────────────────────────────────────────────────────
socket.on('game_over', ({ ranking }) => {
  stopTimer();
  renderGameOver(ranking);
  showView('view-gameover');
  playSound('fanfare');
});

// ── Revelar respuestas correctas + mini ranking ────────────────────────────
async function revealAnswers(verdictText) {
  // Obtener cuál opción es la correcta via API (solo el presentador la conoce)
  try {
    const q = currentQuestion;
    if (!q) return;

    document.getElementById('p-answer-verdict').textContent = verdictText;

    // Solicitar opciones con is_correct (requiere auth)
    const res  = await fetch(`api/presenter/options?pin=${encodeURIComponent(PIN)}&password=${encodeURIComponent(PASSWORD)}`);
    const data = await res.json();
    const correctId = data.correct_option_id;

    const revealGrid = document.getElementById('p-options-revealed');
    revealGrid.innerHTML = '';
    currentOptions.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = `p-option ${opt.id === correctId ? 'correct' : 'wrong'}`;
      div.innerHTML = `<span class="p-option-icon">${ICONS[i] || '●'}</span><span class="p-option-text">${opt.text}</span>`;
      revealGrid.appendChild(div);
    });

    // Mini ranking
    const rankRes  = await fetch(`api/presenter/ranking?pin=${encodeURIComponent(PIN)}&password=${encodeURIComponent(PASSWORD)}`);
    const rankData = await rankRes.json();
    renderMiniRanking(rankData.players || []);
    playSound('correct'); 

  } catch (e) {
    console.error('Error revelando respuestas', e);
  }
  showView('view-answer');
}

function renderMiniRanking(players) {
  const medals = ['🥇', '🥈', '🥉'];
  const el = document.getElementById('p-mini-ranking');
  el.innerHTML = players.slice(0, 5).map((p, i) => `
    <div class="p-mini-rank-row" style="animation-delay:${i * 0.08}s">
      <span class="p-mini-medal">${medals[i] || (i + 1)}</span>
      <span class="p-mini-name">${p.nickname}</span>
      <span class="p-mini-score">${p.score} pts</span>
    </div>`).join('');
}

function renderGameOver(ranking) {
  // Podio (top 3) — orden visual: 2º · 1º · 3º
  const podiumOrder = [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  const medals      = ['🥈', '🥇', '🥉'];
  const podiumEl    = document.getElementById('p-podium');
  podiumEl.innerHTML = podiumOrder.map((p, i) => `
    <div class="p-podium-place">
      <span class="p-podium-medal">${medals[i]}</span>
      <span class="p-podium-name">${p.nickname}</span>
      <span class="p-podium-score">${p.score} pts</span>
      <div class="p-podium-bar">${medals[i]}</div>
    </div>`).join('');

  // Ranking completo (4º en adelante)
  const fullEl = document.getElementById('p-full-ranking');
  fullEl.innerHTML = ranking.slice(3).map((p, i) => `
    <div class="p-rank-row" style="animation-delay:${i * 0.06}s">
      <span class="p-rank-pos">${i + 4}º</span>
      <span class="p-rank-name">${p.nickname}</span>
      <span class="p-rank-score">${p.score} pts</span>
    </div>`).join('');
}

// ── Timer visual ────────────────────────────────────────────────────────────
function startTimer(seconds) {
  stopTimer();
  timerSecondsLeft = seconds;
  const bar = document.getElementById('p-timer-bar');
  const num = document.getElementById('p-timer-num');
  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.classList.remove('warning');

  timerInterval = setInterval(() => {
    timerSecondsLeft--;
    num.textContent = Math.max(0, timerSecondsLeft);
    const pct = Math.max(0, (timerSecondsLeft / seconds) * 100);
    bar.style.transition = 'width 1s linear';
    bar.style.width = pct + '%';
    if (timerSecondsLeft <= 5 && timerSecondsLeft > 0) {
      bar.classList.add('warning');
      playSound('tick');
    }
    if (timerSecondsLeft <= 0) stopTimer();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
