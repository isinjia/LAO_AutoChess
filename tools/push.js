// Push to GitHub with the version bumped by 0.01 (js/version.js, shown on the title screen).
//   node tools/push.js            commit the bump ("버전 V0.52") and push the current branch
// Commit the work itself first; this only adds the version commit on top.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const file = path.join(root, 'js', 'version.js');
const src = fs.readFileSync(file, 'utf8');
const m = src.match(/v: 'V(\d+)\.(\d{2})'/);
if (!m) { console.error('js/version.js: no version'); process.exit(1); }
const next = (+m[1] * 100 + +m[2] + 1);
const v = `V${Math.floor(next / 100)}.${String(next % 100).padStart(2, '0')}`;
fs.writeFileSync(file, src.replace(m[0], `v: '${v}'`));
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
run('git add js/version.js');
run(`git commit -q -m "버전 ${v}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`);
run('git push -q origin HEAD');
console.log('pushed', v);
