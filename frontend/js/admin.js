// ────────────────────────────────────────────────────────────────────────────
//  ADMIN.JS — Quiz IA Zamora Company v1.9.0 (Login Sencillo)
// ────────────────────────────────────────────────────────────────────────────

let adminPassword = sessionStorage.getItem('adminPassword') || '';
let allSessionsData = [];
let selectedQuizId = null;

// ── LOGIN SENCILLO ──────────────────────────────────────────────────────────
window.simpleLogin = async () => {
  const passInput = document.getElementById('admin-pass-input');
  const errEl = document.getElementById('login-error');
  const password = passInput.value.trim();

  try {
    const res = await fetch('api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
        errEl.innerHTML = `❌ ${data.error || 'Código incorrecto'}`;
        errEl.style.display = 'block';
        return;
    }
    adminPassword = password;
    sessionStorage.setItem('adminPassword', adminPassword);
    errEl.style.display = 'none';
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';
    loadHistory(); loadCurrent(); loadQuizzes(); loadSessionQuizSelect();
  } catch (e) {
    errEl.innerHTML = `⚠️ Error: ${e.message}`;
    errEl.style.display = 'block';
  }
};

window.addEventListener('DOMContentLoaded', () => {
  const passInput = document.getElementById('admin-pass-input');
  if (passInput) passInput.addEventListener('keypress', (e) => { if(e.key==='Enter') simpleLogin(); });
  // Configurar botón de presentador
  const btnPresenter = document.getElementById('btn-open-presenter');
  if (btnPresenter) {
    btnPresenter.onclick = () => {
      const pin = document.getElementById('session-pin').value || '1111';
      window.open(`presenter.html?pin=${pin}&password=${encodeURIComponent(adminPassword)}`, '_blank');
    };
  }

  if (adminPassword) {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';
    loadHistory(); loadCurrent(); loadQuizzes(); loadSessionQuizSelect();
  }
});

function logout() {
  adminPassword = '';
  sessionStorage.removeItem('adminPassword');
  document.getElementById('admin-dashboard').style.display = 'none';
  document.getElementById('admin-login').style.display = 'flex';
}

