import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Check, Square, Trash2, Share2, Copy, CheckCircle2, ArrowLeft, RefreshCw, ExternalLink, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '@/lib/i18n';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

interface CartItem {
  id: string;
  text: string;
  completed: boolean;
}

interface SharedCartData {
  id: string;
  title?: string;
  ownerUid?: string;
  items: CartItem[];
  updatedAt?: any;
}

export const PublicSharedCartView: React.FC<{ cartId: string; onClose?: () => void }> = ({ cartId, onClose }) => {
  const { t } = useTranslation();
  const [cart, setCart] = useState<SharedCartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!cartId) {
      setLoading(false);
      setErrorMsg("No cart ID provided.");
      return;
    }

    setLoading(true);
    const cartRef = doc(db, 'sharedCarts', cartId);
    
    const unsub = onSnapshot(cartRef, (snap) => {
      setLoading(false);
      if (snap.exists()) {
        const data = snap.data();
        setCart({
          id: snap.id,
          title: data.title || 'Shared Shopping Cart',
          ownerUid: data.ownerUid,
          items: Array.isArray(data.items) ? data.items : [],
          updatedAt: data.updatedAt
        });
        setErrorMsg(null);
      } else {
        setCart(null);
        setErrorMsg("This shared shopping cart was not found or has been removed.");
      }
    }, (err) => {
      console.error("Error listening to shared cart:", err);
      setLoading(false);
      setErrorMsg("Unable to connect to shared cart. Please check your internet connection.");
    });

    return () => unsub();
  }, [cartId]);

  const saveItemsToFirestore = async (newItems: CartItem[]) => {
    if (!cartId) return;
    try {
      const cartRef = doc(db, 'sharedCarts', cartId);
      await updateDoc(cartRef, {
        items: newItems,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to update shared cart:", err);
      try {
        // Fallback setDoc with merge if doc didn't exist
        const cartRef = doc(db, 'sharedCarts', cartId);
        await setDoc(cartRef, {
          id: cartId,
          items: newItems,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fallbackErr) {
        handleFirestoreError(fallbackErr, OperationType.UPDATE, `sharedCarts/${cartId}`);
      }
    }
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || !cart) return;

    const newItem: CartItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text: newItemText.trim(),
      completed: false
    };

    const updatedItems = [...(cart.items || []), newItem];
    setCart({ ...cart, items: updatedItems });
    setNewItemText('');
    await saveItemsToFirestore(updatedItems);
  };

  const toggleItem = async (id: string) => {
    if (!cart) return;

    const updatedItems = (cart.items || []).map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    );

    setCart({ ...cart, items: updatedItems });
    await saveItemsToFirestore(updatedItems);
  };

  const deleteItem = async (id: string) => {
    if (!cart) return;

    const updatedItems = (cart.items || []).filter(item => item.id !== id);
    setCart({ ...cart, items: updatedItems });
    await saveItemsToFirestore(updatedItems);
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?cartId=${cartId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback copy
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleOpenMainApp = () => {
    // Clear cartId query parameter from URL and reload or trigger onClose
    const url = new URL(window.location.href);
    url.searchParams.delete('cartId');
    window.history.replaceState({}, '', url.toString());
    if (onClose) {
      onClose();
    } else {
      window.location.reload();
    }
  };

  const completedCount = cart?.items.filter(i => i.completed).length || 0;
  const totalCount = cart?.items.length || 0;
  const remainingCount = totalCount - completedCount;

  return (
    <div className="min-h-screen bg-[#111C2D] text-white flex flex-col items-center justify-start p-4 md:p-8 select-none font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {/* Container Card */}
      <div className="w-full max-w-md bg-[#1E293B] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col my-auto">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-emerald-900/30 via-slate-800 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#A6DDB1]/20 border border-[#A6DDB1]/40 flex items-center justify-center text-[#A6DDB1]">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  {cart?.title || t('shopping.shopping_cart', 'Shared Shopping Cart')}
                </h1>
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {t('shopping.live', 'Live')}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-normal">
                {loading ? t('shopping.connecting', 'Connecting...') : `${t('shopping.remaining', { count: remainingCount })} • ${t('shopping.completed', { count: completedCount })}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQrModal(true)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-emerald-300 transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm"
              title="Show QR Code"
            >
              <QrCode size={16} />
              <span className="hidden sm:inline">{t('shopping.qr_code', 'QR Code')}</span>
            </button>

            <button
              onClick={copyShareLink}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-bold"
              title="Copy Public Link"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Share2 size={16} />}
              <span className="hidden sm:inline">{copied ? t('shopping.copied', 'Copied') : t('shopping.share', 'Share')}</span>
            </button>
          </div>
        </div>

        {/* Live Banner / Toast */}
        {copied && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 flex items-center justify-between text-xs font-normal text-emerald-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} /> {t('shopping.copied', 'Shared cart link copied to clipboard!')}
            </span>
          </div>
        )}

        {/* QR Code Modal Overlay */}
        {showQrModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#1E293B] rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-white/10 flex flex-col items-center text-center gap-4 relative">
              <button
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-2xl bg-[#A6DDB1]/20 border border-[#A6DDB1]/40 flex items-center justify-center text-[#A6DDB1]">
                  <QrCode size={22} />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight mt-1">{t('shopping.scan_shopping_cart', 'Scan Shopping Cart')}</h3>
                <p className="text-xs text-slate-400 font-normal max-w-[240px]">
                  {t('shopping.scan_qr_desc', 'Scan this QR code to quickly open and edit this shared cart on any device.')}
                </p>
              </div>

              {/* QR Code Canvas/SVG */}
              <div className="p-4 bg-white rounded-2xl border border-white/20 shadow-inner flex items-center justify-center">
                <QRCodeSVG
                  value={`${window.location.origin}${window.location.pathname}?cartId=${cartId}`}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  level="M"
                  includeMargin={true}
                />
              </div>

              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={copyShareLink}
                  className="w-full py-2.5 px-4 bg-[#A6DDB1] hover:brightness-105 text-slate-950 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {copied ? <CheckCircle2 size={16} className="text-emerald-800" /> : <Copy size={16} />}
                  <span>{copied ? t('shopping.copied', 'Link Copied to Clipboard!') : t('shopping.copy_cart_link', 'Copy Shared Cart Link')}</span>
                </button>

                <button
                  onClick={() => setShowQrModal(false)}
                  className="w-full py-2 px-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-medium text-xs transition-colors"
                >
                  {t('common.close', 'Close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="p-5 flex-1 flex flex-col gap-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw size={24} className="animate-spin text-[#A6DDB1]" />
              <p className="text-xs font-normal">{t('shopping.connecting', 'Loading shared shopping cart...')}</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShoppingCart size={24} />
              </div>
              <p className="text-sm font-bold text-slate-200">{errorMsg}</p>
              <button
                onClick={handleOpenMainApp}
                className="mt-2 px-5 py-2.5 rounded-2xl bg-[#A6DDB1] text-neutral-900 text-xs font-bold hover:brightness-105 transition-all"
              >
                {t('shopping.open_vantage_app', 'Go to App Home')}
              </button>
            </div>
          ) : (
            <>
              {/* Add item form */}
              <form onSubmit={addItem} className="flex gap-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder={t('shopping.add_item_to_shared_cart', 'Add item to shared cart...')}
                  className="flex-1 px-4 py-3 bg-slate-900/80 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-400 outline-none focus:border-[#A6DDB1] transition-colors"
                />
                <button
                  type="submit"
                  disabled={!newItemText.trim()}
                  className="px-4 bg-[#A6DDB1] disabled:opacity-40 text-neutral-900 font-bold rounded-2xl flex items-center justify-center hover:brightness-105 transition-all"
                >
                  <Plus size={20} />
                </button>
              </form>

              {/* Items List */}
              <div className="flex flex-col gap-2 mt-1 max-h-[380px] overflow-y-auto pr-1">
                {totalCount === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs font-normal border border-dashed border-white/10 rounded-2xl p-6 bg-white/[0.02] whitespace-pre-line">
                    {t('shopping.empty_shared_cart', 'No items in this shopping cart yet.\nAdd items above to start collaborating live!')}
                  </div>
                ) : (
                  cart?.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        item.completed
                          ? 'bg-slate-900/40 border-white/5 opacity-60'
                          : 'bg-slate-800/80 border-white/10 hover:border-[#A6DDB1]/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleItem(item.id);
                        }}
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                          item.completed
                            ? 'bg-[#A6DDB1] border-[#A6DDB1] text-neutral-900'
                            : 'border-slate-500 text-transparent hover:border-[#A6DDB1]'
                        }`}
                      >
                        <Check size={14} className={item.completed ? 'stroke-[3]' : ''} />
                      </button>

                      <span
                        className={`flex-1 text-xs font-normal transition-all ${
                          item.completed
                            ? 'line-through text-slate-400 decoration-slate-500'
                            : 'text-slate-100 font-normal'
                        }`}
                      >
                        {item.text}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteItem(item.id);
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer info & App launcher */}
        <div className="p-4 border-t border-white/10 bg-slate-900/60 flex items-center justify-between text-xs">
          <button
            onClick={copyShareLink}
            className="text-slate-400 hover:text-[#A6DDB1] transition-colors flex items-center gap-1.5 text-[11px] font-normal"
          >
            <Copy size={13} /> {copied ? t('shopping.copied', 'Link Copied!') : t('shopping.copy_cart_link', 'Copy Cart Link')}
          </button>

          <button
            onClick={handleOpenMainApp}
            className="text-[#A6DDB1] hover:underline transition-all flex items-center gap-1 text-[11px] font-bold"
          >
            {t('shopping.open_vantage_app', 'Open Your Finances app')} <ExternalLink size={12} />
          </button>
        </div>

      </div>
    </div>
  );
};
