const fs = require('fs');
const file = 'src/components/Layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `          {profile?.uid && (
            <div className="w-full px-4 pb-3 flex flex-col gap-1.5">
              <div className="flex justify-between items-center w-full">
                <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1">
                  <Sparkles size={12} className="text-[#A6DDB1]" /> Vantage AI Tokens
                </span>
                <span className="text-[11px] font-mono font-bold text-[#A6DDB1]">
                  {typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens.toLocaleString() : '0'} / {getBaseMaxTokens(profile.subscriptionTier).toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-[4px] overflow-hidden">
                <div 
                  className="bg-[#A6DDB1] h-full rounded-full transition-all duration-500" 
                  style={{ width: \`\${Math.min(100, Math.max(0, ((profile.vantageAiTokens || 0) / getBaseMaxTokens(profile.subscriptionTier)) * 100))}%\` }} 
                />
              </div>
            </div>
          )}`;

const replacement = `          {profile?.uid && (
            <div className="w-full px-4 pb-3 flex flex-col gap-1.5">
              <div className="flex justify-between items-center w-full">
                <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1">
                  <Sparkles size={12} className="text-[#A6DDB1]" /> Vantage AI Tokens
                </span>
                <span className="text-[11px] font-mono font-bold text-[#A6DDB1]">
                  {typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens.toLocaleString() : '0'} / {getBaseMaxTokens(profile.subscriptionTier).toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-[4px] overflow-hidden">
                <div 
                  className="bg-[#A6DDB1] h-full rounded-full transition-all duration-500" 
                  style={{ width: \`\${Math.min(100, Math.max(0, ((profile.vantageAiTokens || 0) / getBaseMaxTokens(profile.subscriptionTier)) * 100))}%\` }} 
                />
              </div>
              {(() => {
                const maxTokens = getBaseMaxTokens(profile.subscriptionTier);
                const remaining = typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
                const usedPct = maxTokens > 0 ? ((maxTokens - remaining) / maxTokens) * 100 : 0;
                if (usedPct >= 80) {
                  return (
                    <div className="mt-1 px-3 py-2 bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 rounded-lg flex items-start gap-2">
                      <Sparkles size={14} className="text-[#A6DDB1] mt-0.5 shrink-0" />
                      <p className="text-[11px] text-neutral-600 leading-tight font-normal">
                        You’ve used 80% of your executive bandwidth. Refill instantly with a Booster Pack or upgrade to unlock higher monthly limits.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
