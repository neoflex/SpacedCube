// Progress charts: SVG drawn at the container's real width so text keeps its true size.
// Mouse and touch show a tooltip; the same numbers are in the table below the charts.
import { S } from './state.js';
import { esc, dayKey, fmtDay } from './util.js';

let data = [];
let W = 720;
const PL = 36, PR = 8, PT = 10, PB = 26;

// Axis top with four whole-number steps.
function niceMax(v) {
  const raw = Math.max(1, v / 4), p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return Math.max(1, Math.round(m * p)) * 4;
  return 40 * p;
}

// One entry per day of the selected range; the level breakdown carries over days without a snapshot.
export function buildDays(state, range) {
  const daily = state.daily || {};
  const keys = Object.keys(daily).sort();
  if (!keys.length) return [];
  const end = new Date(); end.setHours(12, 0, 0, 0);
  let start = new Date(end); start.setDate(start.getDate() - (range - 1));
  const first = new Date(keys[0] + 'T12:00:00');
  if (range === 0 || first > start) start = first;
  const out = [];
  let carry = null;
  for (const k of keys) if (k < dayKey(start.getTime()) && daily[k].b) carry = daily[k];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d.getTime());
    const e = daily[k];
    if (e && e.b) carry = e;
    out.push({ k, n: e ? e.n : 0, ok: e ? e.ok : 0, b: carry ? carry.b : [0, 0, 0, 0, 0], act: carry ? carry.act : 0 });
  }
  return out;
}
export const setData = (d) => { data = d; };

function axes(n, H, max, fmtTick) {
  const pw = W - PL - PR, ph = H - PT - PB;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4, y = PT + ph - (ph * i) / 4;
    g += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" class="gl"/><text x="${PL - 6}" y="${y + 4}" class="tk" text-anchor="end">${fmtTick(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - PL) / 70))));
  for (let i = 0; i < n; i += step) {
    const x = PL + (pw * (i + 0.5)) / n;
    g += `<text x="${x}" y="${H - 8}" class="tk" text-anchor="middle">${fmtDay(data[i].k)}</text>`;
  }
  return g;
}
// Column with square base and rounded 4px top.
function col(x, y, w, h, fill) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z" fill="${fill}"/>`;
}
const svg = (H, label, body) => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" role="img" aria-label="${esc(label)}. The numbers are in the table below.">${body}</svg>`;
const hit = (kind, i, slot, ph) => `<rect x="${PL + slot * i}" y="${PT}" width="${slot}" height="${ph}" fill="transparent" data-tip="${kind}" data-i="${i}"/>`;

function levelChart() {
  const n = data.length, H = 240, pw = W - PL - PR, ph = H - PT - PB;
  const max = niceMax(Math.max(1, ...data.map((d) => d.act)));
  const slot = pw / n, bw = Math.min(24, slot * 0.7);
  let marks = '';
  data.forEach((d, i) => {
    const x = PL + slot * i + (slot - bw) / 2;
    let base = PT + ph;
    const order = [4, 3, 2, 1, 0];
    const top = order.filter((b) => d.b[b] > 0).pop();
    for (const b of order) {
      const h = (ph * d.b[b]) / max;
      if (h <= 0) continue;
      const y = base - h;
      const gapH = Math.max(0, h - (b === top ? 0 : 2));
      marks += b === top ? col(x, y, bw, h, `var(--m${b})`) : `<rect x="${x}" y="${y + 2}" width="${bw}" height="${gapH}" fill="var(--m${b})"/>`;
      base = y;
    }
    marks += hit('lv', i, slot, ph);
  });
  return svg(H, 'Cases in practice by level, per day', axes(n, H, max, (v) => Math.round(v)) + marks);
}

function attemptsChart() {
  const n = data.length, H = 170, pw = W - PL - PR, ph = H - PT - PB;
  const max = niceMax(Math.max(1, ...data.map((d) => d.n)));
  const slot = pw / n, bw = Math.min(24, slot * 0.7);
  let marks = '';
  data.forEach((d, i) => {
    const x = PL + slot * i + (slot - bw) / 2, h = (ph * d.n) / max;
    marks += col(x, PT + ph - h, bw, h, 'var(--accent)') + hit('at', i, slot, ph);
  });
  return svg(H, 'Attempts per day', axes(n, H, max, (v) => Math.round(v)) + marks);
}

