import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const gitHash = execSync('git rev-parse HEAD').toString().trim();
  const gitAuthor = execSync('git log -1 --format=%an').toString().trim();
  const gitMessage = execSync('git log -1 --format=%s').toString().trim();
  const gitDate = execSync('git log -1 --format=%ai').toString().trim();

  const gitInfoPath = join(__dirname, '../dist/assets');
  const files = execSync(`find ${gitInfoPath} -name "index-*.js"`).toString().trim().split('\n');

  files.forEach(file => {
    if (!file) return;
    
    let content = readFileSync(file, 'utf8');
    content = content.replace(/__GIT_HASH__/g, gitHash);
    content = content.replace(/__GIT_AUTHOR__/g, gitAuthor);
    content = content.replace(/__GIT_MESSAGE__/g, gitMessage.replace(/"/g, '\\"'));
    content = content.replace(/__GIT_DATE__/g, gitDate);
    
    writeFileSync(file, content);
    console.log(`✓ Injected git info into ${file}`);
  });

  console.log('\nGit Info:');
  console.log(`  Hash: ${gitHash.substring(0, 7)}`);
  console.log(`  Author: ${gitAuthor}`);
  console.log(`  Message: ${gitMessage}`);
  console.log(`  Date: ${gitDate}`);
} catch (error) {
  console.error('Error injecting git info:', error.message);
  process.exit(1);
}
