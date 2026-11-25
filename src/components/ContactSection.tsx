import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Send, CheckCircle2, ExternalLink, Clock, Building, Info, MessageCircle, RotateCcw } from 'lucide-react';
import { WHATSAPP_DISPLAY, whatsappUrlWithText } from '../lib/business';
import { EnquiryError, EnquiryResult, emailStatusText, newRequestId, submitEnquiry } from '../lib/enquiryApi';

interface ContactSectionProps {
  prefilledSize?: string;
}

const SIZE_OPTIONS = [
  { value: 'All Sizes', label: 'All Sizes (General / Institutional Enquiry)' },
  { value: '250 mL', label: '250 mL (Small Bottle • Single-Serve)' },
  { value: '500 mL', label: '500 mL (Everyday Hydration Partner)' },
  { value: '1000 mL', label: '1000 mL (Family & Shared Format)' },
  { value: 'Distribution', label: 'Dealership / Commercial Supply' },
];
const sizeLabel = (value: string) => SIZE_OPTIONS.find((o) => o.value === value)?.label ?? value;

/**
 * What happened to a submitted enquiry. Only `sent` means the company's WhatsApp copy was handed to
 * WhatsApp by our server (Cloud API). Otherwise the customer sends it themselves with click-to-chat.
 */
type Outcome =
  | { kind: 'sent'; result: EnquiryResult }
  | { kind: 'saved'; result: EnquiryResult }
  | { kind: 'offline' };

