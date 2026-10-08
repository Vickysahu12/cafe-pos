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
// UI REDESIGN (2026-10-08): bright Tailwind rang (violet/sky/pink) → warm palette, bilkul web
// (apps/web/lib/product-visual.tsx) jaisa — Cold Coffee app aur QR menu dono pe ek jaisa dikhe.
const RULES: { keywords: string[]; visual: ProductVisual }[] = [
  { keywords: ['coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'frappe', 'chai', 'tea', 'chocolate', 'cocoa'], visual: { icon: Coffee, color: '#6B4423', bg: '#F4E6D3' } },
  { keywords: ['shake', 'smoothie', 'lassi', 'milk'], visual: { icon: Milk, color: '#5B3F86', bg: '#F0EAF6' } },
  { keywords: ['juice', 'lemon', 'lime', 'mojito', 'nimbu'], visual: { icon: Citrus, color: '#4D6A12', bg: '#EEF4D8' } },
  { keywords: ['cola', 'soda', 'drink', 'beverage', 'cooler', 'water', 'pepsi', 'coke', 'sprite'], visual: { icon: CupSoda, color: '#1F5F80', bg: '#E4F0F7' } },
  { keywords: ['mocktail', 'cocktail', 'wine', 'beer'], visual: { icon: Wine, color: '#8E2C3F', bg: '#F8E4E7' } },
  { keywords: ['pizza'], visual: { icon: Pizza, color: '#9A3D12', bg: '#FBE7D7' } },
  { keywords: ['burger', 'sandwich', 'sub', 'wrap', 'roll', 'toast', 'kathi', 'frankie'], visual: { icon: Sandwich, color: '#7A5212', bg: '#F7EBD3' } },
  { keywords: ['cake', 'pastry', 'brownie', 'dessert', 'sweet', 'muffin', 'cupcake', 'waffle', 'pancake'], visual: { icon: CakeSlice, color: '#8C2F55', bg: '#F9E5ED' } },
  { keywords: ['ice cream', 'icecream', 'sundae', 'kulfi', 'gelato'], visual: { icon: IceCreamCone, color: '#8C2F55', bg: '#FBEAF1' } },
  { keywords: ['cookie', 'biscuit'], visual: { icon: Cookie, color: '#6E4A1F', bg: '#F3E7D5' } },
  { keywords: ['croissant', 'bread', 'bun', 'bakery', 'puff'], visual: { icon: Croissant, color: '#85521A', bg: '#F8EAD6' } },
  { keywords: ['soup'], visual: { icon: Soup, color: '#93441A', bg: '#FBE9DA' } },
  { keywords: ['salad', 'veggie', 'healthy'], visual: { icon: Salad, color: '#2F6A2A', bg: '#E7F2E3' } },
  { keywords: ['chicken', 'wings', 'tandoori', 'tikka', 'kebab', 'kabab'], visual: { icon: Drumstick, color: '#8E2F22', bg: '#F8E3DE' } },
  { keywords: ['mutton', 'beef', 'lamb', 'steak', 'meat'], visual: { icon: Beef, color: '#7E2A20', bg: '#F5DFDA' } },
  { keywords: ['egg', 'omelette', 'omelet', 'anda'], visual: { icon: Egg, color: '#7A5B0E', bg: '#FBF2D6' } },
  { keywords: ['fries', 'popcorn', 'snack', 'nachos', 'chips', 'starter', 'momo'], visual: { icon: Popcorn, color: '#7A5B0E', bg: '#FAF1D3' } },
];

const DEFAULT_VISUAL: ProductVisual = { icon: UtensilsCrossed, color: '#5A4632', bg: '#F2EDE5' };

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
