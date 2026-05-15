const clockEl = document.getElementById('clock');
const alarmInput = document.getElementById('alarm-time');
const setBtn = document.getElementById('set-btn');
const stopBtn = document.getElementById('stop-btn');
const statusEl = document.getElementById('status');

let alarmTime = null;
let audioCtx = null;
let beepInterval = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function getNow() {
  const d = new Date();
  return {
    hhmm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    hhmmss: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

function beep() {
  if (!audioCtx) audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.6);
}

function startRinging() {
  document.body.classList.add('ringing');
  statusEl.textContent = '⏰ アラーム！';
  statusEl.className = 'status ringing';
  stopBtn.disabled = false;
  setBtn.disabled = true;
  beep();
  beepInterval = setInterval(beep, 1500);
}

function stopRinging() {
  clearInterval(beepInterval);
  beepInterval = null;
  alarmTime = null;
  document.body.classList.remove('ringing');
  statusEl.textContent = 'アラーム未設定';
  statusEl.className = 'status';
  stopBtn.disabled = true;
  setBtn.disabled = false;
  alarmInput.value = '';
}

setBtn.addEventListener('click', () => {
  const val = alarmInput.value;
  if (!val) return;
  alarmTime = val;
  statusEl.textContent = `${val} にアラームをセット`;
  statusEl.className = 'status active';
  stopBtn.disabled = false;
});

stopBtn.addEventListener('click', stopRinging);

setInterval(() => {
  const { hhmm, hhmmss } = getNow();
  clockEl.textContent = hhmmss;
  if (alarmTime && hhmm === alarmTime && !beepInterval) {
    startRinging();
  }
}, 1000);