async function adminFetch(url, options = {}) {
  const separator = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${separator}password=${encodeURIComponent(adminPassword)}`, options);
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}

function showTab(tabId, btn) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tabId === 'tab-history') loadHistory();
  if (tabId === 'tab-current') loadCurrent();
  if (tabId === 'tab-quizzes') loadQuizzes();
  if (tabId === 'tab-session') loadSessionQuizSelect();
  if (tabId === 'tab-stats') loadStats();
}

async function loadHistory() {
  const res = await adminFetch('api/admin/history');
  const data = await res.json();
  allSessionsData = data.sessions || [];
  const gridEl = document.getElementById('sessions-grid');
  gridEl.innerHTML = '';
  allSessionsData.forEach(s => {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.innerHTML = `<div>📌 ${s.pin}</div><div>${s.quiz_title}</div><small>${s.player_count} jugadores</small>`;
    card.onclick = () => loadSessionDetail(s.id);
    gridEl.appendChild(card);
  });
  document.getElementById('history-loading').style.display = 'none';
}

async function loadSessionDetail(id) {
  const res = await adminFetch(`api/admin/session/${id}`);
  const data = await res.json();
  const tbody = document.getElementById('detail-tbody');
  tbody.innerHTML = '';
  data.players.forEach((p, idx) => {
    tbody.innerHTML += `<tr><td>${idx+1}</td><td>${p.nickname}</td><td>${p.score}</td><td>${p.correct_answers}</td><td>-</td></tr>`;
  });
  document.getElementById('session-detail').style.display = 'block';
}

async function loadCurrent() {
  const res = await adminFetch('api/admin/current');
  const data = await res.json();
  const cards = document.getElementById('current-cards');
  cards.innerHTML = '';
  data.sessions.forEach(s => {
    cards.innerHTML += `<div class="current-card"><h4>${s.title}</h4><h3>PIN: ${s.pin}</h3><p>👥 ${s.player_count} jugadores</p></div>`;
  });
  document.getElementById('current-loading').style.display = 'none';
  document.getElementById('current-content').style.display = 'block';
}

async function loadQuizzes() {
  const res = await adminFetch('api/admin/quizzes');
  const data = await res.json();
  const list = document.getElementById('quizzes-list');
  list.innerHTML = '';
  data.quizzes.forEach(q => {
    const div = document.createElement('div');
    div.className = 'quiz-item';
    div.innerHTML = `<span>${q.title}</span><small>${q.question_count} preguntas</small>`;
    div.onclick = () => editQuiz(q.id);
    list.appendChild(div);
  });
  document.getElementById('quizzes-loading').style.display = 'none';
}

async function editQuiz(id) {
  const res = await adminFetch(`api/admin/quiz/${id}`);
  const data = await res.json();
  selectedQuizId = id;
  document.getElementById('quiz-editor-title').innerText = data.quiz.title;
  const qList = document.getElementById('questions-list');
  qList.innerHTML = '';
  data.questions.forEach(q => {
    qList.innerHTML += `<div class="question-card"><strong>${q.text}</strong><small>${q.type}</small></div>`;
  });
  document.getElementById('quiz-editor-placeholder').style.display = 'none';
  document.getElementById('quiz-editor').style.display = 'block';
}

async function loadSessionQuizSelect() {
  const res = await adminFetch('api/admin/quizzes');
  const data = await res.json();
  const grid = document.getElementById('session-quiz-cards');
  grid.innerHTML = '';
  data.quizzes.forEach(q => {
    const card = document.createElement('div');
    card.className = 'quiz-pick-card';
    card.innerHTML = `<h4>${q.title}</h4>`;
    card.onclick = () => {
        document.querySelectorAll('.quiz-pick-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('lp-quiz').innerText = q.title;
        selectedQuizId = q.id;
    }
    grid.appendChild(card);
  });
}

async function createSession() {
  const pin = document.getElementById('session-pin').value;
  if (!selectedQuizId) return alert('Selecciona un quiz');
  const res = await adminFetch('api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, quiz_id: selectedQuizId })
  });
  if (res.ok) alert('Partida lanzada con éxito');
}

// ── CARGA MASIVA ────────────────────────────────────────────────────────────
window.downloadCSVTemplate = () => {
    // Añadimos sep=, para que Excel detecte la coma como separador automáticamente
    const csvContent = "sep=,\n" +
                       "\"Quiz Title: Mi Nuevo Cuestionario\"\n" +
                       "\"Pregunta\",\"Tipo\",\"Tiempo\",\"Opcion 1\",\"Opcion 2\",\"Opcion 3\",\"Opcion 4\",\"Correcta (1-4)\"\n" +
                       "\"¿De qué color es el logo de Zamora?\",\"multiple\",\"20\",\"Azul\",\"Rojo\",\"Verde\",\"Blanco\",\"3\"\n" +
                       "\"El Licor 43 es originario de Cartagena\",\"boolean\",\"15\",\"Verdadero\",\"Falso\",\"\",\"\",\"1\"";
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_quiz_zamora.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.handleBulkUpload = async (type) => {
    const fileInput = document.getElementById(`file-${type}`);
    const file = fileInput.files[0];
    if (!file) return;

    const content = await file.text();
    try {
        const res = await adminFetch('api/admin/quizzes/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, content })
        });
        const data = await res.json();
        if (res.ok) {
            alert(`✅ ${data.message}: ${data.title} (${data.count} preguntas)`);
            loadQuizzes();
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (e) {
        alert(`⚠️ Error de conexión: ${e.message}`);
    }
    fileInput.value = '';
};

// ── EDITOR DE QUIZZES (CRUD) ────────────────────────────────────────────────
window.showCreateQuizForm = () => document.getElementById('create-quiz-form').style.display = 'block';
window.hideCreateQuizForm = () => document.getElementById('create-quiz-form').style.display = 'none';

window.createQuiz = async () => {
    const title = document.getElementById('new-quiz-title').value.trim();
    if (!title) return alert('El título es obligatorio');
    const res = await adminFetch('api/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
    });
    if (res.ok) {
        alert('✅ Quiz creado');
        hideCreateQuizForm();
        loadQuizzes();
    }
};

window.showAddQuestionForm = () => document.getElementById('add-question-form').style.display = 'block';
window.hideAddQuestionForm = () => document.getElementById('add-question-form').style.display = 'none';

window.toggleBooleanOptions = (type) => {
    document.getElementById('multiple-options-form').style.display = type === 'multiple' ? 'block' : 'none';
    document.getElementById('boolean-options-form').style.display = type === 'boolean' ? 'block' : 'none';
};

window.saveNewQuestion = async () => {
    if (!selectedQuizId) return;
    const text = document.getElementById('new-q-text').value.trim();
    const type = document.getElementById('new-q-type').value;
    const time_limit = parseInt(document.getElementById('new-q-time').value);
    
    if (!text) return alert('El texto es obligatorio');

    const body = { text, type, time_limit };

    if (type === 'boolean') {
        body.boolean_correct = document.querySelector('input[name="boolean-correct"]:checked').value;
    }

    const res = await adminFetch(`api/admin/quiz/${selectedQuizId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        const data = await res.json();
        if (type === 'multiple') {
            const optRows = document.querySelectorAll('.opt-text');
            const correctIdx = parseInt(document.querySelector('input[name="correct-opt"]:checked').value);
            for (let i = 0; i < optRows.length; i++) {
                const optText = optRows[i].value.trim();
                if (optText) {
                    await adminFetch(`api/admin/question/${data.id}/options`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: optText, is_correct: i === correctIdx })
                    });
                }
            }
        }
        alert('✅ Pregunta guardada');
        hideAddQuestionForm();
        editQuiz(selectedQuizId);
    }
};

