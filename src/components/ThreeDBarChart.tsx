import React, { useState, useMemo } from 'react';
import { Box, Layers, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ThreeDBarDataItem {
  name: string;
  value?: number;
  income?: number;
  expense?: number;
  incomeHeight?: number;
  expenseHeight?: number;
  [key: string]: any;
}

interface ThreeDBarChartProps {
  data: ThreeDBarDataItem[];
  type?: 'single' | 'dual'; // 'single' for current situation, 'dual' for income vs expense
  primaryCurrency?: string;
  height?: number;
  title?: string;
  subtitle?: string;
}

export const ThreeDBarChart: React.FC<ThreeDBarChartProps> = ({
  data,
  type = 'single',
  primaryCurrency = 'AED',
  height = 240,
  title,
  subtitle,
}) => {
  const [viewMode, setViewMode] = useState<'3d-iso' | '3d-persp' | '2d'>('3d-iso');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSub, setHoveredSub] = useState<'income' | 'expense' | 'main' | null>(null);

  const currencySymbol = useMemo(() => {
    if (primaryCurrency === 'USD') return '$';
    if (primaryCurrency === 'EUR') return '€';
    if (primaryCurrency === 'GBP') return '£';
    return `${primaryCurrency} `;
  }, [primaryCurrency]);

  const formatCurrency = (val: number) => {
    return `${val < 0 ? '-' : ''}${currencySymbol}${Math.abs(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Process data values and max height scaling
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (type === 'single') {
      const numericValues = data.map((d) => {
        if (typeof d.value === 'number') return d.value;
        const curVal = d[primaryCurrency];
        if (typeof curVal === 'number') return curVal;
        const fallbackNum = Object.values(d).find((v) => typeof v === 'number');
        return typeof fallbackNum === 'number' ? fallbackNum : 0;
      });

      const maxVal = Math.max(...numericValues, 0);
      const minVal = Math.min(...numericValues, 0);

      return data.map((d, i) => {
        const rawVal = numericValues[i];
        return {
          name: d.name,
          val: rawVal,
          isPositive: rawVal >= 0,
        };
      });
    } else {
      // Dual mode (income vs expense)
      const maxVal = Math.max(
        ...data.flatMap((d) => [d.income || 0, d.expense || 0]),
        1
      );

      return data.map((d) => {
        const inc = d.income || 0;
        const exp = d.expense || 0;
        const incPct = d.incomeHeight ? d.incomeHeight : Math.max(10, Math.min(85, (inc / maxVal) * 100));
        const expPct = d.expenseHeight ? d.expenseHeight : Math.max(10, Math.min(85, (exp / maxVal) * 100));

        return {
          name: d.name || d.month || '',
          income: inc,
          expense: exp,
          incomePct: incPct,
          expensePct: expPct,
        };
      });
    }
  }, [data, type, primaryCurrency]);

  // Dimensions for SVG Isometric Rendering
  const svgWidth = 600;
  const svgHeight = height;

  return (
    <div 
      className="w-full flex flex-col relative select-none"
      style={{ fontFamily: "'Google Sans', sans-serif" }}
    >
      {/* Top Header & 3D Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          {title && (
            <h3 className="font-bold text-xl text-[#111c2d] leading-snug">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-[#8c8c99] font-normal mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* View Mode Toggle Controls */}
        <div className="flex items-center gap-1 bg-[#F4F6F8] p-1 rounded-xl border border-[#E1E8ED]">
          <button
            type="button"
            onClick={() => setViewMode('3d-iso')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === '3d-iso'
                ? 'bg-[#111C2D] text-white shadow-sm font-bold'
                : 'text-[#57606F] hover:text-[#111C2D]'
            }`}
            title="3D Isometric View"
          >
            <Box size={13} />
            <span>3D Iso</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('3d-persp')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === '3d-persp'
                ? 'bg-[#111C2D] text-white shadow-sm font-bold'
                : 'text-[#57606F] hover:text-[#111C2D]'
            }`}
            title="3D Perspective View"
          >
            <Layers size={13} />
            <span>3D Persp</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('2d')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === '2d'
                ? 'bg-[#111C2D] text-white shadow-sm font-bold'
                : 'text-[#57606F] hover:text-[#111C2D]'
            }`}
            title="2D Flat View"
          >
            <Eye size={13} />
            <span>2D Flat</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div 
        className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50/50 to-white border border-[#E1E8ED]/80 p-4 transition-all duration-500"
        style={{ height: `${height}px` }}
      >
        {/* Subtle 3D Perspective Grid Background */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-40 transition-all duration-500"
          style={{
            backgroundImage: viewMode !== '2d' 
              ? 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)' 
              : 'linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)',
            backgroundSize: viewMode === '3d-persp' ? '30px 20px' : '24px 24px',
            transform: viewMode === '3d-persp' 
              ? 'perspective(400px) rotateX(45deg) scale(1.15) translateY(-20px)' 
              : viewMode === '3d-iso' 
              ? 'perspective(600px) rotateX(25deg) rotateY(-5deg) scale(1.05)' 
              : 'none',
            transformOrigin: 'bottom center',
          }}
        />

        {/* 2D FLAT VIEW */}
        {viewMode === '2d' && (
          <div className="w-full h-full flex flex-col justify-center relative z-10 px-2 py-4">
            {type === 'single' ? (() => {
              const values = (processedData as any[]).map(d => d.val);
              const maxV = Math.max(...values, 0);
              const minV = Math.min(...values, 0);
              const span = Math.max(Math.abs(maxV - minV), 1);
              const zeroPosPercent = ((maxV) / span) * 50 + 50;

              return (
                <div className="w-full h-full relative flex items-end justify-between gap-3">
                  <div 
                    className="absolute left-0 right-0 border-t border-dashed border-slate-400 z-10 pointer-events-none" 
                    style={{ top: `${Math.max(15, Math.min(85, 100 - zeroPosPercent))}%` }}
                  />

                  {(processedData as any[]).map((d, i) => {
                    const isHovered = hoveredIndex === i;
                    const isPos = d.val >= 0;
                    const heightPct = Math.max(10, (Math.abs(d.val) / span) * 45);

                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center justify-center h-full relative group cursor-pointer"
                        onMouseEnter={() => {
                          setHoveredIndex(i);
                          setHoveredSub('main');
                        }}
                        onMouseLeave={() => {
                          setHoveredIndex(null);
                          setHoveredSub(null);
                        }}
                      >
                        <div className="w-full h-full relative flex items-center justify-center">
                          <div className="w-full max-w-[28px] relative h-full flex items-center justify-center">
                            {isPos ? (
                              <div
                                className={`absolute bottom-1/2 w-full rounded-t-md transition-all duration-300 ${
                                  isHovered ? 'bg-[#83c991] shadow-md scale-105' : 'bg-[#A6DDB1]'
                                }`}
                                style={{ height: `${heightPct}%` }}
                              />
                            ) : (
                              <div
                                className={`absolute top-1/2 w-full rounded-b-md transition-all duration-300 ${
                                  isHovered ? 'bg-red-400 shadow-md scale-105' : 'bg-red-500'
                                }`}
                                style={{ height: `${heightPct}%` }}
                              />
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-[#57606F] font-normal group-hover:text-black mt-2">
                          {d.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              (processedData as any[]).map((d, i) => {
                const isHovered = hoveredIndex === i;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end h-full gap-2 group cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div className="w-full flex-grow flex items-end justify-center gap-1.5 relative">
                      {/* Income Bar */}
                      <div
                        className={`w-1/2 max-w-[20px] rounded-t-md transition-all duration-300 ${
                          isHovered ? 'bg-[#92c99d] shadow-md' : 'bg-[#a6ddb1]'
                        }`}
                        style={{ height: `${d.incomePct}%` }}
                      />
                      {/* Expense Bar */}
                      <div
                        className={`w-1/2 max-w-[20px] rounded-t-md transition-all duration-300 ${
                          isHovered ? 'bg-[#b0b8ae]' : 'bg-[#c1c9bf]/60'
                        }`}
                        style={{ height: `${d.expensePct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#57606F] font-normal group-hover:text-black">
                      {d.name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 3D ISOMETRIC / PERSPECTIVE VIEW ENGINE (SVG PRISMS) */}
        {viewMode !== '2d' && (
          <div 
            className="w-full h-full relative z-10 transition-all duration-500 flex items-center justify-center"
            style={{
              transform: viewMode === '3d-persp' 
                ? 'perspective(700px) rotateX(28deg) rotateY(-8deg)' 
                : 'perspective(900px) rotateX(18deg) rotateY(-2deg)',
            }}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Single Mode Gradients (Positive / Green) */}
                <linearGradient id="mintFront" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#A6DDB1" />
                  <stop offset="100%" stopColor="#6BC27B" />
                </linearGradient>
                <linearGradient id="mintTop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D8F5DD" />
                  <stop offset="100%" stopColor="#B5E8C0" />
                </linearGradient>
                <linearGradient id="mintSide" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#55AB65" />
                  <stop offset="100%" stopColor="#3D8F4C" />
                </linearGradient>

                {/* Single Mode Gradients (Negative / Red) */}
                <linearGradient id="redFront" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#F87171" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
                <linearGradient id="redTop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FCA5A5" />
                  <stop offset="100%" stopColor="#F87171" />
                </linearGradient>
                <linearGradient id="redSide" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#B91C1C" />
                </linearGradient>

                {/* Dual Mode - Income Gradients */}
                <linearGradient id="incFront" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#A6DDB1" />
                  <stop offset="100%" stopColor="#6BC27B" />
                </linearGradient>
                <linearGradient id="incTop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E4FAEA" />
                  <stop offset="100%" stopColor="#BCEDC5" />
                </linearGradient>
                <linearGradient id="incSide" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#51A661" />
                  <stop offset="100%" stopColor="#3B874B" />
                </linearGradient>

                {/* Dual Mode - Expense Gradients */}
                <linearGradient id="expFront" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#CBD5E1" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
                <linearGradient id="expTop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F1F5F9" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </linearGradient>
                <linearGradient id="expSide" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#64748B" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>

                {/* Hover Glow Filters */}
                <filter id="glow3d" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {type === 'single' ? (() => {
                const values = (processedData as any[]).map(d => d.val);
                const maxV = Math.max(...values, 0);
                const minV = Math.min(...values, 0);
                const span = Math.max(Math.abs(maxV - minV), 1);
                const chartTop = 45;
                const chartBottom = svgHeight - 45;
                const usableH = chartBottom - chartTop;
                const zeroY = chartBottom - ((0 - minV) / span) * usableH;

                return (
                  <>
                    {/* Zero Line */}
                    <line
                      x1="20"
                      y1={zeroY}
                      x2={svgWidth - 20}
                      y2={zeroY}
                      stroke="#94A3B8"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />

                    {(processedData as any[]).map((d, i) => {
                      const totalBars = processedData.length;
                      const slotWidth = (svgWidth - 60) / totalBars;
                      const barW = Math.min(32, slotWidth * 0.55);
                      const depth = 14;
                      const baseX = 30 + i * slotWidth + (slotWidth - barW) / 2;
                      const isPos = d.val >= 0;
                      const barH = Math.max(12, (Math.abs(d.val) / span) * usableH);
                      
                      const topY = isPos ? zeroY - barH : zeroY;
                      const baseY = isPos ? zeroY : zeroY + barH;

                      const isHovered = hoveredIndex === i;
                      const frontGrad = isPos ? "url(#mintFront)" : "url(#redFront)";
                      const topGrad = isPos ? "url(#mintTop)" : "url(#redTop)";
                      const sideGrad = isPos ? "url(#mintSide)" : "url(#redSide)";

                      return (
                        <g
                          key={i}
                          className="cursor-pointer transition-transform duration-300"
                          onMouseEnter={() => {
                            setHoveredIndex(i);
                            setHoveredSub('main');
                          }}
                          onMouseLeave={() => {
                            setHoveredIndex(null);
                            setHoveredSub(null);
                          }}
                          style={{
                            transform: isHovered ? 'translateY(-4px)' : 'none',
                            transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          }}
                        >
                          {/* Front Face */}
                          <rect
                            x={baseX}
                            y={topY}
                            width={barW}
                            height={barH}
                            fill={frontGrad}
                            rx="2"
                            filter={isHovered ? 'url(#glow3d)' : undefined}
                          />

                          {/* Top/Bottom Cap Face */}
                          <polygon
                            points={`
                              ${baseX},${topY}
                              ${baseX + depth},${topY - depth * (isPos ? 0.6 : -0.6)}
                              ${baseX + barW + depth},${topY - depth * (isPos ? 0.6 : -0.6)}
                              ${baseX + barW},${topY}
                            `}
                            fill={topGrad}
                          />

                          {/* Right Side Face */}
                          <polygon
                            points={`
                              ${baseX + barW},${topY}
                              ${baseX + barW + depth},${topY - depth * (isPos ? 0.6 : -0.6)}
                              ${baseX + barW + depth},${baseY - depth * (isPos ? 0.6 : -0.6)}
                              ${baseX + barW},${baseY}
                            `}
                            fill={sideGrad}
                          />

                          {/* Label text underneath bar */}
                          <text
                            x={baseX + barW / 2}
                            y={svgHeight - 10}
                            textAnchor="middle"
                            fill={isHovered ? '#111C2D' : '#64748B'}
                            fontSize="12"
                            fontWeight={isHovered ? '700' : '400'}
                            fontFamily="'Google Sans', sans-serif"
                          >
                            {d.name}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })() : (
                <>
                  {/* Chart Base Grid Line */}
                  <line
                    x1="20"
                    y1={svgHeight - 32}
                    x2={svgWidth - 20}
                    y2={svgHeight - 32}
                    stroke="#E1E8ED"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  {(processedData as any[]).map((d, i) => {
                    const totalBars = processedData.length;
                    const slotWidth = (svgWidth - 60) / totalBars;
                    const barW = Math.min(22, slotWidth * 0.36);
                    const depth = 11;
                    const gap = 4;
                    const slotCenterX = 30 + i * slotWidth + slotWidth / 2;

                    const incX = slotCenterX - barW - gap / 2;
                    const expX = slotCenterX + gap / 2;

                    const baseY = svgHeight - 34;
                    const maxH = svgHeight - 75;

                    const incH = Math.max(14, (d.incomePct / 100) * maxH);
                    const expH = Math.max(14, (d.expensePct / 100) * maxH);

                    const incTopY = baseY - incH;
                    const expTopY = baseY - expH;

                    const isHovered = hoveredIndex === i;
                    const isIncHovered = isHovered && (hoveredSub === 'income' || !hoveredSub);
                    const isExpHovered = isHovered && (hoveredSub === 'expense' || !hoveredSub);

                    return (
                      <g
                        key={i}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => {
                          setHoveredIndex(null);
                          setHoveredSub(null);
                        }}
                      >
                        {/* --- INCOME 3D PILLAR --- */}
                        <g
                          onMouseEnter={() => setHoveredSub('income')}
                          style={{
                            transform: isIncHovered ? 'translateY(-6px)' : 'none',
                            transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          }}
                        >
                          <ellipse
                            cx={incX + barW / 2 + depth / 2}
                            cy={baseY + 4}
                            rx={barW * 0.75}
                            ry={depth * 0.4}
                            fill="rgba(17, 28, 45, 0.1)"
                          />
                          <rect
                            x={incX}
                            y={incTopY}
                            width={barW}
                            height={incH}
                            fill="url(#incFront)"
                            rx="1.5"
                            filter={isIncHovered ? 'url(#glow3d)' : undefined}
                          />
                          <polygon
                            points={`
                              ${incX},${incTopY}
                              ${incX + depth},${incTopY - depth * 0.55}
                              ${incX + barW + depth},${incTopY - depth * 0.55}
                              ${incX + barW},${incTopY}
                            `}
                            fill="url(#incTop)"
                          />
                          <polygon
                            points={`
                              ${incX + barW},${incTopY}
                              ${incX + barW + depth},${incTopY - depth * 0.55}
                              ${incX + barW + depth},${baseY - depth * 0.55}
                              ${incX + barW},${baseY}
                            `}
                            fill="url(#incSide)"
                          />
                        </g>

                        {/* --- EXPENSE 3D PILLAR --- */}
                        <g
                          onMouseEnter={() => setHoveredSub('expense')}
                          style={{
                            transform: isExpHovered ? 'translateY(-6px)' : 'none',
                            transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          }}
                        >
                          <ellipse
                            cx={expX + barW / 2 + depth / 2}
                            cy={baseY + 4}
                            rx={barW * 0.75}
                            ry={depth * 0.4}
                            fill="rgba(17, 28, 45, 0.1)"
                          />
                          <rect
                            x={expX}
                            y={expTopY}
                            width={barW}
                            height={expH}
                            fill="url(#expFront)"
                            rx="1.5"
                            filter={isExpHovered ? 'url(#glow3d)' : undefined}
                          />
                          <polygon
                            points={`
                              ${expX},${expTopY}
                              ${expX + depth},${expTopY - depth * 0.55}
                              ${expX + barW + depth},${expTopY - depth * 0.55}
                              ${expX + barW},${expTopY}
                            `}
                            fill="url(#expTop)"
                          />
                          <polygon
                            points={`
                              ${expX + barW},${expTopY}
                              ${expX + barW + depth},${expTopY - depth * 0.55}
                              ${expX + barW + depth},${baseY - depth * 0.55}
                              ${expX + barW},${baseY}
                            `}
                            fill="url(#expSide)"
                          />
                        </g>

                        {/* Month Label */}
                        <text
                          x={slotCenterX}
                          y={svgHeight - 10}
                          textAnchor="middle"
                          fill={isHovered ? '#111C2D' : '#64748B'}
                          fontSize="12"
                          fontWeight={isHovered ? '700' : '400'}
                          fontFamily="'Google Sans', sans-serif"
                        >
                          {d.name}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
          </div>
        )}

        {/* Floating 3D Tooltip Card on Hover */}
        <AnimatePresence>
          {hoveredIndex !== null && processedData[hoveredIndex] && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ duration: 0.15 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#111C2D] text-white px-3.5 py-2 rounded-xl shadow-xl border border-slate-700/60 z-30 pointer-events-none flex items-center gap-3 text-xs"
            >
              <span className="font-bold text-slate-300 border-r border-slate-700 pr-2.5">
                {processedData[hoveredIndex].name}
              </span>

              {type === 'single' ? (
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-[#A6DDB1]">Value:</span>
                  <span className="text-white">
                    {formatCurrency((processedData[hoveredIndex] as any).val)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={12} className="text-[#A6DDB1]" />
                    <span className="text-[#A6DDB1] font-bold">
                      {formatCurrency((processedData[hoveredIndex] as any).income)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingDown size={12} className="text-slate-300" />
                    <span className="text-slate-200 font-bold">
                      {formatCurrency((processedData[hoveredIndex] as any).expense)}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
