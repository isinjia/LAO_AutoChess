// Star grades for units and gear (both merge two copies, up to ★7):
//   ★1 bronze 1, ★2 bronze 2, ★3 silver 1, ★4 silver 2, ★5 gold 1, ★6 gold 2, ★7 one rainbow star
//   Stars.html(n) -> markup     Stars.medal(n) -> 'bronze' | 'silver' | 'gold' | 'rainbow'     Stars.count(n) -> 1 | 2
(function (root) {
  const MAX = 7;
  const medal = (n) => (n >= 7 ? 'rainbow' : n >= 5 ? 'gold' : n >= 3 ? 'silver' : 'bronze');
  const count = (n) => (n >= 7 ? 1 : 2 - (n % 2));
  const NAME = { bronze: '동', silver: '은', gold: '금', rainbow: '오색' };
  function html(n, cls = '') {
    n = Math.max(1, Math.min(MAX, n || 1));
    return `<span class="stars ${medal(n)}${cls ? ' ' + cls : ''}" title="${n}성 (${NAME[medal(n)]}별 ${count(n)}개)">${'<i>★</i>'.repeat(count(n))}</span>`;
  }
  const api = { MAX, medal, count, html };
  if (typeof module !== 'undefined') module.exports = api; else root.Stars = api;
})(this);
