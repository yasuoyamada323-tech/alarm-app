// J-Quants API ベースURL
const API_BASE = 'https://api.jquants.com/v1';

// --- アプリ状態 ---
let idToken = null;
let priceChart = null;
let volumeChart = null;
let candleSeries = null;
let volumeSeries = null;
let maSeries = {};
let isSyncing = false;

// --- トークン管理 ---
function saveRefreshToken(token) {
  localStorage.setItem('jq_refresh_token', token);
}
function loadRefreshToken() {
  return localStorage.getItem('jq_refresh_token');
}
function clearTokens() {
  localStorage.removeItem('jq_refresh_token');
  idToken = null;
}

// --- J-Quants API ---
async function apiGetRefreshToken(email, password) {
  const res = await fetch(`${API_BASE}/token/auth_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailaddress: email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `認証エラー (${res.status})`);
  }
  const data = await res.json();
  return data.refreshToken;
}

async function apiGetIdToken(refreshToken) {
  const res = await fetch(
    `${API_BASE}/token/auth_refresh?refreshtoken=${encodeURIComponent(refreshToken)}`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`トークン更新エラー (${res.status})`);
  const data = await res.json();
  return data.idToken;
}

async function apiRequest(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 401) {
    // トークン期限切れ → リフレッシュ
    const refreshToken = loadRefreshToken();
    if (refreshToken) {
      idToken = await apiGetIdToken(refreshToken);
      return apiRequest(path, params);
    }
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) throw new Error(`APIエラー (${res.status})`);
  return res.json();
}

async function fetchDailyQuotes(code, from, to) {
  const data = await apiRequest('/prices/daily_quotes', { code, from, to });
  return data.daily_quotes || [];
}

async function fetchListedInfo(code) {
  const data = await apiRequest('/listed/info', { code }).catch(() => null);
  return data?.info?.[0] || null;
}

// --- 移動平均計算 ---
function calcMA(candles, period) {
  const result = [];
  for (let i = period - 1; i < candles.length; i++) {
    const sum = candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0);
    result.push({ time: candles[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return result;
}

// --- 日付ユーティリティ ---
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toAPIDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function setDateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  document.getElementById('date-to').value = formatDate(to);
  document.getElementById('date-from').value = formatDate(from);
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '―';
  return new Intl.NumberFormat('ja-JP').format(n);
}

function formatYen(n) {
  if (n == null || isNaN(n)) return '―';
  return `¥${new Intl.NumberFormat('ja-JP').format(n)}`;
}

function formatTurnover(n) {
  if (n == null || isNaN(n)) return '―';
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}億円`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}万円`;
  return `${formatNumber(n)}円`;
}

// --- UI ヘルパー ---
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// --- チャート初期化 ---
const CHART_COLORS = {
  background: '#0d1117',
  text: '#8b949e',
  grid: '#21262d',
  border: '#30363d',
  up: '#f85149',
  down: '#388bfd',
  ma5: '#f0b429',
  ma25: '#3fb950',
  ma75: '#a371f7',
  volumeUp: 'rgba(248, 81, 73, 0.5)',
  volumeDown: 'rgba(56, 139, 253, 0.5)',
};

function getChartBaseOptions() {
  return {
    layout: {
      background: { color: CHART_COLORS.background },
      textColor: CHART_COLORS.text,
    },
    grid: {
      vertLines: { color: CHART_COLORS.grid },
      horzLines: { color: CHART_COLORS.grid },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: CHART_COLORS.border },
    timeScale: { borderColor: CHART_COLORS.border, timeVisible: false },
    handleScroll: true,
    handleScale: true,
  };
}

function destroyCharts() {
  if (priceChart) { priceChart.remove(); priceChart = null; }
  if (volumeChart) { volumeChart.remove(); volumeChart = null; }
  candleSeries = null;
  volumeSeries = null;
  maSeries = {};
}

function initCharts() {
  destroyCharts();

  const priceEl = document.getElementById('price-chart');
  const volumeEl = document.getElementById('volume-chart');

  priceChart = LightweightCharts.createChart(priceEl, {
    ...getChartBaseOptions(),
    height: 400,
    timeScale: { ...getChartBaseOptions().timeScale, visible: false },
  });

  volumeChart = LightweightCharts.createChart(volumeEl, {
    ...getChartBaseOptions(),
    height: 120,
    timeScale: { borderColor: CHART_COLORS.border, timeVisible: true },
  });

  // 価格チャートシリーズ
  candleSeries = priceChart.addCandlestickSeries({
    upColor: CHART_COLORS.up,
    downColor: CHART_COLORS.down,
    borderUpColor: CHART_COLORS.up,
    borderDownColor: CHART_COLORS.down,
    wickUpColor: CHART_COLORS.up,
    wickDownColor: CHART_COLORS.down,
  });

  // 移動平均
  maSeries.ma5 = priceChart.addLineSeries({
    color: CHART_COLORS.ma5, lineWidth: 1, priceLineVisible: false,
  });
  maSeries.ma25 = priceChart.addLineSeries({
    color: CHART_COLORS.ma25, lineWidth: 1, priceLineVisible: false,
  });
  maSeries.ma75 = priceChart.addLineSeries({
    color: CHART_COLORS.ma75, lineWidth: 1.5, priceLineVisible: false,
  });

  // 出来高チャートシリーズ
  volumeSeries = volumeChart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  });
  volumeChart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.2, bottom: 0 },
  });

  // タイムスケール同期
  priceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (isSyncing || !range) return;
    isSyncing = true;
    volumeChart.timeScale().setVisibleLogicalRange(range);
    isSyncing = false;
  });
  volumeChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (isSyncing || !range) return;
    isSyncing = true;
    priceChart.timeScale().setVisibleLogicalRange(range);
    isSyncing = false;
  });

  // リサイズ対応
  const resizeObserver = new ResizeObserver(() => {
    if (priceChart) priceChart.applyOptions({ width: priceEl.clientWidth });
    if (volumeChart) volumeChart.applyOptions({ width: volumeEl.clientWidth });
  });
  resizeObserver.observe(priceEl);
}

// --- チャート描画 ---
function renderChart(quotes) {
  const candles = quotes
    .map(q => ({
      time: q.Date,
      open: q.AdjustmentOpen || q.Open,
      high: q.AdjustmentHigh || q.High,
      low: q.AdjustmentLow || q.Low,
      close: q.AdjustmentClose || q.Close,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const volumes = quotes
    .map(q => ({
      time: q.Date,
      value: q.AdjustmentVolume || q.Volume,
      color: (q.AdjustmentClose || q.Close) >= (q.AdjustmentOpen || q.Open)
        ? CHART_COLORS.volumeUp
        : CHART_COLORS.volumeDown,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  candleSeries.setData(candles);
  volumeSeries.setData(volumes);
  maSeries.ma5.setData(calcMA(candles, 5));
  maSeries.ma25.setData(calcMA(candles, 25));
  maSeries.ma75.setData(calcMA(candles, 75));

  priceChart.timeScale().fitContent();
  volumeChart.timeScale().fitContent();
}

// --- 銘柄情報更新 ---
function updateStockInfo(quotes, info) {
  const sorted = [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const close = last.AdjustmentClose || last.Close;
  const open = last.AdjustmentOpen || last.Open;
  const high = last.AdjustmentHigh || last.High;
  const low = last.AdjustmentLow || last.Low;
  const volume = last.AdjustmentVolume || last.Volume;
  const prevClose = prev ? (prev.AdjustmentClose || prev.Close) : null;

  document.getElementById('company-name').textContent = info?.CompanyName || '銘柄情報なし';
  document.getElementById('stock-code-tag').textContent = last.Code || '';
  document.getElementById('market-tag').textContent = info?.MarketProductCategory || '';
  document.getElementById('sector-tag').textContent = info?.Sector17CodeName || '';

  document.getElementById('current-price').textContent = formatYen(close);
  document.getElementById('open-price').textContent = formatYen(open);
  document.getElementById('high-price').textContent = formatYen(high);
  document.getElementById('low-price').textContent = formatYen(low);
  document.getElementById('volume-display').textContent = formatNumber(volume);
  document.getElementById('turnover-display').textContent = formatTurnover(last.TurnoverValue);

  const changeEl = document.getElementById('price-change');
  if (prevClose) {
    const diff = close - prevClose;
    const pct = (diff / prevClose) * 100;
    const sign = diff >= 0 ? '+' : '';
    changeEl.textContent = `${sign}${formatNumber(Math.round(diff * 10) / 10)} (${sign}${pct.toFixed(2)}%)`;
    changeEl.className = `price-delta ${diff >= 0 ? 'up' : 'down'}`;
  } else {
    changeEl.textContent = '―';
    changeEl.className = 'price-delta';
  }

  show('stock-info');
}

// --- 検索処理 ---
async function handleSearch() {
  const code = document.getElementById('stock-code').value.trim();
  const from = document.getElementById('date-from').value;
  const to = document.getElementById('date-to').value;

  hide('app-error');

  if (!code) { setError('app-error', '銘柄コードを入力してください'); return; }
  if (!from || !to) { setError('app-error', '期間を指定してください'); return; }
  if (from > to) { setError('app-error', '開始日は終了日より前に設定してください'); return; }

  hide('stock-info');
  hide('chart-container');
  show('loading');

  try {
    const [quotes, info] = await Promise.all([
      fetchDailyQuotes(code, toAPIDate(from), toAPIDate(to)),
      fetchListedInfo(code),
    ]);

    if (!quotes.length) {
      throw new Error('データが見つかりませんでした。銘柄コードと期間を確認してください。');
    }

    hide('loading');
    show('chart-container');
    initCharts();
    renderChart(quotes);
    updateStockInfo(quotes, info);

  } catch (err) {
    hide('loading');
    if (err.message === 'SESSION_EXPIRED') {
      setError('app-error', '認証が切れました。再ログインしてください。');
      setTimeout(() => { clearTokens(); showLoginScreen(); }, 2000);
    } else {
      setError('app-error', err.message);
    }
  }
}

// --- MA トグル ---
function setupMAToggles() {
  ['ma5', 'ma25', 'ma75'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      maSeries[id]?.applyOptions({ visible: e.target.checked });
    });
  });
}

// --- 画面切替 ---
function showLoginScreen() {
  hide('app-screen');
  show('login-screen');
  destroyCharts();
}

function showAppScreen() {
  hide('login-screen');
  show('app-screen');
}

// --- ログイン ---
async function handleLogin() {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const btn = document.getElementById('login-btn');

  hide('login-error');

  if (!email || !password) {
    setError('login-error', 'メールアドレスとパスワードを入力してください');
    return;
  }

  btn.textContent = 'ログイン中...';
  btn.disabled = true;

  try {
    const refreshToken = await apiGetRefreshToken(email, password);
    saveRefreshToken(refreshToken);
    idToken = await apiGetIdToken(refreshToken);
    showAppScreen();
  } catch (err) {
    setError('login-error', err.message);
  } finally {
    btn.textContent = 'ログイン';
    btn.disabled = false;
  }
}

// --- クイック期間ボタン ---
function setupQuickRange() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setDateRange(parseInt(btn.dataset.days));
    });
  });
}

// --- アプリ初期化 ---
async function init() {
  // デフォルト期間: 6ヶ月
  setDateRange(180);
  setupQuickRange();
  setupMAToggles();

  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens();
    showLoginScreen();
  });
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('stock-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });

  // セッション復元（config.js のトークン → localStorage の順で試みる）
  const configToken = window.APP_CONFIG?.refreshToken;
  const storedToken = loadRefreshToken();
  const refreshToken = configToken || storedToken;

  if (refreshToken) {
    try {
      idToken = await apiGetIdToken(refreshToken);
      if (configToken) saveRefreshToken(configToken);
      showAppScreen();
    } catch {
      clearTokens();
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }
}

document.addEventListener('DOMContentLoaded', init);
