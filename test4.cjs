const fs = require('fs');
const content = fs.readFileSync('src/components/Analytics.tsx', 'utf8');
const lines = content.split('\n');

for (let i = 0; i < 1750; i++) {
  const line = lines[i];
  if (line.includes('return') && !line.includes('return (') && !line.includes('return ()') && !line.match(/return [a-zA-Z0-9_]+;/)) {
    console.log(`Line ${i + 1}: ${line}`);
  }
}
