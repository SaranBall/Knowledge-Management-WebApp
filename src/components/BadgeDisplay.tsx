import React, { useState } from 'react';
import { 
  Zap, Shield, Trophy, Award, Sparkles, BookOpen, GraduationCap, Target, Crown 
} from 'lucide-react';
import { Badge } from '../utils/badgeUtils';

// Helper component to render Lucide icons dynamically
export const BadgeIcon: React.FC<{ name: string; className?: string }> = ({ name, className = "w-4 h-4" }) => {
  switch (name) {
    case 'Zap':
      return <Zap className={className} />;
    case 'Shield':
      return <Shield className={className} />;
    case 'Trophy':
      return <Trophy className={className} />;
    case 'Award':
      return <Award className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'BookOpen':
      return <BookOpen className={className} />;
    case 'GraduationCap':
      return <GraduationCap className={className} />;
    case 'Target':
      return <Target className={className} />;
    case 'Crown':
      return <Crown className={className} />;
    default:
      return <Award className={className} />;
  }
};

interface BadgePillProps {
  badge: Badge;
  showDetailOnClick?: boolean;
}

export const BadgePill: React.FC<BadgePillProps> = ({ badge, showDetailOnClick = false }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const { color, earned, title, description, iconName } = badge;

  // Colors mapping for badges
  const colorClasses = {
    amber: earned 
      ? 'bg-amber-100 text-amber-805 border-amber-300 hover:bg-amber-150' 
      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-40',
    teal: earned 
      ? 'bg-teal-100 text-teal-805 border-teal-300 hover:bg-teal-150' 
      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-40',
    emerald: earned 
      ? 'bg-emerald-105 text-emerald-805 border-emerald-300 hover:bg-emerald-150' 
      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-40',
    indigo: earned 
      ? 'bg-indigo-100 text-indigo-805 border-indigo-300 hover:bg-indigo-150' 
      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-40',
    rose: earned 
      ? 'bg-rose-100 text-rose-805 border-rose-300 hover:bg-rose-150' 
      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-40',
    violet: earned 
      ? 'bg-violet-100 text-violet-805 border-violet-300 hover:bg-violet-150' 
      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-40',
  }[color] || 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div 
      className="relative z-1"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold font-sans transition-all duration-200 ${colorClasses} ${earned ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed select-none'}`}>
        <BadgeIcon name={iconName} className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[110px]">{title.split(' (')[0]}</span>
      </div>

      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-2.5 bg-slate-900/98 text-white rounded-xl text-xs shadow-xl backdrop-blur-xs transition duration-150 animate-in fade-in slide-in-from-bottom-2 z-50 pointer-events-none text-left">
          <div className="flex items-center gap-1.5 font-bold mb-1 border-b border-white/10 pb-1">
            <span className={`${earned ? 'text-amber-400' : 'text-slate-400'}`}>{earned ? '🏆 Verified Badge' : '🔒 Locked Badge'}</span>
          </div>
          <p className="font-extrabold text-slate-100">{title}</p>
          <p className="text-[10px] text-slate-300 font-sans leading-relaxed mt-1">{description}</p>
          <p className="text-[9.5px] text-slate-400 font-mono mt-1 border-t border-white/5 pt-1">
            🔍 เกณฑ์: {badge.requirement}
          </p>
          <p className="text-[9px] font-medium text-emerald-400 mt-0.5">
            สถานะ: {badge.progressText}
          </p>
        </div>
      )}
    </div>
  );
};

interface UserBadgesGridProps {
  badges: Badge[];
}

export const UserBadgesGrid: React.FC<UserBadgesGridProps> = ({ badges }) => {
  const earnedBadges = badges.filter(b => b.earned);
  const lockedBadges = badges.filter(b => !b.earned);

  return (
    <div className="space-y-4">
      {/* Earned Section summary card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
        {badges.map((badge) => {
          const { id, title, description, earned, iconName, color, requirement, progressText } = badge;
          
          const headerColors = {
            amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
            teal: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
            emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
            indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
            rose: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
            violet: 'bg-violet-500/10 text-violet-600 border-violet-500/20'
          }[color] || 'bg-slate-500/10 text-slate-600 border-slate-500/20';

          return (
            <div 
              key={id} 
              className={`p-3.5 rounded-2xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                earned 
                  ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md' 
                  : 'bg-slate-50/50 border-slate-150/80 grayscale opacity-65'
              }`}
            >
              {earned && (
                <div className="absolute top-0 right-0 w-12 h-12 overflow-hidden pointer-events-none">
                  <div className="bg-emerald-500 text-white text-[7px] font-bold text-center py-0.5 w-16 -rotate-45 translate-x-3 translate-y-2 uppercase tracking-wide">Earn</div>
                </div>
              )}

              {/* Icon Container */}
              <div className="space-y-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center border font-bold ${headerColors} ${earned ? 'animate-in zoom-in-95' : ''}`}>
                  <BadgeIcon name={iconName} className="w-4 h-4" />
                </div>

                <div className="space-y-1">
                  <h4 className={`font-black text-xs leading-snug ${earned ? 'text-slate-800' : 'text-slate-500'}`}>
                    {title.split(' (')[0]}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-normal leading-relaxed">
                    {description.split(' หรือ')[0]}
                  </p>
                </div>
              </div>

              {/* Footnote criteria details */}
              <div className="mt-4 pt-2.5 border-t border-slate-100 space-y-1 text-left">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">เกณฑ์เป้าหมาย:</span>
                <p className="text-[9px] text-slate-500 leading-snug">{requirement}</p>
                <div className="pt-1 flex items-center justify-between text-[8px] font-mono font-bold mt-1">
                  <span className="text-slate-400">STATUS:</span>
                  <span className={earned ? 'text-emerald-600 uppercase' : 'text-slate-400 uppercase'}>
                    {progressText || (earned ? 'COMPLETED' : 'LOCKED')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
