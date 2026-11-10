import React from 'react';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'light',
  size = 'md',
  showTagline = false,
  className = '',
}) => {
  const isLight = variant === 'light';

  // Sizing definitions
  const textSizes = {
    sm: 'text-xl tracking-[0.2em]',
    md: 'text-2xl md:text-3xl tracking-[0.22em]',
    lg: 'text-4xl md:text-5xl tracking-[0.25em]',
  };

  const h2oSizes = {
    sm: 'text-xs tracking-[0.18em]',
    md: 'text-sm md:text-base tracking-[0.2em]',
    lg: 'text-lg md:text-xl tracking-[0.22em]',
  };

  return (
    <div className={`flex flex-col items-start select-none ${className}`}>
      <div className="flex items-baseline gap-1.5 font-bold uppercase transition-colors">
        <span
          className={`font-sans font-extrabold transition-colors ${
            textSizes[size]
          } ${isLight ? 'text-brand-cream' : 'text-brand-maroon'}`}
        >
          PRIME
        </span>
        <span
          className={`font-sans font-semibold tracking-wider ${
            h2oSizes[size]
          } text-brand-bronze`}
        >
          H<sub className="font-sans text-[0.7em] bottom-[-0.15em] text-brand-bronze">2</sub>O
        </span>
      </div>

      <div className="w-full flex items-center justify-between gap-1.5 mt-0.5">
        <div
          className={`h-[1px] flex-1 ${
            isLight ? 'bg-brand-bronze/40' : 'bg-brand-bronze/50'
          }`}
        />
        <span
          className={`text-[9px] uppercase tracking-[0.28em] font-medium ${
            isLight ? 'text-brand-cream/80' : 'text-brand-brown'
          }`}
        >
          PACKAGED DRINKING WATER
        </span>
        <div
          className={`h-[1px] flex-1 ${
            isLight ? 'bg-brand-bronze/40' : 'bg-brand-bronze/50'
          }`}
        />
      </div>

      {showTagline && (
        <span
          className={`italic font-serif text-xs md:text-sm mt-1 self-center tracking-wider ${
            isLight ? 'text-brand-bronze-light' : 'text-brand-maroon'
          }`}
        >
          I Trust PRIME
        </span>
      )}
    </div>
  );
};
