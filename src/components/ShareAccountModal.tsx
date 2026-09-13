import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, UserPlus, Shield, Eye, Edit3, PieChart, Send, CheckCircle2, 
  Copy, Link, Trash2, Clock, Sparkles, AlertCircle, RefreshCw, Lock, 
  ChevronRight, Users, Activity, Check, Mail, ExternalLink, XCircle, KeyRound
} from 'lucide-react';
import { doc, updateDoc, setDoc, getDoc, collection, addDoc, getDocs, query, where, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PermissionLevel, SharedPartner, AuditLogEntry, LinkedWorkspace } from '../types/household';
import { RedeemInviteModal } from './RedeemInviteModal';

interface ShareAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  onUpdateProfile: (updatedProfile: any) => void;
  onOpenPremium?: () => void;
}

export const ShareAccountModal: React.FC<ShareAccountModalProps> = ({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
  onOpenPremium
}) => {
  const [activeTab, setActiveTab] = useState<'invite' | 'partners' | 'audit'>('invite');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>('full_access');
  const [invitationNote, setInvitationNote] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successLink, setSuccessLink] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emailSentNotice, setEmailSentNotice] = useState(false);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);

  // Partners and Audit logs state
  const [partnersList, setPartnersList] = useState<SharedPartner[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const isPaid = !!(
    profile?.subscriptionTier && 
    profile.subscriptionTier.toLowerCase() !== 'free'
  ) || profile?.isPremium;

  useEffect(() => {
    if (profile?.sharedPartners && Array.isArray(profile.sharedPartners)) {
      setPartnersList(profile.sharedPartners);
    }
  }, [profile?.sharedPartners]);

  useEffect(() => {
    if (isOpen && profile?.uid) {
      fetchAuditLogs();
    }
  }, [isOpen, profile?.uid]);

  const fetchAuditLogs = async () => {
    if (!profile?.uid) return;
    setIsLoadingLogs(true);
    try {
      const logsRef = collection(db, `users/${profile.uid}/audit_logs`);
      const snap = await getDocs(logsRef);
      const fetched: AuditLogEntry[] = [];
      snap.forEach((docSnap) => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as AuditLogEntry);
      });
      // Sort newest first
      fetched.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAuditLogs(fetched);
    } catch (err) {
      console.warn("Could not fetch audit logs:", err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const recordAuditLog = async (action: string, details: string) => {
    if (!profile?.uid) return;
    const newEntry: AuditLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUid: profile.uid,
      actorEmail: profile.email || 'primary.user@vantage.ae',
      actorName: profile.fullName || 'Primary Account Owner',
      action,
      details,
      timestamp: new Date().toISOString()
    };

    try {
      const logDocRef = doc(db, `users/${profile.uid}/audit_logs`, newEntry.id);
      await setDoc(logDocRef, newEntry);
      setAuditLogs(prev => [newEntry, ...prev]);
    } catch (e) {
      console.warn("Error saving audit log:", e);
    }
  };

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'INV-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      alert("Please enter a valid recipient email address.");
      return;
    }

    setIsSubmitting(true);
    setSuccessLink(null);
    setSuccessCode(null);
    setEmailSentNotice(false);

    try {
      const code = generateInviteCode();
      const inviteUrl = `${window.location.origin}/invite?code=${code}&owner=${encodeURIComponent(profile.email || '')}`;
      
      const newPartner: SharedPartner = {
        partnerEmail: recipientEmail.trim().toLowerCase(),
        permissionLevel,
        status: 'pending',
        inviteCode: code,
        invitedAt: new Date().toISOString()
      };

      // 1. Update owner's sharedPartners array
      const currentPartners = Array.isArray(profile?.sharedPartners) ? profile.sharedPartners : [];
      const updatedPartners = [
        ...currentPartners.filter((p: SharedPartner) => p.partnerEmail !== newPartner.partnerEmail),
        newPartner
      ];

      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, {
        sharedPartners: updatedPartners,
        updatedAt: new Date().toISOString()
      });

      // 2. Save invitation document to global `shared_invitations` for recipient lookup
      const inviteDocRef = doc(db, 'shared_invitations', code);
      await setDoc(inviteDocRef, {
        id: code,
        ownerUid: profile.uid,
        ownerName: profile.fullName || 'Account Owner',
        ownerEmail: profile.email || 'primary@vantage.ae',
        recipientEmail: recipientEmail.trim().toLowerCase(),
        permissionLevel,
        status: 'pending',
        inviteCode: code,
        note: invitationNote || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 3. Dispatch actual email via backend API using support@yourfinances.me
      try {
        await fetch('/api/send-invite-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: recipientEmail.trim().toLowerCase(),
            ownerName: profile.fullName || 'Account Owner',
            ownerEmail: profile.email || 'primary@vantage.ae',
            inviteCode: code,
            inviteUrl,
            permissionLevel,
            note: invitationNote || ''
          })
        });
      } catch (mailApiErr) {
        console.warn("Server email dispatch trigger warning:", mailApiErr);
      }

      // 4. Record Audit Log
      await recordAuditLog(
        "Dispatched Invitation",
        `Sent ${permissionLevel.replace('_', ' ')} invitation to ${recipientEmail.trim().toLowerCase()}`
      );

      // 4. Update profile in parent React state
      onUpdateProfile({
        ...profile,
        sharedPartners: updatedPartners
      });

      setSuccessCode(code);
      setSuccessLink(inviteUrl);
      setEmailSentNotice(true);
      setRecipientEmail('');
      setInvitationNote('');
      setPartnersList(updatedPartners);
    } catch (err) {
      console.error("Error creating invitation:", err);
      alert("Failed to send invitation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeAccess = async (partnerEmailToRevoke: string) => {
    if (!confirm(`Are you sure you want to revoke access for ${partnerEmailToRevoke}? They will immediately lose workspace access.`)) {
      return;
    }

    try {
      const currentPartners = Array.isArray(profile?.sharedPartners) ? profile.sharedPartners : [];
      const updatedPartners = currentPartners.map((partner: SharedPartner) => {
        if (partner.partnerEmail.toLowerCase() === partnerEmailToRevoke.toLowerCase()) {
          return {
            ...partner,
            status: 'revoked' as const,
            revokedAt: new Date().toISOString()
          };
        }
        return partner;
      });

      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, {
        sharedPartners: updatedPartners,
        updatedAt: new Date().toISOString()
      });

      await recordAuditLog(
        "Revoked Partner Access",
        `Terminated shared workspace access tokens for ${partnerEmailToRevoke}`
      );

      onUpdateProfile({
        ...profile,
        sharedPartners: updatedPartners
      });
      setPartnersList(updatedPartners);
    } catch (err) {
      console.error("Error revoking access:", err);
      alert("Failed to revoke access. Please try again.");
    }
  };

  const handleCancelInvitation = async (partnerEmailToCancel: string, inviteCodeToCancel?: string) => {
    try {
      const currentPartners = Array.isArray(profile?.sharedPartners) ? profile.sharedPartners : [];
      const updatedPartners = currentPartners.filter(
        (partner: SharedPartner) => partner.partnerEmail.toLowerCase() !== partnerEmailToCancel.toLowerCase()
      );

      if (profile?.uid) {
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, {
          sharedPartners: updatedPartners,
          updatedAt: new Date().toISOString()
        });
      }

      if (inviteCodeToCancel) {
        try {
          const inviteDocRef = doc(db, 'shared_invitations', inviteCodeToCancel);
          await deleteDoc(inviteDocRef);
        } catch (e) {
          console.warn("Could not delete invite doc:", e);
        }
      }

      try {
        await recordAuditLog(
          "Cancelled Invitation",
          `Cancelled pending household invitation for ${partnerEmailToCancel}`
        );
      } catch (logErr) {
        console.warn("Audit log warning:", logErr);
      }

      onUpdateProfile({
        ...profile,
        sharedPartners: updatedPartners
      });
      setPartnersList(updatedPartners);
    } catch (err) {
      console.error("Error cancelling invitation:", err);
      alert("Failed to cancel invitation. Please try again.");
    }
  };



  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-neutral-900/50 backdrop-blur-xs"
        />

        <motion.div 
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-neutral-100 overflow-hidden text-[#111c2d] font-['Google_Sans',sans-serif]"
        >
          {/* Top Header */}
          <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#A6DDB1]/20 flex items-center justify-center text-[#111c2d]">
                <Users size={18} />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#111c2d] leading-tight">Household Sharing & Partner Access</h2>
                <p className="text-[12px] text-neutral-500 font-normal">Manage joint finances with partners, family, or advisors</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {!isPaid ? (
            /* PAYWALL GATE (FREE TIER UPSELL BANNER) */
            <div className="p-5 sm:p-6 text-center bg-white space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#A6DDB1]/20 flex items-center justify-center text-[#111c2d]">
                <Lock size={26} className="text-[#111c2d]" />
              </div>
              
              <div className="space-y-1.5">
                <span className="inline-block px-3 py-1 rounded-full bg-[#A6DDB1]/25 text-[#111c2d] text-[12px] font-bold">
                  Premium Household Feature
                </span>
                <h3 className="text-[18px] font-bold text-[#111c2d]">Unlock Household Sharing</h3>
                <p className="text-[12px] text-neutral-600 font-normal max-w-xs mx-auto leading-relaxed">
                  Unlock Household Sharing with Tier 1, Tier 2 or Tier 3 to invite family members, sync joint accounts, and customize access permissions.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 text-left space-y-2">
                <div className="flex items-center gap-2 text-[12px] font-bold text-[#111c2d]">
                  <CheckCircle2 size={16} className="text-[#008744]" />
                  <span>Role-Based Access Control (View, Edit, or Split View)</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold text-[#111c2d]">
                  <CheckCircle2 size={16} className="text-[#008744]" />
                  <span>Real-time Shared Budget Gauges & Multi-User Activity Logs</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold text-[#111c2d]">
                  <CheckCircle2 size={16} className="text-[#008744]" />
                  <span>One-Tap Immediate Revocation Controls</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => {
                    onClose();
                    if (onOpenPremium) onOpenPremium();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#A6DDB1] hover:bg-[#95cbA0] text-[#111c2d] text-[12px] font-bold transition-all shadow-xs flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  <span>Upgrade Subscription</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[12px] font-bold transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            /* PAID FEATURE INTERFACE */
            <div>
              {/* Tab Navigation Bar */}
              <div className="grid grid-cols-3 border-b border-neutral-100 bg-neutral-50/50">
                <button
                  onClick={() => setActiveTab('invite')}
                  className={`py-3 px-3 text-[12px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'invite' 
                      ? 'border-[#111c2d] text-[#111c2d] bg-white' 
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <UserPlus size={14} />
                  <span>Send Invite</span>
                </button>
                <button
                  onClick={() => setActiveTab('partners')}
                  className={`py-3 px-3 text-[12px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'partners' 
                      ? 'border-[#111c2d] text-[#111c2d] bg-white' 
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Users size={14} />
                  <span>Partners ({partnersList.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`py-3 px-3 text-[12px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'audit' 
                      ? 'border-[#111c2d] text-[#111c2d] bg-white' 
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Activity size={14} />
                  <span>Audit Logs</span>
                </button>
              </div>

              <div className="p-4 sm:p-5 max-h-[70vh] overflow-y-auto">
                {/* TAB 1: SEND INVITATION */}
                {activeTab === 'invite' && (
                  <form onSubmit={handleSendInvitation} className="space-y-4">
                    {emailSentNotice && successCode && (
                      <div className="p-3.5 rounded-xl bg-[#A6DDB1]/20 border border-[#A6DDB1]/40 space-y-2">
                        <div className="flex items-center gap-2 text-[#111c2d]">
                          <CheckCircle2 size={16} className="text-[#008744]" />
                          <span className="text-[12px] font-bold">Invitation Successfully Dispatched!</span>
                        </div>
                        <p className="text-[12px] text-neutral-600 font-normal">
                          A branded email invitation has been dispatched to the recipient. You can also copy the direct invitation link or code below:
                        </p>
                        
                        <div className="p-2.5 rounded-lg bg-white border border-neutral-200 flex items-center justify-between gap-2 font-mono text-[12px]">
                          <span className="truncate text-neutral-800 font-bold">{successCode}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(successCode)}
                            className="px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-[#111c2d] text-[12px] font-bold transition-colors flex items-center gap-1"
                          >
                            {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedLink ? 'Copied' : 'Copy Code'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[12px] font-bold text-[#111c2d] mb-1">
                        Recipient Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="partner@example.com"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-[12px] font-normal text-[#111c2d] focus:outline-none focus:border-[#111c2d] transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-bold text-[#111c2d] mb-1">
                        Access Permission Level (RBAC)
                      </label>
                      <div className="space-y-2">
                        <label 
                          onClick={() => setPermissionLevel('full_access')}
                          className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-all ${
                            permissionLevel === 'full_access' 
                              ? 'border-[#111c2d] bg-neutral-50 shadow-xs' 
                              : 'border-neutral-200 hover:border-neutral-300 bg-white'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="perm" 
                            checked={permissionLevel === 'full_access'}
                            onChange={() => setPermissionLevel('full_access')}
                            className="mt-0.5 accent-[#111c2d]"
                          />
                          <div>
                            <div className="text-[12px] font-bold text-[#111c2d] flex items-center gap-1.5">
                              <Edit3 size={14} className="text-[#008744]" />
                              <span>Full Collaborative Editing</span>
                            </div>
                            <p className="text-[12px] text-neutral-500 font-normal mt-0.5">
                              Can view, log, and edit transactions, mini-budgets, and joint account details.
                            </p>
                          </div>
                        </label>

                        <label 
                          onClick={() => setPermissionLevel('view_only')}
                          className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-all ${
                            permissionLevel === 'view_only' 
                              ? 'border-[#111c2d] bg-neutral-50 shadow-xs' 
                              : 'border-neutral-200 hover:border-neutral-300 bg-white'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="perm" 
                            checked={permissionLevel === 'view_only'}
                            onChange={() => setPermissionLevel('view_only')}
                            className="mt-0.5 accent-[#111c2d]"
                          />
                          <div>
                            <div className="text-[12px] font-bold text-[#111c2d] flex items-center gap-1.5">
                              <Eye size={14} className="text-blue-600" />
                              <span>View Only</span>
                            </div>
                            <p className="text-[12px] text-neutral-500 font-normal mt-0.5">
                              Can view budget gauges, balances, and shared ledgers, but cannot modify core settings or salary definitions.
                            </p>
                          </div>
                        </label>

                        <label 
                          onClick={() => setPermissionLevel('split_view')}
                          className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-all ${
                            permissionLevel === 'split_view' 
                              ? 'border-[#111c2d] bg-neutral-50 shadow-xs' 
                              : 'border-neutral-200 hover:border-neutral-300 bg-white'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="perm" 
                            checked={permissionLevel === 'split_view'}
                            onChange={() => setPermissionLevel('split_view')}
                            className="mt-0.5 accent-[#111c2d]"
                          />
                          <div>
                            <div className="text-[12px] font-bold text-[#111c2d] flex items-center gap-1.5">
                              <PieChart size={14} className="text-amber-600" />
                              <span>Split Expense View</span>
                            </div>
                            <p className="text-[12px] text-neutral-500 font-normal mt-0.5">
                              Restricted to joint/shared expense categories and shared household mini-budgets only.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-bold text-[#111c2d] mb-1">
                        Personal Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={invitationNote}
                        onChange={(e) => setInvitationNote(e.target.value)}
                        placeholder="e.g. Joining our household budget account"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-[12px] font-normal text-[#111c2d] focus:outline-none focus:border-[#111c2d] transition-colors"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#111c2d] text-white text-[12px] font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors shadow-xs"
                    >
                      {isSubmitting ? (
                        <span className="animate-pulse">Dispatching Invitation...</span>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Send Secure Invitation</span>
                        </>
                      )}
                    </button>

                    <div className="pt-3 border-t border-neutral-100 text-center">
                      <button
                        type="button"
                        onClick={() => setIsRedeemModalOpen(true)}
                        className="text-[12px] font-bold text-[#111c2d] hover:underline flex items-center justify-center gap-1.5 mx-auto"
                      >
                        <KeyRound size={14} className="text-[#008744]" />
                        <span>Have an invite code? Redeem partner code</span>
                      </button>
                    </div>

                    <RedeemInviteModal
                      isOpen={isRedeemModalOpen}
                      onClose={() => setIsRedeemModalOpen(false)}
                      profile={profile}
                      onUpdateProfile={onUpdateProfile}
                    />
                  </form>
                )}

                {/* TAB 2: MANAGED PARTNERS & REVOCATION CONTROL */}
                {activeTab === 'partners' && (
                  <div className="space-y-3">
                    {partnersList.length === 0 ? (
                      <div className="py-8 text-center text-neutral-500 space-y-2">
                        <Users size={28} className="mx-auto text-neutral-300" />
                        <p className="text-[12px] font-normal">No shared partners or invitations sent yet.</p>
                        <button
                          onClick={() => setActiveTab('invite')}
                          className="px-3 py-1.5 rounded-lg bg-[#A6DDB1] text-[#111c2d] text-[12px] font-bold"
                        >
                          Invite Partner Now
                        </button>
                      </div>
                    ) : (
                      partnersList.map((partner, idx) => (
                        <div 
                          key={idx}
                          className="p-3.5 rounded-xl border border-neutral-200/80 bg-white flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-bold text-[#111c2d]">
                                {partner.partnerEmail}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-normal">
                              <span>Permission: {partner.permissionLevel.replace('_', ' ')}</span>
                              <span>•</span>
                              <span>Code: {partner.inviteCode}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              partner.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : partner.status === 'revoked'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {partner.status === 'accepted' ? 'Active' : partner.status === 'revoked' ? 'Revoked' : 'Pending'}
                            </span>

                            {partner.status === 'pending' || !partner.status ? (
                              <button
                                onClick={() => handleCancelInvitation(partner.partnerEmail, partner.inviteCode)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition-colors flex items-center gap-1"
                              >
                                <XCircle size={12} />
                                <span>Cancel Invitation</span>
                              </button>
                            ) : partner.status === 'accepted' ? (
                              <button
                                onClick={() => handleRevokeAccess(partner.partnerEmail)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-colors flex items-center gap-1"
                              >
                                <Trash2 size={12} />
                                <span>Revoke Access</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-neutral-400 font-normal italic">Revoked</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}




              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
