import React, { useState, useEffect } from 'react';
import { BrandLogo } from './BrandLogo';
import { Menu, X, Phone, ArrowUpRight } from 'lucide-react';

interface NavbarProps {
  onOpenContact?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenContact }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', href: '#home' },
    { label: 'About Us', href: '#about' },
    { label: 'Our Products', href: '#products' },
    // mobile drawer only — the desktop bar has no room for more links
    { label: 'Order Online', href: '#order', mobileOnly: true },
    { label: 'Customize', href: '#customize', mobileOnly: true },
    { label: 'Our Promise', href: '#promise' },
    { label: 'Contact', href: '#contact' },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (href === '#home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.history.pushState) {
        window.history.pushState(null, '', '#home');
      }
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

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-brand-purple-deep/95 backdrop-blur-md shadow-luxury py-2.5 sm:py-3 border-b border-brand-lavender/25'
          : 'bg-brand-purple py-3.5 lg:py-4 border-b border-brand-lavender/20'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Left: Brand Logo */}
          <a
            href="#home"
            onClick={(e) => handleNavClick(e, '#home')}
            className="group flex items-center focus:outline-none shrink-0"
            aria-label="PRIME H2O Homepage"
          >
            <BrandLogo variant="light" size="sm" />
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-6 xl:space-x-8" aria-label="Main Navigation">
            {navLinks.filter((link) => !link.mobileOnly).map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-white/90 hover:text-brand-lavender text-sm uppercase tracking-[0.16em] font-medium transition-colors duration-200 relative group py-1"
              >
                <span>{link.label}</span>
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-brand-lavender transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          {/* Right: Phone & CTA */}
          <div className="hidden lg:flex items-center space-x-4 xl:space-x-5">
            <a
              href="tel:8143489222"
              className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/85 hover:text-brand-lavender transition-colors py-1.5 px-3 rounded border border-brand-lavender/30 hover:border-brand-lavender"
              title="Call PRIME H2O Direct Helpline"
            >
              <Phone className="w-3.5 h-3.5 text-brand-lavender" />
              <span className="font-semibold tracking-wider">8143489222</span>
            </a>

            <a
              href="#contact"
              onClick={(e) => {
                handleNavClick(e, '#contact');
                if (onOpenContact) onOpenContact();
              }}
              className="inline-flex items-center gap-1.5 px-4 xl:px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-purple bg-white hover:bg-brand-lavender-light hover:text-brand-purple-deep transition-all duration-300 shadow-md hover:shadow-luxury rounded-sm border border-brand-lavender/40 group"
            >
              <span>Contact Us</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-brand-purple transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          {/* Mobile menu trigger button */}
          <div className="flex lg:hidden items-center gap-3">
            <a
              href="tel:8143489222"
              className="p-2 text-white hover:text-brand-lavender border border-brand-lavender/30 rounded"
              aria-label="Call PRIME H2O"
            >
              <Phone className="w-4 h-4 text-brand-lavender" />
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-white hover:text-brand-lavender focus:outline-none"
              aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-white" />
              ) : (
                <Menu className="w-6 h-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-brand-purple-deep border-b border-brand-lavender/30 px-6 pt-4 pb-6 space-y-4 shadow-2xl animate-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-3 pt-2">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-white hover:text-brand-lavender text-base uppercase tracking-[0.18em] font-medium py-2 border-b border-brand-lavender/15 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="pt-2 flex flex-col gap-3">
            <a
              href="tel:8143489222"
              className="flex items-center justify-center gap-2 py-3 text-sm uppercase tracking-wider text-white border border-brand-lavender/40 rounded"
            >
              <Phone className="w-4 h-4 text-brand-lavender" />
              <span>Call 8143489222</span>
            </a>

            <a
              href="#contact"
              onClick={(e) => {
                handleNavClick(e, '#contact');
                if (onOpenContact) onOpenContact();
              }}
              className="flex items-center justify-center gap-2 py-3 text-sm font-semibold uppercase tracking-wider bg-white text-brand-purple rounded"
            >
              <span>Contact Us</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
