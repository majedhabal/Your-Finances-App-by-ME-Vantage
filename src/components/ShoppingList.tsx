import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Check, Square, Share2, Copy, CheckCircle2, Link2, QrCode, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '@/lib/i18n';
import { db } from '../lib/firebase';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
}

export const ShoppingList: React.FC<{ uid: string }> = ({ uid }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [sharedCartId, setSharedCartId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareBar, setShowShareBar] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const isRemoteUpdatingRef = useRef(false);

  const cartDocId = uid ? `scart-${uid}` : '';

  // 1. Listen to user's personal shoppingList collection
  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(collection(db, `users/${uid}/shoppingList`), (snap) => {
      if (snap.empty) {
        // Migrate from localStorage if exists
        const cacheKey = `vantage_shopping_list_${uid}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const batch = writeBatch(db);
              parsed.forEach((item: any) => {
                const docRef = doc(db, `users/${uid}/shoppingList/${item.id}`);
                batch.set(docRef, {
                  id: item.id,
                  text: item.text,
                  completed: !!item.completed,
                  createdAt: serverTimestamp()
                });
              });
              batch.commit().catch(e => console.error("Error migrating shopping list to firestore:", e));
            }
          } catch (e) {
            console.error("Failed to parse local shopping list for migration:", e);
          }
        }
        if (!isRemoteUpdatingRef.current) {
          setItems([]);
        }
      } else {
        if (!isRemoteUpdatingRef.current) {
          const fetched = snap.docs.map(d => ({
            id: d.id,
            text: d.data().text || '',
            completed: !!d.data().completed
          }));
          setItems(fetched);
        }
      }
    }, (err) => {
      console.warn("Shopping list offline fallback:", err);
    });

    return () => unsub();
  }, [uid]);

  // 2. Real-time Listener on the Shared Cart doc to reflect changes made by public link users
  useEffect(() => {
    if (!uid || !cartDocId) return;

    const sharedCartRef = doc(db, 'sharedCarts', cartDocId);
    const unsub = onSnapshot(sharedCartRef, (snap) => {
      if (snap.exists()) {
        setSharedCartId(cartDocId);
        setShowShareBar(true);
        const data = snap.data();
        if (Array.isArray(data.items)) {
          const remoteItems: ShoppingItem[] = data.items.map((i: any) => ({
            id: i.id || `item-${Math.random()}`,
            text: i.text || '',
            completed: !!i.completed
          }));

          isRemoteUpdatingRef.current = true;
          setItems(remoteItems);
          setTimeout(() => {
            isRemoteUpdatingRef.current = false;
          }, 300);
        }
      }
    }, (err) => {
      console.warn("Shared cart listener notice:", err);
    });

    return () => unsub();
  }, [uid, cartDocId]);

  // Helper to sync items array to shared cart document
  const syncToSharedCart = async (updatedItems: ShoppingItem[]) => {
    if (!cartDocId) return;
    try {
      const cartRef = doc(db, 'sharedCarts', cartDocId);
      await setDoc(cartRef, {
        id: cartDocId,
        ownerUid: uid,
        title: 'Shopping Cart',
        items: updatedItems.map(i => ({ id: i.id, text: i.text, completed: i.completed })),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to sync shared cart:", err);
    }
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || !uid) return;

    const itemId = `shop-${Date.now()}`;
    const newItem: ShoppingItem = {
      id: itemId,
      text: newItemText.trim(),
      completed: false
    };

    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    setNewItemText('');

    try {
      await setDoc(doc(db, `users/${uid}/shoppingList`, itemId), {
        ...newItem,
        createdAt: serverTimestamp()
      });
      if (sharedCartId || showShareBar) {
        await syncToSharedCart(updatedItems);
      }
    } catch (err) {
      console.error("Failed to add shopping list item:", err);
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/shoppingList/${itemId}`);
    }
  };

  const toggleItem = async (id: string) => {
    if (!uid) return;
    const item = items.find(i => i.id === id);
    if (!item) return;

    const newCompleted = !item.completed;
    const updatedItems = items.map(i => i.id === id ? { ...i, completed: newCompleted } : i);
    setItems(updatedItems);

    try {
      const itemRef = doc(db, `users/${uid}/shoppingList`, id);
      await updateDoc(itemRef, {
        completed: newCompleted,
        updatedAt: serverTimestamp()
      });
      
      // Always sync to shared cart if created
      await syncToSharedCart(updatedItems);
    } catch (err) {
      console.error("Failed to toggle shopping list item:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/shoppingList/${id}`);
    }
  };

  const deleteItem = async (id: string) => {
    if (!uid) return;

    const updatedItems = items.filter(i => i.id !== id);
    setItems(updatedItems);

    try {
      const itemRef = doc(db, `users/${uid}/shoppingList`, id);
      await deleteDoc(itemRef);

      await syncToSharedCart(updatedItems);
    } catch (err) {
      console.error("Failed to delete shopping list item:", err);
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/shoppingList/${id}`);
    }
  };

  const handleShareCart = async () => {
    if (!uid || !cartDocId) return;

    try {
      // Create/Update shared cart document in Firestore
      await syncToSharedCart(items);
      setSharedCartId(cartDocId);
      setShowShareBar(true);

      const shareUrl = `${window.location.origin}${window.location.pathname}?cartId=${cartDocId}`;
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const el = document.createElement('textarea');
        el.value = shareUrl;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Failed to generate shared cart link:", err);
    }
  };

  const copyShareUrl = async () => {
    if (!cartDocId) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?cartId=${cartDocId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn("Copy fallback triggered:", e);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 font-sans select-none" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {/* Header with Share & QR Buttons */}
      <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
            {t('shopping.remaining', { count: items.filter(i => !i.completed).length })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              await handleShareCart();
              setShowQrModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-xs font-bold transition-all shadow-sm"
            title="Generate QR Code"
          >
            <QrCode size={14} className="text-[#A6DDB1]" />
            <span>{t('shopping.qr_code', 'QR Code')}</span>
          </button>

          <button
            onClick={handleShareCart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#A6DDB1]/20 hover:bg-[#A6DDB1]/30 border border-[#A6DDB1]/50 text-neutral-800 text-xs font-bold transition-all"
            title="Share live shopping cart link"
          >
            <Share2 size={14} className="text-[#3b824d]" />
            <span>{copied ? t('shopping.copied', 'Copied') : t('shopping.share', 'Share')}</span>
          </button>
        </div>
      </div>

      {/* Shared Active Banner */}
      {showShareBar && (
        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900 gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-medium">{t('shopping.public_link_live', 'Public link live — items update live when crossed out!')}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowQrModal(true)}
              className="p-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg text-[10px] font-bold transition-colors"
              title="View QR Code"
            >
              <QrCode size={14} />
            </button>
            <button
              onClick={copyShareUrl}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-colors"
            >
              {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
              {copied ? t('shopping.copied', 'Copied') : t('shopping.copy', 'Copy')}
            </button>
          </div>
        </div>
      )}

      {/* QR Code Modal Overlay */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center gap-4 relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-2xl bg-[#A6DDB1]/30 border border-[#A6DDB1] flex items-center justify-center text-[#2b6d3d]">
                <QrCode size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight mt-1">{t('shopping.qr_code', 'QR Code')}</h3>
              <p className="text-xs text-slate-500 font-normal max-w-[240px]">
                {t('shopping.public_link_live', 'Scan this QR code with any phone camera to access and edit this shared cart live.')}
              </p>
            </div>

            {/* QR Code Box */}
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-100 shadow-inner flex items-center justify-center">
              <QRCodeSVG
                value={`${window.location.origin}${window.location.pathname}?cartId=${cartDocId}`}
                size={180}
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="M"
                includeMargin={true}
              />
            </div>

            <div className="w-full flex flex-col gap-2">
              <button
                onClick={copyShareUrl}
                className="w-full py-2.5 px-4 bg-[#A6DDB1] hover:brightness-105 text-slate-900 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                {copied ? <CheckCircle2 size={16} className="text-emerald-800" /> : <Copy size={16} />}
                <span>{copied ? t('shopping.copied', 'Link Copied to Clipboard!') : t('shopping.copy', 'Copy Shared Cart Link')}</span>
              </button>

              <button
                onClick={() => setShowQrModal(false)}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={addItem} className="flex gap-2">
        <input 
          type="text" 
          value={newItemText} 
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder={t('shopping.add_item', 'Add an item...')}
          className="flex-1 p-2.5 border border-neutral-250 rounded-xl text-xs text-neutral-800 placeholder-neutral-450 outline-none focus:border-[#A6DDB1] transition-colors"
        />
        <button 
          type="submit" 
          disabled={!newItemText.trim()}
          className="w-10 h-10 bg-[#A6DDB1] disabled:opacity-40 text-neutral-900 rounded-xl flex items-center justify-center hover:brightness-105 transition-all"
        >
          <Plus size={20} />
        </button>
      </form>

      {/* List Items */}
      <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-0.5">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400 font-normal border border-dashed border-neutral-200 rounded-xl whitespace-pre-line">
            {t('shopping.empty_cart', 'Your shopping cart is empty.\nAdd items above or share the link!')}
          </div>
        ) : (
          items.map(item => (
            <div 
              key={item.id} 
              onClick={() => toggleItem(item.id)}
              className={`flex items-center gap-2.5 p-3 border rounded-xl transition-all cursor-pointer ${
                item.completed 
                  ? 'bg-neutral-100/60 border-neutral-200/40 opacity-70' 
                  : 'bg-neutral-50/60 border-neutral-200/60 hover:border-[#A6DDB1]/60'
              }`}
            >
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItem(item.id);
                }} 
                className={`transition-colors ${item.completed ? 'text-[#3b824d]' : 'text-neutral-400 hover:text-[#3b824d]'}`}
              >
                {item.completed ? <Check size={18} className="stroke-[2.5]" /> : <Square size={18} />}
              </button>

              <span className={`flex-1 text-xs text-neutral-800 transition-all ${item.completed ? 'line-through text-neutral-400' : 'font-normal'}`}>
                {item.text}
              </span>

              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteItem(item.id);
                }} 
                className="text-neutral-400 hover:text-rose-500 p-1 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
