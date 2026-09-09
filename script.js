// ------------------------------------------------------------------
// Configuração do jogo
// ------------------------------------------------------------------
const maxAttempts = 7;
const codeLength = 4;
const adminPassword = "aidento";
let secretCode = "9742";

let attempts = 0;
let currentCode = "";
let history = [];
let gameOver = false;
let missionStarted = false;

// ------------------------------------------------------------------
// Elementos
// ------------------------------------------------------------------
const codeDisplay = document.getElementById("codeDisplay");
const attemptCounter = document.getElementById("attemptCounter");
const statusState = document.getElementById("statusState");
const historyList = document.getElementById("historyList");
const keypad = document.getElementById("keypad");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");
const victoryOverlay = document.getElementById("victoryOverlay");
const appShell = document.getElementById("appShell");

const endgameActions = document.getElementById("endgameActions");
const restartBtn = document.getElementById("restartBtn");
const changeCodeBtn = document.getElementById("changeCodeBtn");

const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelpBtn = document.getElementById("closeHelpBtn");

const briefingModal = document.getElementById("briefingModal");
const startMissionBtn = document.getElementById("startMissionBtn");

const adminModal = document.getElementById("adminModal");
const adminModalBox = document.getElementById("adminModalBox");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminError = document.getElementById("adminError");
const confirmAdminBtn = document.getElementById("confirmAdminBtn");
const cancelAdminBtn = document.getElementById("cancelAdminBtn");

const newCodeModal = document.getElementById("newCodeModal");
const newCodeModalBox = document.getElementById("newCodeModalBox");
const newCodeInput = document.getElementById("newCodeInput");
const newCodeError = document.getElementById("newCodeError");
const confirmNewCodeBtn = document.getElementById("confirmNewCodeBtn");
const cancelNewCodeBtn = document.getElementById("cancelNewCodeBtn");

const confettiCanvas = document.getElementById("confettiCanvas");
const confettiCtx = confettiCanvas.getContext("2d");

// ------------------------------------------------------------------
// Áudio (feedback sonoro leve, sem arquivos externos)
// ------------------------------------------------------------------
function playTone(freq, duration = 150, type = "sine", delay = 0) {
  try {
    playTone.ctx = playTone.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = playTone.ctx;
    const start = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration / 1000);
  } catch (err) {
    // Web Audio indisponível — falha em silêncio
  }
}

function playKeySound() {
  playTone(420, 60, "sine");
}

function playSuccessSound() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    playTone(freq, 220, "sine", i * 0.12);
  });
}

function playErrorSound() {
  playTone(200, 260, "sawtooth");
}

function playUnlockSound() {
  [392, 523.25, 659.25].forEach((freq, i) => playTone(freq, 180, "triangle", i * 0.1));
}

// ------------------------------------------------------------------
// Confete (usado na vitória)
// ------------------------------------------------------------------
function resizeConfettiCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeConfettiCanvas);
resizeConfettiCanvas();

function launchConfetti() {
  const colors = ["#59d0ff", "#8b5cf6", "#4ade80", "#fbbf24", "#f87171"];
  const particles = Array.from({ length: 110 }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: -20 - Math.random() * confettiCanvas.height * 0.4,
    w: 5 + Math.random() * 5,
    h: 8 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    speedY: 2.5 + Math.random() * 3,
    speedX: (Math.random() - 0.5) * 2.2,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 12,
  }));

  let frame = 0;
  const maxFrames = 230;

  function animate() {
    frame += 1;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    particles.forEach((p) => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += p.rotationSpeed;

      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate((p.rotation * Math.PI) / 180);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  animate();
}

// ------------------------------------------------------------------
// Renderização
// ------------------------------------------------------------------
function updateDisplay() {
  const paddedValue = currentCode.padEnd(codeLength, "_");
  const formatted = paddedValue.split("").join(" ");
  codeDisplay.textContent = formatted;
}

function updateAttemptText() {
  attemptCounter.textContent = `${attempts} / ${maxAttempts}`;
}

function setStatus(text, tone = "neutral") {
  statusState.textContent = text;
  statusState.style.color =
    tone === "success" ? "#4ade80" :
    tone === "danger" ? "#f87171" :
    tone === "warning" ? "#fbbf24" : "#eaf6ff";
}

function shakeElement(el) {
  el.classList.remove("shake");
  // força reflow para permitir reiniciar a animação
  void el.offsetWidth;
  el.classList.add("shake");
}

function updateTensionState() {
  if (gameOver) {
    appShell.classList.remove("low-attempts");
    return;
  }
  const remaining = maxAttempts - attempts;
  appShell.classList.toggle("low-attempts", attempts > 0 && remaining <= 2);
}

// ------------------------------------------------------------------
// Lógica do jogo
// ------------------------------------------------------------------
/**
 * Avalia a tentativa contra o código correto usando o algoritmo clássico
 * de Mastermind (duas passadas). Isso garante que dígitos repetidos sejam
 * contados corretamente — por exemplo, se o código fosse "1123" e a
 * tentativa "1111", apenas dois "1" podem ser marcados como corretos.
 */
function evaluateGuess(guess) {
  const results = new Array(guess.length);
  const codeRemaining = secretCode.split('');

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secretCode[i]) {
      results[i] = { label: "POSIÇÃO CERTA", className: "success" };
      codeRemaining[i] = null;
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (results[i]) continue;
    const index = codeRemaining.indexOf(guess[i]);
    if (index !== -1) {
      results[i] = { label: "CERTA, MAS POSIÇÃO ERRADA", className: "warning" };
      codeRemaining[index] = null;
    } else {
      results[i] = { label: "ERRADO", className: "danger" };
    }
  }

  return {
    results,
    correct: results.every((result) => result.className === "success"),
  };
}

