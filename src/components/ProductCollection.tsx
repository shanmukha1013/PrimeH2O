import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Eye, Layers } from 'lucide-react';

export interface ProductItem {
  id: string;
  size: string;
  headline: string;
  description: string;
  benefits: string[];
  image: string;
  badge: string;
  heightClass: string;
  scaleClass: string;
  specs: {
    volume: string;
    packType: string;
    idealFor: string;
    closure: string;
  };
}

interface ProductCollectionProps {
  onSelectProduct: (product: ProductItem) => void;
  onInquireSize: (size: string) => void;
}

export const productsData: ProductItem[] = [
  {
    id: 'prime-250',
    size: '250 mL',
    headline: 'Small Bottle. Big Convenience.',
    description: 'A compact choice for quick refreshment and on-the-go moments.',
    benefits: [
      'Easy to carry.',
      'Ideal for short outings.',
      'A convenient single-serve size.',
    ],
    image: '/assets/bottle_250ml.png',
    badge: 'Single-Serve Pocket Edition',
    heightClass: 'h-64 sm:h-72',
    scaleClass: 'scale-[0.85]',
    specs: {
      volume: '250 mL Net Quantity',
      packType: 'Ergonomic Ribbed Pet Bottle',
      idealFor: 'Meetings, Quick Commutes & Single-Serve Outings',
      closure: 'Champagne Bronze Tamper-Evident Cap',
    },
  },
  {
    id: 'prime-500',
    size: '500 mL',
    headline: 'Your Everyday Hydration Partner.',
    description: 'A handy everyday format for work, travel and daily routines.',
    benefits: [
      'Convenient everyday size.',
      'Fits easily into a bag.',
      'Great for daily use.',
    ],
    image: '/assets/bottle_500ml.png',
    badge: 'Most Popular Everyday Size',
    heightClass: 'h-72 sm:h-80',
    scaleClass: 'scale-[0.95]',
    specs: {
      volume: '500 mL Net Quantity',
      packType: 'Signature Ribbed Contour Bottle',
      idealFor: 'Office Desks, Daily Travel & Gym Bags',
      closure: 'Champagne Bronze Tamper-Evident Cap',
    },
  },
  {
    id: 'prime-1000',
    size: '1000 mL',
    headline: 'More to Enjoy. More to Share.',
    description: 'A larger format for longer days, shared moments and convenient hydration.',
    benefits: [
      'Larger capacity.',
      'Suitable for longer outings.',
      'A practical family-size option.',
    ],
    image: '/assets/bottle_1000ml.png',
    badge: 'Extended Family & Shared Format',
    heightClass: 'h-80 sm:h-92',
    scaleClass: 'scale-[1.05]',
    specs: {
      volume: '1000 mL (1 Litre) Net Quantity',
      packType: 'High-Capacity Ribbed Bottle',
      idealFor: 'Long Drives, Family Tables & Shared Dining',
      closure: 'Champagne Bronze Tamper-Evident Cap',
    },
  },
];

