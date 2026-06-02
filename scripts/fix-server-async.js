const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'server.js');
const lines = fs.readFileSync(file, 'utf8').split('\n');

const fns = [
  'readUsers', 'writeUsers', 'readPosts', 'writePosts', 'readMessages', 'writeMessages',
  'readGroups', 'writeGroups', 'readStands', 'writeStands', 'readStories', 'writeStories'
];

for (let i = 0; i < lines.length; i++) {
  if (/^\s*(async )?function \w+/.test(lines[i])) continue;
  for (const fn of fns) {
    lines[i] = lines[i].replace(new RegExp(`(?<!await )\\b${fn}\\(`, 'g'), `await ${fn}(`);
  }
}

let s = lines.join('\n');
s = s.replace(/await await /g, 'await ');

s = s.replace(
  /app\.(get|post|put|patch|delete)\('\/api\/([^']+)', requireAuth, \(req, res\) =>/g,
  "app.$1('/api/$2', requireAuth, asyncHandler(async (req, res) =>"
);
s = s.replace(/app\.post\('\/api\/register', \(req, res\) =>/, "app.post('/api/register', asyncHandler(async (req, res) =>");
s = s.replace(/app\.post\('\/api\/login', \(req, res\) =>/, "app.post('/api/login', asyncHandler(async (req, res) =>");
s = s.replace(/app\.get\('\/api\/user', \(req, res\) =>/, "app.get('/api/user', asyncHandler(async (req, res) =>");

const out = s.split('\n');
let inAsync = false;
for (let i = 0; i < out.length; i++) {
  if (out[i].includes('asyncHandler(async')) inAsync = true;
  if (inAsync && out[i] === '});') {
    let j = i + 1;
    while (j < out.length && out[j].trim() === '') j++;
    if (out[j] && out[j].startsWith('app.')) {
      out[i] = '}));';
      inAsync = false;
    }
  }
}

fs.writeFileSync(file, out.join('\n'));
console.log('done');
