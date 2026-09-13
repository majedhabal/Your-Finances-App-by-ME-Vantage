import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SharedInvitation, SharedPartner, LinkedWorkspace } from '../types/household';

interface RedeemInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  onUpdateProfile: (updatedProfile: any) => void;
  initialCode?: string;
}

export const RedeemInviteModal: React.FC<RedeemInviteModalProps> = ({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
  initialCode = ''
}) => {
  const [code, setCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SharedInvitation | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  if (!isOpen) return null;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMsg("Please enter a valid invitation code.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessData(null);

    try {
      const cleanCode = code.trim().toUpperCase();
      const inviteRef = doc(db, 'shared_invitations', cleanCode);
      const inviteSnap = await getDoc(inviteRef);

      if (!inviteSnap.exists()) {
        setErrorMsg("Invalid or expired invitation code. Please verify with the primary workspace owner.");
        setIsLoading(false);
        return;
      }

      const inviteData = inviteSnap.data() as SharedInvitation;

      if (inviteData.status === 'revoked') {
        setErrorMsg("This invitation has been revoked by the workspace owner.");
        setIsLoading(false);
        return;
      }

      // Verify recipient email if profile exists
      const userEmail = (profile?.email || '').trim().toLowerCase();
      const expectedEmail = (inviteData.recipientEmail || '').trim().toLowerCase();

      if (userEmail && expectedEmail && userEmail !== expectedEmail) {
        setErrorMsg(`This invitation was sent to ${expectedEmail}, but you are currently logged in as ${userEmail}. Please log in with the invited email address to claim this workspace.`);
        setIsLoading(false);
        return;
      }

      // 1. Update invitation status to 'accepted'
      await updateDoc(inviteRef, {
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });

      // 2. Update owner's sharedPartners record
      const ownerUid = inviteData.ownerUid;
      const ownerRef = doc(db, 'users', ownerUid);
      const ownerSnap = await getDoc(ownerRef);

      if (ownerSnap.exists()) {
        const ownerData = ownerSnap.data();
        const existingPartners = Array.isArray(ownerData.sharedPartners) ? ownerData.sharedPartners : [];
        const updatedPartners = existingPartners.map((p: SharedPartner) => {
          if (p.inviteCode === cleanCode || p.partnerEmail.toLowerCase() === expectedEmail) {
            return {
              ...p,
              partnerUid: profile.uid,
              partnerName: profile.fullName || 'Partner',
              status: 'accepted',
              acceptedAt: new Date().toISOString()
            };
          }
          return p;
        });

        await updateDoc(ownerRef, {
          sharedPartners: updatedPartners,
          updatedAt: new Date().toISOString()
        });
      }

      // 3. Add linked workspace to current user profile
      const newLinkedWorkspace: LinkedWorkspace = {
        ownerUid: inviteData.ownerUid,
        ownerName: inviteData.ownerName,
        ownerEmail: inviteData.ownerEmail,
        permissionLevel: inviteData.permissionLevel,
        status: 'active',
        linkedAt: new Date().toISOString()
      };

      const currentLinked = Array.isArray(profile?.linkedWorkspaces) ? profile.linkedWorkspaces : [];
      const updatedLinked = [
        ...currentLinked.filter((w: LinkedWorkspace) => w.ownerUid !== inviteData.ownerUid),
        newLinkedWorkspace
      ];

      const userDocRef = doc(db, 'users', profile.uid);
      await updateDoc(userDocRef, {
        linkedWorkspaces: updatedLinked,
        updatedAt: new Date().toISOString()
      });

      const updatedProfile = {
        ...profile,
        linkedWorkspaces: updatedLinked
      };
      onUpdateProfile(updatedProfile);
      localStorage.setItem('vantage_user_profile', JSON.stringify(updatedProfile));

      setSuccessData(inviteData);
    } catch (err: any) {
      console.error("Error redeeming invite:", err);
      setErrorMsg(err.message || "Failed to redeem invitation code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-neutral-100"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-[#111c2d]" />
            <h3 className="text-[15px] font-bold text-[#111c2d]">Redeem Household Invite</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {successData ? (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#A6DDB1]/30 flex items-center justify-center mx-auto text-[#008744]">
                <CheckCircle2 size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-[16px] font-bold text-[#111c2d]">Workspace Successfully Linked!</h4>
                <p className="text-[13px] text-neutral-600 font-normal">
                  You are now connected to <strong>{successData.ownerName}</strong>'s financial workspace with <strong>{successData.permissionLevel.replace('_', ' ')}</strong> permission.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-[#111c2d] hover:bg-[#1f2d42] text-white text-[13px] font-bold transition-colors shadow-xs"
              >
                Launch Shared Workspace
              </button>
            </div>
          ) : (
            <form onSubmit={handleRedeem} className="space-y-4">
              <p className="text-[13px] text-neutral-600 font-normal leading-relaxed">
                Enter the secure invitation code sent to your email by the primary account owner to instantly link your household workspace.
              </p>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-bold text-[#111c2d] mb-1.5">
                  Invitation Code
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. INV-AB12CD"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-[14px] font-mono font-bold text-[#111c2d] tracking-wider uppercase focus:outline-none focus:border-[#111c2d] transition-colors"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[13px] font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#111c2d] hover:bg-[#1f2d42] text-white text-[13px] font-bold transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Claim Invitation</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
