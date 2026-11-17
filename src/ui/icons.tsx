import type { ReactNode } from 'react';

// Icônes de prestation, dessinées pour la maquette dans le style des images de `exemple/` :
// une silhouette claire sur une pastille sombre. Les couleurs viennent des tokens (voir `.picon`).
// Classes : pi-fill (forme pleine), pi-soft (fondu), pi-line (trait gravé), pi-mark (trait clair),
// pi-shade (zone grisée sur le visage : barbe, moustache).

const HEAD = 'M24 8C17.8 8 14.2 12.6 14.2 20 14.2 29.5 17.8 40 24 40 30.2 40 33.8 29.5 33.8 20 33.8 12.6 30.2 8 24 8Z';
const EAR = 'M14.4 22C12.4 21.2 11 22.6 11.3 24.8 11.6 26.9 12.9 28.2 14.9 27.9Z';

/** Dessine `d`, puis son miroir : les tracés de côté ne sont écrits que pour la gauche. */
function Both({ d, className }: { d: string; className: string }) {
  return (
    <>
      <path d={d} className={className} />
      <path d={d} className={className} transform="translate(48 0) scale(-1 1)" />
    </>
  );
}

type Cut = {
  /** Cheveux derrière la tête : longueurs. */
  back?: string;
  /** Cheveux sur le crâne. */
  top: string;
  /** Côtés en fondu, tracé de gauche. */
  side?: string;
  /** Mèches et raie, gravées dans les cheveux. */
  lines?: string;
  /** Traits clairs autour de la tête, tracé de gauche. */
  rays?: string;
  dots?: [number, number][];
};

const SHORT_TOP = 'M16.2 15.2C16.8 9.6 19.6 6.4 24 6.4 28.4 6.4 31.2 9.6 31.8 15.2 29.6 13.4 27 12.6 24 12.6 21 12.6 18.4 13.4 16.2 15.2Z';

