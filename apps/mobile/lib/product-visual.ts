// lib/product-visual.ts
// USE CASE (2026-09-30): Product/category ke naam se matching icon + halka colour
// (Coffee → cup, Pizza → pizza, Cake → cake...). Pehle billing grid mein HAR item
// aur HAR category pe same "Coffee" icon tha — cashier ko rush mein item dhoondhne
// mein time lagta tha. Photos nahi hain (MVP), isliye icon + colour se scan-ability.
// Customer web app (apps/web/app/order/[slug]/status) mein bhi yahi idea use hua hai.
// CONNECTED TO: billing.tsx (products + category sidebar), products.tsx.

import {
  Coffee, CupSoda, Pizza, Sandwich, CakeSlice, Cookie, IceCreamCone, Soup, Salad,
  Beef, Drumstick, Croissant, Wine, Milk, UtensilsCrossed, Citrus, Popcorn, Egg,
  type LucideIcon,
} from 'lucide-react-native';

export interface ProductVisual {
  icon: LucideIcon;
  color: string; // icon colour
  bg: string;    // avatar background
}

// Order matters — pehla match jeetta hai ("cold coffee" → coffee, "iced tea" → tea)
const RULES: { keywords: string[]; visual: ProductVisual }[] = [
  { keywords: ['coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'frappe', 'chai', 'tea'], visual: { icon: Coffee, color: '#B45309', bg: '#FEF3C7' } },
  { keywords: ['shake', 'smoothie', 'lassi', 'milk'], visual: { icon: Milk, color: '#7C3AED', bg: '#EDE9FE' } },
  { keywords: ['juice', 'lemon', 'lime', 'mojito', 'nimbu'], visual: { icon: Citrus, color: '#65A30D', bg: '#ECFCCB' } },
  { keywords: ['cola', 'soda', 'drink', 'beverage', 'cooler', 'water', 'pepsi', 'coke', 'sprite'], visual: { icon: CupSoda, color: '#0369A1', bg: '#E0F2FE' } },
  { keywords: ['mocktail', 'cocktail', 'wine', 'beer'], visual: { icon: Wine, color: '#BE123C', bg: '#FFE4E6' } },
  { keywords: ['pizza'], visual: { icon: Pizza, color: '#C2410C', bg: '#FFEDD5' } },
  { keywords: ['burger', 'sandwich', 'sub', 'wrap', 'roll', 'toast', 'kathi', 'frankie'], visual: { icon: Sandwich, color: '#D97706', bg: '#FEF3C7' } },
  { keywords: ['cake', 'pastry', 'brownie', 'dessert', 'sweet', 'muffin', 'cupcake', 'waffle', 'pancake'], visual: { icon: CakeSlice, color: '#DB2777', bg: '#FCE7F3' } },
  { keywords: ['ice cream', 'icecream', 'sundae', 'kulfi', 'gelato'], visual: { icon: IceCreamCone, color: '#DB2777', bg: '#FCE7F3' } },
  { keywords: ['cookie', 'biscuit'], visual: { icon: Cookie, color: '#B45309', bg: '#FEF3C7' } },
  { keywords: ['croissant', 'bread', 'bun', 'bakery', 'puff'], visual: { icon: Croissant, color: '#B45309', bg: '#FFEDD5' } },
  { keywords: ['soup'], visual: { icon: Soup, color: '#C2410C', bg: '#FFEDD5' } },
  { keywords: ['salad', 'veggie', 'healthy'], visual: { icon: Salad, color: '#15803D', bg: '#DCFCE7' } },
  { keywords: ['chicken', 'wings', 'tandoori', 'tikka', 'kebab', 'kabab'], visual: { icon: Drumstick, color: '#B91C1C', bg: '#FEE2E2' } },
  { keywords: ['mutton', 'beef', 'lamb', 'steak', 'meat'], visual: { icon: Beef, color: '#B91C1C', bg: '#FEE2E2' } },
  { keywords: ['egg', 'omelette', 'omelet', 'anda'], visual: { icon: Egg, color: '#CA8A04', bg: '#FEF9C3' } },
  { keywords: ['fries', 'popcorn', 'snack', 'nachos', 'chips', 'starter', 'momo'], visual: { icon: Popcorn, color: '#CA8A04', bg: '#FEF9C3' } },
];

const DEFAULT_VISUAL: ProductVisual = { icon: UtensilsCrossed, color: '#475569', bg: '#F1F5F9' };

export function getProductVisual(name: string): ProductVisual {
  const n = name.toLowerCase();
  return RULES.find((r) => r.keywords.some((k) => n.includes(k)))?.visual ?? DEFAULT_VISUAL;
}
