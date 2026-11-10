import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { BrandIntro } from './components/BrandIntro';
import { ProductCollection, ProductItem } from './components/ProductCollection';
import { WhyPrime } from './components/WhyPrime';
import { OurPromise } from './components/OurPromise';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { ProductModal } from './components/ProductModal';
import { LabelStudio } from './components/LabelStudio';
import { LocationOrder } from './components/LocationOrder';

export const App: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [prefilledInquirySize, setPrefilledInquirySize] = useState<string>('');

  React.useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        if (hash === '#home') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          const el = document.querySelector(hash);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }, 200);
    }
  }, []);

  const handleInquireSize = (size: string) => {
    setPrefilledInquirySize(size);
    // Smooth scroll to contact section
    const contactEl = document.getElementById('contact');
    if (contactEl) {
      contactEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.history.pushState) {
        window.history.pushState(null, '', '#contact');
      }
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream text-brand-brown font-sans selection:bg-brand-maroon selection:text-brand-cream relative">
      {/* Top Navbar */}
      <Navbar
        onOpenContact={() => {
          const contactEl = document.getElementById('contact');
          if (contactEl) {
            contactEl.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {/* Main Multi-Section Layout */}
      <main id="main-content">
        {/* Section B: Hero Experience */}
        <Hero />

        {/* Section C: Brand Introduction */}
        <BrandIntro />

        {/* Section D: Our Product Collection */}
        <ProductCollection
          onSelectProduct={(product) => setSelectedProduct(product)}
          onInquireSize={handleInquireSize}
        />

        {/* Section D2: Create Your Own PRIME — custom label designer */}
        <LabelStudio />

        {/* Section E: Why PRIME H2O */}
        <WhyPrime />

        {/* Section F: Our Promise */}
        <OurPromise />

        {/* Section G: Contact / Get In Touch */}
        <ContactSection prefilledSize={prefilledInquirySize} />

        {/* Section G2: Location map + WhatsApp QR ordering */}
        <LocationOrder />
      </main>

      {/* Section H: Premium Maroon Footer */}
      <Footer />

      {/* Interactive Product Details Modal */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onInquire={handleInquireSize}
      />
    </div>
  );
};

export default App;
