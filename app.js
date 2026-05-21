const clockEl   = document.getElementById('clock');
const dateEl    = document.getElementById('date');
const alarmInput = document.getElementById('alarm-time');
const addBtn    = document.getElementById('add-btn');
const alarmList = document.getElementById('alarm-list');
const emptyMsg  = document.getElementById('empty-msg');
const overlay   = document.getElementById('overlay');
const overlayTime  = document.getElementById('overlay-time');
const overlayLabel = document.getElementById('overlay-label');
const snoozeBtn = document.getElementById('snooze-btn');
const stopBtn   = document.getElementById('stop-btn');

let alarms = [];      // { id, hhmm, enabled, snoozedUntil }
let audioCtx = null;
let beepInterval = null;
let ringingId = null;

const DAYS = ['日','月','火','水','木','金','土'];

function pad(n) { return String(n).padStart(2, '0'); }

function getNow() {
  const d = new Date();
  return {
    hhmm:   `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    hhmmss: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    dateStr: `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${DAYS[d.getDay()]}）`,
    ms: d.getTime(),
  };
}

function beep() {
  if (!audioCtx) audioCtx = new AudioContext();
  const osc  = audioCtx.createOscillator();
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

function startRinging(alarm) {
  ringingId = alarm.id;
  overlayTime.textContent  = alarm.hhmm;
  overlayLabel.textContent = alarm.snoozedUntil ? 'スヌーズ後のアラーム' : '';
  overlay.classList.remove('hidden');
  beep();
  beepInterval = setInterval(beep, 1500);
}

function stopRinging() {
  clearInterval(beepInterval);
  beepInterval = null;
  ringingId = null;
  overlay.classList.add('hidden');
  renderList();
}

stopBtn.addEventListener('click', stopRinging);

snoozeBtn.addEventListener('click', () => {
  const alarm = alarms.find(a => a.id === ringingId);
  if (alarm) {
    alarm.snoozedUntil = Date.now() + 5 * 60 * 1000;
  }
  stopRinging();
});

addBtn.addEventListener('click', () => {
  const val = alarmInput.value;
  if (!val) return;
  alarms.push({ id: Date.now(), hhmm: val, enabled: true, snoozedUntil: null });
  alarmInput.value = '';
  renderList();
});

function renderList() {
  alarmList.innerHTML = '';
  if (alarms.length === 0) {
    alarmList.appendChild(emptyMsg);
    return;
  }
  alarms
    .slice()
    .sort((a, b) => a.hhmm.localeCompare(b.hhmm))
    .forEach(alarm => {
      const li = document.createElement('li');
      li.className = `alarm-item${alarm.enabled ? '' : ' disabled'}${alarm.snoozedUntil ? ' snoozed' : ''}`;
      li.dataset.id = alarm.id;

      const snoozeText = alarm.snoozedUntil
        ? `スヌーズ中 → ${formatSnoozedTime(alarm.snoozedUntil)}`
        : '';

      li.innerHTML = `
        <div style="flex:1">
          <div class="alarm-time-display">${alarm.hhmm}</div>
          <div class="alarm-meta${alarm.snoozedUntil ? ' snooze-info' : ''}">${snoozeText}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${alarm.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <button class="delete-btn" title="削除">✕</button>
      `;

      li.querySelector('input[type=checkbox]').addEventListener('change', e => {
        alarm.enabled = e.target.checked;
        alarm.snoozedUntil = null;
        renderList();
      });

      li.querySelector('.delete-btn').addEventListener('click', () => {
        alarms = alarms.filter(a => a.id !== alarm.id);
        renderList();
      });

      alarmList.appendChild(li);
    });
}

function formatSnoozedTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Clock tick & alarm check
setInterval(() => {
  const { hhmm, hhmmss, dateStr, ms } = getNow();
  clockEl.textContent = hhmmss;
  dateEl.textContent  = dateStr;

  if (beepInterval) return; // already ringing

  for (const alarm of alarms) {
    if (!alarm.enabled) continue;

    if (alarm.snoozedUntil) {
      if (ms >= alarm.snoozedUntil) {
        alarm.snoozedUntil = null;
        startRinging(alarm);
        renderList();
      }
      continue;
    }

    if (alarm.hhmm === hhmm) {
      startRinging(alarm);
      break;
    }
  }
}, 1000);

// Initial render
renderList();
