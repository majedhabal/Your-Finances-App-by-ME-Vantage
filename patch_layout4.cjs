const fs = require('fs');
const file = 'src/components/Layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `<div className="w-full bg-neutral-100 rounded-full h-[4px] overflow-hidden">
                <div 
                  className="bg-[#A6DDB1] h-full rounded-full transition-all duration-500" 
                  style={{ width: \`\${Math.min(100, Math.max(0, ((profile.vantageAiTokens || 0) / getBaseMaxTokens(profile.subscriptionTier)) * 100))}%\` }} 
                />
              </div>`;

const replacement = `{(() => {
                const maxTokens = getBaseMaxTokens(profile.subscriptionTier);
                const remaining = typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
                const usedPct = maxTokens > 0 ? ((maxTokens - remaining) / maxTokens) * 100 : 0;
                
                let bgColorClass = "bg-[#A6DDB1]";
                if (usedPct >= 90) {
                  bgColorClass = "bg-red-700";
                } else if (usedPct >= 80) {
                  bgColorClass = "bg-yellow-600";
                }

                return (
                  <div className="w-full bg-neutral-100 rounded-full h-[4px] overflow-hidden">
                    <div 
                      className={\`h-full rounded-full transition-all duration-500 \${bgColorClass}\`}
                      style={{ width: \`\${Math.min(100, Math.max(0, (remaining / maxTokens) * 100))}%\` }} 
                    />
                  </div>
                );
              })()}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
