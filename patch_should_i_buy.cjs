const fs = require('fs');
const file = 'src/components/ShouldIBuyThis.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `          {/* VANTAGE SLIM METRICS HEADER BAR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-white/5 border border-white/10 mb-4 text-xs">
            <div className="flex flex-col">
              <span className="text-[10px] text-neutral-400 font-normal">Liquid Runway Buffer</span>
              <span className="text-sm font-bold text-white font-mono mt-0.5">
                {currency} {metrics.liquidCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
              <span className="text-[10px] text-neutral-400 font-normal">Safe Discretionary Limit</span>
              <span className="text-sm font-bold text-[#A6DDB1] font-mono mt-0.5">
                {currency} {metrics.unallocatedBuffer.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
              <span className="text-[10px] text-neutral-400 font-normal">Active Hourly Value</span>
              <span className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                {currency} {metrics.hourlyRate.toFixed(1)}/hr
              </span>
            </div>
          </div>`;

const replacement = `          {/* VANTAGE SLIM METRICS HEADER BAR */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10 mb-4 text-xs">
            {currentTokens <= 10000 && (
              <div className="w-full px-3 py-2.5 bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 rounded-lg flex items-center gap-2.5 mb-1">
                <Sparkles size={16} className="text-[#A6DDB1] shrink-0" />
                <p className="text-[11px] text-white/90 leading-tight font-normal">
                  You’ve used 80% of your executive bandwidth. Refill instantly with a Booster Pack or upgrade to unlock higher monthly limits.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-neutral-400 font-normal">Liquid Runway Buffer</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5">
                  {currency} {metrics.liquidCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
                <span className="text-[10px] text-neutral-400 font-normal">Safe Discretionary Limit</span>
                <span className="text-sm font-bold text-[#A6DDB1] font-mono mt-0.5">
                  {currency} {metrics.unallocatedBuffer.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
                <span className="text-[10px] text-neutral-400 font-normal">Active Hourly Value</span>
                <span className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                  {currency} {metrics.hourlyRate.toFixed(1)}/hr
                </span>
              </div>
            </div>
          </div>`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
