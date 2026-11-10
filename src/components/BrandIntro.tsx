import React from 'react';
import { motion } from 'framer-motion';
import { Droplet } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
};

export const BrandIntro: React.FC = () => {
  return (
    <section
      id="about"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-brand-cream border-t border-brand-bronze/20 scroll-mt-[72px] lg:scroll-mt-[80px] overflow-hidden"
      aria-label="About PRIME H2O"
    >
      {/* Editorial Borders & Soft Champagne Glow */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-brand-bronze/40 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-brand-bronze/40 to-transparent" />
      <div className="absolute -right-32 top-1/3 w-[420px] h-[420px] rounded-full bg-brand-bronze/10 blur-[110px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Section Header */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center space-y-6"
        >
          <div className="inline-flex items-center justify-center gap-2">
            <span className="w-6 h-px bg-brand-bronze" />
            <span className="text-xs uppercase tracking-[0.26em] font-semibold text-brand-maroon">
              About Company
            </span>
            <span className="w-6 h-px bg-brand-bronze" />
          </div>

          <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-maroon leading-tight text-balance">
            More Than a Brand.
            <span className="block italic text-brand-brown font-light">
              A Promise of Trust.
            </span>
          </h2>

          <div className="w-16 h-0.5 bg-brand-bronze mx-auto" />
        </motion.div>

        <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">

          {/* Company Description */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-7 border-l-2 border-brand-bronze/50 pl-5 sm:pl-8 space-y-6 text-base sm:text-lg text-brand-brown/90 leading-relaxed"
          >
            <p className="text-lg sm:text-xl text-brand-brown">
              <strong className="font-semibold text-brand-maroon">PRIME H₂O</strong> is not just a brand; it is a name built on people's trust and belief. Born as a startup after overcoming numerous hurdles, PRIME H₂O entered the market with one simple mission: to provide the best-quality drinking water to everyone.
            </p>
            <p>
              Our water undergoes multiple filtration processes, with carefully balanced TDS, appropriate pH levels and essential minerals, to deliver quality hydration.
            </p>
          </motion.div>

          {/* Brand Messages Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 relative bg-maroon-gradient rounded-sm border border-brand-bronze/50 shadow-luxury-lg px-6 py-10 sm:px-10 sm:py-12 text-center overflow-hidden"
          >
            {/* Champagne corner accents */}
            <span className="absolute top-3 left-3 w-6 h-6 border-t border-l border-brand-bronze/70" />
            <span className="absolute top-3 right-3 w-6 h-6 border-t border-r border-brand-bronze/70" />
            <span className="absolute bottom-3 left-3 w-6 h-6 border-b border-l border-brand-bronze/70" />
            <span className="absolute bottom-3 right-3 w-6 h-6 border-b border-r border-brand-bronze/70" />
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-brand-bronze/15 blur-[80px] pointer-events-none" />

            <div className="relative">
              <div className="mx-auto w-12 h-12 rounded-full border border-brand-bronze/60 bg-brand-cream/5 flex items-center justify-center">
                <Droplet className="w-5 h-5 text-brand-bronze-light" />
              </div>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="mt-6 font-editorial text-3xl sm:text-4xl font-medium uppercase tracking-[0.06em] leading-tight text-brand-cream"
              >
                <span className="block">SAVE WATER</span>{' '}
                <span className="block text-brand-bronze-light">AND SAVE LIVES.</span>
              </motion.p>

              {/* Divider */}
              <div className="my-8 flex items-center justify-center gap-3">
                <span className="w-12 h-px bg-brand-bronze/60" />
                <span className="w-1.5 h-1.5 rotate-45 bg-brand-bronze" />
                <span className="w-12 h-px bg-brand-bronze/60" />
              </div>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="font-editorial italic text-4xl sm:text-5xl font-medium tracking-wide text-brand-bronze-light"
              >
                I TRUST PRIME.
              </motion.p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};