function successChart() {
  const n = data.length, H = 170, pw = W - PL - PR, ph = H - PT - PB;
  const slot = pw / n;
  const pts = data.map((d, i) => (d.n ? { x: PL + slot * (i + 0.5), y: PT + ph - (ph * d.ok) / d.n, i } : null));
  let path = '', area = '', run = [];
  const flush = () => {
    if (run.length > 1) {
      path += `<path d="M${run.map((p) => p.x + ',' + p.y).join('L')}" fill="none" stroke="var(--good)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      area += `<path d="M${run[0].x},${PT + ph}L${run.map((p) => p.x + ',' + p.y).join('L')}L${run[run.length - 1].x},${PT + ph}Z" fill="var(--good)" opacity=".1"/>`;
    }
    run = [];
  };
  pts.forEach((p) => { if (p) run.push(p); else flush(); });
  flush();
  let dots = '';
  pts.forEach((p) => { if (p) dots += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--good)" stroke="var(--surface)" stroke-width="2"/>`; });
  let hits = '';
  data.forEach((d, i) => { hits += hit('sr', i, slot, ph); });
  return svg(H, 'Success rate per day', axes(n, H, 100, (v) => v + '%') + area + path + dots + hits);
}

function tipHtml(kind, i) {
  const { C } = S;
  const d = data[i];
  const head = `<b>${esc(fmtDay(d.k, true))}</b>`;
  if (kind === 'lv') {
    const rows = [4, 3, 2, 1, 0].filter((b) => d.b[b]).map((b) => `<span><i class="sw" style="background:var(--m${b})"></i>${C.BUCKETS[b]}</span><span>${d.b[b]}</span>`).join('');
    return `${head}<div class="tg">${rows || '<span>Nothing in practice</span><span></span>'}<span>In practice</span><span>${d.act}</span></div>`;
  }
  if (kind === 'at') return `${head}<div class="tg"><span>Attempts</span><span>${d.n}</span><span>Correct</span><span>${d.ok}</span></div>`;
  return `${head}<div class="tg"><span>Success</span><span>${d.n ? Math.round((100 * d.ok) / d.n) + '%' : 'no attempts'}</span><span>Attempts</span><span>${d.n}</span></div>`;
}

export function fillCharts() {
  if (!data.length) return;
  const draw = { lv: levelChart, at: attemptsChart, sr: successChart };
  document.querySelectorAll('.chartwrap[data-chart]').forEach((wrap) => {
    W = Math.max(260, Math.floor(wrap.clientWidth));
    const old = wrap.querySelector('svg'); if (old) old.remove();
    wrap.insertAdjacentHTML('afterbegin', draw[wrap.dataset.chart]());
  });
}

function showTip(e) {
  const t = e.target.closest && e.target.closest('[data-tip]');
  document.querySelectorAll('.chartwrap .tip').forEach((tip) => { if (!t || !tip.parentElement.contains(t)) tip.hidden = true; });
  document.querySelectorAll('.chart .hl').forEach((el) => el.remove());
  if (!t) return;
  const wrap = t.closest('.chartwrap'), tip = wrap.querySelector('.tip');
  tip.innerHTML = tipHtml(t.dataset.tip, Number(t.dataset.i));
  tip.hidden = false;
  const hl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  ['x', 'y', 'width', 'height'].forEach((a) => hl.setAttribute(a, t.getAttribute(a)));
  hl.setAttribute('class', 'hl');
  t.parentNode.insertBefore(hl, t.parentNode.firstChild.nextSibling);
  const wr = wrap.getBoundingClientRect(), tr = t.getBoundingClientRect();
  let left = tr.left - wr.left + tr.width / 2 + 12;
  if (left + tip.offsetWidth > wr.width) left = tr.left - wr.left + tr.width / 2 - tip.offsetWidth - 12;
  tip.style.left = Math.max(0, left) + 'px';
  tip.style.top = '8px';
}

export function listenCharts() {
  document.addEventListener('mousemove', (e) => { if (S.view === 'progress') showTip(e); });
  document.addEventListener('click', (e) => { if (S.view === 'progress' && e.target.closest('[data-tip]')) showTip(e); });
  let timer = null;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (S.view === 'progress') fillCharts(); }, 150); });
}
