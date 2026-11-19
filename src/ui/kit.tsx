import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSim } from '../sim/store';

/** Scan simulé : viseur plein écran, puis `onDone` après un court délai. */
export function Scanner({ label, onDone, onCancel }: { label: string; onDone: () => void; onCancel: () => void }) {
  // Ref : un re-rendu (lecture auto) ne doit pas relancer le délai.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => done.current(), 1300);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="scanner" role="dialog" aria-label={label}>
      <p className="scanner-label">{label}</p>
      <div className="scanner-frame">
        <QrFake seed={label} />
        <span className="scanner-line" />
      </div>
      <p className="scanner-hint">Scan simulé pour la démo</p>
      <button className="btn btn-ghost-light" onClick={onCancel}>
        Annuler
      </button>
    </div>
  );
}

/** Notifications façon push, en haut de l'écran du téléphone. */
export function Toasts({ to }: { to: 'client' | 'agent' }) {
  const { s, dispatch } = useSim();
  const mine = s.notifs.filter((n) => n.to === to).slice(-2);
  const firstId = mine[0]?.id;
  useEffect(() => {
    if (firstId === undefined) return;
    const id = setTimeout(() => dispatch({ type: 'dropNotif', id: firstId }), 4500);
    return () => clearTimeout(id);
  }, [firstId, dispatch]);
  return (
    <div className="toasts" aria-live="polite">
      {mine.map((n) => (
        <button key={n.id} className="toast" onClick={() => dispatch({ type: 'dropNotif', id: n.id })}>
          <span className="toast-icon" aria-hidden>
            W
          </span>
          <span>
            <strong>{n.title}</strong>
            <span className="toast-body">{n.body}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Panneau qui monte du bas de l'écran. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <h2 className="sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Barre de progression aux rayures d'enseigne de barbier : réservée à « en service ». */
export function BarberPole({ ratio, over }: { ratio: number; over?: boolean }) {
  return (
    <div className={`pole${over ? ' pole-over' : ''}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(4, ratio * 100))}%` }} />
    </div>
  );
}

/** Faux QR code, déterministe. */
export function QrFake({ seed, size = 168 }: { seed: string; size?: number }) {
  const n = 25;
  let hsh = 2166136261;
  for (const c of seed) hsh = Math.imul(hsh ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    hsh ^= hsh << 13;
    hsh ^= hsh >>> 17;
    hsh ^= hsh << 5;
    return ((hsh >>> 0) % 1000) / 1000;
  };
  const finder = (x: number, y: number) =>
    [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (!finder(x, y) && rand() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
  const eye = (x: number, y: number) => (
    <g key={`e${x}${y}`}>
      <rect x={x} y={y} width={7} height={7} />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} />
    </g>
  );
  return (
    <svg className="qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} aria-hidden shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <g fill="currentColor">
        {cells}
        {eye(0, 0)}
        {eye(n - 7, 0)}
        {eye(0, n - 7)}
      </g>
    </svg>
  );
}

const ROW = 44;

/**
 * Roulette : une colonne qui défile et s'arrête sur une valeur.
 * Au doigt ou à la molette, on fait défiler. Au clavier : flèches haut et bas.
 */
export function Wheel<T extends number>({
  values,
  value,
  onChange,
  format,
  label,
  rows = 3,
}: {
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  label: string;
  rows?: 3 | 5;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const idx = Math.max(0, values.indexOf(value));
  // Compte les défilements terminés sur une autre valeur. L'écran peut garder sa valeur (une heure bornée, par
  // exemple) : sans ce compteur, `idx` ne change pas et la colonne resterait sur la valeur refusée.
  const [settled, setSettled] = useState(0);

  // Aligne la colonne sur la valeur, sauf si elle y est déjà (sinon le défilement en cours saute).
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== idx) el.scrollTop = idx * ROW;
  }, [idx, settled]);
  useEffect(() => () => clearTimeout(settle.current), []);

  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (values[i] !== value) {
        onChange(values[i]);
        setSettled((n) => n + 1);
      }
    }, 90);
  };
  const move = (d: number) => {
    const i = Math.min(values.length - 1, Math.max(0, idx + d));
    if (i !== idx) onChange(values[i]);
  };

  return (
    <div className="wheel" style={{ height: rows * ROW }}>
      <div
        ref={ref}
        className="wheel-col"
        style={{ padding: `${((rows - 1) / 2) * ROW}px 0` }}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
          if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
        }}
      >
        {values.map((v) => (
          <div key={v} className={`wheel-item${v === value ? ' on' : ''}`} onClick={() => onChange(v)}>
            {format(v)}
          </div>
        ))}
      </div>
      <span className="wheel-band" aria-hidden />
    </div>
  );
}

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const HOURS = range(6, 22);
const MINUTES = range(0, 55, 5);
const pad = (n: number) => String(n).padStart(2, '0');

