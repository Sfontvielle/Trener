// Простые контурные иконки для макетов: <i data-i="bell"></i> → <svg class="i">…</svg>
const P = {
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevR: '<path d="M9.5 18l6-6-6-6"/>',
  chevL: '<path d="M14.5 18l-6-6 6-6"/>',
  chevUp: '<path d="M18 14.5l-6-6-6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 9v6M11 9v6M14 9v6M17 9v6"/>',
  edit: '<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5z"/><path d="M13 6.5l4.5 4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11"/>',
  fork: '<path d="M7 3.5V10a2 2 0 0 0 4 0V3.5M9 12v8.5M16.5 3.5c-2 1.5-2.5 5 0 8.5v8.5"/>',
  chart: '<path d="M5 20V12M10 20V5M15 20v-9M20 20v-5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>',
  repeat: '<path d="M16.5 3.5l3 3-3 3"/><path d="M4.5 11.5v-1a4 4 0 0 1 4-4h11"/><path d="M7.5 20.5l-3-3 3-3"/><path d="M19.5 12.5v1a4 4 0 0 1-4 4h-11"/>',
  steps: '<path d="M8 3.5c1.8 0 2.8 2.1 2.8 4.6S9.6 12.5 8 12.5 5.2 10.6 5.2 8.1 6.2 3.5 8 3.5zM6 15.5h4M16 8.5c1.8 0 2.8 2.1 2.8 4.6s-1.2 4.4-2.8 4.4-2.8-1.9-2.8-4.4 1-4.6 2.8-4.6zM14 20.5h4"/>',
  moon: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  coach: '<path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 19.8l1.2-4.4a8 8 0 1 1 15.3-3.9z"/><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01"/>',
  drop: '<path d="M12 3.5s5.5 6 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5.2 3.6-8.4.4 2 1.6 3 2.6 3.2C12.6 7.6 13 5 15 3c.6 3.8 3 6.2 3 10.4 0 4.3-2.4 7.6-6 7.6z"/>',
  bowl: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trophy: '<path d="M7.5 4.5h9v4a4.5 4.5 0 0 1-9 0zM7.5 6.5H4.5a3 3 0 0 0 3 4M16.5 6.5h3a3 3 0 0 1-3 4M12 13.5v3.5M8.5 20h7"/>',
  link: '<path d="M10 14l4-4M8.5 11.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M15.5 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2"/>',
};
document.querySelectorAll('i[data-i]').forEach((el) => {
  const name = el.getAttribute('data-i');
  const cls = ['i', ...(el.className ? el.className.split(' ') : [])].join(' ');
  el.outerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
});
// Шкалы: <div class="scale" data-v="0.64" style="--c: var(--protein)"></div>
document.querySelectorAll('.scale[data-v]').forEach((el) => {
  const v = Math.max(0, Math.min(1, Number(el.getAttribute('data-v'))));
  el.innerHTML = `<div class="track"><div class="fill" style="width:${(v * 100).toFixed(1)}%"></div></div>` + [25, 50, 75].map((t) => `<div class="tick" style="left:${t}%"></div>`).join('');
});
