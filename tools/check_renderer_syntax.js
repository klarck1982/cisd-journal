/**
 * Syntax-checks every renderer module.
 *
 * The renderer is split into ordered <script> files rather than one large file, so a
 * single `node --check renderer/app.js` no longer covers it. This walks the directory
 * so a newly added module can never escape the check by being forgotten here.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'renderer', 'app');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort();

if (!files.length) {
  console.error('Renderer syntax: FAIL (no modules found in renderer/app)');
  process.exit(1);
}

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'pipe' });
  } catch (error) {
    console.error(`Renderer syntax: FAIL in ${file}`);
    console.error(error.stderr?.toString() || error.message);
    process.exit(1);
  }
}

console.log(`Renderer syntax: PASS (${files.length} modules)`);
