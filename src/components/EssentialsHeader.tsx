import React from 'react';
import { Calendar } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface EssentialsHeaderProps {
  title: string;
  uiOverrides?: {
    container?: string;
    title?: string;
  };
}

export const EssentialsHeader: React.FC<EssentialsHeaderProps> = ({
  title,
  uiOverrides,
}) => {
  const { t } = useTranslation();
  return (
    <div className={uiOverrides?.container || "sticky top-0 z-40 bg-[#F8FAFC] flex flex-col pt-2 pb-1 px-[5px]"}>
      <div className="flex justify-between items-center w-full">
        <h2 className={uiOverrides?.title || "font-bold tracking-tighter text-black"}>
          <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '24px' }}>{title}</span>
        </h2>
      </div>
      <p className="text-[11px] text-neutral-500 font-normal mt-0.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
        {t('essentials.tip_triple_tap', 'Tip: Triple tap on the app to hide your sensitive data.')}
      </p>
    </div>
  );
};
