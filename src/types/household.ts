export type PermissionLevel = 'full_access' | 'view_only' | 'split_view';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface SharedPartner {
  partnerUid?: string;
  partnerEmail: string;
  partnerName?: string;
  permissionLevel: PermissionLevel;
  status: InvitationStatus;
  inviteCode: string;
  invitedAt: string;
  acceptedAt?: string;
  revokedAt?: string;
}

export interface SharedInvitation {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  recipientEmail: string;
  permissionLevel: PermissionLevel;
  status: InvitationStatus;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorName?: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface LinkedWorkspace {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  permissionLevel: PermissionLevel;
  status: 'active' | 'revoked';
  linkedAt: string;
}
