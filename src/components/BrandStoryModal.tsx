import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Sparkles, Heart, RefreshCw } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface BrandStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExploreProducts: () => void;
}

export const BrandStoryModal: React.FC<BrandStoryModalProps> = ({
  isOpen,
  onClose,
  onExploreProducts,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-brand-maroon-deep/85 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-2xl bg-brand-cream border border-brand-bronze rounded-sm shadow-2xl z-10 overflow-hidden my-8"
        >
          {/* Header */}
          <div className="bg-brand-maroon px-6 py-5 flex items-center justify-between border-b border-brand-bronze/40">
            <div>
              <span className="text-[10px] uppercase tracking-[0.26em] font-semibold text-brand-bronze block">
                Brand Heritage &amp; Philosophy
              </span>
              <h3 className="font-editorial text-2xl sm:text-3xl font-medium text-brand-cream">
                The Story of PRIME H₂O
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-brand-cream/80 hover:text-brand-cream hover:bg-brand-cream/10 rounded transition-colors"
              aria-label="Close Story Dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-6 text-brand-brown">
            
            {/* Centerpiece Logo */}
            <div className="flex justify-center py-2">
              <BrandLogo variant="dark" size="md" showTagline={true} />
            </div>

            {/* Official Brand Promise */}
            <div className="p-5 bg-brand-cream-light rounded border-l-4 border-l-brand-maroon border border-brand-bronze/30">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-maroon block mb-1">
                Our Solemn Commitment
              </span>
              <p className="text-sm sm:text-base italic font-serif text-brand-brown leading-relaxed">
                &ldquo;At PRIME-H₂O, we are committed to delivering pure, safe and refreshing drinking water, because your well-being is our priority.&rdquo;
              </p>
            </div>

            {/* The 3 Core Pillars */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-[0.22em] font-bold text-brand-maroon">
                Our Three Non-Negotiable Pillars
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-brand-cream-light rounded border border-brand-bronze/25 text-center space-y-1">
                  <Sparkles className="w-5 h-5 text-brand-maroon mx-auto" />
                  <span className="text-xs font-bold uppercase block text-brand-maroon">
                    Pure by Nature
                  </span>
                  <span className="text-[11px] text-brand-brown/80 block">
                    Untouched clarity
                  </span>
                </div>

                <div className="p-3 bg-brand-cream-light rounded border border-brand-bronze/25 text-center space-y-1">
                  <Heart className="w-5 h-5 text-brand-maroon mx-auto" />
                  <span className="text-xs font-bold uppercase block text-brand-maroon">
                    Healthy for Life
                  </span>
                  <span className="text-[11px] text-brand-brown/80 block">
                    Uncompromising safety
                  </span>
                </div>

                <div className="p-3 bg-brand-cream-light rounded border border-brand-bronze/25 text-center space-y-1">
                  <RefreshCw className="w-5 h-5 text-brand-maroon mx-auto" />
                  <span className="text-xs font-bold uppercase block text-brand-maroon">
                    Refreshing Always
                  </span>
                  <span className="text-[11px] text-brand-brown/80 block">
                    Revitalizing taste
                  </span>
                </div>
              </div>
            </div>

            {/* Official PDF Catalogue Link */}
            <div className="p-4 bg-brand-cream-dark/50 rounded border border-brand-bronze/30 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold uppercase text-brand-maroon block">
                  Official Brand Catalogue
                </span>
                <span className="text-xs text-brand-brown/80 block">
                  Complete 6-page editorial edition with full specs
                </span>
              </div>

              <a
                href="/PRIME_H2O_Catalogue.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich rounded transition-colors shrink-0 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 text-brand-bronze" />
                <span>View PDF</span>
              </a>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExploreProducts();
                }}
                className="flex-1 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich rounded transition-colors text-center shadow-md"
              >
                Explore The PRIME Range
              </button>

              <button
                type="button"
                onClick={onClose}
                className="py-3 px-5 text-xs font-bold uppercase tracking-[0.16em] bg-transparent text-brand-brown hover:bg-brand-cream-dark rounded border border-brand-bronze/40 transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