function triggerResultAnimation(type, message) {
  victoryOverlay.classList.remove("active", "success", "danger");
  void victoryOverlay.offsetWidth;

  victoryOverlay.classList.add(type, "active");
  victoryOverlay.querySelector(".victory-core").textContent = message;

  window.clearTimeout(triggerResultAnimation.timeoutId);
  triggerResultAnimation.timeoutId = window.setTimeout(() => {
    victoryOverlay.classList.remove("active", "success", "danger");
  }, 2600);
}

function renderHistory() {
  historyList.innerHTML = "";

  if (history.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "history-card empty";
    emptyCard.textContent = "Nenhuma tentativa registrada.";
    historyList.appendChild(emptyCard);
    return;
  }

  [...history].reverse().forEach((entry, reverseIndex) => {
    const actualIndex = history.length - reverseIndex;

    const card = document.createElement("div");
    card.className = `history-card ${entry.correct ? "success" : "error"}`;

    const header = document.createElement("div");
    header.className = "card-header";

    const label = document.createElement("span");
    label.className = "card-label";
    label.textContent = `Tentativa ${actualIndex}`;

    const code = document.createElement("div");
    code.className = "card-code";
    code.textContent = entry.value;

    header.appendChild(label);
    header.appendChild(code);

    const results = document.createElement("div");
    results.className = "card-results";

    entry.results.forEach((result, resultIndex) => {
      const row = document.createElement("div");
      row.className = `digit-row ${result.className}`;

      const digit = document.createElement("span");
      digit.className = "digit-box";
      digit.textContent = entry.value[resultIndex];

      const status = document.createElement("span");
      status.className = "digit-status";
      status.textContent = result.label;

      row.appendChild(digit);
      row.appendChild(status);
      results.appendChild(row);
    });

    card.appendChild(header);
    card.appendChild(results);
    historyList.appendChild(card);
  });
}

async function handleSubmit() {
  if (gameOver || !missionStarted) return;

  if (currentCode.length !== codeLength) {
    setStatus("Código incompleto", "warning");
    shakeElement(codeDisplay);
    return;
  }

  submitBtn.disabled = true;

  try {
    const data = evaluateGuess(currentCode);
    const { results, correct } = data;

    attempts += 1;
    updateAttemptText();

    history.push({ value: currentCode, correct, results });
    renderHistory();

    if (correct) {
      playSuccessSound();
      launchConfetti();
      triggerResultAnimation("success", "PARABÉNS CIENTISTA!!\nVOCÊ SALVOU O LABORATÓRIO!");
      setStatus("Acesso liberado", "success");
      endGame();
    } else if (attempts >= maxAttempts) {
      playErrorSound();
      shakeElement(codeDisplay);
      triggerResultAnimation("danger", "VOCÊ EXPLODIU O LABORATÓRIO");
      setStatus("Sistema bloqueado", "danger");
      endGame();
    } else {
      playErrorSound();
      shakeElement(codeDisplay);
      const remaining = maxAttempts - attempts;
      setStatus(`${remaining} tentativa(s) restante(s)`, "warning");
    }

    currentCode = "";
    updateDisplay();
    updateTensionState();
  } catch (error) {
    console.error(error);
  } finally {
    if (!gameOver) {
      submitBtn.disabled = false;
    }
  }
}

function endGame() {
  gameOver = true;
  disableInput();
  updateTensionState();
  endgameActions.classList.remove("hidden");
  restartBtn.focus();
}

function disableInput() {
  submitBtn.disabled = true;
  clearBtn.disabled = true;
  document.querySelectorAll(".key").forEach((button) => {
    button.disabled = true;
  });
}

function enableInput() {
  submitBtn.disabled = false;
  clearBtn.disabled = false;
  document.querySelectorAll(".key").forEach((button) => {
    button.disabled = false;
  });
}

function resetGame({ newMission = false } = {}) {
  attempts = 0;
  currentCode = "";
  history = [];
  gameOver = false;

  updateAttemptText();
  updateDisplay();
  renderHistory();
  enableInput();
  endgameActions.classList.add("hidden");
  updateTensionState();

  if (newMission) {
    setStatus("Novo código definido! Em análise", "success");
  } else {
    setStatus("Em análise", "neutral");
  }
}

