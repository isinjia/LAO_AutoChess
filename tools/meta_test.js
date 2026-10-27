// Playthrough check (the packaged game): a bot plays the story from 1-1 to the ending, then the 2nd cycle, retrying a
// stage until it clears (as a player would). It reports the attempts per chapter and in total.
//   node tools/meta_test.js [saves] [maxTriesPerStage]
const path = require('path');
const J = (f) => path.join(__dirname, '..', 'js', f);
const roster = require(J('roster.js'));
const Meta = require(J('meta.js'));
const { playStage } = require('./stage_test.js');
const STORY = require(J('story.js'));
const LAST = STORY.total(), PER = STORY.PER_CHAPTER;
const A = +process.argv[2] || 3, MAX = +process.argv[3] || 30;

const sum = { 1: [], 2: [] };
for (let a = 1; a <= A; a++) {
  const m = Meta.memory(roster);
  m.setDeck(m.deck());
  for (const cycle of [1, 2]) {
    if (cycle === 2 && !m.newCycle()) break;
    const perCh = new Array(STORY.CHAPTERS.length).fill(0);
    let stuck = 0;
    for (let g = 1; g <= LAST; g++) {
      let tries = 0, cleared = false;
      while (!cleared && tries < MAX) {
        tries++;
        m.setDeck(m.partyDeck()); // the chapter's party first, like the game's first sortie of a chapter
        const st = playStage(g, m.data.unlocked, a * 100000 + cycle * 10000 + g * 100 + tries, m.upgrades(), { baseHp: m.baseHp(), deck: m.deck(), cycle });
        m.finishStage(g, st.cleared, st.cleared ? st.waves : st.wave - 1);
        cleared = st.cleared;
      }
      perCh[Math.floor((g - 1) / PER)] += tries;
      if (!cleared) { stuck = g; break; }
    }
    const total = perCh.reduce((x, y) => x + y, 0);
    sum[cycle].push(total);
    console.log(`save ${a} · ${cycle}회차: ${stuck ? `${STORY.at(stuck).code}에서 ${MAX}번 실패로 멈춤` : '엔딩 도달'} · 출격 ${total}회 | 챕터별 ${perCh.map((n, i) => `${i + 1}장 ${n}`).join(' ')}`);
  }
}
for (const c of [1, 2]) if (sum[c].length) console.log(`${c}회차 평균 출격 ${Math.round(sum[c].reduce((x, y) => x + y, 0) / sum[c].length)}회 (스테이지 ${LAST}개)`);
