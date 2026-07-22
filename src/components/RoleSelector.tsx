/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, Role } from '../types';
import { Shield, Sparkles, UserCheck } from 'lucide-react';

interface RoleSelectorProps {
  users: User[];
  currentUser: User;
  onUserChange: (user: User) => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({
  users,
  currentUser,
  onUserChange,
}) => {
  return (
    <div id="simulated-role-panel" className="bg-slate-900 text-slate-100 border-b border-indigo-950 px-3 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center bg-indigo-600/30 text-indigo-300 p-1 rounded">
            <Shield className="w-4 h-4" />
          </span>
          <div>
            <h4 className="font-semibold text-slate-200">
              ระบบทดสอบจำลองบทบาทผู้ใช้ (Role Simulator)
            </h4>
            <p className="text-[10px] text-slate-400">
              คลิกสลับบัญชีเพื่อทดสอบสิทธิ์ (Admin / Editor / Viewer) และการทำงานแต่ละเวิร์กโฟลว์
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {users.map((user) => {
            const isSelected = user.id === currentUser.id;
            const displayedRole = (user.role === 'Admin' && currentUser.role !== 'Admin') ? 'Editor' : user.role;
            let roleBadgeClass = "bg-slate-700 text-slate-300";
            if (displayedRole === 'Admin') roleBadgeClass = isSelected ? "bg-red-500 text-white" : "bg-red-500/20 text-red-300";
            if (displayedRole === 'Editor') roleBadgeClass = isSelected ? "bg-amber-500 text-slate-900" : "bg-amber-500/20 text-amber-300";
            if (displayedRole === 'Viewer') roleBadgeClass = isSelected ? "bg-green-500 text-slate-900" : "bg-green-500/20 text-green-300";

            return (
              <button
                key={user.id}
                id={`btn-select-user-${user.id}`}
                onClick={() => onUserChange(user)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer text-left ${
                  isSelected
                    ? 'border-indigo-500 bg-slate-800 shadow-lg ring-1 ring-indigo-500'
                    : 'border-slate-800 bg-slate-955 hover:bg-slate-800/80 hover:border-slate-700'
                }`}
              >
                <img
                  src={user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full border border-slate-700 object-cover"
                />
                <div>
                  <div className="font-medium text-slate-200 flex items-center gap-1.5 leading-none">
                    <span>{user.name.split(' ')[0]}</span>
                    <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${roleBadgeClass}`}>
                      {displayedRole}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono inline-block mt-0.5">
                    {user.position.split(' / ')[0]}
                  </span>
                </div>
                {isSelected && <UserCheck className="w-3.5 h-3.5 text-indigo-400 ml-1 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
