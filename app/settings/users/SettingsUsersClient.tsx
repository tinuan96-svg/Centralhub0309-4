'use client';

import { useState, useEffect } from 'react';
import { userService, UserProfile } from '@/lib/services/userService';

export default function UsersManagementPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    profile_role: 'user' as 'admin' | 'user',
    is_active: true
  });

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    const data = await userService.getAllProfiles();
    setProfiles(data);
    setLoading(false);
  };

  const handleEdit = (profile: UserProfile) => {
    setEditingProfile(profile);
    setFormData({
      full_name: profile.full_name || '',
      profile_role: profile.profile_role,
      is_active: profile.is_active
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    const success = await userService.updateProfile(editingProfile.id, formData);
    if (success) {
      setEditingProfile(null);
      loadProfiles();
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-14 fold-inner:static z-20 bg-slate-950/80 backdrop-blur-md fold-inner:bg-transparent -mx-4 px-4 py-3 border-b fold-inner:border-0 border-slate-800/50">
        <h2 className="text-xl font-bold text-white uppercase tracking-tighter">User Management</h2>
        <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-0.5">Admin & Access Control</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-4">
           {/* Desktop Table */}
           <div className="hidden fold-inner:block bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
             <table className="w-full text-left">
               <thead>
                 <tr className="bg-slate-800/50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                   <th className="px-6 py-4">User</th>
                   <th className="px-6 py-4">Role</th>
                   <th className="px-6 py-4">Status</th>
                   <th className="px-6 py-4 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/50">
                 {profiles.map((profile) => (
                   <tr key={profile.id} className="hover:bg-slate-800/30 transition-colors">
                     <td className="px-6 py-4">
                       <div className="font-bold text-slate-100 uppercase tracking-tight">{profile.full_name || 'No Name'}</div>
                       <div className="text-[10px] text-slate-500 font-mono">{profile.email}</div>
                     </td>
                     <td className="px-6 py-4">
                       <span className={`px-2 py-0.5 text-[9px] uppercase font-black rounded border ${
                         profile.profile_role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
                       }`}>
                         {profile.profile_role}
                       </span>
                     </td>
                     <td className="px-6 py-4">
                       <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${
                         profile.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                       }`}>
                         {profile.is_active ? 'Active' : 'Inactive'}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-right">
                       <button
                         onClick={() => handleEdit(profile)}
                         className="text-cyan-400 hover:text-cyan-300 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 transition-all active:scale-95"
                       >
                         Manage
                       </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>

           {/* Mobile Cards */}
           <div className="fold-inner:hidden space-y-3">
              {profiles.map((profile) => (
                 <div key={profile.id} className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
                    <div className="flex justify-between items-start">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-black text-white text-lg">
                             {profile.full_name?.[0]?.toUpperCase() || profile.email?.[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                             <p className="font-bold text-slate-100 uppercase tracking-tight truncate">{profile.full_name || 'No Name'}</p>
                             <p className="text-[10px] text-slate-500 font-mono truncate">{profile.email}</p>
                          </div>
                       </div>
                       <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded border ${
                         profile.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                       }`}>
                         {profile.is_active ? 'Active' : 'Inactive'}
                       </span>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                       <div className="flex flex-col">
                          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Access Level</span>
                          <span className={`w-fit px-2 py-0.5 text-[9px] uppercase font-black rounded border ${
                            profile.profile_role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {profile.profile_role}
                          </span>
                       </div>
                       <button
                         onClick={() => handleEdit(profile)}
                         className="px-6 py-2.5 bg-slate-800 text-cyan-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 active:scale-95 transition-all"
                       >
                         Manage Permissions
                       </button>
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}

      {editingProfile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Edit User Permissions</h3>
            <p className="text-sm text-slate-400 mb-4">Updating permissions for {editingProfile.email}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Role</label>
                <select
                  value={formData.profile_role}
                  onChange={e => setFormData({ ...formData, profile_role: e.target.value as 'admin' | 'user' })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Active Account</span>
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
