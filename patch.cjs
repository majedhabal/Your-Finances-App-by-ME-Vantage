const fs = require('fs');
const file = 'src/components/ShouldIBuyThis.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `  // Evaluate query with online price check & work hours calculation
  const handleEvaluate = async (overrideText?: string) => {
    const textToEvaluate = overrideText || queryInput;
    if (!textToEvaluate.trim()) return;

    setIsEvaluating(true);
    setVerdictData(null);`;

const replacement1 = `  // Evaluate query with online price check & work hours calculation
  const handleEvaluate = async (overrideText?: string) => {
    const textToEvaluate = overrideText || queryInput;
    if (!textToEvaluate.trim()) return;

    const tokenCost = 6500;
    if (currentTokens < tokenCost) {
      alert(\`No Vantage AI tokens remaining! This request requires \${tokenCost} tokens, but you only have \${currentTokens} remaining.\`);
      return;
    }

    setIsEvaluating(true);
    setVerdictData(null);`;

content = content.replace(target1, replacement1);

const target2 = `        if (data && data.price) {
          itemName = data.itemName || textToEvaluate;`;

const replacement2 = `        // Decrement tokens dynamically on successful fetch
        if (profile?.uid) {
          const userRef = doc(db, 'users', profile.uid);
          const nextTokens = Math.max(0, currentTokens - 6500);
          updateDoc(userRef, { vantageAiTokens: nextTokens }).catch(err => console.error(err));
        }

        if (data && data.price) {
          itemName = data.itemName || textToEvaluate;`;

content = content.replace(target2, replacement2);

fs.writeFileSync(file, content);
