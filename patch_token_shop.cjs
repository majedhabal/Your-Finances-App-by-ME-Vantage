const fs = require('fs');
const file = 'src/components/TokenShopModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetButton = `              <button
                onClick={handlePurchase}
                disabled={!selectedPack || isProcessing}
                className="w-full py-3.5 rounded-xl bg-neutral-900 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors font-['Google_Sans']"
              >
                {isProcessing ? (
                  <span className="animate-pulse">Processing...</span>
                ) : (
                  <>
                    <CreditCard size={18} />
                    Buy Now
                  </>
                )}
              </button>`;

const replacementButtons = `              {selectedPack ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-black text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-900 transition-colors font-['Google_Sans']"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <span className="text-lg leading-none mt-[-2px]"></span> Pay
                      </>
                    )}
                  </button>
                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-[#008744] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#007038] transition-colors font-['Google_Sans']"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4.3 22.4l11.4-11.4-11.4-11.4c-.2.2-.3.6-.3 1.1v20.6c0 .5.1.9.3 1.1z"/>
                          <path d="M16.9 12.1l-1.2-1.2-11.4 11.4 12.6-7.2c.4-.2.6-.6.6-1 0-.4-.2-.8-.6-1z"/>
                        </svg>
                        Google Play
                      </>
                    )}
                  </button>
                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-white border border-neutral-200 text-neutral-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors font-['Google_Sans'] mt-2"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <CreditCard size={18} />
                        Credit Card
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  disabled
                  className="w-full py-3.5 rounded-xl bg-neutral-100 text-neutral-400 font-bold flex items-center justify-center gap-2 font-['Google_Sans']"
                >
                  Select a pack to continue
                </button>
              )}`;

content = content.replace(targetButton, replacementButtons);
fs.writeFileSync(file, content);
