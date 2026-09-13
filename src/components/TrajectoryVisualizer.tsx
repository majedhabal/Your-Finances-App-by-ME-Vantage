import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Sparkles, Sliders, Calendar, Check, Shield } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useTranslation } from '@/lib/i18n';

interface TrajectoryVisualizerProps {
  startingNetWorth: number;
  baseCurrency: string;
  monthlySalary: number;
}

export const TrajectoryVisualizer: React.FC<TrajectoryVisualizerProps> = ({
  startingNetWorth,
  baseCurrency,
  monthlySalary
}) => {
  const { t } = useTranslation();
  const [yearsHorizon, setYearsHorizon] = useState<5 | 10 | 20>(10);
  const [annualGrowthRate, setAnnualGrowthRate] = useState<number>(7);

  const calculatedProjectionData = useMemo(() => {
    const dataPoints = [];
    let cumulativeWealth = startingNetWorth;
    const annualSavingsInput = monthlySalary * 12 * 0.35; // Standard 35% compound rule benchmark

    const currentYear = new Date().getFullYear();

    for (let year = 0; year <= yearsHorizon; year++) {
      dataPoints.push({
        label: `'${String(currentYear + year).substring(2)}`,
        wealth: Math.round(cumulativeWealth)
      });
      cumulativeWealth = (cumulativeWealth + annualSavingsInput) * (1 + annualGrowthRate / 100);
    }
    return dataPoints;
  }, [startingNetWorth, monthlySalary, yearsHorizon, annualGrowthRate]);

  return (
    <div 
      className="w-full p-5 flex flex-col gap-5 box-border transition-all duration-300"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: 'var(--glass-border)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-card)'
      }}
    >
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-3 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 text-[#A6DDB1] flex items-center justify-center">
            <TrendingUp size={16} />
          </div>
          <div className="flex flex-col">
            <h4 className="text-sm font-bold text-white m-0 tracking-tight lowercase">{t('trajectory_visualizer.title')}</h4>
            <span className="text-[10px] text-neutral-400 font-medium mt-0.5">{t('trajectory_visualizer.subtitle')}</span>
          </div>
        </div>

        {/* TIME CONTROLS BAR */}
        <div className="flex gap-1.5 p-1 bg-black/20 rounded-xl border border-white/5 self-start sm:self-auto">
          {([5, 10, 20] as const).map((horizon) => (
            <button
              key={horizon}
              onClick={() => setYearsHorizon(horizon)}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                yearsHorizon === horizon 
                  ? 'bg-[#A6DDB1] border-transparent text-[#1E2229]' 
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {t('trajectory_visualizer.years', { count: horizon })}
            </button>
          ))}
        </div>
      </div>

      {/* 3D CHART LAYER CONTAINER */}
      <div 
        className="w-full h-[240px] relative my-2 py-2"
        style={{
          perspective: '1000px',
          transformStyle: 'preserve-3d'
        }}
      >
        <div 
          className="w-full h-full relative transition-transform duration-500 hover:rotate-x-[15deg] hover:rotate-y-[-2deg]"
          style={{
            transform: 'rotateX(22deg) rotateY(-6deg) rotateZ(1deg) translateZ(10px)',
            transformStyle: 'preserve-3d',
            filter: 'drop-shadow(0px 20px 25px rgba(0, 0, 0, 0.4))'
          }}
        >
          {/* 3D Floor Grid Plane */}
          <div 
            className="absolute inset-0 pointer-events-none rounded-xl border border-white/5"
            style={{
              background: 'linear-gradient(180deg, rgba(166, 221, 177, 0.08) 0%, rgba(0, 0, 0, 0) 100%)',
              backgroundImage: 'radial-gradient(rgba(166, 221, 177, 0.2) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
              transform: 'translateZ(-15px)'
            }}
          />

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={calculatedProjectionData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <filter id="vantageGrowth3DShadow" x="-20%" y="-20%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#000000" floodOpacity="0.5" />
                </filter>

                <linearGradient id="vantageGrowth3DGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#366945" stopOpacity={0.7} />
                  <stop offset="40%" stopColor="rgba(166, 221, 177, 0.35)" />
                  <stop offset="100%" stopColor="rgba(166, 221, 177, 0.02)" />
                </linearGradient>

                <linearGradient id="vantageGrowth3DRidge" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1E4327" />
                  <stop offset="50%" stopColor="#A6DDB1" />
                  <stop offset="100%" stopColor="#2E5A3B" />
                </linearGradient>

                <radialGradient id="vantageGrowth3DSphere" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="45%" stopColor="#A6DDB1" />
                  <stop offset="100%" stopColor="#1E4327" />
                </radialGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(20, 24, 33, 0.92)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(166, 221, 177, 0.3)',
                  borderRadius: '12px',
                  boxShadow: '0 16px 36px 0 rgba(0,0,0,0.5)',
                  padding: '10px 14px',
                  transform: 'translateZ(30px)'
                }}
                labelStyle={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}
                itemStyle={{ fontSize: 11, fontWeight: 700, color: '#A6DDB1' }}
                formatter={(value) => [`${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`, t('trajectory_visualizer.tooltip_label')]}
              />

              {/* 3D Floor Shadow Projection Path */}
              <Area 
                type="monotone" 
                dataKey="wealth" 
                stroke="rgba(0,0,0,0.35)" 
                strokeWidth={5}
                fill="none" 
                style={{ transform: 'translateY(12px)', filter: 'blur(4px)' }}
              />

              {/* 3D Extruded Top Ridge Area */}
              <Area 
                type="monotone" 
                dataKey="wealth" 
                stroke="url(#vantageGrowth3DRidge)" 
                strokeWidth={4.5} 
                strokeLinecap="round"
                fill="url(#vantageGrowth3DGradient)" 
                filter="url(#vantageGrowth3DShadow)"
                dot={{
                  r: 3.5,
                  fill: 'url(#vantageGrowth3DSphere)',
                  stroke: '#1E4327',
                  strokeWidth: 1.5
                }}
                activeDot={{ 
                  r: 6.5, 
                  stroke: '#1E2229', 
                  strokeWidth: 2, 
                  fill: '#A6DDB1',
                  style: { filter: 'drop-shadow(0 0 10px #A6DDB1)' }
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PARAMETER TUNING FOOTER ROW GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-3 select-none">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-wider text-neutral-400 pl-0.5">{t('trajectory_visualizer.compounding_rate', { rate: annualGrowthRate })}</span>
          <input 
            type="range" 
            min="1" 
            max="15" 
            value={annualGrowthRate} 
            onChange={(e) => setAnnualGrowthRate(Number(e.target.value))} 
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#A6DDB1]" 
          />
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-start gap-2.5">
          <Shield size={14} className="text-[#A6DDB1] shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-neutral-400 m-0">
            {t('trajectory_visualizer.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
};
