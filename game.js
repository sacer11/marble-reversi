const EMPTY = 0;
const BLACK = 1;
const WHITE = -1;
const SIZE = 8;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

const cells = [];
let board = [];
let current = BLACK;
let gameOver = false;
let mode = "ai";
let difficulty = 1;
let playerName = "TOM";
let timerLimit = 0;
let clocks = { [BLACK]: 0, [WHITE]: 0 };
let timerId = null;
let soundOn = true;
let audioContext = null;
let moveCount = 0;

const setupEl = document.querySelector("#setup");
const gameEl = document.querySelector("#game");
const onlineEl = document.querySelector("#online");
const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const thinkingEl = document.querySelector("#thinking");
const passBtn = document.querySelector("#passBtn");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const difficultyWrap = document.querySelector("#difficultyWrap");
const themeSelect = document.querySelector("#themeSelect");
const onlineOpponents = ["NOVA", "KAITO", "MIRA", "JUNO", "LYRA", "ORION"];
const marbleCount = 16;
let onlineSimulated = false;

function applyTheme(theme = themeSelect.value) {
  document.body.dataset.theme = theme;
}

function chooseMarblePair() {
  const dark = Math.floor(Math.random() * marbleCount);
  const light = Math.floor(Math.random() * marbleCount);
  document.documentElement.style.setProperty("--marble-dark-image", `url("assets/pieces/marbles/dark-${dark}.png")`);
  document.documentElement.style.setProperty("--marble-light-image", `url("assets/pieces/marbles/light-${light}.png")`);
}

function initBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  current = BLACK;
  gameOver = false;
  moveCount = 0;
}

function inside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function flipsFor(row, col, color, state = board) {
  if (!inside(row, col) || state[row][col] !== EMPTY) return [];
  const flips = [];

  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;

    while (inside(r, c) && state[r][c] === -color) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }

    if (line.length && inside(r, c) && state[r][c] === color) {
      flips.push(...line);
    }
  }

  return flips;
}

function legalMoves(color, state = board) {
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const flips = flipsFor(row, col, color, state);
      if (flips.length) moves.push({ row, col, flips });
    }
  }
  return moves;
}

function applyMove(row, col, color, state = board) {
  const flips = flipsFor(row, col, color, state);
  if (!flips.length) return false;
  state[row][col] = color;
  for (const [r, c] of flips) state[r][c] = color;
  return flips.length;
}

function cloneBoard(state) {
  return state.map((row) => [...row]);
}

function counts(state = board) {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (const row of state) {
    for (const cell of row) {
      if (cell === BLACK) black += 1;
      if (cell === WHITE) white += 1;
      if (cell === EMPTY) empty += 1;
    }
  }
  return { black, white, empty };
}

function scoreBoard(state, color) {
  const weights = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120],
  ];
  let score = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      score += state[row][col] * color * weights[row][col];
    }
  }
  score += (legalMoves(color, state).length - legalMoves(-color, state).length) * 8;
  const c = counts(state);
  score += (color === BLACK ? c.black - c.white : c.white - c.black) * 2;
  return score;
}

