import React from 'react';
import { BrandLogo } from './BrandLogo';
import { Phone, Mail, MapPin, ArrowUp } from 'lucide-react';

export const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.history.pushState) {
      window.history.pushState(null, '', '#home');
    }
  };

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href === '#home') {
      scrollToTop();
      return;
    }
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.history.pushState) {
        window.history.pushState(null, '', href);
      }
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="bg-gradient-to-b from-[#F8F7FF] via-[#F5F3FF] to-[#EDE9FE] text-[#3B0764] border-t border-[#DDD6FE] pt-16 pb-12 relative overflow-hidden"
      aria-label="PRIME H2O Corporate Footer"
    >
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#DDD6FE]/40 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Top Brand Banner */}
        <div className="border-b border-[#DDD6FE] pb-10 flex items-center justify-between gap-6">
          <div>
            <span className="text-xs uppercase tracking-[0.28em] font-bold text-[#6D28D9] block mb-2">
              THE GREATNESS OF PRIME H₂O
            </span>
            <BrandLogo variant="dark" size="md" showTagline={true} />
          </div>

          <button
            type="button"
            onClick={scrollToTop}
            className="p-2.5 sm:px-4 sm:py-2.5 rounded-sm border border-[#DDD6FE] bg-white text-[#3B0764] hover:text-[#6D28D9] hover:border-[#6D28D9] shadow-sm transition-all duration-300 flex items-center gap-2 group"
            aria-label="Back to top of page"
            title="Back to top"
          >
            <span className="hidden sm:inline text-xs uppercase tracking-[0.16em] font-semibold text-[#3B0764]/80 group-hover:text-[#6D28D9] transition-colors">
              Back to Top
            </span>
            <ArrowUp className="w-4 h-4 text-[#6D28D9] group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* 4-Column Navigation & Information Grid */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          
          {/* Col 1: About PRIME H2O */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-[0.24em] font-bold text-[#6D28D9]">
              About PRIME H₂O
            </h4>
            <p className="text-xs sm:text-sm text-[#3B0764]/80 leading-relaxed font-normal">
              PRIME H₂O (PRIME H2O / PrimeH2O) delivers pure, mineral-balanced packaged drinking water in Hyderabad across Nagole, Bandlaguda, and surrounding regions.
            </p>
            <div className="pt-2">
              <span className="font-editorial italic text-lg text-[#6D28D9] font-medium">
                I Trust PRIME.
              </span>
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-[0.24em] font-bold text-[#6D28D9]">
              Quick Navigation
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#3B0764]/80">
              <li>
                <a
                  href="#home"
                  onClick={(e) => handleNavClick(e, '#home')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  Home
                </a>
              </li>
              <li>
                <a
                  href="#about"
                  onClick={(e) => handleNavClick(e, '#about')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  About Us &amp; Philosophy
                </a>
              </li>
              <li>
                <a
                  href="#products"
                  onClick={(e) => handleNavClick(e, '#products')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  The PRIME Range
                </a>
              </li>
              <li>
                <a
                  href="#order"
                  onClick={(e) => handleNavClick(e, '#order')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  Order Online
                </a>
              </li>
              <li>
                <a
                  href="#customize"
                  onClick={(e) => handleNavClick(e, '#customize')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  Custom Branding
                </a>
              </li>
              <li>
                <a
                  href="#why-prime"
                  onClick={(e) => handleNavClick(e, '#why-prime')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  Why PRIME H₂O
                </a>
              </li>
              <li>
                <a
                  href="#promise"
                  onClick={(e) => handleNavClick(e, '#promise')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  Our Brand Promise
                </a>
              </li>
              <li>
                <a
                  href="#contact"
                  onClick={(e) => handleNavClick(e, '#contact')}
                  className="hover:text-[#6D28D9] transition-colors"
                >
                  Contact &amp; Inquiries
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Bottle Formats */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-[0.24em] font-bold text-[#6D28D9]">
              Product Portfolio
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#3B0764]/80">
              <li>
                <a href="#products" className="hover:text-[#6D28D9] transition-colors flex items-center justify-between">
                  <span>250 mL Bottle</span>
                  <span className="text-[10px] text-[#6D28D9] uppercase font-bold">Single-Serve</span>
                </a>
              </li>
              <li>
                <a href="#products" className="hover:text-[#6D28D9] transition-colors flex items-center justify-between">
                  <span>500 mL Bottle</span>
                  <span className="text-[10px] text-[#6D28D9] uppercase font-bold">Everyday</span>
                </a>
              </li>
              <li>
                <a href="#products" className="hover:text-[#6D28D9] transition-colors flex items-center justify-between">
                  <span>1000 mL Bottle</span>
                  <span className="text-[10px] text-[#6D28D9] uppercase font-bold">Family / Share</span>
                </a>
              </li>
              <li className="pt-2 text-xs text-[#3B0764]/60">
                Category: Packaged Drinking Water
              </li>
            </ul>
          </div>

          {/* Col 4: Corporate Contact */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-[0.24em] font-bold text-[#6D28D9]">
              Headquarters
            </h4>
            <div className="space-y-3 text-xs sm:text-sm text-[#3B0764]/80">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#6D28D9] shrink-0 mt-0.5" />
                <address className="not-italic leading-relaxed font-normal">
                  Nagole, Bandlaguda,<br />
                  Hyderabad, Telangana – 500068.
                </address>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#6D28D9] shrink-0" />
                <a href="tel:8143489222" className="hover:text-[#6D28D9] transition-colors font-bold">
                  8143489222
                </a>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#6D28D9] shrink-0" />
                <a href="mailto:prime2417@gmail.com" className="hover:text-[#6D28D9] transition-colors">
                  prime2417@gmail.com
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Legal & Copyright Bar */}
        <div className="pt-8 mt-4 border-t border-[#DDD6FE] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#3B0764]/70">
          <p>
            &copy; {currentYear} PRIME H₂O. All Rights Reserved.
          </p>

          <p className="font-editorial italic text-sm text-[#6D28D9] font-medium">
            THE GREATNESS OF PRIME H₂O &bull; I Trust PRIME
          </p>

          <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider">
            <span>Pure by Nature</span>
            <span>&bull;</span>
            <span>Healthy for Life</span>
            <span>&bull;</span>
            <span>Refreshing Always</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