const CUTS: Record<string, Cut> = {
  degrade: {
    top: SHORT_TOP,
    side: 'M13.9 22C13.7 17.8 14.6 14.6 16.4 12.4L17.8 14.6C16.6 16.4 16 18.8 15.9 22Z',
    lines: 'M21 8.6 20.4 11M24 8V10.6M27 8.6 27.6 11',
  },
  taper: {
    top: 'M13.9 19C13.5 11.2 17.6 6.4 24 6.4 30.4 6.4 34.5 11.2 34.1 19 33.3 16.2 32.2 14.4 30.6 13.4 26.8 14.2 21.6 13.8 17.8 11.8 16 13.4 14.7 15.8 13.9 19Z',
    side: 'M13.9 19H15.8L15.6 24.6 14.3 24Z',
    lines: 'M18.6 8.6C17.8 9.8 17.5 10.8 17.6 11.8',
  },
  burst: {
    top: 'M15 17.4C15 10.6 18.6 6.4 24 6.4 29.4 6.4 33 10.6 33 17.4 31.2 14.6 28.2 13.2 24 13.2 19.8 13.2 16.8 14.6 15 17.4Z',
    side: 'M13.9 21.5C13.8 19.6 14.2 17.9 15 16.6L16.2 18.2C15.9 19.2 15.8 20.3 15.8 21.5Z',
    rays: 'M10.2 20.4 8 18.8M9.2 24.8H6.6M10.4 29 8.4 30.6',
  },
  crop: {
    top: 'M14 18C13.6 14.6 14.4 11.6 15.8 9.6L17.4 11 18.4 8 20.4 10 21.8 6.8 24 9.2 26.2 6.8 27.6 10 29.6 8 30.6 11 32.2 9.6C33.6 11.6 34.4 14.6 34 18Z',
    side: 'M14 18H15.8L15.7 23 14.2 22.6Z',
    lines: 'M18 18V15.8M21 18V15M24 18V15.8M27 18V15M30 18V15.8',
  },
  classique: {
    top: 'M13.7 20.4C13.1 11.8 17.4 6.2 24 6.2 30.8 6.2 34.9 11.8 34.3 20.4 33.5 17.4 32.4 15.2 30.8 13.8 26.2 15.2 20.4 14.4 17.2 11.4 15.4 13.4 14.3 16.4 13.7 20.4Z',
    lines: 'M18.2 8.2C17.2 9.4 16.9 10.4 17.2 11.4M21 9.4C24 11.2 27.6 11.8 30.6 11.2',
  },
  buzz: {
    top: 'M13.8 21C13.4 12.4 17.4 7.2 24 7.2 30.6 7.2 34.6 12.4 34.2 21 33.4 17 32.2 14.6 30.4 13.6 26.8 12.4 21.2 12.4 17.6 13.6 15.8 14.6 14.6 17 13.8 21Z',
    dots: [[20, 10.4], [24, 9.6], [28, 10.4], [16.8, 13.4], [31.2, 13.4], [22, 11.6], [26, 11.6]],
  },
  undercut: {
    top: 'M12.4 14.8C12.4 9.2 17 5.4 24.2 5.4 30.8 5.4 35.4 8.8 35.6 14.2 32.2 13 28.4 12.8 24.4 13 20 13.2 15.8 13.8 12.4 14.8Z',
    lines: 'M16.6 9.8C20.8 8.2 27 8 31.8 9.4',
  },
  slick: {
    top: 'M13.9 19.6C13.3 11.4 17.6 6 24 6 30.4 6 34.7 11.4 34.1 19.6 32.9 16 31.5 14.2 29.7 13.4 26.2 12.5 21.8 12.5 18.3 13.4 16.5 14.2 15.1 16 13.9 19.6Z',
    lines: 'M20.2 12.8C20.3 10.2 21 8 22.2 6.4M24 12.6V6.2M27.8 12.8C27.7 10.2 27 8 25.8 6.4M16.4 14.6C16.6 11.6 17.8 9.2 19.6 7.6M31.6 14.6C31.4 11.6 30.2 9.2 28.4 7.6',
  },
  pompadour: {
    top: 'M13.8 20.4C12.8 13.8 14.2 9.2 16.8 6.6 19.4 3.6 23.6 2 27.6 2.8 32.2 3.6 35 7.6 34.6 13.4 34.5 15.8 34.3 18.2 34.2 20.4 33.4 17.4 32.4 15.4 30.8 14.2 26.6 15.2 21 14.8 17.2 12.6 15.4 14.4 14.4 17 13.8 20.4Z',
    lines: 'M19 12.4C19.6 8.8 21.8 6.2 25 5M24.4 13.6C25.2 10.4 27.2 8 30 6.8',
  },
  wolf: {
    back: 'M24 5C16 5 11 10.2 11 17.8 11 22.4 10 26.6 8 30.4L12 29 11 33.8 15.2 31.2 15.8 35.4 18.8 32H29.2L32.2 35.4 32.8 31.2 37 33.8 36 29 40 30.4C38 26.6 37 22.4 37 17.8 37 10.2 32 5 24 5Z',
    top: 'M13.6 21C13.2 12.4 17.4 6.6 24 6.6 30.6 6.6 34.8 12.4 34.4 21L32.4 16.2 31 19.6 29 15.2 27 18.8 24.8 14.8 22.6 18.6 20.4 14.8 18.2 18.8 16.4 15.6Z',
  },
  curtain: {
    top: 'M24 7.2C18 5.6 12.8 10 12.6 17.6 12.5 20.6 12.9 23.6 13.6 26 14.8 24 15.4 21.8 15.8 19.6 16.6 15 19.4 12.6 24 11.6 28.6 12.6 31.4 15 32.2 19.6 32.6 21.8 33.2 24 34.4 26 35.1 23.6 35.5 20.6 35.4 17.6 35.2 10 30 5.6 24 7.2Z',
    lines: 'M24 7.4V11.4',
  },
  mulet: {
    back: 'M15.4 22C14 28 12 33.6 9.6 38 11.8 39.4 14.2 40.2 16.8 40.2L18 36H30L31.2 40.2C33.8 40.2 36.2 39.4 38.4 38 36 33.6 34 28 32.6 22Z',
    top: 'M14.4 17C14.6 10.4 18.4 6.4 24 6.4 29.6 6.4 33.4 10.4 33.6 17 32.2 15 30.6 13.8 28.8 13.4L27.6 15.2 25.8 13 24 15 22.2 13 20.4 15.2 19.2 13.4C17.4 13.8 15.8 15 14.4 17Z',
  },
  bro: {
    back: 'M24 5.6C16.2 5.6 11.2 10.4 11 17.6 10.9 22 9.6 25.6 7 28.6 9.2 29 11.2 28.6 13 27.4 13.2 29.2 12.8 30.8 11.8 32.2 14.2 32 16.2 31 17.6 29H30.4C31.8 31 33.8 32 36.2 32.2 35.2 30.8 34.8 29.2 35 27.4 36.8 28.6 38.8 29 41 28.6 38.4 25.6 37.1 22 37 17.6 36.8 10.4 31.8 5.6 24 5.6Z',
    top: 'M13.9 20C13.3 12 17.6 6.6 24 6.6 30.4 6.6 34.7 12 34.1 20 32.9 16.2 31.3 14 29.1 13 25.8 12.2 22.2 12.2 18.9 13 16.7 14 15.1 16.2 13.9 20Z',
    lines: 'M19.2 12.9C18.6 10.6 19.2 8.6 20.8 7M24 12.4V6.8M28.8 12.9C29.4 10.6 28.8 8.6 27.2 7',
  },
};

