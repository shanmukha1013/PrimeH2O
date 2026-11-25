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
          className="fixed inset-0 bg-brand-purple-deep/90 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-2xl bg-white border border-brand-purple-light rounded-sm shadow-2xl z-10 overflow-hidden my-8"
        >
          {/* Header */}
          <div className="bg-brand-purple px-6 py-5 flex items-center justify-between border-b border-brand-lavender/50">
            <div>
              <span className="text-[10px] uppercase tracking-[0.26em] font-semibold text-brand-purple-light block">
                Brand Heritage &amp; Philosophy
              </span>
              <h3 className="font-editorial text-2xl sm:text-3xl font-medium text-white">
                The Story of PRIME H₂O
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
              aria-label="Close Story Dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-6 text-brand-slate">
            
            {/* Centerpiece Logo */}
            <div className="flex justify-center py-2">
              <BrandLogo variant="dark" size="md" showTagline={true} />
            </div>

            {/* Official Brand Promise */}
            <div className="p-5 bg-brand-lavender-pure rounded border-l-4 border-l-brand-maroon border border-brand-lavender/40">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-purple block mb-1">
                Our Solemn Commitment
              </span>
              <p className="text-sm sm:text-base italic font-serif text-brand-slate leading-relaxed">
                &ldquo;At PRIME H₂O, we are committed to delivering pure, safe and refreshing drinking water, because your well-being is our priority.&rdquo;
              </p>
            </div>

            {/* The 3 Core Pillars */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-[0.22em] font-bold text-brand-purple">
                Our Three Non-Negotiable Pillars
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-brand-lavender-pure rounded border border-brand-lavender/35 text-center space-y-1">
                  <Sparkles className="w-5 h-5 text-brand-purple mx-auto" />
                  <span className="text-xs font-bold uppercase block text-brand-purple">
                    Pure by Nature
                  </span>
                  <span className="text-[11px] text-brand-slate/80 block">
                    Untouched clarity
                  </span>
                </div>

                <div className="p-3 bg-brand-lavender-pure rounded border border-brand-lavender/35 text-center space-y-1">
                  <Heart className="w-5 h-5 text-brand-purple mx-auto" />
                  <span className="text-xs font-bold uppercase block text-brand-purple">
                    Healthy for Life
                  </span>
                  <span className="text-[11px] text-brand-slate/80 block">
                    Uncompromising safety
                  </span>
                </div>

                <div className="p-3 bg-brand-lavender-pure rounded border border-brand-lavender/35 text-center space-y-1">
                  <RefreshCw className="w-5 h-5 text-brand-purple mx-auto" />
                  <span className="text-xs font-bold uppercase block text-brand-purple">
                    Refreshing Always
                  </span>
                  <span className="text-[11px] text-brand-slate/80 block">
                    Revitalizing taste
                  </span>
                </div>
              </div>
            </div>

            {/* Official PDF Catalogue Link */}
            <div className="p-4 bg-brand-lavender-light/50 rounded border border-brand-lavender/40 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold uppercase text-brand-purple block">
                  Official Brand Catalogue
                </span>
                <span className="text-xs text-brand-slate/80 block">
                  Complete 6-page editorial edition with full specs
                </span>
              </div>

              <a
                href="/PRIME_H2O_Catalogue.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-brand-purple text-white hover:bg-brand-purple-rich rounded transition-colors shrink-0 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 text-brand-purple-light" />
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
                className="flex-1 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-brand-purple text-white hover:bg-brand-purple-rich rounded transition-colors text-center shadow-md"
              >
                Explore The PRIME Range
              </button>

              <button
                type="button"
                onClick={onClose}
                className="py-3 px-5 text-xs font-bold uppercase tracking-[0.16em] bg-transparent text-brand-slate hover:bg-brand-lavender-light rounded border border-brand-lavender/50 transition-colors"
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
