import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ShieldCheck, Droplet, ArrowRight } from 'lucide-react';

// The four PRIME H₂O campaign photographs shown on the right side of the hero.
// `position` keeps the PRIME bottle in frame when the desktop frame trims the edges.
const HERO_SLIDES = [
  {
    src: '/assets/hero/prime-ad-1.jpeg',
    alt: 'A man holding out a PRIME H₂O bottle against a backdrop',
    position: '45% 50%',
  },
  {
    src: '/assets/hero/prime-ad-2.jpeg',
    alt: 'Friends drinking PRIME H₂O at the Charminar market',
    position: '50% 50%',
  },
  {
    src: '/assets/hero/prime-ad-3.jpeg',
    alt: 'A badminton player holding a PRIME H₂O bottle after a match',
    position: '55% 50%',
  },
  {
    src: '/assets/hero/prime-ad-4.jpeg',
    alt: 'A smiling family holding PRIME H₂O bottles',
    position: '50% 50%',
  },
];

const SLIDE_INTERVAL_MS = 1500;

// Random order where every photo appears once per round and the same photo
// never shows twice in a row (the new round never starts with `avoidFirst`).
function shuffledOrder(count: number, avoidFirst: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (count > 1 && order[0] === avoidFirst) {
    const swapWith = 1 + Math.floor(Math.random() * (count - 1));
    [order[0], order[swapWith]] = [order[swapWith], order[0]];
  }
  return order;
}

// Returns the photo to show and the one it is replacing (kept visible underneath
// while the new photo fades in on top, so the transition never dips or ghosts).
function useRandomSlideshow(count: number, intervalMs: number): { active: number; previous: number } {
  const [firstRound] = useState(() => shuffledOrder(count, -1));
  const [slide, setSlide] = useState({ active: firstRound[0], previous: -1 });
  const activeRef = useRef(firstRound[0]);
  const queueRef = useRef(firstRound.slice(1));

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (queueRef.current.length === 0) {
        queueRef.current = shuffledOrder(count, activeRef.current);
      }
      const next = queueRef.current.shift() as number;
      activeRef.current = next;
      setSlide((prev) => ({ active: next, previous: prev.active }));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, intervalMs]);

  return slide;
}

// All four photos are stacked in one fixed-ratio frame and cross-faded, so
// they are preloaded and the layout never shifts. object-cover never distorts.
const HeroSlideshow: React.FC<{ active: number; previous: number }> = ({ active, previous }) => (
  <div className="relative w-full">
    {/* Studio Radial Glow */}
    <div className="absolute -inset-6 rounded-full bg-brand-lavender/20 blur-[70px] pointer-events-none" />

    <div className="relative aspect-video lg:aspect-[4/3] overflow-hidden rounded-frame border border-brand-lavender/40 bg-brand-purple-deep shadow-[0_30px_60px_-20px_rgba(50,16,100,0.4)] [transform:translateZ(0)]">
      {HERO_SLIDES.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          aria-hidden={i !== active}
          draggable={false}
          loading="eager"
          decoding="async"
          style={{ objectPosition: slide.position }}
          className={`absolute inset-0 w-full h-full object-cover select-none transition-[opacity,transform] duration-[600ms] ease-out motion-reduce:transition-none ${
            i === active
              ? 'z-20 opacity-100 scale-100'
              : i === previous
                ? 'z-10 opacity-100 scale-100'
                : 'z-0 opacity-0 scale-[1.03]'
          }`}
        />
      ))}
      <div className="absolute inset-0 rounded-frame ring-1 ring-inset ring-brand-lavender/25 pointer-events-none z-30" />
    </div>
  </div>
);

