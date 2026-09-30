import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Bot, RefreshCw, Mic } from 'lucide-react';
import { executeVantageAITask } from '../lib/VantageAIRouter';
import { PremiumMarketingCard } from './PremiumMarketingCard';
import { VantageVoiceAssistant } from './VantageVoiceAssistant';
import i18n from '../lib/i18n';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getEffectiveAiTokens } from '../lib/tokenConsumption';
import ReactMarkdown from 'react-markdown';
import { getNavigationGuide, NavigationGuide } from '../lib/navigationGuideHelper';

declare global {
  interface Window {
    __vantage_active_chat?: any;
  }
}

interface VantageAIProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  profile: any;
  refreshGlobalBalances?: () => Promise<void>;
  isInline?: boolean;
  onNavigateTab?: (tab: 'essentials' | 'accounts' | 'analytics' | 'activity' | 'settings' | 'ai') => void;
  onOpenModal?: (modal: 'transaction' | 'account' | 'goal') => void;
}

const extractText = (node: any): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
};

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-sm font-bold text-neutral-900 mb-2 mt-3" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-xs font-bold text-neutral-900 mb-1.5 mt-2.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-xs font-bold text-neutral-900 mb-1 mt-2" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </h3>
  ),
  p: ({ children }: any) => {
    const fullText = extractText(children);
    const isDisclaimer = 
      fullText.includes("DISCLAIMER: YOUR FINANCES") || 
      fullText.includes("VANTAGE AI DOES NOT HAVE ANY OF YOUR PRIVATE BANKING CREDENTIALS");

    return (
      <p className={`mb-3 last:mb-0 leading-relaxed font-normal text-neutral-800 text-xs bg-neutral-50/80 p-3 rounded-xl border border-neutral-100 ${isDisclaimer ? 'italic text-neutral-500 my-2 bg-transparent border-none p-0' : ''}`} style={{ fontFamily: "'Google Sans', sans-serif", fontSize: isDisclaimer ? '10px' : undefined }}>
        {children}
      </p>
    );
  },
  ul: ({ children }: any) => (
    <ul className="my-3 space-y-2 pl-0" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="my-3 space-y-2 pl-0" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="flex items-start gap-2.5 text-xs text-neutral-800 font-normal leading-relaxed bg-white p-3 rounded-xl border border-neutral-200/70 shadow-2xs" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      <span className="w-2 h-2 rounded-full bg-[#366945] mt-1.5 shrink-0" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ children }: any) => (
    <strong className="font-bold text-[#366945]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </strong>
  ),
};

