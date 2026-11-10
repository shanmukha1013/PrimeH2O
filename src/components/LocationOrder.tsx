import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, MessageCircle, Phone, ExternalLink, QrCode } from 'lucide-react';
import {
  BUSINESS_ADDRESS_LINES,
  MAP_EMBED_URL,
  MAP_OPEN_URL,
  WHATSAPP_DISPLAY,
  WHATSAPP_NUMBER,
  WHATSAPP_ORDER_URL,
} from '../lib/business';

// Map of the registered PRIME H₂O address + the official WhatsApp ordering QR.
export const LocationOrder: React.FC = () => (
  <section
    id="find-us"
    className="relative py-16 sm:py-20 md:py-24 bg-brand-cream-light border-t border-brand-bronze/30 scroll-mt-[72px] lg:scroll-mt-[80px] overflow-hidden"
    aria-label="PRIME H2O location and WhatsApp ordering"
  >
    <div className="absolute -top-32 right-0 w-[420px] h-[420px] rounded-full bg-brand-bronze/10 blur-[110px] pointer-events-none" />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-3xl mx-auto text-center space-y-4">
        <div className="inline-flex items-center gap-2">
          <span className="w-8 h-px bg-brand-bronze" />
          <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-maroon">
            Visit &amp; Order
          </span>
          <span className="w-8 h-px bg-brand-bronze" />
        </div>
        <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-maroon leading-tight">
          Find PRIME. Order in a Scan.
        </h2>
        <p className="text-base sm:text-lg text-brand-brown/85 max-w-xl mx-auto">
          Locate us in Hyderabad, or scan our QR code to start your order on WhatsApp.
        </p>
      </div>

      <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        {/* Map */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-7 flex flex-col bg-brand-cream p-3 sm:p-4 rounded-sm border border-brand-bronze/40 shadow-luxury"
        >
          <div className="relative flex-1 min-h-[320px] sm:min-h-[400px] overflow-hidden rounded-sm border border-brand-bronze/30 bg-brand-cream-tint">
            <iframe
              title="PRIME H₂O location on Google Maps — Nagole, Bandlaguda, Hyderabad"
              src={MAP_EMBED_URL}
              className="absolute inset-0 w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-5 pb-2 px-2">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-sm bg-brand-maroon flex items-center justify-center shrink-0 border border-brand-bronze/30">
                <MapPin className="w-4 h-4 text-brand-bronze" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-brand-maroon block">
                  PRIME H₂O — Registered Address
                </span>
                <address className="not-italic text-sm text-brand-brown/90 leading-relaxed">
                  {BUSINESS_ADDRESS_LINES[0]} {BUSINESS_ADDRESS_LINES[1]}
                </address>
              </div>
            </div>
            <a
              href={MAP_OPEN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-maroon border border-brand-bronze/50 hover:border-brand-maroon hover:bg-brand-cream-dark/50 transition-colors rounded-sm shrink-0"
            >
              <span>Open in Maps</span>
              <ExternalLink className="w-3.5 h-3.5 text-brand-bronze" />
            </a>
          </div>
        </motion.div>

        {/* WhatsApp QR */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="lg:col-span-5 bg-brand-cream p-6 sm:p-8 rounded-sm border border-brand-bronze/40 shadow-luxury flex flex-col items-center text-center"
        >
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-bold text-brand-bronze-dark">
            <QrCode className="w-3.5 h-3.5" /> Instant Ordering
          </span>

          {/* The official QR image, shown uncropped at its native 4:5 ratio */}
          <div className="relative mt-5 w-full max-w-[340px]">
            <span className="absolute -top-2 -left-2 w-7 h-7 border-t-2 border-l-2 border-brand-bronze" />
            <span className="absolute -top-2 -right-2 w-7 h-7 border-t-2 border-r-2 border-brand-bronze" />
            <span className="absolute -bottom-2 -left-2 w-7 h-7 border-b-2 border-l-2 border-brand-bronze" />
            <span className="absolute -bottom-2 -right-2 w-7 h-7 border-b-2 border-r-2 border-brand-bronze" />
            <img
              src="/assets/prime-whatsapp-qr.jpg"
              alt="PRIME H₂O WhatsApp ordering QR code — scan to order on WhatsApp at +91 81434 89222"
              width={1200}
              height={1500}
              loading="lazy"
              className="block w-full h-auto rounded-sm shadow-luxury bg-white"
            />
          </div>

          <h3 className="mt-8 font-sans text-lg sm:text-xl font-extrabold uppercase tracking-[0.14em] text-brand-maroon">
            Scan to Order on WhatsApp
          </h3>
          <a
            href={`tel:+${WHATSAPP_NUMBER}`}
            className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-brand-brown hover:text-brand-maroon transition-colors"
          >
            <Phone className="w-4 h-4 text-brand-bronze" />
            {WHATSAPP_DISPLAY}
          </a>

          <div className="editorial-rule w-40 my-6" />

          <a
            href={WHATSAPP_ORDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full max-w-[340px] inline-flex items-center justify-center gap-2.5 py-4 px-6 text-xs sm:text-sm font-bold uppercase tracking-[0.2em] bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich transition-all duration-300 rounded-sm shadow-luxury border border-brand-bronze/40 hover:-translate-y-0.5"
          >
            <MessageCircle className="w-4 h-4 text-brand-bronze transition-transform duration-300 group-hover:scale-110" />
            <span>Order on WhatsApp</span>
          </a>
        </motion.div>
      </div>
    </div>
  </section>
);
