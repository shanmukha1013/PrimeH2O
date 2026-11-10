import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Compass } from 'lucide-react';

export const WhyPrime: React.FC = () => {
  const pillars = [
    {
      title: 'PURE BY NATURE',
      tagline: 'Untouched Clarity in Every Drop',
      desc: 'Our packaged drinking water is bottled with rigorous hygiene and pristine balance, preserving clarity from the first sip to the last. We believe pure hydration should feel naturally crisp and effortless.',
      icon: Sparkles,
      editorialQuote: 'A devotion to natural clarity.',
    },
    {
      title: 'HEALTHY FOR LIFE',
      tagline: 'Your Well-Being is Our Priority',
      desc: 'At PRIME-H₂O, safety is never an afterthought. Every bottle is sealed with a tamper-evident champagne bronze closure and packaged under stringent sanitary discipline, ensuring safe hydration you and your family can trust daily.',
      icon: Shield,
      editorialQuote: 'Every bottle sealed for total safety.',
    },
    {
      title: 'REFRESHING ALWAYS',
      tagline: 'Vitality for Everyday Moments',
      desc: 'Designed for daily routines, quiet breaks, intense work hours, and celebratory gatherings alike. PRIME H₂O delivers that instant, invigorating refreshment that keeps your body and mind in rhythm.',
      icon: Compass,
      editorialQuote: 'Crisp rejuvenation on demand.',
    },
  ];

  return (
    <section
      id="why-prime"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-brand-cream-light border-t border-brand-bronze/25 scroll-mt-[72px] lg:scroll-mt-[80px]"
      aria-label="Why Choose PRIME H2O"
    >
      {/* Decorative Editorial Watermark */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 select-none opacity-[0.03] text-brand-maroon font-editorial text-[18vw] leading-none font-bold">
          PRIME
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-8 h-px bg-brand-bronze" />
            <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-maroon">
              Brand Storytelling
            </span>
            <span className="w-8 h-px bg-brand-bronze" />
          </div>

          <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-maroon leading-tight">
            The Greatness of PRIME
          </h2>

          <p className="text-base sm:text-lg text-brand-brown/85 font-normal max-w-xl mx-auto">
            Built on a singular philosophy of purity, health, and steadfast refreshment for everyday living.
          </p>

          <div className="w-20 h-0.5 bg-brand-bronze mx-auto mt-4" />
        </div>

        {/* Storytelling Grid: Visual + Content */}
        <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* Left: Interactive Bottle Feature Portrait */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="lg:col-span-5 relative"
          >
            <div className="relative mx-auto max-w-sm rounded-sm p-4 bg-brand-cream border border-brand-bronze/40 shadow-luxury">
              {/* Bronze Outer Frame lines */}
              <div className="absolute inset-2 border border-brand-bronze/20 pointer-events-none" />

              <div className="relative bg-brand-maroon/5 py-10 px-6 rounded flex flex-col items-center justify-center overflow-hidden">
                <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-brand-bronze mb-2">
                  THE GREATNESS OF PRIME-H₂O
                </span>
                
                <img
                  src="/assets/bottle_500ml.png"
                  alt="PRIME H2O Signature Bottle"
                  className="h-80 sm:h-96 w-auto object-contain drop-shadow-[0_20px_25px_rgba(80,13,24,0.22)] py-2 select-none"
                />

                <div className="mt-4 text-center space-y-1">
                  <span className="font-editorial italic text-xl text-brand-maroon block">
                    I Trust PRIME
                  </span>
                  <span className="text-xs uppercase tracking-[0.16em] text-brand-brown/70 font-semibold">
                    Signature Ribbed Format &bull; Bronze Cap
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right: Three Brand Promises Detailed */}
          <div className="lg:col-span-7 space-y-8">
            {pillars.map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <motion.div
                  key={pillar.title}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.15 }}
                  className="relative p-6 sm:p-8 bg-brand-cream rounded-sm border-l-4 border-l-brand-maroon border border-brand-bronze/25 hover:border-brand-bronze/50 transition-all duration-300 shadow-sm hover:shadow-luxury group"
                >
                  <div className="flex items-start gap-4 sm:gap-6">
                    <div className="w-12 h-12 rounded-sm bg-brand-maroon text-brand-cream flex items-center justify-center shrink-0 border border-brand-bronze/40 shadow-sm group-hover:scale-105 transition-transform duration-300">
                      <Icon className="w-5 h-5 text-brand-bronze" />
                    </div>

                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-brand-maroon">
                          {pillar.title}
                        </h3>
                        <span className="text-xs italic font-serif text-brand-bronze">
                          {pillar.editorialQuote}
                        </span>
                      </div>

                      <h4 className="font-editorial text-2xl text-brand-maroon font-medium">
                        {pillar.tagline}
                      </h4>

                      <p className="text-sm text-brand-brown/85 font-normal leading-relaxed pt-1">
                        {pillar.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
};
