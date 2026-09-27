'use strict';
// One place for the things that appear everywhere. Change BRAND here (or set BRAND_NAME in .env) and rebuild the pages.
const BRAND = process.env.BRAND_NAME || 'Mbali';

module.exports = {
  BRAND,
  TAGLINE: 'East African food brands, on UK shelves.',
  // What trade members can tick on the sign-up form
  CATEGORIES: [
    { key: 'chilli', label: 'Chilli oils & hot sauces' },
    { key: 'spices', label: 'Spice blends & seasonings' },
    { key: 'tea', label: 'Tea & coffee' },
    { key: 'staples', label: 'Flours, grains & cooking essentials' },
    { key: 'drinks', label: 'Drinks & snacks' },
  ],
  BUSINESS_TYPES: [
    { key: 'shop', label: 'Shop or supermarket' },
    { key: 'restaurant', label: 'Restaurant, cafe or takeaway' },
    { key: 'caterer', label: 'Caterer or market stall' },
    { key: 'online', label: 'Online store' },
    { key: 'wholesaler', label: 'Wholesaler or cash & carry' },
    { key: 'other', label: 'Something else' },
  ],
  SPEND_BANDS: ['Under £250 a month', '£250 – £1,000 a month', '£1,000 – £5,000 a month', 'Over £5,000 a month', 'Not sure yet'],
  COUNTRIES: ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'Ethiopia', 'Somalia', 'Other'],
  BRAND_CATEGORIES: ['Chilli oil or hot sauce', 'Spices & seasonings', 'Tea', 'Coffee', 'Flours & staples', 'Snacks', 'Drinks', 'Other'],
  EXPORT_EXPERIENCE: ['Never exported', 'Exported once or twice', 'Export regularly'],
  FOUNDING_MEMBER_CAP: 50,   // "Founding members" offer shown on the site
};
