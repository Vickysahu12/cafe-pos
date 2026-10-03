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

// FIX (2026-10-02): ab naam mein jo keyword sabse BAAD aaye wo jeetta hai (getProductVisual dekho)
const RULES: { keywords: string[]; visual: ProductVisual }[] = [
  { keywords: ['coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'frappe', 'chai', 'tea', 'chocolate', 'cocoa'], visual: { icon: Coffee, color: '#B45309', bg: '#FEF3C7' } },
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

/**
 * FIX (2026-10-02): pehle simple `includes` tha — "Chocolate Brownie" mein "cho-COLA-te"
 * mil jaata aur brownie pe soda-can icon aata. Ab (web ke lib/product-visual.tsx jaisa):
 *  1. Keyword shabd ki SHURUAAT pe mile (cola ≠ chocolate)
 *  2. Kai mile to jo naam mein SABSE BAAD aaye wo jeete ("Chicken Burger" → burger,
 *     "Chocolate Shake" → shake, "Hot Chocolate" → chocolate)
 *  3. Shabd-shuruaat pe kuch na mile to beech mein dhoondho (cheesecake, milkshake)
 */
export function getProductVisual(name: string): ProductVisual {
  const n = name.toLowerCase();
  let best = null as { at: number; visual: ProductVisual } | null;
  for (const wordStart of [true, false]) {
    for (const r of RULES) {
      for (const k of r.keywords) {
        let at = -1;
        for (let i = n.indexOf(k); i !== -1; i = n.indexOf(k, i + 1)) {
          if (!wordStart || i === 0 || !/[a-z0-9]/.test(n[i - 1]!)) at = i;
        }
        if (at > (best?.at ?? -1)) best = { at, visual: r.visual };
      }
    }
    if (best) break;
  }
  return best?.visual ?? DEFAULT_VISUAL;
}
