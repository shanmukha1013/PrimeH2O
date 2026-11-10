import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Heart, Sparkles, Droplets } from 'lucide-react';

export const OurPromise: React.FC = () => {
  return (
    <section
      id="promise"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-brand-maroon text-brand-cream scroll-mt-[72px] lg:scroll-mt-[80px]"
      aria-label="PRIME H2O Brand Promise"
    >
      {/* Background Decorative Waves & Geometric Bronze Accents */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        {/* Subtle radial studio warm highlights */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-brand-bronze/15 rounded-full blur-[150px]" />

        {/* Delicate wave lines */}
        <svg
          className="absolute inset-0 w-full h-full text-brand-bronze/20"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1440 600"
        >
          <path
            d="M0 320 C360 220 720 420 1080 300 C1260 240 1380 280 1440 310"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M0 360 C360 260 720 460 1080 340 C1260 280 1380 320 1440 350"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
          />
        </svg>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Editorial Frame Box */}
        <div className="relative border border-brand-bronze/40 rounded-sm p-6 sm:p-10 lg:p-14 bg-brand-maroon-deep/70 backdrop-blur-md shadow-2xl">
          
          {/* Inner Decorative Corner Borders */}
          <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-brand-bronze" />
          <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-brand-bronze" />
          <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-brand-bronze" />
          <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-brand-bronze" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Editorial Content */}
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="lg:col-span-7 space-y-8 text-left"
            >
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-bronze block">
                  The Greatness of PRIME-H₂O
                </span>

                {/* Heading with Script Style Flourish */}
                <h2 className="font-editorial italic text-5xl sm:text-6xl lg:text-7xl font-normal text-brand-cream leading-tight">
                  Our Promise
                </h2>

                {/* Golden Flourish Line */}
                <div className="w-24 h-1 bg-gradient-to-r from-brand-bronze via-brand-bronze-light to-transparent rounded-full" />
              </div>

              {/* Exact Catalogue Message */}
              <blockquote className="font-sans text-xl sm:text-2xl md:text-3xl text-brand-cream font-light leading-relaxed">
                &ldquo;At <strong className="font-semibold text-brand-cream">PRIME-H₂O</strong>, we are committed to delivering pure, safe and refreshing drinking water, because your well-being is our priority.&rdquo;
              </blockquote>

              {/* Three Value Pillars in Bronze/Cream styling */}
              <div className="pt-6 border-t border-brand-bronze/30 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-cream/10 border border-brand-bronze/40 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-brand-bronze" />
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-cream">
                      Pure
                    </span>
                    <span className="text-xs text-brand-cream/70 font-light">
                      by Nature
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-cream/10 border border-brand-bronze/40 flex items-center justify-center shrink-0">
                    <Heart className="w-4 h-4 text-brand-bronze" />
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-cream">
                      Healthy
                    </span>
                    <span className="text-xs text-brand-cream/70 font-light">
                      for Life
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-cream/10 border border-brand-bronze/40 flex items-center justify-center shrink-0">
                    <Droplets className="w-4 h-4 text-brand-bronze" />
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-cream">
                      Refreshing
                    </span>
                    <span className="text-xs text-brand-cream/70 font-light">
                      Always
                    </span>
                  </div>
                </div>
              </div>

              {/* Tagline Endorsement */}
              <div className="pt-2 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-brand-bronze" />
                <span className="font-editorial italic text-xl text-brand-bronze-light">
                  I Trust PRIME
                </span>
              </div>
            </motion.div>

            {/* Right Column: Bottle Visual Centerpiece */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="lg:col-span-5 flex flex-col items-center justify-center"
            >
              <div className="relative py-4">
                {/* Radial studio backlight */}
                <div className="absolute inset-0 bg-brand-bronze/20 blur-[60px] rounded-full" />
                
                <img
                  src="/assets/hero_bottle.png"
                  alt="PRIME H2O Packaged Drinking Water Signature Promise"
                  className="relative z-10 h-80 sm:h-96 md:h-[420px] w-auto object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)] select-none animate-float-slow"
                  loading="lazy"
                />
              </div>

              <span className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand-bronze text-center">
                PACKAGED DRINKING WATER
              </span>
            </motion.div>

          </div>

        </div>

      </div>
    </section>
  );
};
