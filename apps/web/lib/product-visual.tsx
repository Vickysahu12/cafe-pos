// lib/product-visual.tsx
// USE CASE (2026-09-30): Item/category naam se icon + rang (photos nahi hain).
// Pehle yahi logic 4 alag files mein copy-paste tha (menu, cart, checkout, status) —
// ek jagah badlo to baaki purane reh jaate. Ab ek hi source. Mobile app ka
// lib/product-visual.ts bhi yahi keywords use karta hai, dono jagah same icon dikhe.
//
// REDESIGN (2026-10-02): "PHOTO SLOT". Har item card pe ab ek bada square artwork hai —
// theek wahi jagah jahan V2 mein asli food photo aayegi (10+ paid cafes ke baad).
// Tab bas `imageUrl ? <img> : <ProductArt>` — card ka design nahi badlega.
//   - Har food family ka apna garam gradient (coffee = brown, juice = lime, pizza = orange…)
//   - Peeche ek bada, halka, ghooma hua "ghost" icon + beech mein saaf icon → depth
//   - Item naam ke hash se angle/ghost position thoda alag — ek category ke 6 coffee
//     items bilkul copy-paste nahi dikhte
//   - Fake stock photos JAAN-BOOJH ke nahi: customer ko jo dikhe wahi plate pe aaye

import {
  Coffee, CupSoda, Pizza, Sandwich, CakeSlice, Cookie, IceCreamCone, Soup, Salad,
  Beef, Drumstick, Croissant, Wine, Milk, UtensilsCrossed, Citrus, Popcorn, Egg,
  type LucideIcon,
} from 'lucide-react';

export interface ProductVisual {
  Icon: LucideIcon;
  /** Gradient start / end + icon colour (hex — inline style, Tailwind purge se safe) */
  from: string;
  to: string;
  ink: string;
}

const v = (Icon: LucideIcon, from: string, to: string, ink: string): ProductVisual => ({ Icon, from, to, ink });