function Head({ cut }: { cut: Cut }) {
  return (
    <>
      {cut.back && <path d={cut.back} className="pi-fill" />}
      <Both d={EAR} className="pi-fill" />
      <path d={HEAD} className="pi-fill" />
      {cut.side && <Both d={cut.side} className="pi-soft" />}
      <path d={cut.top} className="pi-fill" />
      {cut.lines && <path d={cut.lines} className="pi-line" />}
      {cut.rays && <Both d={cut.rays} className="pi-mark" />}
      {cut.dots?.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.7} className="pi-dot" />)}
    </>
  );
}

/** Visage de face, cheveux courts : le support des icônes de barbe. */
function Face({ children }: { children: ReactNode }) {
  return (
    <g transform="translate(24 23) scale(1.12) translate(-24 -24)">
      <Both d={EAR} className="pi-fill" />
      <path d={HEAD} className="pi-fill" />
      <path d={SHORT_TOP} className="pi-fill" />
      {children}
    </g>
  );
}

const MOUSTACHE = 'M24 29.6C22.6 28.2 20.4 28.2 18.8 29.8 18 30.6 17 31 15.8 30.8 17 32.6 19 33.4 21 33 22.4 32.7 23.4 32 24 30.8 24.6 32 25.6 32.7 27 33 29 33.4 31 32.6 32.2 30.8 31 31 30 30.6 29.2 29.8 27.6 28.2 25.4 28.2 24 29.6Z';

function Bottle({ children }: { children?: ReactNode }) {
  return (
    <>
      <path d="M24 14V9.5H31" className="pi-mark" />
      <rect x={21} y={13.5} width={6} height={7} className="pi-fill" />
      <rect x={15} y={19.5} width={18} height={23} rx={4} className="pi-fill" />
      {children}
    </>
  );
}

