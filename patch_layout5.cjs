const fs = require('fs');
const file = 'src/components/Layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetImport = "import { Settings as SettingsIcon, WifiOff, Home, Landmark, Activity, TrendingUp, BrainCircuit, Plus, Camera, Coffee, Sparkles, ChevronDown } from 'lucide-react';";
const replacementImport = "import { Settings as SettingsIcon, WifiOff, Home, Landmark, Activity, TrendingUp, BrainCircuit, Plus, Camera, Coffee, Sparkles, ChevronDown, ShoppingCart } from 'lucide-react';\nimport { TokenShopModal } from './TokenShopModal';";
content = content.replace(targetImport, replacementImport);

const targetState = "const [isBandwidthBannerExpanded, setIsBandwidthBannerExpanded] = React.useState(true);";
const replacementState = "const [isBandwidthBannerExpanded, setIsBandwidthBannerExpanded] = React.useState(true);\n  const [isTokenShopOpen, setIsTokenShopOpen] = React.useState(false);";
content = content.replace(targetState, replacementState);

const targetHeader = `<div className="flex justify-between items-center w-full">
                <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1">
                  <Sparkles size={12} className="text-[#A6DDB1]" /> Vantage AI Tokens
                </span>
                <span className="text-[11px] font-mono font-bold text-[#A6DDB1]">
                  {typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens.toLocaleString() : '0'} / {getBaseMaxTokens(profile.subscriptionTier).toLocaleString()}
                </span>
              </div>`;

const replacementHeader = `<div className="flex justify-between items-center w-full relative">
                <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1">
                  <Sparkles size={12} className="text-[#A6DDB1]" /> Vantage AI Tokens
                </span>
                <button 
                  onClick={() => setIsTokenShopOpen(true)}
                  className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center p-1 rounded-full text-[#A6DDB1] hover:bg-[#A6DDB1]/10 transition-colors"
                  aria-label="Buy AI Tokens"
                >
                  <ShoppingCart size={14} />
                </button>
                <span className="text-[11px] font-mono font-bold text-[#A6DDB1]">
                  {typeof profile.vantageAiTokens === 'number' ? profile.vantageAiTokens.toLocaleString() : '0'} / {getBaseMaxTokens(profile.subscriptionTier).toLocaleString()}
                </span>
              </div>`;
content = content.replace(targetHeader, replacementHeader);

const targetModal = `<PremiumModal 
          isOpen={isPremiumModalOpen} 
          onClose={() => setIsPremiumModalOpen(false)}
          uid={profile?.uid || ''}
          profile={profile}
          onSuccess={(updatedProfile) => {
            if (onUpdateProfile) onUpdateProfile(updatedProfile);
            setIsPremiumModalOpen(false);
          }}
        />`;

const replacementModal = `<PremiumModal 
          isOpen={isPremiumModalOpen} 
          onClose={() => setIsPremiumModalOpen(false)}
          uid={profile?.uid || ''}
          profile={profile}
          onSuccess={(updatedProfile) => {
            if (onUpdateProfile) onUpdateProfile(updatedProfile);
            setIsPremiumModalOpen(false);
          }}
        />
        <TokenShopModal
          isOpen={isTokenShopOpen}
          onClose={() => setIsTokenShopOpen(false)}
          uid={profile?.uid || ''}
          profile={profile}
          onSuccess={(updatedProfile) => {
            if (onUpdateProfile) onUpdateProfile(updatedProfile);
            setIsTokenShopOpen(false);
          }}
        />`;
content = content.replace(targetModal, replacementModal);

fs.writeFileSync(file, content);
