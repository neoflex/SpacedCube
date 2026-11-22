// Progress: totals, charts and the same numbers as a table.
import { S, snapshotToday, render } from './state.js';
import { esc, dayKey, fmtDay } from './util.js';
import { buildDays, setData } from './charts.js';
import { onAction } from './actions.js';

const ORDER = [4, 3, 2, 1, 0];

export function progressView() {
  const { C, state } = S;
  snapshotToday();
  const days = buildDays(state, S.range);
  setData(days);
  const N = C.CASE_IDS.length;
  const daily = state.daily || {};
  const tk = dayKey();
  const today = daily[tk] || { n: 0, ok: 0 };
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
  const wk = dayKey(weekAgo.getTime());
  let wn = 0, wok = 0;
  for (const k in daily) if (k >= wk) { wn += daily[k].n; wok += daily[k].ok; }
  const mastered = C.activeIds(state).filter((id) => C.bucketOf(state.cases[id].level) === 4).length;
  const prev = Object.keys(daily).sort().filter((k) => k < wk).pop();
  const mDelta = prev && daily[prev].b ? mastered - daily[prev].b[4] : null;
  const chipR = (v, t) => `<button type="button" class="fchip" data-action="range" data-r="${v}" aria-pressed="${S.range === v}">${t}</button>`;
  const title = `<h1 class="view-title sr-only" id="view-title" tabindex="-1">${C.name} progress</h1>`;
  const tiles = `<ul class="tiles" role="list">
    <li class="card tile"><span>Today</span><b>${today.n}</b><small>${today.n ? Math.round((100 * today.ok) / today.n) + '% correct' : 'no attempts yet'}</small></li>
    <li class="card tile"><span>Last 7 days</span><b>${wn}</b><small>${wn ? Math.round((100 * wok) / wn) + '% correct' : 'no attempts'}</small></li>
    <li class="card tile"><span>Mastered</span><b>${mastered}<em>/${N}</em></b><small>${mDelta == null ? 'cases at level 7 or more' : (mDelta >= 0 ? '+' : '') + mDelta + ' in the last 7 days'}</small></li>
  </ul>`;
  if (!days.length) {
    return `${title}<section class="progress">${tiles}<div class="card empty"><h2>No history yet</h2><p class="muted">Charts start with your next practice attempt in ${C.name}. Earlier practice was not logged by day.</p></div></section>`;
  }
  const legend = ORDER.map((b) => `<span><i style="background:var(--m${b})" aria-hidden="true"></i>${C.BUCKETS[b]}</span>`).join('');
  const rows = days.slice().reverse().filter((d) => d.n || d.k === tk).map((d) => `<tr><th scope="row">${esc(fmtDay(d.k, true))}</th><td>${d.n}</td><td>${d.n ? Math.round((100 * d.ok) / d.n) + '%' : '–'}</td>${ORDER.map((b) => `<td>${d.b[b]}</td>`).join('')}</tr>`).join('');
  const card = (kind, h, sub, extra = '') => `<section class="card chartcard" aria-labelledby="ch-${kind}"><h2 id="ch-${kind}">${h}</h2><p class="sub">${sub}</p>${extra}<div class="chartwrap" data-chart="${kind}"><div class="tip" hidden></div></div></section>`;
  return `${title}<section class="progress">
    ${tiles}
    <div class="toolbar"><div class="row" role="group" aria-label="Period">${chipR(14, '14 days')}${chipR(30, '30 days')}${chipR(90, '90 days')}${chipR(0, 'All')}</div>
      ${days.length < 3 ? '<span class="muted" style="font-size:13px">History starts on your first logged day and fills in as you practise.</span>' : ''}</div>
    ${card('lv', 'Cases by level', `${C.name} cases in practice at the end of each day`, `<div class="legend" aria-hidden="true">${legend}</div>`)}
    <div class="charts2">
      ${card('at', 'Attempts per day', 'Every graded scramble, including misses')}
      ${card('sr', 'Success rate', 'Share of attempts marked Got it, without help')}
    </div>
    <details class="card"><summary>Show as a table</summary><div class="tablewrap" tabindex="0" role="region" aria-label="Daily progress table"><table>
      <caption class="sr-only">Daily attempts, success rate and cases by level, most recent first</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">Attempts</th><th scope="col">Success</th>${ORDER.map((b) => `<th scope="col">${C.BUCKETS[b]}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div></details>
  </section>`;
}

onAction({
  range: (el) => { S.range = Number(el.dataset.r); render(); },
});