export const ContactSection: React.FC<ContactSectionProps> = ({ prefilledSize = '' }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    email: '',
    sizeInterest: prefilledSize || 'All Sizes',
    message: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [waOpened, setWaOpened] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // reused for retries of the same submission, so a retry never creates a second enquiry
  const requestIdRef = React.useRef(newRequestId());
  const inFlightRef = React.useRef(false);

  // Update prefilledSize when prop changes
  React.useEffect(() => {
    if (prefilledSize) {
      setFormData((prev) => ({ ...prev, sizeInterest: prefilledSize }));
    }
  }, [prefilledSize]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Please enter your full name.';
    }
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Please enter your phone number.';
    } else if (!/^[0-9+\-\s()]{7,15}$/.test(formData.phoneNumber.trim())) {
      newErrors.phoneNumber = 'Please enter a valid phone number.';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }
    if (!formData.message.trim()) {
      newErrors.message = 'Please provide details of your enquiry.';
    } else if (formData.message.trim().length > 2000) {
      newErrors.message = 'Please keep your message under 2,000 characters.';
    }
    setErrors(newErrors);
    const first = ['fullName', 'phoneNumber', 'email', 'message'].find((k) => newErrors[k]);
    if (first) {
      const el = document.getElementById(first);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLInputElement | null)?.focus({ preventScroll: true });
      return false;
    }
    return true;
  };

  /** The enquiry exactly as entered, for WhatsApp click-to-chat (wa.me, URL-encoded). */
  const whatsappText = (enquiryId?: string) =>
    [
      "Hi PRIME H₂O! I'd like to make an enquiry.",
      '',
      `*Name:* ${formData.fullName.trim()}`,
      `*Phone:* ${formData.phoneNumber.trim()}`,
      `*Email:* ${formData.email.trim()}`,
      `*Product / requirement:* ${sizeLabel(formData.sizeInterest)}`,
      ...(enquiryId ? [`*Enquiry ID:* ${enquiryId}`] : []),
      '',
      '*Message:*',
      formData.message.trim(),
    ].join('\n');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send();
  };

  /** Validates, then saves the enquiry; the same request ID is reused, so retries never duplicate it. */
  const send = async () => {
    // a ref, not state: two clicks in the same instant must not send two requests
    if (inFlightRef.current || !validate()) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');
    setWaOpened(false);
    try {
      const res = await submitEnquiry({
        source: 'contact',
        clientRequestId: requestIdRef.current,
        name: formData.fullName.trim(),
        phone: formData.phoneNumber.trim(),
        email: formData.email.trim(),
        bottleSize: formData.sizeInterest,
        message: formData.message.trim(),
        website: honeypotRef.current?.value ?? '',
      });
      // "sent" only when our server handed the company's copy to WhatsApp (Cloud API)
      const handedToWhatsApp = res.teamWhatsApp === 'accepted' || res.teamWhatsApp === 'delivered';
      setOutcome({ kind: handedToWhatsApp ? 'sent' : 'saved', result: res });
    } catch (err) {
      const fields = err instanceof EnquiryError ? err.fields : {};
      const mapped: Record<string, string> = {};
      if (fields.name) mapped.fullName = fields.name;
      if (fields.phone) mapped.phoneNumber = fields.phone;
      if (fields.email) mapped.email = fields.email;
      if (fields.message) mapped.message = fields.message;
      if (Object.keys(mapped).length) {
        // the details need correcting: stay on the form
        setErrors(mapped);
        setSubmitError(err instanceof Error ? err.message : 'Please correct the highlighted fields.');
      } else {
        // the website could not save it (server unavailable, network, rate limit): send it on WhatsApp instead
        setOutcome({ kind: 'offline' });
      }
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const honeypotRef = React.useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setFormData({
      fullName: '',
      phoneNumber: '',
      email: '',
      sizeInterest: 'All Sizes',
      message: '',
    });
    setErrors({});
    setOutcome(null);
    setWaOpened(false);
    setSubmitError('');
    requestIdRef.current = newRequestId();
  };

  const enquiryId = outcome && outcome.kind !== 'offline' ? outcome.result.enquiryId : undefined;
  const waUrl = outcome ? whatsappUrlWithText(whatsappText(enquiryId)) : '';

  const mapUrl =
    'https://www.google.com/maps/search/?api=1&query=Nagole,+Bandlaguda,+Hyderabad,+Telangana+500068';

  return (
    <section
      id="contact"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-white border-t border-brand-lavender/40 scroll-mt-[72px] lg:scroll-mt-[80px]"
      aria-label="Connect With PRIME H2O"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-8 h-px bg-brand-purple-light" />
            <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-purple">
              Get In Touch
            </span>
            <span className="w-8 h-px bg-brand-purple-light" />
          </div>

          <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-purple leading-tight">
            Connect With PRIME
          </h2>

          <p className="text-base sm:text-lg text-brand-slate/85 font-normal max-w-xl mx-auto">
            Reach out for distribution enquiries, retail availability, or direct corporate and event supply.
          </p>
        </div>

        {/* Contact Layout Grid */}
        <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          
          {/* Left Column: Official Contact Card & Direct Functional Action Buttons */}
          <motion.div
            initial={{ opacity: 0, x: -25 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-5 space-y-8"
          >
            <div className="bg-brand-lavender-pure p-8 sm:p-10 rounded-sm border border-brand-lavender/50 shadow-luxury space-y-8 relative overflow-hidden">
              
              {/* Brand Header */}
              <div className="border-b border-brand-lavender/35 pb-6">
                <span className="text-xs font-bold uppercase tracking-[0.24em] text-brand-purple-light block">
                  Official Contact Desk
                </span>
                <h3 className="font-sans text-2xl font-extrabold uppercase tracking-widest text-brand-purple mt-1">
                  PRIME H₂O
                </h3>
                <p className="text-xs uppercase tracking-[0.2em] font-medium text-brand-slate mt-0.5">
                  PACKAGED DRINKING WATER
                </p>
              </div>

              {/* Contact Details List */}
              <div className="space-y-6">
                
                {/* Address */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-sm bg-brand-purple text-white flex items-center justify-center shrink-0 border border-brand-lavender/40">
                    <MapPin className="w-4 h-4 text-brand-purple-light" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-wider font-bold text-brand-purple block">
                      Registered Address
                    </span>
                    <address className="not-italic text-sm text-brand-slate/90 leading-relaxed font-normal">
                      Nagole, Bandlaguda,<br />
                      Hyderabad, Telangana – 500068.
                    </address>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-sm bg-brand-purple text-white flex items-center justify-center shrink-0 border border-brand-lavender/40">
                    <Phone className="w-4 h-4 text-brand-purple-light" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-wider font-bold text-brand-purple block">
                      Direct Helpline
                    </span>
                    <a
                      href="tel:8143489222"
                      className="text-base font-semibold text-brand-purple hover:text-brand-purple-light transition-colors"
                    >
                      8143489222
                    </a>
                    <span className="block text-xs text-brand-slate/70">
                      Standard operating & distribution hours
                    </span>
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-sm bg-brand-purple text-white flex items-center justify-center shrink-0 border border-brand-lavender/40">
                    <Mail className="w-4 h-4 text-brand-purple-light" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-wider font-bold text-brand-purple block">
                      Email Communication
                    </span>
                    <a
                      href="mailto:prime2417@gmail.com"
                      className="text-sm font-semibold text-brand-purple hover:text-brand-purple-light transition-colors break-all"
                    >
                      prime2417@gmail.com
                    </a>
                  </div>
                </div>

              </div>

              {/* Functional Quick Action Buttons */}
              <div className="pt-4 border-t border-brand-lavender/35 flex flex-col sm:flex-row gap-3">
                <a
                  href="tel:8143489222"
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-brand-purple text-white hover:bg-brand-purple-rich transition-colors rounded-sm shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5 text-brand-purple-light" />
                  <span>Call Now</span>
                </a>

                <a
                  href="mailto:prime2417@gmail.com?subject=Enquiry%20regarding%20PRIME%20H2O"
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-white text-brand-purple hover:bg-brand-lavender transition-colors border border-brand-purple/30 rounded-sm shadow-sm"
                >
                  <Mail className="w-3.5 h-3.5 text-brand-purple" />
                  <span>Email Us</span>
                </a>
              </div>

              {/* Google Maps Location Link */}
              <div>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium uppercase tracking-[0.14em] text-brand-slate hover:text-brand-purple bg-brand-lavender-light/60 hover:bg-brand-lavender-light transition-colors border border-brand-lavender/40 rounded-sm"
                >
                  <MapPin className="w-3.5 h-3.5 text-brand-purple-light" />
                  <span>View Location on Google Maps</span>
                  <ExternalLink className="w-3 h-3 text-brand-slate/70" />
                </a>
              </div>

              {/* Additional operational details */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-brand-slate/70 font-medium">
                <div className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-brand-purple-light" />
                  <span>Hyderabad Hub</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-purple-light" />
                  <span>Mon – Sat: 9am – 6pm</span>
                </div>
              </div>

            </div>
          </motion.div>

          {/* Right Column: Contact Enquiry Form */}
          <motion.div
            initial={{ opacity: 0, x: 25 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7"
          >
            <div className="bg-brand-lavender-pure p-8 sm:p-10 rounded-sm border border-brand-lavender/50 shadow-luxury">
              
              <div className="space-y-1 mb-8">
                <span className="text-xs uppercase tracking-[0.22em] font-bold text-brand-purple-light block">
                  Inquiry Portal
                </span>
                <h3 className="font-editorial text-2xl sm:text-3xl font-medium text-brand-purple">
                  Send an Enquiry
                </h3>
                <p className="text-xs sm:text-sm text-brand-slate/80 font-normal">
                  Fill in your details below. Our team reviews customer and bulk dispatch requests promptly.
                </p>
              </div>

              {outcome ? (
                <div role="status" aria-live="polite" className="py-10 px-6 text-center space-y-5 bg-white rounded-frame border border-brand-lavender/50">
                  <div className="w-14 h-14 rounded-full bg-brand-purple/10 border border-brand-lavender/60 flex items-center justify-center mx-auto text-brand-purple">
                    {outcome.kind === 'sent' ? (
                      <CheckCircle2 className="w-8 h-8 text-brand-purple" />
                    ) : (
                      <MessageCircle className="w-7 h-7 text-brand-purple" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-editorial text-2xl text-brand-purple font-semibold">
                      {outcome.kind === 'sent'
                        ? 'Enquiry Sent to PRIME H₂O'
                        : outcome.kind === 'saved'
                          ? 'One More Step: Send It on WhatsApp'
                          : 'Send Your Enquiry on WhatsApp'}
                    </h4>
                    <p className="text-sm text-brand-slate max-w-md mx-auto leading-relaxed">
                      {outcome.kind === 'sent' ? (
                        <>
                          Thank you, <strong className="font-semibold text-brand-purple">{formData.fullName}</strong>. Your enquiry about{' '}
                          <strong className="font-semibold text-brand-purple">{formData.sizeInterest}</strong> has been saved and passed to
                          WhatsApp for delivery to our team.
                        </>
                      ) : outcome.kind === 'saved' ? (
                        <>
                          Thank you, <strong className="font-semibold text-brand-purple">{formData.fullName}</strong>. Your enquiry has been
                          saved, but it has <strong className="font-semibold">not reached our WhatsApp yet</strong>. Tap the button below to open
                          WhatsApp with your enquiry ready, then press <strong className="font-semibold">Send</strong>.
                        </>
                      ) : (
                        <>
                          Our online enquiry service is not available right now, so your enquiry has <strong className="font-semibold">not been
                          sent yet</strong>. Tap the button below to open WhatsApp with all your details ready, then press{' '}
                          <strong className="font-semibold">Send</strong>.
                        </>
                      )}
                    </p>
                    {outcome.kind !== 'offline' && (
                      <p className="text-xs uppercase tracking-[0.18em] text-brand-slate/80">
                        Enquiry ID{' '}
                        <span className="font-bold text-brand-purple tracking-[0.12em] select-all">{outcome.result.enquiryId}</span>
                      </p>
                    )}
                    {outcome.kind !== 'offline' && outcome.result.duplicate && (
                      <p className="text-sm text-brand-slate/90 max-w-md mx-auto">We had already received this enquiry, so it was not saved twice.</p>
                    )}
                    {outcome.kind !== 'offline' && emailStatusText(outcome.result.customerEmail) && (
                      <p className="text-sm text-brand-slate/90 max-w-md mx-auto">{emailStatusText(outcome.result.customerEmail)}</p>
                    )}
                  </div>

                  {outcome.kind !== 'sent' && (
                    <div className="space-y-3">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setWaOpened(true)}
                        className="w-full max-w-md mx-auto inline-flex items-center justify-center gap-2 py-4 px-6 text-xs sm:text-sm font-bold uppercase tracking-[0.18em] bg-brand-purple text-white hover:bg-brand-purple-rich transition-colors rounded-sm shadow-luxury border border-brand-lavender/50"
                      >
                        <MessageCircle className="w-4 h-4 text-brand-purple-light" />
                        Send Enquiry on WhatsApp
                      </a>
                      <p className="text-xs text-brand-slate/75 max-w-md mx-auto">
                        {waOpened
                          ? 'WhatsApp opened with your enquiry. It reaches us only after you press Send in WhatsApp.'
                          : `Opens a chat with PRIME H₂O (${WHATSAPP_DISPLAY}) with your name, phone, email, requirement and message filled in.`}
                      </p>
                      {outcome.kind === 'offline' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOutcome(null);
                            void send();
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-purple hover:text-brand-purple transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Try the website again
                        </button>
                      )}
                    </div>
                  )}

                  <div className="p-4 bg-brand-lavender-pure rounded-tile border border-brand-lavender/40 text-xs text-brand-slate/85 max-w-md mx-auto text-left space-y-1.5">
                    <div className="font-semibold text-brand-purple uppercase tracking-wider text-[11px]">
                      Immediate Assistance:
                    </div>
                    <div>
                      For urgent dispatch, event catering or dealership queries, you can also directly call our office at{' '}
                      <a href="tel:8143489222" className="font-bold underline text-brand-purple">
                        8143489222
                      </a>{' '}
                      or email{' '}
                      <a href="mailto:prime2417@gmail.com" className="font-bold underline text-brand-purple">
                        prime2417@gmail.com
                      </a>.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-4 px-6 py-2.5 text-xs uppercase tracking-[0.18em] font-bold bg-brand-purple text-white hover:bg-brand-purple-rich transition-colors rounded-sm"
                  >
                    Submit Another Enquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {/* spam trap: hidden from people, filled in by bots */}
                  <div hidden aria-hidden="true">
                    <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </div>
                  
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="fullName"
                      className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-purple"
                    >
                      Full Name <span className="text-brand-purple-rich">*</span>
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => {
                        setFormData({ ...formData, fullName: e.target.value });
                        if (errors.fullName) setErrors({ ...errors, fullName: '' });
                      }}
                      placeholder="e.g. Ramesh Kumar"
                      className={`w-full px-4 py-3 bg-white border text-sm text-brand-slate placeholder-brand-slate/40 focus:outline-none focus:ring-1 transition-all rounded-sm ${
                        errors.fullName
                          ? 'border-red-600 focus:ring-red-600'
                          : 'border-brand-lavender/50 focus:border-brand-purple focus:ring-brand-purple'
                      }`}
                    />
                    {errors.fullName && (
                      <p className="text-xs text-red-700 font-medium">{errors.fullName}</p>
                    )}
                  </div>

                  {/* Phone & Email Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Phone Number */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="phoneNumber"
                        className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-purple"
                      >
                        Phone Number <span className="text-brand-purple-rich">*</span>
                      </label>
                      <input
                        id="phoneNumber"
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={(e) => {
                          setFormData({ ...formData, phoneNumber: e.target.value });
                          if (errors.phoneNumber) setErrors({ ...errors, phoneNumber: '' });
                        }}
                        placeholder="e.g. 8143489222"
                        className={`w-full px-4 py-3 bg-white border text-sm text-brand-slate placeholder-brand-slate/40 focus:outline-none focus:ring-1 transition-all rounded-sm ${
                          errors.phoneNumber
                            ? 'border-red-600 focus:ring-red-600'
                            : 'border-brand-lavender/50 focus:border-brand-purple focus:ring-brand-purple'
                        }`}
                      />
                      {errors.phoneNumber && (
                        <p className="text-xs text-red-700 font-medium">{errors.phoneNumber}</p>
                      )}
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="email"
                        className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-purple"
                      >
                        Email Address <span className="text-brand-purple-rich">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          if (errors.email) setErrors({ ...errors, email: '' });
                        }}
                        placeholder="e.g. yourname@domain.com"
                        className={`w-full px-4 py-3 bg-white border text-sm text-brand-slate placeholder-brand-slate/40 focus:outline-none focus:ring-1 transition-all rounded-sm ${
                          errors.email
                            ? 'border-red-600 focus:ring-red-600'
                            : 'border-brand-lavender/50 focus:border-brand-purple focus:ring-brand-purple'
                        }`}
                      />
                      {errors.email && (
                        <p className="text-xs text-red-700 font-medium">{errors.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Bottle Size Interest */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="sizeInterest"
                      className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-purple"
                    >
                      Interested Product Size / Requirements
                    </label>
                    <select
                      id="sizeInterest"
                      value={formData.sizeInterest}
                      onChange={(e) =>
                        setFormData({ ...formData, sizeInterest: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-white border border-brand-lavender/50 text-sm text-brand-slate focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all rounded-sm"
                    >
                      {SIZE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Message */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="message"
                      className="block text-xs uppercase tracking-[0.16em] font-bold text-brand-purple"
                    >
                      Enquiry Message <span className="text-brand-purple-rich">*</span>
                    </label>
                    <textarea
                      id="message"
                      rows={4}
                      maxLength={2000}
                      value={formData.message}
                      onChange={(e) => {
                        setFormData({ ...formData, message: e.target.value });
                        if (errors.message) setErrors({ ...errors, message: '' });
                      }}
                      placeholder="Please let us know your location, approximate volume required, or any specific questions..."
                      className={`w-full px-4 py-3 bg-white border text-sm text-brand-slate placeholder-brand-slate/40 focus:outline-none focus:ring-1 transition-all rounded-sm resize-none ${
                        errors.message
                          ? 'border-red-600 focus:ring-red-600'
                          : 'border-brand-lavender/50 focus:border-brand-purple focus:ring-brand-purple'
                      }`}
                    />
                    {errors.message && (
                      <p className="text-xs text-red-700 font-medium">{errors.message}</p>
                    )}
                  </div>

                  {submitError && (
                    <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-sm border border-red-700/40 bg-red-50 text-sm text-red-800">
                      <Info className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full inline-flex items-center justify-center gap-2 py-4 px-6 text-xs sm:text-sm font-bold uppercase tracking-[0.2em] bg-brand-purple text-white hover:bg-brand-purple-rich transition-all duration-300 rounded-sm shadow-luxury disabled:opacity-75 disabled:cursor-not-allowed group border border-brand-lavender/50"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Sending Enquiry...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 text-brand-purple-light transition-transform duration-300 group-hover:translate-x-1" />
                          <span>Submit Enquiry to PRIME H₂O</span>
                        </>
                      )}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-brand-slate/70 font-medium">
                      Your enquiry goes to PRIME H₂O on WhatsApp ({WHATSAPP_DISPLAY}).
                    </p>
                  </div>

                </form>
              )}

            </div>
          </motion.div>

        </div>

      </div>
    </section>
  );
};
