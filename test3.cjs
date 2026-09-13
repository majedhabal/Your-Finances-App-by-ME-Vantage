const fs = require('fs');
const content = fs.readFileSync('src/components/Analytics.tsx', 'utf8');
const lines = content.split('\n');

let openBraces = 0;
let inIIFE = false;

for (let i = 2600; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('{(() => {')) {
    inIIFE = true;
  }
  
  if (inIIFE) {
    if (line.match(/[ =\(]use[A-Z][a-zA-Z0-9]*\(/)) {
      console.log(`Found hook in IIFE at line ${i + 1}: ${line}`);
    }
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    openBraces += opens - closes;
    if (openBraces === 0) {
      console.log(`IIFE ends at line ${i + 1}`);
      break;
    }
  }
}
