const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let hasReturn = false;
  let returnLine = -1;
  let componentStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if we enter the component body, simple heuristic
    if (line.match(/export const [A-Z]/) || line.match(/export default function [A-Z]/) || line.match(/const [A-Z][a-zA-Z0-9]*[ =]+(?:React\.memo|\(|<)/)) {
      hasReturn = false;
      componentStart = i + 1;
    }
    
    // Check for early returns (top level usually indented by 2 spaces)
    if ((line.match(/^  if \(/) && line.includes('return')) || line.match(/^  return /)) {
      if (!hasReturn) {
         hasReturn = true;
         returnLine = i + 1;
      }
    }
    
    // Check for hooks
    if (line.match(/[ =\(]use[A-Z][a-zA-Z0-9]*\(/)) {
      if (hasReturn) {
        console.log(`Found hook after return in ${filePath} at line ${i + 1}. Return was at ${returnLine} for component starting at ${componentStart}`);
      }
    }
  }
}

const dir = 'src/components';
const files = fs.readdirSync(dir);
for (const file of files) {
  if (file.endsWith('.tsx')) {
    checkFile(path.join(dir, file));
  }
}
