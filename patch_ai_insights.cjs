const fs = require('fs');
const file = 'src/components/AIInsights.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `            {/* Cost Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/10 text-xs">
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">General Q&A</span>
                <span className="font-bold text-white">10 tokens</span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">Receipt OCR Scan</span>
                <span className="font-bold text-white">20 tokens</span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">Should I Buy Verdict</span>
                <span className="font-bold text-white">15 tokens</span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">Deep Forecast</span>
                <span className="font-bold text-white">50 tokens</span>
              </div>
            </div>`;

const replacement = `            {/* Cost Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/10 text-xs">
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">AI Chat</span>
                <span className="font-bold text-white">3,000 tokens</span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">Receipt Scan</span>
                <span className="font-bold text-white">4,500 tokens</span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">Should I Buy</span>
                <span className="font-bold text-white">6,500 tokens</span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                <span className="text-neutral-400 font-normal">NLP Search</span>
                <span className="font-bold text-white">1,500 tokens</span>
              </div>
            </div>`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
