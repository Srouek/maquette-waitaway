import type { Behavior, DayPlan, PauseId, PausePlan, Prestation, QueueFile, Ticket } from './types';

export const STORE = {
  name: 'Salon Le Clos',
  address: '12 rue des Martyrs, Paris 9e',
};

/** La file tenue par l'agent de la vue « Coiffeur ». */
export const AGENT_FILE_ID = 'agent';

export const JULIE_PRESTATIONS: Prestation[] = [
  { id: 'coupe-f', group: 'autre', label: 'Coupe femme', minutes: 35, description: 'Coupe et coiffage.' },
  { id: 'brushing', group: 'autre', label: 'Brushing', minutes: 25, description: 'Séchage et mise en forme.' },
  { id: 'enfant', group: 'autre', label: 'Coupe enfant', minutes: 15, description: 'Jusqu’à 12 ans.' },
];

export const h = (hh: number, mm = 0) => hh * 60 + mm;

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const PAUSE_LABEL: Record<PauseId, string> = {
  matin: 'Pause du matin',
  midi: 'Pause de midi',
  aprem: 'Pause de l’après-midi',
};

/** La pause de midi est la seule dont la durée se règle : de 30 min à 1 h 30. */
export const MIDI_MIN = 30;
export const MIDI_MAX = 90;

export const defaultPauses = (): PausePlan[] => [
  { id: 'matin', on: true, at: h(10, 30), minutes: 15 },
  { id: 'midi', on: true, at: h(12, 30), minutes: 60 },
  { id: 'aprem', on: true, at: h(16), minutes: 15 },
];

/** Semaine type proposée à la création du compte : du mardi au samedi. */
export const defaultWeek = (): DayPlan[] =>
  DAYS.map((_, day) => ({ day, works: day >= 1 && day <= 5, start: h(9), end: h(19), pauses: defaultPauses() }));

let seq = 0;
export function mkTicket(
  file: Pick<QueueFile, 'prestations'>,
  name: string,
  prestationIds: string[],
  joinedAt: number,
  behavior: Behavior,
  extra: Partial<Ticket> = {},
): Ticket {
  seq += 1;
  const duration = prestationIds.reduce(
    (sum, id) => sum + (file.prestations.find((p) => p.id === id)?.minutes ?? 0),
    0,
  );
  return { id: `t${seq}-${Math.random().toString(36).slice(2, 7)}`, seq, name, prestationIds, duration, joinedAt, behavior, ...extra };
}