/** Heure du jour, en minutes depuis minuit : 1 roulette pour l'heure, 1 pour les minutes. */
export function TimeWheel({ value, onChange, label, rows }: { value: number; onChange: (v: number) => void; label: string; rows?: 3 | 5 }) {
  const hh = Math.min(22, Math.max(6, Math.floor(value / 60)));
  const mm = Math.round((value % 60) / 5) * 5 % 60;
  return (
    <div className="timewheel" role="group" aria-label={label}>
      <Wheel values={HOURS} value={hh} onChange={(v) => onChange(v * 60 + mm)} format={pad} label={`${label}, heure`} rows={rows} />
      <span className="timewheel-sep" aria-hidden>
        :
      </span>
      <Wheel values={MINUTES} value={mm} onChange={(v) => onChange(hh * 60 + v)} format={pad} label={`${label}, minutes`} rows={rows} />
    </div>
  );
}

const DURATIONS = range(5, 120, 5);

/** Durée en minutes, de 5 à 120. */
export function DurationWheel({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="timewheel" role="group" aria-label={label}>
      <Wheel values={DURATIONS} value={value} onChange={onChange} format={String} label={label} rows={5} />
      <span className="timewheel-unit">min</span>
    </div>
  );
}

/** Ligne « − valeur + ». `verbs` remplace « Réduire » et « Allonger », écrits pour une durée. */
export function Stepper({
  value,
  onMinus,
  onPlus,
  label,
  verbs = ['Réduire', 'Allonger'],
}: {
  value: string;
  onMinus?: () => void;
  onPlus?: () => void;
  label: string;
  verbs?: [string, string];
}) {
  return (
    <span className="stepper-ctl">
      <button type="button" aria-label={`${verbs[0]} ${label}`} disabled={!onMinus} onClick={onMinus}>
        −
      </button>
      <strong>{value}</strong>
      <button type="button" aria-label={`${verbs[1]} ${label}`} disabled={!onPlus} onClick={onPlus}>
        +
      </button>
    </span>
  );
}

/** Hook utilitaire : un scan en cours, ou rien. */
export function useScan() {
  const [scan, setScan] = useState<{ label: string; then: () => void } | null>(null);
  const node = scan ? (
    <Scanner
      label={scan.label}
      onCancel={() => setScan(null)}
      onDone={() => {
        scan.then();
        setScan(null);
      }}
    />
  ) : null;
  return { start: (label: string, then: () => void) => setScan({ label, then }), node };
}

/**
 * Cercle dégressif : l'arc part de midi, dans le sens horaire, et sa longueur vaut `ratio` (0 à 1) du tour.
 * La couleur vient de la variable CSS `--ring` du parent, le contenu central de `children`.
 */
export function CountdownRing({ ratio, label, children }: { ratio: number; label: string; children: ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const k = Math.max(0, Math.min(1, ratio));
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle className="ring-track" cx="60" cy="60" r={r} />
        <circle className="ring-arc" cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - k)} transform="rotate(-90 60 60)" />
        <g className="ring-dot-turn" style={{ transform: `rotate(${k * 360}deg)` }}>
          <circle className="ring-dot" cx="60" cy={60 - r} r="7" />
        </g>
      </svg>
      <div className="ring-center" aria-hidden>
        {children}
      </div>
    </div>
  );
}
