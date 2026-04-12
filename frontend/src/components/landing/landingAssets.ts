/**
 * Logistics-only imagery for the landing narrative.
 * Unsplash: ?auto=format&fit=crop&w=1200&q=80
 * Pexels: compress + width (fit=crop where supported)
 */
const US = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

const PX = (id: number, file: string, extra = '') =>
  `https://images.pexels.com/photos/${id}/${file}.jpeg?auto=compress&cs=tinysrgb&w=1200${extra}`;

export const LANDING_IMAGES = {
  /** Cinematic port / night logistics */
  hero: PX(2835432, 'pexels-photo-2835432', '&h=900&fit=crop'),

  problem: {
    damaged: PX(4484078, 'pexels-photo-4484078', '&h=800&fit=crop'),
    congestion: US('1494412574643-ff11b0a5c1c3'),
    customs: US('1601584115197-04ecc0da31d7'),
    warehouse: US('1553413077-190dd305871c'),
  },

  /** Large-scale container port / terminal */
  solution: PX(163726, 'belgium-antwerp-shipping-container-163726', '&h=900&fit=crop'),

  steps: {
    /** Port crane / container handling */
    load: PX(1117210, 'pexels-photo-1117210', '&h=675&fit=crop'),
    contract: US('1558494949-ef010cbdcc31'),
    delivery: PX(5025667, 'pexels-photo-5025667', '&h=800&fit=crop'),
  },

} as const;
