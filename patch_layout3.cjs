const fs = require('fs');
const file = 'src/components/Layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetBanner = `              {(() => {
                const maxTokens = getBaseMaxTokens(profile.subscriptionTier);
                const remaining = typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
                const usedPct = maxTokens > 0 ? ((maxTokens - remaining) / maxTokens) * 100 : 0;
                if (usedPct >= 80) {
                  return (
                    <div className="mt-1 bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 rounded-lg flex flex-col overflow-hidden">
                      <div 
                        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#A6DDB1]/5 transition-colors"
                        onClick={() => setIsBandwidthBannerExpanded(!isBandwidthBannerExpanded)}
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-[#A6DDB1] shrink-0" />
                          <span className="text-[11px] font-bold text-neutral-600">Bandwidth Warning (80% Used)</span>
                        </div>
                        <button className="text-neutral-500 hover:text-neutral-700 transition-colors p-0.5 rounded-md focus:outline-none">
                          <ChevronDown size={14} className={\`transform transition-transform \${isBandwidthBannerExpanded ? 'rotate-180' : ''}\`} />
                        </button>
                      </div>
                      <AnimatePresence>
                        {isBandwidthBannerExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-3 pb-2 pt-0"
                          >
                            <p className="text-[11px] text-neutral-600 leading-tight font-normal pl-5">
                              You’ve used 80% of your executive bandwidth. Refill instantly with a Booster Pack or upgrade to unlock higher monthly limits.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }
                return null;
              })()}`;

content = content.replace(targetBanner, '');
fs.writeFileSync(file, content);