function chooseAiMove() {
  const moves = legalMoves(WHITE);
  if (!moves.length) return null;

  if (difficulty === 0) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (difficulty === 1) {
    return [...moves].sort((a, b) => moveValue(b) - moveValue(a))[0];
  }

  const depth = difficulty === 2 ? 3 : 5;
  let best = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const next = cloneBoard(board);
    applyMove(move.row, move.col, WHITE, next);
    const score = minimax(next, depth - 1, BLACK, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function moveValue(move) {
  const corner = (move.row === 0 || move.row === 7) && (move.col === 0 || move.col === 7);
  const edge = move.row === 0 || move.row === 7 || move.col === 0 || move.col === 7;
  return move.flips.length + (corner ? 80 : 0) + (edge ? 12 : 0);
}

function minimax(state, depth, turn, alpha, beta) {
  const moves = legalMoves(turn, state);
  const otherMoves = legalMoves(-turn, state);
  if (depth === 0 || (!moves.length && !otherMoves.length)) {
    return scoreBoard(state, WHITE);
  }

  if (!moves.length) return minimax(state, depth - 1, -turn, alpha, beta);

  if (turn === WHITE) {
    let value = -Infinity;
    for (const move of moves) {
      const next = cloneBoard(state);
      applyMove(move.row, move.col, turn, next);
      value = Math.max(value, minimax(next, depth - 1, -turn, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    const next = cloneBoard(state);
    applyMove(move.row, move.col, turn, next);
    value = Math.min(value, minimax(next, depth - 1, -turn, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function renderBoard() {
  const moves = legalMoves(current);
  const legalSet = new Set(moves.map((move) => `${move.row},${move.col}`));

  cells.forEach((cell, index) => {
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const value = board[row][col];
    cell.className = `cell${legalSet.has(`${row},${col}`) && canHumanAct() ? " legal" : ""}`;
    cell.setAttribute("aria-label", `${row + 1}/${col + 1}`);
    cell.innerHTML = value === EMPTY
      ? ""
      : `<span class="disc ${value === BLACK ? "black" : "white"}"></span>`;
  });
}

function renderUi() {
  const c = counts();
  document.querySelector("#blackScore").textContent = c.black;
  document.querySelector("#whiteScore").textContent = c.white;
  document.querySelector("#blackName").textContent = playerName || "DU";
  document.querySelector("#whiteName").textContent = onlineSimulated
    ? document.querySelector("#whiteName").dataset.opponent || "RIVAL"
    : mode === "ai" ? "CPU" : "GUEST";
  document.querySelector("#scoreBlack").classList.toggle("active-player", current === BLACK && !gameOver);
  document.querySelector("#scoreWhite").classList.toggle("active-player", current === WHITE && !gameOver);
  document.querySelector("#blackClock").textContent = formatClock(clocks[BLACK]);
  document.querySelector("#whiteClock").textContent = formatClock(clocks[WHITE]);
  document.querySelector("#roundCount").textContent = Math.floor(moveCount / 2) + 1;
  passBtn.disabled = !canHumanAct() || legalMoves(current).length > 0 || gameOver;
  renderBoard();
}

function updateStatus() {
  const c = counts();
  if (gameOver) {
    const rival = onlineSimulated ? document.querySelector("#whiteName").dataset.opponent || "RIVAL" : mode === "ai" ? "CPU" : "GUEST";
    const winner = c.black === c.white ? "Draw!" : c.black > c.white ? `${playerName} wins!` : `${rival} wins!`;
    statusEl.textContent = `${winner} ${c.black}:${c.white}`;
    return;
  }

  const moves = legalMoves(current);
  const rival = onlineSimulated ? document.querySelector("#whiteName").dataset.opponent || "RIVAL" : mode === "ai" ? "CPU" : "GUEST";
  const name = current === BLACK ? playerName : rival;
  statusEl.textContent = moves.length
    ? `${name} to move.`
    : `${name} must pass.`;
}

function canHumanAct() {
  return !gameOver && (mode === "human" || current === BLACK);
}

function handleCell(row, col) {
  if (!canHumanAct()) return;
  unlockAudio();
  const flips = flipsFor(row, col, current);
  const flipped = applyMove(row, col, current);
  if (!flipped) return;
  moveCount += 1;
  playMoveSound(flipped, current, isEdgeCell(row, col));
  animateMove(row, col, flips);
  endTurn();
}

function endTurn() {
  current = -current;
  checkFlow();
}

function checkFlow() {
  const moves = legalMoves(current);
  const otherMoves = legalMoves(-current);

  if (!moves.length && !otherMoves.length) {
    gameOver = true;
    stopTimer();
  } else if (!moves.length) {
    updateStatus();
    renderUi();
    window.setTimeout(() => {
      if (!gameOver) {
        current = -current;
        checkFlow();
      }
    }, 700);
    return;
  }

  updateStatus();
  renderUi();

  if (!gameOver && (mode === "ai" || onlineSimulated) && current === WHITE) {
    thinkingEl.classList.remove("hidden");
    window.setTimeout(() => {
      const move = chooseAiMove();
      if (move) {
        const flips = flipsFor(move.row, move.col, WHITE);
        const flipped = applyMove(move.row, move.col, WHITE);
        moveCount += 1;
        playMoveSound(flipped, WHITE, isEdgeCell(move.row, move.col));
        animateMove(move.row, move.col, flips);
      }
      thinkingEl.classList.add("hidden");
      endTurn();
    }, 260 + difficulty * 180);
  }
}

function startGame() {
  unlockAudio();
  applyTheme();
  chooseMarblePair();
  onlineSimulated = false;
  playerName = document.querySelector("#playerName").value.trim().slice(0, 6).toUpperCase() || "DU";
  difficulty = Number(document.querySelector("#difficulty").value);
  timerLimit = Number(document.querySelector("#timerSelect").value);
  clocks = { [BLACK]: timerLimit, [WHITE]: timerLimit };
  setupEl.classList.add("hidden");
  onlineEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  initBoard();
  startTimer();
  updateStatus();
  renderUi();
}

function startOnlineGame(opponent) {
  unlockAudio();
  applyTheme();
  chooseMarblePair();
  onlineSimulated = true;
  mode = "ai";
  difficulty = 2;
  playerName = document.querySelector("#playerName").value.trim().slice(0, 6).toUpperCase() || "DU";
  document.querySelector("#rankPlayer").textContent = playerName;
  document.querySelector("#whiteName").dataset.opponent = opponent;
  timerLimit = 0;
  clocks = { [BLACK]: 0, [WHITE]: 0 };
  setupEl.classList.add("hidden");
  onlineEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  initBoard();
  startTimer();
  updateStatus();
  renderUi();
}

function showOnline() {
  playerName = document.querySelector("#playerName").value.trim().slice(0, 6).toUpperCase() || "DU";
  document.querySelector("#rankPlayer").textContent = playerName;
  setupEl.classList.add("hidden");
  gameEl.classList.add("hidden");
  onlineEl.classList.remove("hidden");
}

function makeInviteCode() {
  const number = Math.floor(100 + Math.random() * 900);
  const name = (document.querySelector("#playerName").value.trim().slice(0, 3).toUpperCase() || "YOU").padEnd(3, "X");
  return `${name}-${number}`;
}

function startTimer() {
  stopTimer();
  if (!timerLimit) {
    clocks[BLACK] = 0;
    clocks[WHITE] = 0;
    return;
  }

  timerId = window.setInterval(() => {
    if (gameOver) return;
    clocks[current] -= 1;
    if (clocks[current] <= 0) {
      clocks[current] = 0;
      gameOver = true;
      stopTimer();
      statusEl.textContent = `${current === BLACK ? playerName : "CPU"} loses on time.`;
    }
    renderUi();
  }, 1000);
}

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function formatClock(seconds) {
  if (!timerLimit) return "--:--";
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = (seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function isEdgeCell(row, col) {
  return row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1;
}

function animateMove(row, col, flips) {
  window.requestAnimationFrame(() => {
    markCell(row, col, "placed", row, col);
    flips.forEach(([flipRow, flipCol], index) => {
      window.setTimeout(() => {
        markCell(flipRow, flipCol, isEdgeCell(row, col) || isEdgeCell(flipRow, flipCol) ? "edge-hit" : "flipped", row, col);
      }, index * 42);
    });
  });
}

function markCell(row, col, className, originRow, originCol) {
  const cell = cells[row * SIZE + col];
  if (!cell) return;
  const dx = col - originCol || (col < 4 ? -1 : 1);
  const dy = row - originRow || (row < 4 ? -1 : 1);
  const distance = className === "edge-hit" ? 30 : 22;
  cell.style.setProperty("--roll-x", `${Math.sign(dx) * distance}px`);
  cell.style.setProperty("--roll-y", `${Math.sign(dy) * distance}px`);
  cell.style.setProperty("--roll-rot", `${(Math.abs(dx) + Math.abs(dy) + 1) * (className === "edge-hit" ? 165 : 128)}deg`);
  cell.classList.remove("placed", "flipped", "edge-hit");
  void cell.offsetWidth;
  cell.classList.add(className);
  window.setTimeout(() => cell.classList.remove(className), className === "edge-hit" ? 980 : 800);
}

function playMoveSound(flipped, color, edgeHit = false) {
  if (!soundOn || !flipped) return;
  const hits = Math.min(10, flipped + 1 + (edgeHit ? 2 : 0));
  const volume = Math.min(0.18, 0.06 + flipped * 0.011);
  billiardRoll(Math.min(0.03, 0.01 + flipped * 0.003), edgeHit ? 0.42 : 0.26);
  billiardKnock(volume * 0.95, edgeHit || flipped >= 5, 0);
  for (let index = 0; index < hits; index += 1) {
    const jitter = Math.random() * 10;
    window.setTimeout(() => {
      billiardClick(volume * Math.pow(0.78, index), edgeHit || flipped >= 5, index);
    }, 48 + index * (edgeHit ? 44 : 58) + jitter);
  }
  if (flipped >= 4) {
    window.setTimeout(() => billiardCluster(Math.min(0.12, volume * 0.7), flipped), 115);
  }
}

function billiardKnock(volume, heavy = false, index = 0) {
  const context = unlockAudio();
  if (!context) return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(heavy ? 520 : 680, now);
  osc.frequency.exponentialRampToValueAtTime(heavy ? 155 : 210, now + 0.052);
  filter.type = "lowpass";
  filter.frequency.value = heavy ? 1550 : 2200;
  filter.Q.value = 1.2;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (heavy ? 0.18 : 0.13));
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function billiardClick(volume, heavy = false, index = 0) {
  const context = unlockAudio();
  if (!context) return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  osc.type = "square";
  osc.frequency.setValueAtTime((heavy ? 920 : 1180) + Math.random() * 180, now);
  osc.frequency.exponentialRampToValueAtTime(heavy ? 260 : 360, now + 0.035);
  filter.type = "bandpass";
  filter.frequency.value = heavy ? 980 : 1350;
  filter.Q.value = heavy ? 7 : 9;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.004, volume * 0.7), now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.065);
}

function billiardCluster(volume, flipped) {
  const bursts = Math.min(8, flipped + 1);
  for (let i = 0; i < bursts; i += 1) {
    window.setTimeout(() => {
      if (i % 3 === 0) billiardKnock(volume * Math.pow(0.82, i), true, i);
      else billiardClick(volume * Math.pow(0.84, i), true, i);
    }, 18 + i * 34 + Math.random() * 16);
  }
}

function billiardRoll(volume, duration) {
  const context = unlockAudio();
  if (!context) return;
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const t = i / bufferSize;
    const grain = Math.random() * 2 - 1;
    const pulse = Math.sin(i * 0.04) > 0.86 ? 0.8 : 0.16;
    data[i] = grain * pulse * Math.pow(1 - t, 1.9) * volume;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "lowpass";
  filter.frequency.value = 640;
  gain.gain.value = 0.72;
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();
}

function marbleCupBounce(volume, heavy = false, index = 0) {
  const context = unlockAudio();
  if (!context) return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const start = (heavy ? 1180 : 1650) + Math.random() * 420 - index * 34;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(heavy ? 360 : 520, now + 0.055);
  filter.type = "bandpass";
  filter.frequency.value = heavy ? 1050 : 1500;
  filter.Q.value = heavy ? 9 : 12;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.004, volume), now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (heavy ? 0.13 : 0.09));
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

function cupThump(volume, heavy = false) {
  const context = unlockAudio();
  if (!context) return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(heavy ? 220 : 280, now);
  osc.frequency.exponentialRampToValueAtTime(heavy ? 95 : 130, now + 0.18);
  filter.type = "lowpass";
  filter.frequency.value = heavy ? 950 : 1250;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (heavy ? 0.26 : 0.2));
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.28);
}

function cupRattle(volume, flipped) {
  const bursts = Math.min(10, flipped + 2);
  for (let i = 0; i < bursts; i += 1) {
    window.setTimeout(() => {
      marbleCupBounce(volume * Math.pow(0.88, i), true, i);
    }, 20 + i * 28 + Math.random() * 18);
  }
}

function marbleRollSound(volume, duration) {
  const context = unlockAudio();
  if (!context) return;
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const t = i / bufferSize;
    const grain = Math.random() * 2 - 1;
    const pulse = Math.sin(i * 0.075) > 0.72 ? 1 : 0.22;
    data[i] = grain * pulse * Math.pow(1 - t, 1.6) * volume;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.value = 720;
  filter.Q.value = 3.5;
  gain.gain.value = 0.85;
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();
}

function unlockAudio() {
  if (!soundOn) return null;
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return null;
  audioContext ||= new AudioEngine();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function tone(frequency, duration, volume, accent = false) {
  if (!soundOn) return;
  const context = unlockAudio();
  if (!context) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  osc.frequency.value = frequency;
  osc.type = accent ? "triangle" : "sine";
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);

  if (accent) {
    const harmony = audioContext.createOscillator();
    const harmonyGain = audioContext.createGain();
    harmony.frequency.value = frequency * 1.5;
    harmony.type = "sine";
    harmonyGain.gain.setValueAtTime(0.0001, now);
    harmonyGain.gain.exponentialRampToValueAtTime(volume * 0.48, now + 0.018);
    harmonyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.04);
    harmony.connect(harmonyGain);
    harmonyGain.connect(audioContext.destination);
    harmony.start(now);
    harmony.stop(now + duration + 0.06);
  }
}

function buildBoard() {
  boardEl.innerHTML = "";
  cells.length = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.setAttribute("role", "gridcell");
      button.addEventListener("click", () => handleCell(row, col));
      cells.push(button);
      boardEl.append(button);
    }
  }
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    modeButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    difficultyWrap.classList.toggle("hidden", mode !== "ai");
  });
});