export const ProductCollection: React.FC<ProductCollectionProps> = ({
  onSelectProduct,
  onInquireSize,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'lineup'>('cards');

  return (
    <section
      id="products"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-brand-cream border-t border-brand-bronze/20 scroll-mt-[72px] lg:scroll-mt-[80px]"
      aria-label="PRIME H2O Product Collection"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Heading & Subheading */}
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-8 h-px bg-brand-bronze" />
            <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-maroon">
              Product Collection
            </span>
            <span className="w-8 h-px bg-brand-bronze" />
          </div>

          <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-maroon leading-tight">
            The PRIME Range
          </h2>

          <p className="text-base sm:text-lg text-brand-brown/85 font-normal tracking-wide">
            Everyday hydration. A size for every moment.
          </p>

          {/* Toggle between Individual Cards and Trio Lineup */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-4 py-2 text-xs uppercase tracking-[0.16em] font-semibold rounded-sm transition-all duration-300 border ${
                viewMode === 'cards'
                  ? 'bg-brand-maroon text-brand-cream border-brand-maroon shadow-md'
                  : 'bg-transparent text-brand-maroon border-brand-bronze/40 hover:border-brand-maroon'
              }`}
            >
              Detailed Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('lineup')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.16em] font-semibold rounded-sm transition-all duration-300 border ${
                viewMode === 'lineup'
                  ? 'bg-brand-maroon text-brand-cream border-brand-maroon shadow-md'
                  : 'bg-transparent text-brand-maroon border-brand-bronze/40 hover:border-brand-maroon'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Scale Comparison Lineup</span>
            </button>
          </div>
        </div>

        {/* View Mode: Three Cards */}
        {viewMode === 'cards' ? (
          <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 xl:gap-10 items-stretch">
            {productsData.map((prod, idx) => (
              <motion.div
                key={prod.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: idx * 0.15 }}
                className="group relative bg-brand-cream-light rounded-sm border border-brand-bronze/35 hover:border-brand-bronze p-5 sm:p-6 lg:p-8 flex flex-col justify-between shadow-sm hover:shadow-luxury-lg transition-all duration-300"
              >
                {/* Size Pill Tag */}
                <div className="flex items-center justify-between gap-2 border-b border-brand-bronze/20 pb-3">
                  <span className="px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] bg-brand-maroon text-brand-cream rounded-sm shrink-0">
                    {prod.size}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-brand-brown/80 font-bold text-right">
                    {prod.badge}
                  </span>
                </div>

                {/* Bottle Presentation Showcase */}
                <div className="relative py-8 flex items-center justify-center min-h-[300px]">
                  {/* Subtle pedestal circle */}
                  <div className="absolute w-44 h-44 rounded-full bg-brand-cream-dark/50 border border-brand-bronze/20 blur-sm pointer-events-none group-hover:scale-110 transition-transform duration-500" />
                  
                  {/* Bottle Image with Reflection */}
                  <img
                    src={prod.image}
                    alt={`PRIME H2O ${prod.size} Packaged Drinking Water Bottle`}
                    className={`${prod.heightClass} w-auto object-contain drop-shadow-[0_15px_20px_rgba(80,13,24,0.18)] transition-transform duration-500 group-hover:scale-105 group-hover:-translate-y-2`}
                    loading="lazy"
                  />
                </div>

                {/* Content Section */}
                <div className="space-y-4 pt-4 border-t border-brand-bronze/20">
                  <div className="space-y-1">
                    <h3 className="font-editorial text-2xl sm:text-3xl font-medium text-brand-maroon">
                      {prod.headline}
                    </h3>
                    <p className="text-sm text-brand-brown/85 font-normal leading-relaxed">
                      &ldquo;{prod.description}&rdquo;
                    </p>
                  </div>

                  {/* Three Benefits List (Exact from PDF) */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-bronze block">
                      Key Highlights:
                    </span>
                    <ul className="space-y-2 text-xs sm:text-sm text-brand-brown">
                      {prod.benefits.map((b, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-2.5">
                          <span className="w-4 h-4 rounded-full bg-brand-maroon/10 text-brand-maroon flex items-center justify-center shrink-0 mt-0.5 border border-brand-bronze/30">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectProduct(prod)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-[0.16em] bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich transition-colors duration-200 rounded-sm shadow-sm group-hover:shadow-luxury"
                    >
                      <Eye className="w-3.5 h-3.5 text-brand-bronze" />
                      <span>Explore Product</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onInquireSize(prod.size)}
                      className="inline-flex items-center justify-center p-3 text-brand-maroon hover:text-brand-maroon-deep bg-brand-cream-dark hover:bg-brand-cream transition-colors duration-200 rounded-sm border border-brand-bronze/30"
                      title={`Inquire about ${prod.size} orders`}
                      aria-label={`Inquire about ${prod.size}`}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          /* View Mode: Trio Scale Comparison Lineup */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mt-16 bg-brand-cream-light border border-brand-bronze/40 rounded-sm p-8 sm:p-12 shadow-luxury text-center"
          >
            <div className="max-w-2xl mx-auto space-y-2 mb-8">
              <span className="text-xs uppercase tracking-[0.24em] font-bold text-brand-maroon">
                Visual Scale Comparison
              </span>
              <h3 className="font-editorial text-3xl sm:text-4xl text-brand-maroon">
                PRIME Lineup: 250 mL &bull; 500 mL &bull; 1000 mL
              </h3>
              <p className="text-sm text-brand-brown/80 font-normal">
                Designed to maintain optimal ergonomic grip, aesthetic ridges, and the iconic maroon-bronze label across every format.
              </p>
            </div>

            <div className="relative py-6 flex items-center justify-center">
              <img
                src="/assets/bottle_trio.png"
                alt="PRIME H2O Complete Lineup: 250mL, 500mL, 1000mL"
                className="max-h-[460px] w-auto object-contain mx-auto drop-shadow-2xl"
              />
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto pt-6 border-t border-brand-bronze/25 text-left">
              <div className="p-4 bg-brand-cream rounded border border-brand-bronze/20">
                <span className="text-xs font-bold uppercase text-brand-maroon">250 mL</span>
                <p className="text-xs text-brand-brown/85 mt-1">Single-serve convenience for brief outings and hospitality.</p>
              </div>
              <div className="p-4 bg-brand-cream rounded border border-brand-bronze/20">
                <span className="text-xs font-bold uppercase text-brand-maroon">500 mL</span>
                <p className="text-xs text-brand-brown/85 mt-1">The universal companion for desk, gym, and daily commutes.</p>
              </div>
              <div className="p-4 bg-brand-cream rounded border border-brand-bronze/20">
                <span className="text-xs font-bold uppercase text-brand-maroon">1000 mL</span>
                <p className="text-xs text-brand-brown/85 mt-1">Full-day hydration and shared family moments.</p>
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </section>
  );
};