const OTHERS: Record<string, ReactNode> = {
  moustache: (
    <Face>
      <path d={MOUSTACHE} className="pi-shade" />
    </Face>
  ),
  'barbe-classique': (
    <Face>
      <path
        d="M14.5 25C14.9 31 16.3 36.6 19 39.8 20.4 41.6 22.2 42.6 24 42.6 25.8 42.6 27.6 41.6 29 39.8 31.7 36.6 33.1 31 33.5 25 32.1 27.6 30.9 29 29.5 29.6 27.9 28.8 26 28.4 24 28.4 22 28.4 20.1 28.8 18.5 29.6 17.1 29 15.9 27.6 14.5 25Z"
        className="pi-shade"
      />
      <ellipse cx={24} cy={33} rx={2.6} ry={1.1} className="pi-fill" />
    </Face>
  ),
  'barbe-express': (
    <Face>
      <path
        d="M14.7 27C15.5 32.2 17.1 36.4 19.6 38.8 21 40 22.4 40.6 24 40.6 25.6 40.6 27 40 28.4 38.8 30.9 36.4 32.5 32.2 33.3 27 32.3 30.2 30.7 33 28.4 34.8 27 35.8 25.6 36.2 24 36.2 22.4 36.2 21 35.8 19.6 34.8 17.3 33 15.7 30.2 14.7 27Z"
        className="pi-shade"
      />
    </Face>
  ),
  'rasage-tondeuse': (
    <>
      <rect x={16.5} y={7} width={15} height={7} rx={1.5} className="pi-fill" />
      <path d="M19.5 7V11M22.5 7V11M25.5 7V11M28.5 7V11" className="pi-line" />
      <path d="M18.5 14H29.5L30.5 37C30.6 39.8 28.6 42 26 42H22C19.4 42 17.4 39.8 17.5 37Z" className="pi-fill" />
      <rect x={22} y={19} width={4} height={8} rx={2} className="pi-cut" />
    </>
  ),
  'rasage-shaver': (
    <>
      <rect x={14} y={6.5} width={20} height={11} rx={5} className="pi-fill" />
      <circle cx={20} cy={12} r={2.6} className="pi-cut" />
      <circle cx={28} cy={12} r={2.6} className="pi-cut" />
      <path d="M17.5 17.5H30.5V36C30.5 39.3 27.6 42 24 42 20.4 42 17.5 39.3 17.5 36Z" className="pi-fill" />
      <circle cx={24} cy={26} r={2.2} className="pi-cut" />
    </>
  ),
  'rasage-trad': (
    <>
      <path d="M32 13 39 35" className="pi-handle" />
      <path d="M7.5 19.5 29.8 9.6C31.2 9 32.6 9.6 33.2 11L35.2 16 12 27.2C10.4 28 8.6 27 8.2 25.2Z" className="pi-fill" />
      <path d="M11 22.6 31.6 13.2" className="pi-line" />
    </>
  ),
  shampoing: (
    <>
      <Bottle>
        <path d="M19.5 27H28.5M19.5 31H25.5" className="pi-line" />
      </Bottle>
      <circle cx={38.5} cy={14} r={2.8} className="pi-mark" />
      <circle cx={41} cy={22} r={1.6} className="pi-mark" />
      <circle cx={9} cy={30} r={2.2} className="pi-mark" />
    </>
  ),
  'shampoing-barbe': (
    <Bottle>
      <path d={MOUSTACHE} className="pi-cut" transform="translate(4.8 8.4) scale(0.8)" />
    </Bottle>
  ),
  'soin-hydratant': (
    <>
      <path d="M24 5.5C29 12.1 34.5 18.2 34.5 25.6 34.5 31.6 29.8 36.5 24 36.5 18.2 36.5 13.5 31.6 13.5 25.6 13.5 18.2 19 12.1 24 5.5Z" className="pi-fill" />
      <path d="M18.6 26.4C18.8 29 20.6 31 23 31.4" className="pi-line" />
      <path d="M12 42H36" className="pi-mark" />
    </>
  ),
};

/** Ciseaux : toute prestation sans dessin propre. */
const SCISSORS = (
  <>
    <circle cx={15} cy={35} r={4.2} className="pi-mark" />
    <circle cx={33} cy={35} r={4.2} className="pi-mark" />
    <path d="M17.6 31.6 33 8M30.4 31.6 15 8" className="pi-mark" />
  </>
);

/** Les têtes sont dessinées avec de la marge : elles sont agrandies pour remplir la pastille. */
const ZOOM = 'translate(24 25) scale(1.12) translate(-24 -24)';

export function PrestationIcon({ id, size = 44 }: { id: string; size?: number }) {
  const cut = CUTS[id];
  return (
    <span className="picon" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        {cut ? <g transform={ZOOM}><Head cut={cut} /></g> : OTHERS[id] ?? SCISSORS}
      </svg>
    </span>
  );
}

// ---------- Icônes d'interface ----------

const ui = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const PencilIcon = () => (
  <svg {...ui}>
    <path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 013 3L8 18.5 4 20zM14.5 6l3 3" />
  </svg>
);

export const ScanIcon = () => (
  <svg {...ui}>
    <path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.500A1.500 1.500 0 0118.500 20H16M8 20H5.500A1.500 1.500 0 014 18.500V16M7 12h10" />
  </svg>
);

export const StarIcon = ({ on }: { on: boolean }) => (
  <svg {...ui} fill={on ? 'currentColor' : 'none'}>
    <path d="M12 3.6l2.6 5.3 5.800.800-4.200 4.100 1 5.800L12 16.900 6.800 19.600l1-5.800L3.600 9.700l5.800-.800L12 3.600z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...ui}>
    <path d="M6 9h10v4a5 5 0 01-10 0V9zM16 10h1.500a2.500 2.500 0 010 5H16M8 3v2.500M12 3v2.500M5 20h12" />
  </svg>
);