document.querySelector("#startBtn").addEventListener("click", startGame);
themeSelect.addEventListener("change", () => {
  applyTheme();
});
document.querySelector("#onlineBtn").addEventListener("click", showOnline);
document.querySelector("#onlineBackBtn").addEventListener("click", () => {
  onlineEl.classList.add("hidden");
  setupEl.classList.remove("hidden");
});
document.querySelector("#friendMatchBtn").addEventListener("click", () => {
  document.querySelector("#matchmaking").classList.add("hidden");
  document.querySelector("#inviteCode").textContent = makeInviteCode();
  document.querySelector("#inviteCard").classList.remove("hidden");
});
document.querySelector("#randomMatchBtn").addEventListener("click", () => {
  const matchmaking = document.querySelector("#matchmaking");
  const invite = document.querySelector("#inviteCard");
  const opponent = onlineOpponents[Math.floor(Math.random() * onlineOpponents.length)];
  invite.classList.add("hidden");
  matchmaking.classList.remove("hidden");
  document.querySelector("#matchStatus").textContent = "Matching skill level";
  window.setTimeout(() => {
    document.querySelector("#matchStatus").textContent = `${opponent} found`;
  }, 900);
  window.setTimeout(() => startOnlineGame(opponent), 1550);
});
document.querySelector("#newGameBtn").addEventListener("click", startGame);
document.querySelector("#menuBtn").addEventListener("click", () => {
  stopTimer();
  onlineSimulated = false;
  gameEl.classList.add("hidden");
  setupEl.classList.remove("hidden");
});
passBtn.addEventListener("click", () => {
  if (legalMoves(current).length === 0) endTurn();
});
document.querySelector("#soundToggle").addEventListener("click", () => {
  soundOn = !soundOn;
  document.querySelector("#soundIcon").textContent = soundOn ? "🔊" : "🔇";
  if (soundOn) {
    unlockAudio();
    tone(440, 0.08, 0.06);
    window.setTimeout(() => tone(660, 0.08, 0.05), 70);
  }
});

buildBoard();
initBoard();
applyTheme();
chooseMarblePair();
renderUi();
