import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Phone, ArrowRight } from 'lucide-react';
import { ProductItem } from './ProductCollection';

interface ProductModalProps {
  product: ProductItem | null;
  onClose: () => void;
  onInquire: (size: string) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  onClose,
  onInquire,
}) => {
  if (!product) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-brand-maroon-deep/80 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-3xl bg-brand-cream border border-brand-bronze rounded-sm shadow-2xl z-10 overflow-hidden my-8"
        >
          {/* Top Decorative Maroon Bar */}
          <div className="bg-brand-maroon px-6 py-4 flex items-center justify-between border-b border-brand-bronze/40">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-widest bg-brand-cream text-brand-maroon">
                {product.size}
              </span>
              <span className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-bronze">
                PRIME H₂O Range
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-brand-cream/80 hover:text-brand-cream hover:bg-brand-cream/10 rounded transition-colors"
              aria-label="Close Product Details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 sm:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            
            {/* Left: Realistic Bottle Showcase */}
            <div className="md:col-span-5 bg-brand-cream-light p-6 rounded border border-brand-bronze/30 flex flex-col items-center justify-center relative">
              <div className="absolute w-36 h-36 rounded-full bg-brand-bronze/10 blur-xl pointer-events-none" />
              <img
                src={product.image}
                alt={`PRIME H2O ${product.size}`}
                className="max-h-80 w-auto object-contain drop-shadow-xl my-2"
              />
              <span className="text-[11px] uppercase tracking-widest text-brand-maroon font-bold mt-2">
                I Trust PRIME
              </span>
            </div>

            {/* Right: Specifications & Details */}
            <div className="md:col-span-7 space-y-5 text-left">
              <div>
                <span className="text-xs uppercase tracking-[0.22em] font-bold text-brand-bronze block">
                  Product Overview
                </span>
                <h3 className="font-editorial text-3xl font-medium text-brand-maroon">
                  {product.headline}
                </h3>
                <p className="text-sm text-brand-brown/90 mt-1 font-normal leading-relaxed">
                  &ldquo;{product.description}&rdquo;
                </p>
              </div>

              {/* Three Benefits */}
              <div className="space-y-2 pt-1 border-t border-brand-bronze/20">
                <span className="text-xs uppercase tracking-[0.18em] font-bold text-brand-maroon block">
                  Distinct Advantages:
                </span>
                <ul className="space-y-1.5 text-xs sm:text-sm text-brand-brown">
                  {product.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-brand-maroon text-brand-cream flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Specifications Box */}
              <div className="p-3.5 bg-brand-cream-light rounded border border-brand-bronze/30 text-xs space-y-1.5 text-brand-brown">
                <div className="flex justify-between">
                  <span className="text-brand-brown/70">Format:</span>
                  <span className="font-semibold text-brand-maroon">{product.specs.volume}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-brown/70">Closure:</span>
                  <span className="font-semibold text-brand-maroon">{product.specs.closure}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-brown/70">Packaging:</span>
                  <span className="font-semibold text-brand-maroon">{product.specs.packType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-brown/70">Ideal Application:</span>
                  <span className="font-semibold text-brand-maroon">{product.specs.idealFor}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onInquire(product.size);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich transition-colors rounded-sm shadow-md"
                >
                  <span>Inquire for {product.size}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-brand-bronze" />
                </button>

                <a
                  href="tel:8143489222"
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-brand-cream-light text-brand-maroon border border-brand-bronze/40 hover:bg-brand-cream transition-colors rounded-sm"
                >
                  <Phone className="w-3.5 h-3.5 text-brand-bronze" />
                  <span>Call Helpline</span>
                </a>
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
