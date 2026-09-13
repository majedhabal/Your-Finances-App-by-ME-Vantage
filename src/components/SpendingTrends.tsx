import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TrendingDown, Activity, Calendar } from 'lucide-react';
import { VantageDataErrorBoundary } from './VantageDataErrorBoundary';

interface SpendingTrendsProps {
  allTransactions: any[];
  selectedAccIds: Set<string>;
  accounts: any[];
  baseCurrency: string;
  getRateToAED: (curr: string) => number;
}

export const SpendingTrends: React.FC<SpendingTrendsProps> = ({
  allTransactions,
  selectedAccIds,
  accounts,
  baseCurrency,
  getRateToAED
}) => {
  const baseRateToAED = getRateToAED(baseCurrency);

  const chartData = useMemo(() => {
    const daysData: { dateStr: string; label: string; amount: number }[] = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      daysData.push({ dateStr, label, amount: 0 });
    }

    allTransactions.forEach(tx => {
      if (tx.type !== 'expense' && tx.type !== 'Outflow') return;
      if (selectedAccIds.size > 0 && !selectedAccIds.has(tx.accountId)) return;

      const txDateStr = typeof tx.date === 'string' ? tx.date.substring(0, 10) : '';
      const matchDay = daysData.find(d => d.dateStr === txDateStr);
      
      if (matchDay) {
        const txAccount = accounts.find(a => a.id === tx.accountId);
        const txCurrency = txAccount?.currency || baseCurrency;
        
        let amountInAED = tx.amount || 0;
        if (txCurrency !== 'AED') {
          const rateToAED = getRateToAED(txCurrency);
          amountInAED = amountInAED * rateToAED;
        }

        const amountInBase = amountInAED / baseRateToAED;
        matchDay.amount += amountInBase;
      }
    });

    return daysData.map(d => ({
      name: d.label,
      spending: parseFloat(d.amount.toFixed(2))
    }));
  }, [allTransactions, selectedAccIds, accounts, baseCurrency, baseRateToAED, getRateToAED]);

  const totalPeriodBurn = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.spending, 0);
  }, [chartData]);

  return (
    <VantageDataErrorBoundary>
      <div 
        className="w-full p-5 flex flex-col gap-4 box-border transition-all duration-300"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: 'var(--glass-border)',
          borderRadius: '24px',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        {/* SUMMARY INSIGHT ROW */}
        <div className="flex items-center justify-between select-none border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <TrendingDown size={16} />
            </div>
            <div className="flex flex-col">
              <h4 className="text-sm font-bold text-white m-0 tracking-tight lowercase">spending trends</h4>
              <span className="text-[12px] text-neutral-400 font-medium mt-0.5">Rolling 30-day allocation timeline</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="text-sm font-mono font-bold text-white tracking-tight">
              {totalPeriodBurn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {baseCurrency}
            </span>
            <span className="text-[12px] font-mono tracking-widest text-neutral-500 uppercase mt-0.5">Aggregated burn</span>
          </div>
        </div>

        {/* VECTOR CHART AREA CANVAS */}
        <div 
          className="w-full h-[240px] mt-2 relative py-2"
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
                background: 'linear-gradient(180deg, rgba(244, 63, 94, 0.08) 0%, rgba(0, 0, 0, 0) 100%)',
                backgroundImage: 'radial-gradient(rgba(244, 63, 94, 0.2) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                transform: 'translateZ(-15px)'
              }}
            />

            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  {/* 3D Drop Shadow Filter */}
                  <filter id="vantageBurn3DShadow" x="-20%" y="-20%" width="150%" height="150%">
                    <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#000000" floodOpacity="0.5" />
                  </filter>

                  {/* 3D Wall Ribbon Extrusion Gradient */}
                  <linearGradient id="vantageBurn3DGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.7} />
                    <stop offset="40%" stopColor="rgba(244, 63, 94, 0.35)" />
                    <stop offset="100%" stopColor="rgba(244, 63, 94, 0.02)" />
                  </linearGradient>

                  {/* 3D Top Ridge Metallic Gradient */}
                  <linearGradient id="vantageBurn3DRidge" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#881337" />
                    <stop offset="50%" stopColor="#FB7185" />
                    <stop offset="100%" stopColor="#E11D48" />
                  </linearGradient>

                  {/* 3D Node Sphere Gradient */}
                  <radialGradient id="vantageBurn3DSphere" cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="45%" stopColor="#FB7185" />
                    <stop offset="100%" stopColor="#881337" />
                  </radialGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'system-ui', fontWeight: 600 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'system-ui', fontWeight: 600 }} 
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(20, 24, 33, 0.92)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    borderRadius: '12px',
                    boxShadow: '0 16px 36px 0 rgba(0,0,0,0.5)',
                    padding: '12px 14px',
                    transform: 'translateZ(30px)'
                  }}
                  labelStyle={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}
                  itemStyle={{ fontSize: 11, fontWeight: 700, color: '#FB7185' }}
                  formatter={(value) => [`${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`, 'Outflow']}
                />

                {/* 3D Floor Shadow Projection Path */}
                <Area 
                  type="monotone" 
                  dataKey="spending" 
                  stroke="rgba(0,0,0,0.35)" 
                  strokeWidth={5}
                  fill="none" 
                  style={{ transform: 'translateY(12px)', filter: 'blur(4px)' }}
                />

                {/* 3D Extruded Top Ridge Area */}
                <Area 
                  type="monotone" 
                  dataKey="spending" 
                  stroke="url(#vantageBurn3DRidge)" 
                  strokeWidth={4.5} 
                  strokeLinecap="round"
                  fill="url(#vantageBurn3DGradient)" 
                  filter="url(#vantageBurn3DShadow)"
                  dot={{
                    r: 3.5,
                    fill: 'url(#vantageBurn3DSphere)',
                    stroke: '#881337',
                    strokeWidth: 1.5
                  }}
                  activeDot={{ 
                    r: 6.5, 
                    stroke: '#1E2229', 
                    strokeWidth: 2, 
                    fill: '#FB7185',
                    style: { filter: 'drop-shadow(0 0 10px #FB7185)' }
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </VantageDataErrorBoundary>
  );
};