// ── QR ──────────────────────────────────────────────────────────────────────
window.generateQR = () => {
    const url = document.getElementById('qr-url-input').value.trim();
    if (!url) return alert('Introduce la URL del servidor');
    const qrImg = document.getElementById('qr-image');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
    document.getElementById('qr-container').style.display = 'block';
};

// ── ESTADÍSTICAS ────────────────────────────────────────────────────────────
window.loadStats = async () => {
    const date = document.getElementById('stats-filter-date').value;
    const quizId = document.getElementById('stats-filter-quiz').value;
    const res = await adminFetch(`api/admin/stats?date=${date}&quizId=${quizId}`);
    const data = await res.json();
    
    document.getElementById('kpi-sessions').innerText = data.global.total_sessions || 0;
    document.getElementById('kpi-players').innerText = data.global.total_players || 0;
    document.getElementById('kpi-avg-score').innerText = data.global.avg_score || 0;

    const tbody = document.getElementById('stats-quiz-tbody');
    tbody.innerHTML = '';
    data.byQuiz.forEach(q => {
        tbody.innerHTML += `<tr>
            <td>${q.title}</td>
            <td style="text-align:center;">${q.sessions_played}</td>
            <td style="text-align:center;">${q.total_players}</td>
            <td style="text-align:center;">${q.max_score}</td>
            <td style="text-align:center;">${q.accuracy_pct}%</td>
        </tr>`;
    });
    document.getElementById('stats-loading').style.display = 'none';
    document.getElementById('stats-content').style.display = 'block';
};

// ── BACKUPS ─────────────────────────────────────────────────────────────────
window.generateBackup = async () => {
    const dest = document.querySelector('input[name="backup-dest"]:checked').value;
    const statusEl = document.getElementById('backup-status');
    const textEl = document.getElementById('backup-text');
    
    statusEl.style.display = 'block';
    textEl.innerText = 'Procesando volcado...';

    try {
        const res = await adminFetch('api/admin/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination: dest })
        });
        
        if (dest === 'download' && res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_quiz_${new Date().toISOString().slice(0,10)}.sql.gz`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } else {
            const data = await res.json();
            alert(data.message || data.error);
        }
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        statusEl.style.display = 'none';
    }
};

window.closeDetail = () => { document.getElementById('session-detail').style.display = 'none'; };

window.applyHistoryFilters = () => { loadHistory(); };

window.exportAllCSV = () => {
    alert('Función de exportación total en desarrollo.');
};

window.exportCSV = () => {
    const rows = [];
    const table = document.getElementById('detail-table');
    const trs = table.querySelectorAll('tr');
    trs.forEach(tr => {
        const cells = tr.querySelectorAll('th, td');
        const row = Array.from(cells).map(c => `"${c.innerText}"`).join(',');
        rows.push(row);
    });
    const csvContent = rows.join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ranking_sesion.csv`);
    link.click();
};