const RULES: { keywords: string[]; visual: ProductVisual }[] = [
  { keywords: ['coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'frappe', 'chai', 'tea', 'chocolate', 'cocoa'], visual: v(Coffee, '#F4E6D3', '#E2C29A', '#6B4423') },
  { keywords: ['shake', 'smoothie', 'lassi', 'milk'], visual: v(Milk, '#F0EAF6', '#D9CAEC', '#5B3F86') },
  { keywords: ['juice', 'lemon', 'lime', 'mojito', 'nimbu'], visual: v(Citrus, '#EEF4D8', '#D5E6A2', '#4D6A12') },
  { keywords: ['cola', 'soda', 'drink', 'beverage', 'cooler', 'water', 'pepsi', 'coke', 'sprite'], visual: v(CupSoda, '#E4F0F7', '#C3DDEC', '#1F5F80') },
  { keywords: ['mocktail', 'cocktail', 'wine', 'beer'], visual: v(Wine, '#F8E4E7', '#EDC0C8', '#8E2C3F') },
  { keywords: ['pizza'], visual: v(Pizza, '#FBE7D7', '#F1C29D', '#9A3D12') },
  { keywords: ['burger', 'sandwich', 'sub', 'wrap', 'roll', 'toast', 'kathi', 'frankie'], visual: v(Sandwich, '#F7EBD3', '#EACD98', '#7A5212') },
  { keywords: ['cake', 'pastry', 'brownie', 'dessert', 'sweet', 'muffin', 'cupcake', 'waffle', 'pancake'], visual: v(CakeSlice, '#F9E5ED', '#EFC3D4', '#8C2F55') },
  { keywords: ['ice cream', 'icecream', 'sundae', 'kulfi', 'gelato'], visual: v(IceCreamCone, '#FBEAF1', '#F1CDE0', '#8C2F55') },
  { keywords: ['cookie', 'biscuit'], visual: v(Cookie, '#F3E7D5', '#E1C49C', '#6E4A1F') },
  { keywords: ['croissant', 'bread', 'bun', 'bakery', 'puff'], visual: v(Croissant, '#F8EAD6', '#EBC99A', '#85521A') },
  { keywords: ['soup'], visual: v(Soup, '#FBE9DA', '#EFC5A3', '#93441A') },
  { keywords: ['salad', 'veggie', 'healthy'], visual: v(Salad, '#E7F2E3', '#C3E0BA', '#2F6A2A') },
  { keywords: ['chicken', 'wings', 'tandoori', 'tikka', 'kebab', 'kabab'], visual: v(Drumstick, '#F8E3DE', '#ECBBAF', '#8E2F22') },
  { keywords: ['mutton', 'beef', 'lamb', 'steak', 'meat'], visual: v(Beef, '#F5DFDA', '#E4B3A9', '#7E2A20') },
  { keywords: ['egg', 'omelette', 'omelet', 'anda'], visual: v(Egg, '#FBF2D6', '#F0DB98', '#7A5B0E') },
  { keywords: ['fries', 'popcorn', 'snack', 'nachos', 'chips', 'starter', 'momo'], visual: v(Popcorn, '#FAF1D3', '#EDD78C', '#7A5B0E') },
];

const DEFAULT_VISUAL: ProductVisual = v(UtensilsCrossed, '#F2EDE5', '#E0D5C4', '#5A4632');

/**
 * FIX (2026-10-02): pehle simple `includes` tha — "Chocolate Brownie" mein "cho-COLA-te"
 * mil jaata aur brownie pe soda-can icon aata. Ab:
 *  1. Keyword shabd ki SHURUAAT pe mile (cola ≠ chocolate)
 *  2. Kai mile to jo naam mein SABSE BAAD aaye wo jeete — English mein asli cheez
 *     aakhri shabd hoti hai: "Chicken Burger" → burger, "Chocolate Shake" → shake,
 *     "Hot Chocolate" → chocolate (coffee cup)
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

/** Chhota stable hash — same naam = hamesha same variation (render pure rahe) */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const ANGLES = [135, 160, 115, 145];
const GHOSTS = [
  { right: '-18%', bottom: '-20%', rotate: -18 },
  { right: '-22%', top: '-18%', rotate: 16 },
  { left: '-20%', bottom: '-22%', rotate: 12 },
];

interface ProductArtProps {
  name: string;
  /** Icon size in px — tile ke size ke hisaab se */
  iconSize?: number;
  className?: string;
}

/**
 * Photo slot artwork. Parent size deta hai (className se: h-28 w-28 / aspect-square…).
 * V2: yahan `imageUrl` prop aayega — mile to <img>, warna yahi artwork.
 */
export function ProductArt({ name, iconSize = 40, className = '' }: ProductArtProps) {
  const { Icon, from, to, ink } = getProductVisual(name);
  const h = hash(name);
  const angle = ANGLES[h % ANGLES.length];
  const { rotate, ...pos } = GHOSTS[h % GHOSTS.length];

  return (
    <div
      aria-hidden="true"
      className={`relative isolate flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`, color: ink }}
    >
      {/* Upar-left se halki roshni — flat rang ki jagah "plate" jaisa ubhaar */}
      <span
        className="absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(120% 90% at 22% 12%, rgb(255 255 255 / 0.55) 0%, rgb(255 255 255 / 0) 55%)' }}
      />
      {/* Ghost icon — bada, halka, ghooma hua */}
      <Icon
        className="absolute -z-10 opacity-[0.13]"
        style={{ ...pos, width: '78%', height: '78%', transform: `rotate(${rotate}deg)` }}
        strokeWidth={1.25}
      />
      <Icon size={iconSize} strokeWidth={1.6} />
    </div>
  );
}

/** Item ka chhota tile (cart, status) — wahi artwork, chhota */
export function ProductTile({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return size === 'sm' ? (
    <ProductArt name={name} iconSize={20} className="h-12 w-12 rounded-xl" />
  ) : (
    <ProductArt name={name} iconSize={24} className="h-14 w-14 rounded-2xl" />
  );
}
