// Shared PRIME H₂O business details used by the location / ordering sections.

export const WHATSAPP_NUMBER = '918143489222';
export const WHATSAPP_DISPLAY = '+91 81434 89222';

// Exactly the link encoded in the official PRIME H₂O WhatsApp QR code.
export const WHATSAPP_ORDER_URL =
  'https://wa.me/918143489222?text=Hi%20PRIMEH2O%21%20I%20would%20like%20to%20place%20an%20order.';

export const whatsappUrlWithText = (text: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

// Registered address as published in the Contact section and footer.
export const BUSINESS_ADDRESS_LINES = ['Nagole, Bandlaguda,', 'Hyderabad, Telangana – 500068.'];
const ADDRESS_QUERY = 'Nagole, Bandlaguda, Hyderabad, Telangana 500068';

export const MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(ADDRESS_QUERY)}&output=embed`;
export const MAP_OPEN_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS_QUERY)}`;