function addDigit(digit) {
  if (gameOver || !missionStarted || currentCode.length >= codeLength) return;
  currentCode += digit;
  updateDisplay();
  setStatus("Digitação ativa", "neutral");
  playKeySound();
}

function removeDigit() {
  if (gameOver || !missionStarted || currentCode.length === 0) return;
  currentCode = currentCode.slice(0, -1);
  updateDisplay();
  playKeySound();
}

function buildKeypad() {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  digits.forEach((digit) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key";
    button.textContent = digit;
    button.setAttribute("aria-label", `Dígito ${digit}`);
    button.addEventListener("click", () => addDigit(digit));
    keypad.appendChild(button);
  });

  const backspaceBtn = document.createElement("button");
  backspaceBtn.type = "button";
  backspaceBtn.className = "key key-backspace";
  backspaceBtn.textContent = "⌫";
  backspaceBtn.setAttribute("aria-label", "Apagar último dígito");
  backspaceBtn.addEventListener("click", removeDigit);
  keypad.appendChild(backspaceBtn);
}

// ------------------------------------------------------------------
// Modais genéricos
// ------------------------------------------------------------------
function openModal(modal) {
  modal.classList.add("active");
}

function closeModal(modal) {
  modal.classList.remove("active");
}

function isAnyModalOpen() {
  return [helpModal, adminModal, newCodeModal].some((m) => m.classList.contains("active"));
}

// ------------------------------------------------------------------
// Missão (briefing inicial)
// ------------------------------------------------------------------
startMissionBtn.addEventListener("click", () => {
  closeModal(briefingModal);
  missionStarted = true;
  setStatus("Em análise", "neutral");
  playUnlockSound();
});

// ------------------------------------------------------------------
// Ajuda
// ------------------------------------------------------------------
helpBtn.addEventListener("click", () => openModal(helpModal));
closeHelpBtn.addEventListener("click", () => closeModal(helpModal));

// ------------------------------------------------------------------
// Painel do Administrador (só disponível após finalizar a partida)
// ------------------------------------------------------------------
changeCodeBtn.addEventListener("click", () => {
  adminPasswordInput.value = "";
  adminError.classList.add("hidden");
  openModal(adminModal);
  window.setTimeout(() => adminPasswordInput.focus(), 50);
});

cancelAdminBtn.addEventListener("click", () => closeModal(adminModal));

function attemptAdminLogin() {
  if (adminPasswordInput.value.trim() === adminPassword) {
    playUnlockSound();
    closeModal(adminModal);
    newCodeInput.value = "";
    newCodeError.classList.add("hidden");
    openModal(newCodeModal);
    window.setTimeout(() => newCodeInput.focus(), 50);
    return;
  }

  {
    playErrorSound();
    adminError.classList.remove("hidden");
    shakeElement(adminModalBox);
    adminPasswordInput.value = "";
    adminPasswordInput.focus();
  }
}

confirmAdminBtn.addEventListener("click", attemptAdminLogin);
adminPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") attemptAdminLogin();
});

// ------------------------------------------------------------------
// Definir novo código secreto
// ------------------------------------------------------------------
cancelNewCodeBtn.addEventListener("click", () => closeModal(newCodeModal));

newCodeInput.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, codeLength);
});

function confirmNewCode() {
  const value = newCodeInput.value;
  if (value.length !== codeLength || !/^\d+$/.test(value)) {
    newCodeError.classList.remove("hidden");
    shakeElement(newCodeModalBox);
    return;
  }

  secretCode = value;
  closeModal(newCodeModal);
  playUnlockSound();
  resetGame({ newMission: true });
}

confirmNewCodeBtn.addEventListener("click", confirmNewCode);
newCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") confirmNewCode();
});

// ------------------------------------------------------------------
// Eventos principais
// ------------------------------------------------------------------
submitBtn.addEventListener("click", handleSubmit);

clearBtn.addEventListener("click", () => {
  if (gameOver || !missionStarted) return;
  currentCode = "";
  updateDisplay();
  setStatus("Campo limpo", "neutral");
});

restartBtn.addEventListener("click", () => resetGame());

// Suporte a teclado físico: dígitos, Backspace e Enter (ignorado quando o
// foco está em um campo de texto de algum modal, ou enquanto a missão
// ainda não começou / um modal está aberto)
document.addEventListener("keydown", (event) => {
  if (document.activeElement && document.activeElement.tagName === "INPUT") return;

  if (event.key === "Escape") {
    if (adminModal.classList.contains("active")) closeModal(adminModal);
    else if (newCodeModal.classList.contains("active")) closeModal(newCodeModal);
    else if (helpModal.classList.contains("active")) closeModal(helpModal);
    return;
  }

  if (!missionStarted || isAnyModalOpen()) return;

  if (event.key >= "0" && event.key <= "9") {
    addDigit(event.key);
  } else if (event.key === "Backspace") {
    removeDigit();
  } else if (event.key === "Enter") {
    handleSubmit();
  }
});

// ------------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------------
updateDisplay();
updateAttemptText();
renderHistory();
buildKeypad();
