const fs = require('fs');
const content = fs.readFileSync('src/components/Analytics.tsx', 'utf8');
const lines = content.split('\n');

let openBraces = 0;
let inRenderPastTab = false;

for (let i = 1148; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('const renderPastTab = () => {')) {
    inRenderPastTab = true;
  }
  
  if (inRenderPastTab) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    openBraces += opens - closes;
    if (openBraces === 0) {
      console.log(`renderPastTab ends at line ${i + 1}`);
      break;
    }
  }
}