export const Hero: React.FC = () => {
  const { active: activeSlide, previous: previousSlide } = useRandomSlideshow(HERO_SLIDES.length, SLIDE_INTERVAL_MS);

  return (
    <section
      id="home"
      className="relative min-h-[90vh] lg:min-h-screen pt-28 sm:pt-32 md:pt-36 lg:pt-36 pb-16 sm:pb-20 md:pb-24 bg-brand-purple-deep flex flex-col justify-center scroll-mt-0"
      aria-label="PRIME H2O Hero Section"
    >
      {/* Background Architectural Decor - Subtle Lavender Angles & Editorial Grid */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        {/* Subtle radial studio backlight */}
        <div className="absolute top-1/2 left-3/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-lavender/15 rounded-full blur-[140px]" />
        
        {/* Deep purple ambient glow */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-brand-purple/20 rounded-full blur-[100px]" />

        {/* Diagonal Soft Lavender Lines */}
        <svg
          className="absolute inset-0 w-full h-full text-brand-lavender/25"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1200 800"
        >
          <path
            d="M-100 550 L450 380 L800 620 L1300 480"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M-100 590 L450 420 L800 660 L1300 520"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
          />
          <line
            x1="120"
            y1="0"
            x2="120"
            y2="800"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeDasharray="4 8"
          />
          <line
            x1="1080"
            y1="0"
            x2="1080"
            y2="800"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeDasharray="4 8"
          />
        </svg>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
          
          {/* Left Column: Brand Story & Headline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 text-left space-y-5 sm:space-y-6 md:space-y-8"
          >
            {/* Small Statement Eyebrow */}
            <div className="inline-flex items-center gap-2.5">
              <span className="w-6 sm:w-8 h-[1px] bg-brand-lavender" />
              <span className="text-[11px] sm:text-xs uppercase tracking-[0.28em] font-semibold text-brand-lavender">
                THE GREATNESS OF PRIME H₂O
              </span>
            </div>

            {/* Main Editorial Headline */}
            <div className="space-y-1">
              <h1 className="font-editorial text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-normal text-white leading-[1.05] tracking-tight text-balance">
                Every Drop.{' '}
                <span className="block italic text-brand-lavender font-light">
                  A Promise of Greatness.
                </span>
                <span className="sr-only"> — PRIME H₂O, premium packaged drinking water in Hyderabad</span>
              </h1>
            </div>

            {/* Supporting Text */}
            <p className="text-sm sm:text-base md:text-xl text-white/90 font-light leading-relaxed max-w-xl text-balance">
              Discover <strong className="font-semibold text-white">PRIME H₂O</strong> (PRIME H2O / PrimeH2O) — refreshing packaged drinking water crafted for everyday hydration, events, and bulk supply across Hyderabad from Nagole and Bandlaguda.
            </p>

            {/* Brand Statement Badge */}
            <div className="pt-1 flex items-center gap-4">
              <div className="px-3.5 py-1.5 sm:px-4 sm:py-2 border-l-2 border-brand-lavender bg-white/5 backdrop-blur-sm">
                <span className="block text-[10px] sm:text-xs uppercase tracking-[0.24em] text-brand-lavender font-medium">
                  Brand Statement
                </span>
                <span className="font-editorial italic text-lg sm:text-2xl text-white font-medium tracking-wide">
                  I TRUST PRIME.
                </span>
              </div>
            </div>

            {/* Mobile Campaign Slideshow (Visible only on mobile/tablet screens < lg) */}
            <div className="block lg:hidden pt-2">
              <HeroSlideshow active={activeSlide} previous={previousSlide} />
            </div>

            {/* CTA Button */}
            <div className="pt-2 sm:pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <a
                href="#products"
                onClick={(e) => {
                  e.preventDefault();
                  const productsEl = document.getElementById('products');
                  if (productsEl) {
                    productsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (window.history.pushState) {
                      window.history.pushState(null, '', '#products');
                    }
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-brand-purple bg-white hover:bg-brand-lavender-light hover:text-brand-purple-deep transition-all duration-300 shadow-luxury rounded-sm border border-brand-lavender/50 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Explore Our Products</span>
                <ArrowRight className="w-4 h-4 text-brand-purple" />
              </a>

            </div>

            {/* Trust Pill Indicators */}
            <div className="pt-4 sm:pt-6 border-t border-brand-lavender/20 flex flex-wrap items-center gap-4 sm:gap-6 text-[11px] sm:text-xs uppercase tracking-[0.16em] text-white/75">
              <div className="flex items-center gap-2">
                <Droplet className="w-3.5 h-3.5 text-brand-lavender" />
                <span>Pure by Nature</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-lavender" />
                <span>Healthy for Life</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-lavender" />
                <span>Refreshing Always</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Campaign Photo Slideshow (Desktop) */}
          <div className="hidden lg:flex lg:col-span-5 relative flex-col items-center justify-center">
            <HeroSlideshow active={activeSlide} previous={previousSlide} />
          </div>

        </div>
      </div>

      {/* Bottom Scroll Indicator */}
      <div className="hidden sm:flex absolute bottom-4 left-1/2 -translate-x-1/2 flex-col items-center gap-1.5 text-white/60 hover:text-brand-lavender transition-colors">
        <a
          href="#about"
          onClick={(e) => {
            e.preventDefault();
            const aboutEl = document.getElementById('about');
            if (aboutEl) {
              aboutEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              if (window.history.pushState) {
                window.history.pushState(null, '', '#about');
              }
            }
          }}
          aria-label="Scroll to About Company"
          className="flex flex-col items-center"
        >
          <span className="text-[10px] uppercase tracking-[0.24em] font-medium">Scroll</span>
          <ArrowDown className="w-3.5 h-3.5 animate-bounce mt-1 text-brand-lavender" />
        </a>
      </div>
    </section>
  );
};
