const fs = require('fs');
const file = 'src/components/ShouldIBuyThis.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `            {currentTokens <= 10000 && (
              <div className="w-full px-3 py-2.5 bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 rounded-lg flex items-center gap-2.5 mb-1">
                <Sparkles size={16} className="text-[#A6DDB1] shrink-0" />
                <p className="text-[11px] text-white/90 leading-tight font-normal">
                  You’ve used 80% of your executive bandwidth. Refill instantly with a Booster Pack or upgrade to unlock higher monthly limits.
                </p>
              </div>
            )}
            `;

content = content.replace(target, '');
fs.writeFileSync(file, content);
