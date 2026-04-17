// El script del cliente se autoconecta al host donde fue servido
const socket = io();

// Generar QR de acceso en la pantalla de inicio
window.addEventListener('DOMContentLoaded', () => {
  const qrImg = document.getElementById('login-qr');
  if (qrImg) {
    const url = encodeURIComponent(window.location.href);
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${url}&margin=10`;
  }

  // RECONEXIÓN INTELIGENTE: Intentar recuperar sesión persistente
  const saved = localStorage.getItem('quiz_session');
  if (saved) {
    const data = JSON.parse(saved);
    playerPin = data.pin;
    playerNickname = data.nickname;
    socket.emit('resume_session', data);
  }
});

// --- ESTADO LOCAL ---
let playerPin = '';
let playerNickname = '';
let timerInterval = null;

// --- REFERENCIAS DOM ---
const views = {
  login: document.getElementById('view-login'),
  waiting: document.getElementById('view-waiting'),
  question: document.getElementById('view-question'),
  feedback: document.getElementById('view-feedback'),
  gameover: document.getElementById('view-gameover')
};

// --- CAMBIAR VISTA ---
function switchView(viewName) {
  Object.keys(views).forEach(k => {
    views[k].style.display = 'none';
  });
  if (views[viewName]) views[viewName].style.display = 'block';
}

// Iniciar en login
switchView('login');

// --- LÓGICA DE LOG-IN ---
document.getElementById('btn-join').addEventListener('click', () => {
  const pin = document.getElementById('input-pin').value.trim();
  const nickname = document.getElementById('input-nickname').value.trim();

  if (pin && nickname) {
    playerPin = pin;
    playerNickname = nickname;
    socket.emit('join_game', { pin, nickname });
  } else {
    showError('Por favor, rellena el PIN y tu apodo.');
  }
});

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.innerText = msg;
  el.style.display = 'block';
}

// --- EVENTOS DEL SERVIDOR ---

socket.on('joined_successfully', (data) => {
  document.getElementById('display-name').innerText = data.nickname;
  document.getElementById('display-pin').innerText = data.pin;
  
  // Guardar en localStorage para reconexión
  localStorage.setItem('quiz_session', JSON.stringify({
    pin: data.pin,
    nickname: data.nickname,
    playerId: data.playerId,
    sessionId: data.sessionId
  }));

  switchView('waiting');
});

socket.on('error_message', (msg) => {
  showError(msg);
});

// Actualizar contador de jugadores en sala
socket.on('player_count', (data) => {
  const el = document.getElementById('player-count');
  if (el) el.innerText = data.count;
});

// Mostrar cuenta atrás antes de que empiece el juego
socket.on('game_countdown', (data) => {
  const box = document.getElementById('countdown-box');
  const num = document.getElementById('countdown-number');
  const loader = document.getElementById('waiting-loader');
  if (!box || !num) return;

  if (data.seconds > 0) {
    box.style.display = 'block';
    if (loader) loader.style.display = 'none';
    num.innerText = data.seconds;
  } else {
    box.style.display = 'none';
  }
});
// Si el tiempo se agota antes de que todos respondan
socket.on('time_up', () => {
  clearInterval(timerInterval);
  document.getElementById('time-left').innerText = '0';
  // Deshabilitar botones si no respondió
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
});

// Todos han respondido: mostrar aviso de que viene la siguiente
socket.on('all_answered', () => {
  clearInterval(timerInterval);
  const grid = document.getElementById('options-grid');
  const existing = document.getElementById('all-answered-msg');
  if (!existing && grid) {
    const msg = document.createElement('p');
    msg.id = 'all-answered-msg';
    msg.style.cssText = 'color:#34A853;font-weight:700;font-size:13px;margin-top:10px;text-align:center;';
    msg.innerText = '✅ Todos han respondido. Siguiente pregunta en 5s...';
    grid.parentNode.appendChild(msg);
  }
});

socket.on('next_question', (data) => {
  clearInterval(timerInterval);

  // Rellenar texto y contadores
  document.getElementById('question-text').innerText = data.text;
  document.getElementById('question-counter').innerText = `Pregunta ${data.questionNumber} de ${data.totalQuestions}`;

  // Barra de progreso
  document.getElementById('progress-fill').style.width = `${(data.questionNumber / data.totalQuestions) * 100}%`;

  // Temporizador
  let timeLeft = data.timeLimit;
  document.getElementById('time-left').innerText = timeLeft;
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('time-left').innerText = timeLeft;
    if (timeLeft <= 0) clearInterval(timerInterval);
  }, 1000);

  // Renderizar opciones con colores corporativos
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';
  
  if (data.options.length <= 2) {
    grid.classList.add('boolean-grid');
  } else {
    grid.classList.remove('boolean-grid');
  }

  const shapeLabels = ['▲', '■', '◆', '⬣'];
  data.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = `btn option-btn color-${idx}`;
    btn.innerHTML = `<span class="opt-icon">${shapeLabels[idx]}</span><span>${opt.text}</span>`;
    btn.onclick = () => submitAnswer(opt.id, btn);
    grid.appendChild(btn);
  });

  switchView('question');
});

function submitAnswer(optionId, clickedBtn) {
  // Deshabilitar todos los botones
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
  clickedBtn.classList.add('selected');
  clearInterval(timerInterval);
  socket.emit('submit_answer', { pin: playerPin, option_id: optionId });
}

socket.on('answer_feedback', (data) => {
  // Mostrar pantalla de feedback
  const icon = document.getElementById('feedback-icon');
  const msg = document.getElementById('feedback-msg');
  const pts = document.getElementById('feedback-points');

  if (data.correct) {
    icon.className = 'feedback-icon feedback-correct';
    icon.innerText = '✔';
    msg.innerText = '¡Correcto!';
    msg.style.color = '#006235';
    pts.innerText = `+${data.points_earned} puntos`;
    pts.style.display = 'block';
  } else {
    icon.className = 'feedback-icon feedback-incorrect';
    icon.innerText = '✖';
    msg.innerText = 'Incorrecto';
    msg.style.color = '#7b0e40';
    pts.style.display = 'none';
  }

  switchView('feedback');
});

socket.on('game_over', (data) => {
  clearInterval(timerInterval);

  const ranking = data.ranking;

  // --- RELLENAR PODIO TOP 3 ---
  const podiumPositions = [1, 2, 3]; // orden visual: 2º izq, 1º centro, 3º dcha — el HTML ya lo controla
  podiumPositions.forEach(pos => {
    const player = ranking[pos - 1];
    const nameEl  = document.getElementById(`podium-name-${pos}`);
    const scoreEl = document.getElementById(`podium-score-${pos}`);
    if (nameEl && scoreEl) {
      nameEl.innerText  = player ? player.nickname : '—';
      scoreEl.innerText = player ? `${player.score} pts` : '';
    }
  });

  // Ocultar slots vacíos del podio si hay menos de 3 jugadores
  [2, 3].forEach(pos => {
    const slot = document.getElementById(`podium-${pos}`);
    if (slot && !ranking[pos - 1]) slot.style.visibility = 'hidden';
  });

  // --- RELLENAR LISTA TOP 10 ---
  const list = document.getElementById('ranking-list');
  list.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];

  ranking.forEach((player, idx) => {
    const li = document.createElement('li');
    li.className = 'ranking-item';
    li.style.animationDelay = `${idx * 0.07}s`;
    li.innerHTML = `
      <span class="rank-pos">${medals[idx] || (idx + 1)}</span>
      <span class="rank-name">${player.nickname}</span>
      <span class="rank-score">${player.score} pts</span>
    `;
    list.appendChild(li);
  });

  switchView('gameover');
  // Al finalizar la partida, limpiar la sesión de reconexión
  localStorage.removeItem('quiz_session');
});
