// lib/product-visual.tsx
// USE CASE (2026-09-30): Item/category naam se icon + halka rang (photos nahi hain).
// Pehle yahi logic 4 alag files mein copy-paste tha (menu, cart, checkout, status) —
// ek jagah badlo to baaki purane reh jaate. Ab ek hi source. Mobile app ka
// lib/product-visual.ts bhi yahi keywords use karta hai, dono jagah same icon dikhe.

import {
  Coffee, CupSoda, Pizza, Sandwich, CakeSlice, Cookie, IceCreamCone, Soup, Salad,
  Beef, Drumstick, Croissant, Wine, Milk, UtensilsCrossed, Citrus, Popcorn, Egg,
  type LucideIcon,
} from 'lucide-react';

export interface ProductVisual {
  Icon: LucideIcon;
  /** Tailwind classes: icon colour + tile background */
  tone: string;
}

const RULES: { keywords: string[]; visual: ProductVisual }[] = [
  { keywords: ['coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'frappe', 'chai', 'tea'], visual: { Icon: Coffee, tone: 'text-amber-700 bg-amber-50' } },
  { keywords: ['shake', 'smoothie', 'lassi', 'milk'], visual: { Icon: Milk, tone: 'text-violet-700 bg-violet-50' } },
  { keywords: ['juice', 'lemon', 'lime', 'mojito', 'nimbu'], visual: { Icon: Citrus, tone: 'text-lime-700 bg-lime-50' } },
  { keywords: ['cola', 'soda', 'drink', 'beverage', 'cooler', 'water', 'pepsi', 'coke', 'sprite'], visual: { Icon: CupSoda, tone: 'text-sky-700 bg-sky-50' } },
  { keywords: ['mocktail', 'cocktail', 'wine', 'beer'], visual: { Icon: Wine, tone: 'text-rose-700 bg-rose-50' } },
  { keywords: ['pizza'], visual: { Icon: Pizza, tone: 'text-orange-700 bg-orange-50' } },
  { keywords: ['burger', 'sandwich', 'sub', 'wrap', 'roll', 'toast', 'kathi', 'frankie'], visual: { Icon: Sandwich, tone: 'text-amber-700 bg-amber-50' } },
  { keywords: ['cake', 'pastry', 'brownie', 'dessert', 'sweet', 'muffin', 'cupcake', 'waffle', 'pancake'], visual: { Icon: CakeSlice, tone: 'text-pink-700 bg-pink-50' } },
  { keywords: ['ice cream', 'icecream', 'sundae', 'kulfi', 'gelato'], visual: { Icon: IceCreamCone, tone: 'text-pink-700 bg-pink-50' } },
  { keywords: ['cookie', 'biscuit'], visual: { Icon: Cookie, tone: 'text-amber-700 bg-amber-50' } },
  { keywords: ['croissant', 'bread', 'bun', 'bakery', 'puff'], visual: { Icon: Croissant, tone: 'text-orange-700 bg-orange-50' } },
  { keywords: ['soup'], visual: { Icon: Soup, tone: 'text-orange-700 bg-orange-50' } },
  { keywords: ['salad', 'veggie', 'healthy'], visual: { Icon: Salad, tone: 'text-green-700 bg-green-50' } },
  { keywords: ['chicken', 'wings', 'tandoori', 'tikka', 'kebab', 'kabab'], visual: { Icon: Drumstick, tone: 'text-red-700 bg-red-50' } },
  { keywords: ['mutton', 'beef', 'lamb', 'steak', 'meat'], visual: { Icon: Beef, tone: 'text-red-700 bg-red-50' } },
  { keywords: ['egg', 'omelette', 'omelet', 'anda'], visual: { Icon: Egg, tone: 'text-yellow-700 bg-yellow-50' } },
  { keywords: ['fries', 'popcorn', 'snack', 'nachos', 'chips', 'starter', 'momo'], visual: { Icon: Popcorn, tone: 'text-yellow-700 bg-yellow-50' } },
];

const DEFAULT_VISUAL: ProductVisual = { Icon: UtensilsCrossed, tone: 'text-brand bg-brand-soft' };

export function getProductVisual(name: string): ProductVisual {
  const n = name.toLowerCase();
  return RULES.find((r) => r.keywords.some((k) => n.includes(k)))?.visual ?? DEFAULT_VISUAL;
}

/** Item ka chhota icon tile (menu, cart, status sab jagah same) */
export function ProductTile({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const { Icon, tone } = getProductVisual(name);
  const box = size === 'sm' ? 'h-11 w-11 rounded-xl' : 'h-14 w-14 rounded-2xl';
  return (
    <div className={`flex shrink-0 items-center justify-center ${box} ${tone}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 20 : 24} strokeWidth={1.75} />
    </div>
  );
}