export const VantageAI: React.FC<VantageAIProps> = ({
  isOpen,
  onClose,
  uid,
  accounts,
  transactions,
  accountBalances,
  profile,
  onNavigateTab,
  onOpenModal
}) => {
  const t = (key: string, opts?: any): string => String(i18n.t(key, opts) || key);
  const [queryInput, setQueryInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeQuery, setActiveQuery] = useState('');
  const [messages, setMessages] = useState<{ id?: string; sender: 'user' | 'ai'; text: string; guide?: NavigationGuide | null }[]>([]);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

    const generateMessageId = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  // Listen for historical chat opening events and pending chat global on mount
  useEffect(() => {
    const handleOpenChat = (e: any) => {
      const convo = e.detail;
      if (convo && convo.messages) {
        setMessages(convo.messages.map((m: any, mIdx: number) => ({
          id: m.id || `convo-msg-${mIdx}-${Math.random().toString(36).substring(2, 9)}`,
          sender: m.sender,
          text: m.text
        })));
        setActiveQuery('loaded');
      } else if (convo && convo.prompt) {
        setQueryInput(convo.prompt);
        // Trigger execution directly after prompt is set
        setTimeout(() => {
          handleExecuteInsightTaskDirect(convo.prompt);
        }, 100);
      }
    };

    if (window.__vantage_active_chat) {
      const convo = window.__vantage_active_chat;
      if (convo && convo.messages) {
        setMessages(convo.messages.map((m: any, mIdx: number) => ({
          id: m.id || `active-msg-${mIdx}-${Math.random().toString(36).substring(2, 9)}`,
          sender: m.sender,
          text: m.text
        })));
        setActiveQuery('loaded');
      }
      window.__vantage_active_chat = null;
    }

    window.addEventListener('open-vantage-ai-chat', handleOpenChat);
    return () => {
      window.removeEventListener('open-vantage-ai-chat', handleOpenChat);
    };
  }, []);

  // Auto scroll to the top of the latest message when messages grow or loading changes
  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isOpen) return null;

  const tierClean = (profile?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
  const effectiveTokens = getEffectiveAiTokens(profile);
  const isPremium = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(profile?.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now()) || effectiveTokens > 0;

  const handleClaimSandboxTokens = async () => {
    if (!profile?.uid) return;
    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, { 
        vantageAiTokens: 50000,
        aiTokens: 50000,
        subscriptionTier: 'tier 3',
        isPremium: true
      });
    } catch (err) {
      console.error("Error claiming sandbox tokens:", err);
    }
  };

  const handleExecuteInsightTaskDirect = async (userMessage: string) => {
    if (!userMessage) return;

    const currentTokens = effectiveTokens;
    
    // Check if trends, forecasting, or comprehensive record reading keywords are present
    const lowerMessage = userMessage.toLowerCase();
    const keywords = ['trend', 'forecast', 'predict', 'analyze', 'analysis', 'spending', 'habit', 'chart', 'comprehensive', 'history', 'pattern', 'future', 'projection', 'growth', 'budget', 'health'];
    const isTrendOrForecast = keywords.some(kw => lowerMessage.includes(kw));
    const tokenCost = 3000;

    if (currentTokens < tokenCost) {
      setResponse(`No Vantage AI tokens remaining! This request requires ${tokenCost} tokens, but you only have ${currentTokens} remaining. Please upgrade your plan in settings to Tier 2 or Tier 3 to receive more tokens.`);
      return;
    }

    setLoading(true);
    setActiveQuery(userMessage);
    setQueryInput('');
    setResponse(null);
    setMessages(prev => [...prev, { id: generateMessageId(), sender: 'user', text: userMessage }]);

    try {
      const payload = {
        prompt: userMessage,
        profile,
        accounts,
        accountBalances,
        recentHistory: transactions,
        allTransactions: transactions,
        transactions
      };
      const taskType = isTrendOrForecast ? 'generate_financial_forecast' : 'clean_text';
      const result = await executeVantageAITask(taskType, payload);
      const guide = getNavigationGuide(userMessage);
      const aiResponse = result || t('vantage_ai.empty_response');
      
      setResponse(aiResponse);
      setMessages(prev => [...prev, { id: generateMessageId(), sender: 'ai', text: aiResponse, guide }]);

      // Save complete new chat entry into local storage under the active user's key
      if (uid) {
        const historyKey = `vantage_ai_history_${uid}`;
        try {
          const existing = localStorage.getItem(historyKey);
          const list: any[] = existing ? JSON.parse(existing) : [];
          
          const newConvo = {
            id: Math.random().toString(36).substring(2, 9),
            title: userMessage.slice(0, 40) + (userMessage.length > 40 ? '...' : ''),
            timestamp: Date.now(),
            messages: [
              {
                id: Math.random().toString(36).substring(2, 9),
                sender: 'user',
                text: userMessage,
                timestamp: Date.now() - 1000
              },
              {
                id: Math.random().toString(36).substring(2, 9),
                sender: 'ai',
                text: aiResponse,
                timestamp: Date.now()
              }
            ]
          };
          
          list.unshift(newConvo);
          localStorage.setItem(historyKey, JSON.stringify(list));
          window.dispatchEvent(new CustomEvent('vantage-ai-history-updated'));
        } catch (e) {
          console.error("Failed to write to AI history storage:", e);
        }
      }

      // Decrement AI tokens dynamically
      if (profile?.uid) {
        const userRef = doc(db, 'users', profile.uid);
        const nextTokens = Math.max(0, currentTokens - tokenCost);
        await updateDoc(userRef, { vantageAiTokens: nextTokens, aiTokens: nextTokens });
      }
    } catch (err) {
      console.error("Assistant execution failure:", err);
      const errResponse = t('vantage_ai.error_response');
      setResponse(errResponse);
      setMessages(prev => [...prev, { id: generateMessageId(), sender: 'ai', text: errResponse }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteInsightTask = async () => {
    await handleExecuteInsightTaskDirect(queryInput);
  };

  const handleResetChat = () => {
    setMessages([]);
    setActiveQuery('');
    setResponse(null);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-end p-4 box-border">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm" onClick={onClose} />
        
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="relative w-full max-w-[660px] h-[calc(100vh-2rem)] flex flex-col overflow-hidden box-border bg-white"
          style={{
            borderRadius: '24px',
            boxShadow: '0px 12px 30px rgba(0, 0, 0, 0.05)',
            border: '1px solid #E1E8ED'
          }}
        >
          {/* HEADER ROW BAR */}
          <div className="p-5 flex justify-between items-center border-b border-neutral-100 bg-white shrink-0 select-none">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-[#366945]" />
              <div className="flex flex-col">
                <h3 className="font-headline-md text-base text-neutral-800 m-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t('vantage_ai.title')}</h3>
                <div className="flex flex-col gap-1 mt-0.5">
                  <span className="text-[12px] text-[#366945] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {t('vantage_ai.tokens', { count: effectiveTokens.toLocaleString() })}
                  </span>
                  <button
                    onClick={handleClaimSandboxTokens}
                    className="px-2 py-0.5 text-[12px] font-bold text-[#366945] bg-[#366945]/10 border border-[#366945]/25 rounded-full hover:bg-[#366945]/20 transition-colors cursor-pointer w-fit"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    {t('vantage_ai.claim_sandbox_tokens')}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center">
              {(messages.length > 0 || activeQuery) && (
                <button
                  onClick={handleResetChat}
                  className="mr-2 px-3 py-1.5 text-[12px] font-bold text-neutral-500 hover:text-neutral-800 bg-neutral-50 border border-neutral-100 rounded-full transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  <RefreshCw size={10} />
                  New Chat
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 text-neutral-500 hover:text-neutral-800 cursor-pointer transition-colors"><X size={16} /></button>
            </div>
          </div>

          {/* MESSAGE STREAM CHAT LOG VIEWPORT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 container-scroll-patch box-border" ref={scrollRef}>
            {!isPremium ? (
              <div className="h-full flex items-center justify-center">
                <PremiumMarketingCard featureName="Vantage Core AI" description={t('vantage_ai.premium_description')} />
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {messages.length === 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-neutral-800 font-body-md mb-4" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      Hello there, please tell me how I can help you today?
                    </p>
                    <div className="flex flex-col gap-2">
                      {[
                        "How can I add a transaction?",
                        "Show me my budget for this month",
                        "How do I add a bank account?",
                        "How do I view my analytics?",
                        "How do I manage debt or loans?"
                      ].map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleExecuteInsightTaskDirect(suggestion)}
                          className="p-3 text-sm text-left text-neutral-700 bg-neutral-50 border border-neutral-100 rounded-xl hover:border-[#366945] hover:bg-neutral-100 transition-all cursor-pointer font-body-md"
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {messages.map((msg, index) => (
                  <div 
                    key={msg.id} 
                    ref={index === messages.length - 1 ? lastMessageRef : null}
                    className={`flex w-full ${msg.sender === 'user' ? 'justify-end pl-12' : 'justify-start pr-12'} leading-relaxed box-border my-2`}
                  >
                    {msg.sender === 'user' ? (
                      <div className="p-3.5 bg-[#E8F5E9] text-neutral-900 text-xs font-body-md rounded-2xl rounded-tr-xs border border-[#C8E6C9] break-words max-w-[88%] shadow-xs">
                        {msg.text}
                      </div>
                    ) : (
                      <div className="flex gap-3 items-start w-full box-border">
                        <div className="w-8 h-8 rounded-full bg-[#366945]/10 border border-[#366945]/20 flex items-center justify-center text-[#366945] mt-0.5 shrink-0 select-none shadow-xs">
                          <Bot size={16} />
                        </div>
                        <div className="p-4 bg-white text-neutral-900 font-body-md text-xs rounded-2xl rounded-tl-xs border border-neutral-200 break-words flex-1 shadow-sm">
                          <ReactMarkdown components={markdownComponents}>{msg.text}</ReactMarkdown>
                          {msg.guide && (
                            <div className="mt-3.5 p-3.5 bg-neutral-50 border border-[#366945]/30 rounded-xl flex flex-col gap-2.5 shadow-sm">
                              <div className="text-xs font-bold text-[#366945] flex items-center gap-1.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                <span>🧭</span>
                                <span>{msg.guide.title} — Step-by-Step Guidance</span>
                              </div>
                              <div className="text-xs text-neutral-700 font-normal space-y-1.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                {msg.guide.steps.map((step, sIdx) => (
                                  <div key={sIdx} className="flex items-start gap-2">
                                    <span className="font-bold text-[#366945] shrink-0">{sIdx + 1}.</span>
                                    <span>{step}</span>
                                  </div>
                                ))}
                              </div>
                              {msg.guide.actionLabel && (
                                <button
                                  onClick={() => {
                                    if (msg.guide?.actionLabel?.includes('Should I Buy This')) {
                                      window.dispatchEvent(new CustomEvent('open-should-i-buy-this'));
                                      onClose();
                                      return;
                                    }
                                    if (msg.guide?.targetTab && onNavigateTab) {
                                      onNavigateTab(msg.guide.targetTab);
                                      onClose();
                                    }
                                    if (msg.guide?.targetModal && msg.guide.targetModal !== 'none' && onOpenModal) {
                                      onOpenModal(msg.guide.targetModal as any);
                                      onClose();
                                    }
                                  }}
                                  className="mt-1 px-3.5 py-2.5 bg-[#366945] text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-1.5 w-full shadow-sm"
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                >
                                  {msg.guide.actionLabel}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {messages.length === 0 && activeQuery && (
                  <div className="flex flex-col items-end w-full pl-6 select-none box-border">
                    <div className="p-4 bg-primary-container text-neutral-800 text-sm font-body-md rounded-2xl rounded-br-sm border border-primary/10 break-words max-w-full">{activeQuery}</div>
                  </div>
                )}
                
                {loading && (
                  <div className="flex items-center gap-2 text-sm font-body-md text-neutral-500 py-1 select-none">
                    <RefreshCw size={14} className="animate-spin text-[#366945]" />
                    <span>{t('vantage_ai.processing')}</span>
                  </div>
                )}
                
                {messages.length === 0 && response && (
                  <div className="flex gap-3 items-start pr-6 leading-relaxed w-full box-border">
                    <div className="w-8 h-8 rounded-full bg-primary-container/20 border border-primary/20 flex items-center justify-center text-[#366945] mt-0.5 shrink-0 select-none"><Bot size={16} /></div>
                    <div className="p-4 bg-neutral-50 text-neutral-800 font-body-md text-sm rounded-2xl rounded-br-sm border border-neutral-100 break-words flex-1">
                      <ReactMarkdown components={markdownComponents}>{response}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* INTERACTIVE INPUT TRAIL CONTROL FOR PREALS ROW */}
          {isPremium && (
            <div className="p-4 bg-white border-t border-neutral-100 shrink-0 box-border">
              <div className="relative flex items-center w-full max-w-full">
                <input 
                  type="text" 
                  value={queryInput} 
                  onChange={(e) => setQueryInput(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleExecuteInsightTask()}
                  placeholder={t('vantage_ai.placeholder')} 
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-full py-3 pl-4 pr-12 text-sm text-neutral-800 focus:border-[#366945] outline-none placeholder:text-neutral-400 font-body-md box-border"
                />
                <button onClick={handleExecuteInsightTask} disabled={!queryInput.trim() || loading} className="absolute right-1.5 p-2 bg-[#A6DDB1] text-[#366945] rounded-full hover:opacity-90 active:scale-95 transition-all cursor-pointer border-none flex items-center justify-center disabled:opacity-40"><Send size={16} strokeWidth={2.5} /></button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <VantageVoiceAssistant
        isOpen={isVoiceAssistantOpen}
        onClose={() => setIsVoiceAssistantOpen(false)}
        uid={uid}
        accounts={accounts}
        transactions={transactions}
        accountBalances={accountBalances}
        profile={profile}
        onNavigateTab={onNavigateTab}
        onOpenModal={onOpenModal}
      />
    </AnimatePresence>
  );
};
