const fs = require('fs');
const file = 'src/components/Layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetImport = "import { Settings as SettingsIcon, WifiOff, Home, Landmark, Activity, TrendingUp, BrainCircuit, Plus, Camera, Coffee, Sparkles } from 'lucide-react';";
const replacementImport = "import { Settings as SettingsIcon, WifiOff, Home, Landmark, Activity, TrendingUp, BrainCircuit, Plus, Camera, Coffee, Sparkles, ChevronDown } from 'lucide-react';";
content = content.replace(targetImport, replacementImport);

const targetState = "const [isShouldIBuyThisOpen, setIsShouldIBuyThisOpen] = React.useState(false);";
const replacementState = "const [isShouldIBuyThisOpen, setIsShouldIBuyThisOpen] = React.useState(false);\n  const [isBandwidthBannerExpanded, setIsBandwidthBannerExpanded] = React.useState(true);";
content = content.replace(targetState, replacementState);

const targetBanner = `                if (usedPct >= 80) {
                  return (
                    <div className="mt-1 px-3 py-2 bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 rounded-lg flex items-start gap-2">
                      <Sparkles size={14} className="text-[#A6DDB1] mt-0.5 shrink-0" />
                      <p className="text-[11px] text-neutral-600 leading-tight font-normal">
                        You’ve used 80% of your executive bandwidth. Refill instantly with a Booster Pack or upgrade to unlock higher monthly limits.
                      </p>
                    </div>
                  );
                }`;

const replacementBanner = `                if (usedPct >= 80) {
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
                }`;

content = content.replace(targetBanner, replacementBanner);

fs.writeFileSync(file, content);
