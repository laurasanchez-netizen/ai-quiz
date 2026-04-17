const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- Configuración de Firebase ---
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin inicializado.");
  } catch (e) {
    console.error("❌ Error en FIREBASE_SERVICE_ACCOUNT:", e);
    admin.initializeApp();
  }
} else {
  admin.initializeApp();
}
const db = admin.firestore();

// --- Estado en Memoria ---
const activeGames = {};
const ADMIN_PASSWORD = 'admin1234';

// --- Funciones de Ayuda ---

async function emitQuestion(pin) {
  const game = activeGames[pin];
  if (!game) return;

  const questions = game.questions;
  if (game.currentIndex >= questions.length) {
    return endGame(pin);
  }

  const question = questions[game.currentIndex];
  game.answerTimestamp = Date.now();
  game.answeredPlayers = new Set();

  io.to(pin).emit('next_question', {
    text: question.text,
    options: question.options, // Ya vienen con id y text
    questionNumber: game.currentIndex + 1,
    totalQuestions: questions.length,
    timeLimit: question.time_limit || 20
  });

  // Temporizador de fin de pregunta
  clearTimeout(game.timerHandle);
  game.timerHandle = setTimeout(() => {
    io.to(pin).emit('time_up');
    scheduleNextQuestion(pin, 5000);
  }, (question.time_limit || 20) * 1000);
}

function scheduleNextQuestion(pin, delay = 5000) {
  const game = activeGames[pin];
  if (!game) return;
  clearTimeout(game.timerHandle);
  game.timerHandle = setTimeout(() => {
    game.currentIndex++;
    emitQuestion(pin);
  }, delay);
}

async function endGame(pin) {
  const game = activeGames[pin];
  if (!game) return;

  // Obtener ranking de Firestore
  const playersSnap = await db.collection('sessions').doc(pin).collection('players').orderBy('score', 'desc').get();
  const ranking = playersSnap.docs.map(doc => ({ nickname: doc.id, ...doc.data() }));

  io.to(pin).emit('game_over', { ranking });
  
  // Actualizar estado en Firestore
  await db.collection('sessions').doc(pin).update({ status: 'finished' });

  delete activeGames[pin];
}

// --- WebSocket ---
io.on('connection', (socket) => {
  console.log(`🔌 Conectado: ${socket.id}`);

  socket.on('join_game', async (data) => {
    const { pin, nickname } = data;
    try {
      const sessionRef = db.collection('sessions').doc(pin);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists || sessionDoc.data().status !== 'waiting') {
        return socket.emit('error_message', 'PIN incorrecto o partida ya iniciada.');
      }

      const sessionData = sessionDoc.data();
      
      // Guardar jugador
      await sessionRef.collection('players').doc(nickname).set({
        nickname,
        score: 0,
        socket_id: socket.id
      });

      socket.playerPin = pin;
      socket.nickname = nickname;
      socket.join(pin);

      socket.emit('joined_successfully', { pin, nickname, playerId: nickname, sessionId: pin });

      // Actualizar contador
      const playersSnap = await sessionRef.collection('players').get();
      io.to(pin).emit('player_count', { count: playersSnap.size });

      // --- Arranque automático simplificado (opcional si admin no lanza) ---
      if (!activeGames[pin]) {
        // Cargar preguntas de Firestore
        const quizId = sessionData.quiz_id;
        const questionsSnap = await db.collection('quizzes').doc(quizId).collection('questions').orderBy('order', 'asc').get();
        const questions = questionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        activeGames[pin] = {
          pin,
          questions,
          currentIndex: 0,
          answeredPlayers: new Set(),
          answerTimestamp: null,
          timerHandle: null
        };

        // Cuenta atrás de 30s
        let secondsLeft = 30;
        io.to(pin).emit('game_countdown', { seconds: secondsLeft });
        const cdInterval = setInterval(() => {
          secondsLeft--;
          io.to(pin).emit('game_countdown', { seconds: secondsLeft });
          if (secondsLeft <= 0) {
            clearInterval(cdInterval);
            sessionRef.update({ status: 'active' });
            emitQuestion(pin);
          }
        }, 1000);
      }

    } catch (err) {
      console.error(err);
      socket.emit('error_message', 'Error al unirse.');
    }
  });

  socket.on('submit_answer', async (data) => {
    const { pin, option_id } = data;
    const game = activeGames[pin];
    if (!game || game.answeredPlayers.has(socket.id)) return;

    game.answeredPlayers.add(socket.id);
    const question = game.questions[game.currentIndex];
    const option = question.options.find(o => o.id == option_id);

    const isCorrect = option && option.is_correct;
    let points = 0;

    if (isCorrect) {
      const timeTaken = (Date.now() - game.answerTimestamp) / 1000;
      const speedBonus = Math.max(0, Math.floor((1 - timeTaken / (question.time_limit || 20)) * 500));
      points = 500 + speedBonus;
      
      const playerRef = db.collection('sessions').doc(pin).collection('players').doc(socket.nickname);
      await playerRef.update({ score: admin.firestore.FieldValue.increment(points) });
    }

    socket.emit('answer_feedback', { correct: isCorrect, points_earned: points });
    io.to(pin).emit('presenter_answer');

    // Si todos responden, saltar
    const clients = io.sockets.adapter.rooms.get(pin);
    const numPlayers = clients ? clients.size : 1;
    if (game.answeredPlayers.size >= numPlayers) {
      io.to(pin).emit('all_answered');
      scheduleNextQuestion(pin, 2000);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Desconectado: ${socket.id}`);
  });
});

// API para Login de Admin
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ success: true });
  else res.status(401).json({ error: 'Incorrecto' });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
