import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, UserCheck, UserX, Shield, Mail, Calendar, Clock, Trash2 } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface AdminUserManagementProps {
  onSelectUserForGift?: (userId: string) => void;
}

export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ onSelectUserForGift }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedUsers = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(fetchedUsers);
    } catch (err) {
      console.error('Error fetching registered users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete user ${email || userId} and all their records from Firebase?`)) {
      return;
    }
    try {
      // Delete subcollections documents if any exist
      const subCols = ['accounts', 'miniBudgets', 'transactions', 'recurringTransactions'];
      for (const col of subCols) {
        try {
          const snap = await getDocs(collection(db, 'users', userId, col));
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
          }
        } catch (subErr) {
          console.warn(`Could not delete subcollection ${col}:`, subErr);
        }
      }

      // Delete main user document from Firestore
      await deleteDoc(doc(db, 'users', userId));
      setUsers(prev => prev.filter(u => (u.id || u.uid) !== userId));
      alert(`User ${email || userId} successfully removed from Firebase.`);
    } catch (err) {
      console.error('Error deleting user from Firebase:', err);
      alert('Failed to delete user from Firebase.');
    }
  };

  const filteredUsers = users.filter(u => 
    (u.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.id || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search and Header actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Search by email, name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-normal text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
          <p className="text-sm text-zinc-500 font-normal">
            Total Users: <span className="font-bold text-zinc-900">{users.length}</span>
          </p>
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium text-sm rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">User & Name</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Account Created Date</th>
                <th className="py-3.5 px-4">Last Login Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm font-normal text-zinc-700">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    Loading registered users from Firestore...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-400">
                    No registered users found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const formatFirebaseDate = (val: any, fallback: string = 'N/A') => {
                    if (!val) return fallback;
                    if (typeof val.toDate === 'function') {
                      return val.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    }
                    if (val.seconds) {
                      return new Date(val.seconds * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    }
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) {
                      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    }
                    return fallback;
                  };

                  const userEmail = (u.email && typeof u.email === 'string' && u.email.includes('@')) 
                    ? u.email 
                    : ((u.userEmail && typeof u.userEmail === 'string' && u.userEmail.includes('@')) ? u.userEmail : 'No email provided');

                  const createdAtRaw = u.createdAt || u.onboardedAt || null;
                  const lastLoginRaw = u.lastLogin || u.updatedAt || null;

                  const createdAtFormatted = formatFirebaseDate(createdAtRaw, 'N/A');
                  const lastLoginFormatted = formatFirebaseDate(lastLoginRaw, 'Recent session');

                  // Determine active/inactive status (active if logged in within last 30 days or createdAt within 30 days)
                  const now = new Date().getTime();
                  const parseTime = (val: any) => {
                    if (!val) return 0;
                    if (typeof val.toDate === 'function') return val.toDate().getTime();
                    if (val.seconds) return val.seconds * 1000;
                    const d = new Date(val);
                    return !isNaN(d.getTime()) ? d.getTime() : 0;
                  };
                  const lastLoginTime = parseTime(lastLoginRaw) || parseTime(createdAtRaw) || now;
                  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
                  const isActive = (now - lastLoginTime) < thirtyDaysMs;

                  return (
                    <tr key={u.id || idx} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-zinc-900 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-zinc-100 text-zinc-800 flex items-center justify-center font-bold text-xs border border-zinc-200">
                          {(u.fullName || userEmail || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900">{u.fullName || 'Anonymous User'}</p>
                          <p className="text-xs text-zinc-400 font-normal">ID: {u.id.substring(0, 8)}...</p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{userEmail}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{createdAtFormatted}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{lastLoginFormatted}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div id={idx === 0 ? "user-actions-container" : undefined} className="flex items-center justify-end gap-2">
                          {onSelectUserForGift && (
                            <button
                              onClick={() => onSelectUserForGift(u.id || u.uid)}
                              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                            >
                              Send Gift
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.id || u.uid, u.email)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors border border-rose-200"
                            title="Delete User from Firebase"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
