import { CATALOG } from './catalog';
import type { Behavior, DayFigures, DayPlan, OpeningDay, PauseId, PausePlan, PlannedDay, Prestation, Proposal, QueueFile, SetupStepId, Ticket } from './types';

export const STORE = {
  name: 'Salon Le Clos',
  address: '12 rue des Martyrs, Paris 9e',
};

/** La file tenue par l'agent de la vue « Coiffeur ». */
export const AGENT_FILE_ID = 'agent';

/** Le 2e barbier du salon, que personne ne joue. */
export const MATHIS_FILE_ID = 'mathis';

/** 6 des 9 prestations de la journée du coiffeur. */
export const MATHIS_PRESTATIONS: Prestation[] = CATALOG.filter((p) =>
  ['degrade', 'taper', 'crop', 'classique', 'buzz', 'barbe-express'].includes(p.id),
).map((p) => ({ ...p }));

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

/** Heures d'ouverture proposées au gérant : du mardi au samedi, de 9h00 à 19h00, sans fermeture le midi. */
export const defaultOpeningHours = (): OpeningDay[] =>
  DAYS.map((_, day) => ({ day, open: day >= 1 && day <= 5, ranges: [{ start: h(9), end: h(19) }] }));

/** Les étapes de la configuration du salon par le gérant, dans l'ordre. */
export const SETUP_STEPS: { id: SetupStepId; label: string }[] = [
  { id: 'horaires', label: 'Heures d’ouverture' },
  { id: 'postes', label: 'Postes' },
  { id: 'prestations', label: 'Prestations' },
  { id: 'equipe', label: 'Équipe' },
  { id: 'planning', label: 'Ton planning' },
  { id: 'qr', label: 'QR codes' },
];

/**
 * L'adresse d'Antoine, le coiffeur que la consigne du scénario « Gérant : j'installe mon salon » propose d'inviter.
 * Elle ne sert qu'à ce texte et au geste du rejeu : le scénario suit le 1er coiffeur invité, quels que soient son
 * prénom et son e-mail (`featuredMember` de `engine.ts`).
 */
export const ANTOINE_EMAIL = 'antoine@salonleclos.fr';

/**
 * Le planning que le coiffeur invité a envoyé au saut « 1 semaine plus tard » : le mercredi de 9h00 à 19h00 et le
 * samedi de 9h00 à 18h00, avec les pauses par défaut, sur le poste `point` (le 1er du salon). Le samedi, il chevauche
 * celui du gérant, pré-rempli au 1er poste sur les heures d'ouverture : c'est le cas que montre l'écran Plannings.
 */
export const featuredPlanning = (point: string | undefined): PlannedDay[] =>
  DAYS.map((_, day) => ({
    day,
    works: day === 2 || day === 5,
    start: h(9),
    end: day === 5 ? h(18) : h(19),
    pauses: defaultPauses(),
    point,
  }));

/**
 * Les 2 prestations que le coiffeur invité propose au saut « 1 semaine plus tard » (E6-1), absentes du catalogue
 * WaitAway. L'id de chacune devient celui de la prestation si le gérant la valide.
 */
export const FEATURED_PROPOSALS: Pick<Proposal, 'id' | 'label' | 'group' | 'minutes'>[] = [
  { id: 'proposition-1', label: 'Contour de barbe au fil', group: 'barbe', minutes: 20 },
  { id: 'proposition-2', label: 'Coloration de barbe', group: 'barbe', minutes: 30 },
];

/** Mois des dates de `WEEK_HISTORY`. */
export const HISTORY_MONTH = 'novembre';

/**
 * L'historique du tableau de bord du gérant : 1 ligne par jour, du lundi 16 au dimanche 22 novembre 2026. Le scénario
 * gérant se passe un lundi (`weekday` 0) : après le saut « 1 semaine plus tard », on est le lundi 23, et ce sont les
 * 7 jours d'avant. Chiffres du gérant (`gerant`) et du coiffeur invité (`member`, `featuredMember`), pour chaque jour,
 * même ceux où le salon est fermé par défaut : `managerWeekLater` ne garde que les jours ouverts, et pour le gérant
 * ceux de son planning. Avec les réglages du scénario (fermé le lundi et le dimanche, gérant en repos le mercredi) :
 * 142 clients servis, 18 min d'attente moyenne, et 6 tickets clôturés sur incident le mardi, chez le coiffeur invité.
 *
 * Écart : ces attentes ne viennent pas de `timeline()`. C'est un historique inventé, parce que la simulation ne fait
 * pas tourner 7 jours.
 */
export const WEEK_HISTORY: { day: number; date: number; gerant: DayFigures; member: DayFigures }[] = [
  { day: 0, date: 16, gerant: { served: 8, waitMinutes: 96, incidents: 0 }, member: { served: 10, waitMinutes: 130, incidents: 0 } },
  { day: 1, date: 17, gerant: { served: 11, waitMinutes: 132, incidents: 0 }, member: { served: 14, waitMinutes: 210, incidents: 6 } },
  { day: 2, date: 18, gerant: { served: 12, waitMinutes: 180, incidents: 0 }, member: { served: 16, waitMinutes: 272, incidents: 0 } },
  { day: 3, date: 19, gerant: { served: 13, waitMinutes: 182, incidents: 0 }, member: { served: 15, waitMinutes: 240, incidents: 0 } },
  { day: 4, date: 20, gerant: { served: 15, waitMinutes: 270, incidents: 0 }, member: { served: 18, waitMinutes: 360, incidents: 0 } },
  { day: 5, date: 21, gerant: { served: 18, waitMinutes: 396, incidents: 0 }, member: { served: 22, waitMinutes: 550, incidents: 0 } },
  { day: 6, date: 22, gerant: { served: 7, waitMinutes: 84, incidents: 0 }, member: { served: 9, waitMinutes: 117, incidents: 0 } },
];

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
