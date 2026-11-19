import { CATALOG, GROUPS } from './catalog';
import { AGENT_FILE_ID, DAYS, HISTORY_MONTH, PAUSE_LABEL, SETUP_STEPS, STORE, WEEK_HISTORY, FEATURED_PROPOSALS, defaultPauses, featuredPlanning, h, mkTicket } from './data';
import type {
  DistributionPoint,
  AgentEvent,
  ClientNav,
  DayPlan,
  Manager,
  ManagerView,
  OpeningDay,
  OpeningRange,
  Pause,
  PauseId,
  PausePlan,
  PlannedDay,
  Prestation,
  Proposal,
  QueueFile,
  SetupStatus,
  SetupStepId,
  SimState,
  TeamMember,
  Ticket,
} from './types';

// ---------- Sélecteurs ----------

export const fileById = (s: SimState, id: string) => s.files.find((f) => f.id === id)!;

/** Tickets en attente, par heure d'inscription. */
export const waiting = (f: QueueFile) =>
  f.tickets
    .filter((t) => t.startedAt === undefined && t.abortAt === undefined && t.overtime !== 'pending')
    .sort((a, b) => a.joinedAt - b.joinedAt || a.seq - b.seq);

/**
 * Écart avec QA-20 : la file de l'agent ne refuse plus seule une inscription qui finirait après la fermeture.
 * Le client a scanné le QR code de l'entrée, il est donc au salon : il en parle au coiffeur, qui accepte ou refuse.
 * Au-delà de 30 min après la fermeture, la demande est refusée d'office, sans déranger le coiffeur.
 * Les autres files gardent le refus automatique : personne ne joue leur coiffeur.
 */
export const OVERTIME_MAX = 30;
export const decidesOvertime = (f: QueueFile) => f.id === AGENT_FILE_ID || f.decidesOvertime === true;

/** Demandes d'inscription après la fermeture, en attente de la réponse de l'agent. */
export const pendingOvertime = (f: QueueFile) => f.tickets.filter((t) => t.overtime === 'pending' && t.abortAt === undefined);

export const inService = (f: QueueFile) =>
  f.tickets.find((t) => t.startedAt !== undefined && t.doneAt === undefined && t.abortAt === undefined);

/** Fin estimée d'une prestation démarrée : sa durée, plus le dépassement déjà annoncé. */
export const serviceEnd = (t: Ticket) => t.startedAt! + t.duration + (t.overrun ?? 0);

/** S20 : seuls les clients pas encore confirmés dont le tour est dans moins de 30 min sont prévenus d'un retard. */
export const OVERRUN_NOTIFY_WINDOW = 30;
/** Tranche de dépassement automatique. */
export const OVERRUN_STEP = 5;

/** Les clients à prévenir d'un retard sur la prestation en cours. Les confirmés sont au salon et voient le coiffeur travailler. */
export const overrunTargets = (f: QueueFile, now: number) =>
  waiting(f).filter((t) => !t.anonymous && t.confirmedAt === undefined && waitFor(f, t.id, now) < OVERRUN_NOTIFY_WINDOW);

/** S20 : à partir de 2 dépassements dans la journée, le système suggère d'allonger la prestation de 5 min. */
export const SUGGEST_AFTER = 2;
export const durationSuggestions = (f: QueueFile) =>
  Object.entries(f.overruns ?? {})
    .filter(([, n]) => n >= SUGGEST_AFTER)
    .flatMap(([id, n]) => {
      const p = f.prestations.find((x) => x.id === id);
      return p ? [{ id, label: p.label, count: n, from: p.minutes, to: p.minutes + OVERRUN_STEP }] : [];
    });

/** Minutes avant la fin estimée de la prestation en cours, dépassement compris (négatif = au-delà). Pour l'écran du coiffeur. */
export const remainingRaw = (f: QueueFile, now: number) => {
  const t = inService(f);
  return t ? serviceEnd(t) - now : 0;
};
/** Minutes avant la fin estimée de la prestation en cours, dépassement annoncé compris. */
export const remaining = (f: QueueFile, now: number) => {
  const t = inService(f);
  return t ? Math.max(0, serviceEnd(t) - now) : 0;
};

export const runningPause = (f: QueueFile) => f.pauses.find((p) => p.startedAt !== undefined && p.endedAt === undefined);

/** Fin prévue d'une pause démarrée, retard annoncé compris. */
export const pauseEnd = (p: Pause) => p.startedAt! + p.minutes + (p.delay ?? 0);

/**
 * Pause dont l'heure de fin est passée sans que l'agent ait scanné le QR code de son poste pour reprendre.
 * Tant qu'il ne l'a pas fait, aucun client ne peut démarrer : c'est ce scan qui dit que le coiffeur est revenu.
 * Le temps continue de tourner : l'agent est en retard, et il le reste jusqu'à ce qu'il reprenne, annonce
 * un retard ou ferme sa file. Ce n'est pas encore dans le backlog : voir QA-31 à QA-33.
 */
export const pauseOverdue = (f: QueueFile, now: number) => {
  const run = runningPause(f);
  return run && now >= pauseEnd(run) ? run : undefined;
};

/**
 * Fin de journée passée, plus personne en service ni en attente : l'agent n'a plus qu'à fermer sa file.
 * Écart avec QA-28, qui ne prévoit pas de notification : la maquette invite l'agent à fermer, et le temps s'arrête.
 */
export const closeDue = (f: QueueFile, now: number) =>
  f.open && now >= f.endOfDay && !inService(f) && waiting(f).length === 0 && pendingOvertime(f).length === 0;

/** Titre de la notification de fin de pause, retirée quand l'agent reprend. */
const PAUSE_OVER = 'Ta pause est finie';

const pendingPauses = (f: QueueFile) =>
  f.pauses.filter((p) => p.startedAt === undefined && !p.skipped).sort((a, b) => a.plannedAt - b.plannedAt);

export type Slot =
  | { kind: 'ticket'; ticket: Ticket; start: number; end: number }
  | { kind: 'pause'; pause: Pause; start: number; end: number };

/**
 * Le programme de la file : la pause en cours, puis les tickets en attente et les pauses à venir,
 * avec leurs heures. Tous les temps d'attente en découlent.
 *
 * Placement d'une pause, repris de `adjustTimeForBreaks` (queue.service.ts de QueueAPI) :
 * - l'heure souhaitée est déjà passée quand le poste se libère : la pause passe avant le ticket suivant ;
 * - une prestation chevauche l'heure souhaitée : en position 1, le client passe d'abord et la pause
 *   glisse après lui (S24). Plus loin dans la file, la pause passe avant lui, donc plus tôt que souhaité.
 *
 * Écart avec QueueAPI : le backend recalcule à chaque requête. Un client placé après la pause la verrait
 * sauter derrière lui en arrivant en position 1. Ici, `beforeTicketId` fige le choix (voir `freeze`).
 *
 * `extra` ajoute un ticket fictif en fin de file, pour savoir quand passerait un nouvel inscrit.
 */
function plan(f: QueueFile, now: number, extra?: number) {
  const slots: Slot[] = [];
  const early: [Pause, Ticket][] = [];
  const cur = inService(f);
  const run = runningPause(f);
  let cursor = now;
  if (cur) cursor = Math.max(cursor, serviceEnd(cur));
  if (run) {
    const end = Math.max(now, pauseEnd(run));
    slots.push({ kind: 'pause', pause: run, start: run.startedAt!, end });
    cursor = Math.max(cursor, end);
  }

  const pend = pendingPauses(f);
  const list: { id: string; duration: number; ticket?: Ticket }[] = waiting(f).map((t) => ({ id: t.id, duration: t.duration, ticket: t }));
  if (extra !== undefined) list.push({ id: '', duration: extra });
  let extraStart = cursor;

  list.forEach((t, i) => {
    while (pend.length > 0) {
      const p = pend[0];
      const overlaps = cursor < p.plannedAt && cursor + t.duration > p.plannedAt;
      const before = cursor >= p.plannedAt || (overlaps && (i > 0 || p.beforeTicketId === t.id));
      if (!before) break;
      if (overlaps && t.ticket) early.push([p, t.ticket]);
      slots.push({ kind: 'pause', pause: p, start: cursor, end: cursor + p.minutes });
      cursor += p.minutes;
      pend.shift();
    }
    if (t.ticket) slots.push({ kind: 'ticket', ticket: t.ticket, start: cursor, end: cursor + t.duration });
    else extraStart = cursor;
    cursor += t.duration;
  });

  for (const p of pend) {
    const start = Math.max(cursor, p.plannedAt);
    slots.push({ kind: 'pause', pause: p, start, end: start + p.minutes });
    cursor = start + p.minutes;
  }
  return { slots, early, extraStart };
}

export const timeline = (f: QueueFile, now: number) => plan(f, now).slots;

/** Heure à laquelle passerait un client qui s'inscrit maintenant pour `duration` minutes. */
export const projectedStart = (f: QueueFile, now: number, duration: number) => plan(f, now, duration).extraStart;

/** Temps d'attente estimé d'un ticket en attente : prestation en cours, prestations devant lui, pauses. */
export const waitFor = (f: QueueFile, ticketId: string, now: number) => {
  const slot = timeline(f, now).find((x) => x.kind === 'ticket' && x.ticket.id === ticketId);
  return slot ? slot.start - now : 0;
};

/**
 * Phases de l'attente affichées sur le ticket du client, d'après les minutes d'attente. Hors backlog : décision de
 * Gabi du 17/11/2026 pour le cercle minuteur. Au-delà de 35 min, le client a le temps ; de 35 à 11 min, il se met en
 * route ; de 10 à 6 min (la fenêtre de confirmation), son tour arrive ; à 5 min et moins, il est le prochain.
 */
export const WAIT_PHASE_EARLY = 35;
export const WAIT_PHASE_NEXT = 5;
export type WaitPhase = 'temps' | 'route' | 'arrive' | 'prochain';
export const waitPhase = (wait: number): WaitPhase =>
  wait > WAIT_PHASE_EARLY ? 'temps' : wait > CONFIRM_WINDOW ? 'route' : wait > WAIT_PHASE_NEXT ? 'arrive' : 'prochain';

/**
 * Part de l'attente qui reste, entre 0 et 1 : 1 à l'inscription (`joinWait`). Si le coiffeur prend du retard,
 * l'attente dépasse `joinWait` et le cercle reste plein.
 */
export const waitRatio = (t: Ticket, wait: number) => {
  if (wait <= 0) return 0;
  if (!t.joinWait) return 1;
  return Math.min(1, wait / t.joinWait);
};

/** Minutes de pause de l'agent comprises dans l'attente d'un ticket. */
export const pauseMinutesBefore = (f: QueueFile, ticketId: string, now: number) => {
  let sum = 0;
  for (const x of timeline(f, now)) {
    if (x.kind === 'ticket' && x.ticket.id === ticketId) break;
    if (x.kind === 'pause') sum += x.end - Math.max(now, x.start);
  }
  return sum;
};

/** Temps d'attente total : ce qu'attendrait un client qui s'inscrit maintenant. */
export const totalWait = (f: QueueFile, now: number) => projectedStart(f, now, 0) - now;

/** La pause que l'agent devrait prendre maintenant : son créneau est arrivé, il ne l'a pas démarrée. */
export function pauseDue(f: QueueFile, now: number): Pause | undefined {
  if (runningPause(f)) return undefined;
  const first = timeline(f, now)[0];
  return first?.kind === 'pause' && first.start <= now ? first.pause : undefined;
}

export const position = (f: QueueFile, ticketId: string) => waiting(f).findIndex((t) => t.id === ticketId) + 1;

export const durationOf = (f: QueueFile, ids: string[]) =>
  ids.reduce((s, id) => s + (f.prestations.find((p) => p.id === id)?.minutes ?? 0), 0);

export const prestationsOf = (f: QueueFile, ids: string[]) =>
  ids.flatMap((id) => f.prestations.find((p) => p.id === id) ?? []);

/** Ce que le ticket annonce : ses prestations, ou « Durée libre » pour un walk-in. */
export const ticketLabel = (f: QueueFile, t: Ticket) =>
  t.prestationIds.length > 0 ? prestationsOf(f, t.prestationIds).map((p) => p.label).join(' + ') : 'Durée libre';

export function myTicket(s: SimState): { file: QueueFile; ticket: Ticket } | undefined {
  const ref = s.me.ticketRef;
  if (!ref) return undefined;
  const file = fileById(s, ref.fileId);
  const ticket = file.tickets.find((t) => t.id === ref.ticketId);
  return ticket ? { file, ticket } : undefined;
}

/** Le plan du jour simulé dans la semaine type de l'agent. */
export const todayPlan = (s: SimState): DayPlan => s.agent.week[s.weekday];

// ---------- Gérant ----------

/**
 * Étape de configuration à faire maintenant : la 1re qui n'est pas faite, ou la 1re de toutes si la configuration
 * n'a pas commencé. Absente : les 6 étapes sont faites.
 */
export const currentSetupStep = (m: Manager): SetupStepId | undefined =>
  SETUP_STEPS.find((x) => !m.setupDone?.includes(x.id))?.id;

/** Une étape enregistrée est faite, l'étape en cours est la 1re qui ne l'est pas, les autres sont à faire. */
export function setupStatus(m: Manager, id: SetupStepId): SetupStatus {
  if (m.setupDone === undefined) return 'todo';
  if (m.setupDone.includes(id)) return 'done';
  return currentSetupStep(m) === id ? 'doing' : 'todo';
}

/** La configuration est finie : les 6 étapes sont faites. Le menu (tableau de bord, équipe, plannings, salon) remplace alors les étapes. */
export const setupFinished = (m: Manager) => m.setupDone !== undefined && currentSetupStep(m) === undefined;

/**
 * Le coiffeur invité du scénario gérant : le 1er membre de l'équipe, dans l'ordre d'invitation, quels que soient son
 * prénom et son e-mail. C'est lui qui accepte son invitation et envoie son planning au saut « 1 semaine plus tard ».
 * Absent sans invitation, ou si elles ont toutes été annulées avant le saut.
 */
export const featuredMember = (m: Manager): TeamMember | undefined => m.team[0];

/** Les prestations proposées par l'équipe que le gérant n'a encore ni validées ni refusées, dans l'ordre d'arrivée. */
export const pendingProposals = (m: Manager): Proposal[] => (m.proposals ?? []).filter((p) => p.state === 'en-attente');

/**
 * La prestation qu'une proposition de l'équipe devient une fois validée : une prestation créée, avec l'id de la
 * proposition, sa durée et sans description. Partagée par le reducer (`managerAcceptProposal`) et l'écran Prestations.
 */
export const proposalToPrestation = (p: Proposal): Prestation => ({ id: p.id, label: p.label, group: p.group, minutes: p.minutes, description: '' });

/** Chiffres d'1 coiffeur ou d'1 jour du tableau de bord. `wait` : attente moyenne en minutes, absente sans client servi. */
export type DashboardFigures = { served: number; wait?: number };

export type Dashboard = DashboardFigures & {
  /** « Du lundi 16 au dimanche 22 novembre ». */
  period: string;
  /** Les 7 jours, dans l'ordre. Un jour fermé n'a pas de chiffres. */
  days: (DashboardFigures & { day: number; date: number; closed: boolean })[];
  /** Les coiffeurs qui ont des chiffres dans l'historique : le gérant d'abord, puis les membres dans l'ordre de l'équipe. */
  agents: (DashboardFigures & { who: string; name: string })[];
  /** « 6 tickets clôturés sur incident mardi ne sont pas comptés. » Absent sans incident. */
  incidents?: string;
};

type Entry = NonNullable<Manager['history']>[number]['entries'][number];

/** Clients servis et attente moyenne de ces lignes, arrondie à la minute. Les tickets clôturés sur incident n'y sont pas. */
function figures(entries: Entry[]): DashboardFigures {
  const served = entries.reduce((n, e) => n + e.served, 0);
  const wait = entries.reduce((n, e) => n + e.waitMinutes, 0);
  return served === 0 ? { served } : { served, wait: Math.round(wait / served) };
}

/**
 * Le tableau de bord du gérant (E3-5) : attente moyenne du salon et de chaque coiffeur sur les 7 derniers jours, sans
 * les tickets clôturés sur incident. Absent tant que l'historique n'existe pas (avant le saut « 1 semaine plus tard »).
 * Un jour est fermé d'après les heures d'ouverture actuelles (`Manager.hours`) : ses lignes ne comptent pas, pour que
 * le graphique et les totaux disent la même chose si les heures ont changé après le saut.
 * Hors backlog : E3-5 ne parle que de l'attente. Le nombre de clients servis est ajouté (plan validé par Gabi).
 * Aucune note d'avis : pendant le pilote, personne ne voit les notes.
 */
export function dashboard(m: Manager): Dashboard | undefined {
  const history = m.history;
  if (!history || history.length === 0) return undefined;
  const open = history.filter((d) => m.hours[d.day].open);
  const all = open.flatMap((d) => d.entries);
  const nameOf = (who: string) => (who === MANAGER_WHO ? m.firstName : m.team.find((x) => x.id === who)?.firstName);
  // Un coiffeur compte dès qu'il a des chiffres dans l'historique, le gérant compris, même s'il a coupé « Je coiffe
  // aussi » depuis : les chiffres passés ne changent pas quand un planning change. Les totaux, les barres et les
  // incidents portent sur les coiffeurs listés.
  const whos = [MANAGER_WHO, ...m.team.map((x) => x.id)].filter((id) => all.some((e) => e.who === id));
  const shown = (es: Entry[]) => es.filter((e) => whos.includes(e.who));
  const entries = shown(all);
  const incidentDays = open.filter((d) => shown(d.entries).some((e) => e.incidents > 0));
  const incidents = incidentDays.reduce((n, d) => n + shown(d.entries).reduce((k, e) => k + e.incidents, 0), 0);
  const first = history[0];
  const last = history[history.length - 1];
  return {
    ...figures(entries),
    period: `Du ${DAYS[first.day].toLowerCase()} ${first.date} au ${DAYS[last.day].toLowerCase()} ${last.date} ${HISTORY_MONTH}`,
    days: history.map((d) => {
      const closed = !m.hours[d.day].open;
      return { day: d.day, date: d.date, closed, ...(closed ? { served: 0 } : figures(shown(d.entries))) };
    }),
    agents: whos.map((who) => ({ who, name: nameOf(who) ?? '', ...figures(entries.filter((e) => e.who === who)) })),
    incidents:
      incidents === 0
        ? undefined
        : `${incidents} ${incidents > 1 ? 'tickets clôturés' : 'ticket clôturé'} sur incident ${incidentDays.map((d) => DAYS[d.day].toLowerCase()).join(' et ')} ${incidents > 1 ? 'ne sont pas comptés' : 'n’est pas compté'}.`,
  };
}

/** Le point de distribution suivant, nommé d'après son rang : « Poste 1 », « Poste 2 »… */
export const nextPoint = (points: DistributionPoint[]): DistributionPoint => ({
  id: `point-${points.length + 1}`,
  name: `Poste ${points.length + 1}`,
});

/** Les points de distribution créés d'après l'abonnement : 1 par file. */
export function pointsFor(files: number): DistributionPoint[] {
  const out: DistributionPoint[] = [];
  while (out.length < files) out.push(nextPoint(out));
  return out;
}

const filesText = (n: number) => `${n} ${n > 1 ? 'files' : 'file'}`;

/**
 * Ce qui empêche d'enregistrer les postes : plus de postes que de files, un nom vide, ou 2 postes du même nom.
 * 2 noms sont les mêmes sans tenir compte de la casse ni des espaces autour.
 */
export function pointsError(points: Pick<DistributionPoint, 'name'>[], files: number): string | undefined {
  if (points.length === 0) return 'Il faut au moins 1 poste.';
  if (points.length > files) return `Ton abonnement compte ${filesText(files)} : ${files} ${files > 1 ? 'postes' : 'poste'} au plus.`;
  if (points.some((p) => p.name.trim() === '')) return 'Donne un nom à chaque poste.';
  const seen = new Set<string>();
  for (const p of points) {
    const k = p.name.trim().toLowerCase();
    if (seen.has(k)) return `2 postes s’appellent «\u00a0${p.name.trim()}\u00a0». Donne-leur des noms différents.`;
    seen.add(k);
  }
  return undefined;
}

/** Texte du panneau quand le gérant veut 1 poste de plus que de files : « Ton abonnement compte 1 file. Pour un 2e poste… » */
export const pointsLimitText = (files: number) =>
  `Ton abonnement compte ${filesText(files)}. Pour un ${files + 1}e poste, ajoute une file sur le site.`;

/** Message affiché après l'achat simulé d'1 file. */
export const fileBoughtText = (files: number) =>
  `Simulation : tu viens d’acheter 1 file de plus. Ton abonnement compte maintenant ${filesText(files)}.`;

/**
 * L'étape `id` est enregistrée : elle passe à « fait », et la 1re étape pas encore faite passe en cours. Une étape
 * rouverte après coup ne touche pas aux autres. L'écran de l'étape suivante dans `SETUP_STEPS` s'ouvre aussitôt,
 * même quand le gérant corrige une étape déjà faite pendant la configuration. Après la dernière étape (QR codes), la page de configuration
 * revient : quand les 6 sont faites, aucune n'est en cours et la configuration est finie.
 * Cas particulier : si l'étape suivante est encore à faire (une étape plus tôt est repassée en cours après l'achat
 * d'1 file), c'est l'étape en cours qui s'ouvre, car l'écran d'une étape à faire refuse d'enregistrer.
 * Une fois la configuration finie, rien ne s'enchaîne : Équipe, ouverte depuis le menu, reste affichée, Ton planning
 * ouvert depuis Plannings y revient, Prestations ouvert depuis « À traiter » revient au tableau de bord, et les autres
 * étapes, rouvertes depuis Mon salon, y reviennent.
 */
function finishSetupStep(m: Manager, id: SetupStepId) {
  if (!m.setupDone) return;
  if (setupFinished(m)) {
    // Ton planning ouvert depuis Plannings y revient après l'enregistrement, comme avec Retour, et Prestations
    // ouvert depuis « À traiter » revient au tableau de bord.
    if (m.from !== undefined) m.view = m.from;
    else if (id === 'equipe') m.view = 'equipe';
    else delete m.view;
    delete m.from;
    return;
  }
  if (!m.setupDone.includes(id)) m.setupDone.push(id);
  const next = SETUP_STEPS[SETUP_STEPS.findIndex((x) => x.id === id) + 1]?.id;
  if (next === undefined) delete m.view;
  else m.view = setupStatus(m, next) === 'todo' ? currentSetupStep(m) : next;
}

/** Id de l'affiche du QR Boutique dans `Manager.printed`. Celle de chaque QR File/Station a l'id de son poste. */
export const BOUTIQUE_POSTER = 'boutique';

/** 1 affiche de QR code à imprimer : `title` en gros sur l'affiche, `text` pour dire au client quoi faire. */
export type QrPoster = { id: string; title: string; text: string };

/**
 * Les affiches du Store (E3-3) : le QR Boutique, à l'entrée, puis 1 QR File/Station par poste, dans l'ordre des postes.
 * L'affiche d'un poste garde son id quand le poste est renommé : son QR code ne change pas.
 * Écart au backlog : le QR code affiché est factice (`QrFake`), sans lien avec une vraie file.
 */
export const qrPosters = (m: Pick<Manager, 'store' | 'points'>): QrPoster[] => [
  { id: BOUTIQUE_POSTER, title: m.store.name, text: 'Scanne pour t’inscrire dans la file, puis à ton retour pour confirmer ta présence.' },
  ...m.points.map((p) => ({ id: p.id, title: p.name, text: 'Scanne en arrivant au fauteuil pour démarrer ta prestation' })),
];

/** Ce qui empêche d'enregistrer les heures d'1 jour : une plage qui finit avant de commencer, ou 2 plages qui se chevauchent. */
export function openingDayError(d: OpeningDay): string | undefined {
  if (!d.open) return undefined;
  if (d.ranges.some((r) => r.end <= r.start)) return 'La fermeture doit venir après l’ouverture.';
  const [a, b] = d.ranges;
  if (b && a.start < b.end && b.start < a.end) return 'Les 2 plages se chevauchent.';
  return undefined;
}

/** 1re erreur de la semaine, précédée du jour. Sans erreur, les heures peuvent être enregistrées. */
export function openingHoursError(hours: OpeningDay[]): string | undefined {
  for (const d of hours) {
    const e = openingDayError(d);
    if (e) return `${DAYS[d.day]} : ${e.charAt(0).toLowerCase()}${e.slice(1)}`;
  }
  return undefined;
}

/**
 * Les 2 plages proposées quand le gérant ajoute une 2e plage à 1 jour, rangées dans l'ordre de la journée.
 * Jamais de chevauchement avec la 1re plage `a` :
 * - `a` couvre 12h30 à 14h00 : la journée est coupée là ;
 * - sinon 1 h après `a`, pour 1 h, si elle commence au plus tard à 21h00 (fin bornée à 22h00) ;
 * - sinon 1 h avant `a`, pour 1 h, si elle finit au plus tôt à 7h00 (début borné à 6h00, comme la roulette) ;
 * - sinon aucune : `undefined`, le jour garde 1 seule plage.
 */
export function secondOpeningRange(a: OpeningRange): OpeningRange[] | undefined {
  const noon = h(12, 30);
  const back = h(14);
  if (a.start < noon && a.end > back)
    return [
      { start: a.start, end: noon },
      { start: back, end: a.end },
    ];
  if (a.end + 60 <= h(21)) return [a, { start: a.end + 60, end: Math.min(a.end + 120, h(22)) }];
  if (a.start - 60 >= h(7)) return [{ start: Math.max(a.start - 120, h(6)), end: a.start - 60 }, a];
  return undefined;
}

/** Reprend les plages d'1 jour sur les autres jours ouverts. Les jours fermés ne changent pas. */
export function copyOpeningRanges(hours: OpeningDay[], day: number): OpeningDay[] {
  const from = hours[day];
  return hours.map((d) => (d.day !== day && d.open ? { ...d, ranges: from.ranges.map((r) => ({ ...r })) } : d));
}

/** Bornes d'une durée de prestation, en minutes : celles de la roulette des durées (`DurationWheel` de `ui/kit.tsx`). */
export const PRESTATION_MINUTES = { min: 5, max: 120, step: 5 };

const validMinutes = (n: number) =>
  Number.isInteger(n) && n >= PRESTATION_MINUTES.min && n <= PRESTATION_MINUTES.max && n % PRESTATION_MINUTES.step === 0;

/** 2 noms de prestation sont les mêmes sans tenir compte de la casse ni des espaces autour. */
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Prestation que le gérant crée, avant qu'elle reçoive son id. */
export type PrestationDraft = Pick<Prestation, 'label' | 'group' | 'minutes' | 'description'>;

/**
 * Ce qui empêche de créer une prestation : un nom vide, un nom déjà pris dans le catalogue WaitAway ou par une
 * prestation déjà créée, ou une durée hors de la roulette.
 */
export function newPrestationError(d: Pick<PrestationDraft, 'label' | 'minutes'>, created: Prestation[]): string | undefined {
  const label = d.label.trim();
  if (label === '') return 'Donne un nom à la prestation.';
  if ([...CATALOG, ...created].some((p) => sameName(p.label, label)))
    return `« ${label} » est déjà dans la liste. Coche-la plutôt.`;
  if (!validMinutes(d.minutes)) return `La durée va de ${PRESTATION_MINUTES.min} à ${PRESTATION_MINUTES.max} min.`;
  return undefined;
}

/**
 * Ce qui empêche de valider une proposition de l'équipe, d'après la liste `created` (celle de l'écran, ou celle
 * enregistrée pour le reducer) : son nom est déjà pris, ou une autre erreur de `newPrestationError`.
 */
export function proposalError(p: Proposal, created: Prestation[]): string | undefined {
  if ([...CATALOG, ...created].some((x) => x.id !== p.id && sameName(x.label, p.label.trim()))) return 'Déjà dans ton catalogue : refuse-la.';
  return newPrestationError(p, created.filter((x) => x.id !== p.id));
}

/** La prestation créée, avec un id qui ne prend pas celui d'une autre. Nom et description sans les espaces autour. */
export function createPrestation(d: PrestationDraft, created: Prestation[]): Prestation {
  let n = created.length + 1;
  while (created.some((p) => p.id === `perso-${n}`)) n++;
  return { id: `perso-${n}`, label: d.label.trim(), group: d.group, minutes: d.minutes, description: d.description.trim() };
}

/** Ce qui empêche d'enregistrer le catalogue du Store : aucune prestation, ou 2 prestations du même nom. */
export function storePrestationsError(list: Pick<Prestation, 'label'>[]): string | undefined {
  if (list.length === 0) return 'Coche au moins 1 prestation.';
  for (let i = 0; i < list.length; i++)
    if (list.slice(0, i).some((p) => sameName(p.label, list[i].label)))
      return `2 prestations s’appellent « ${list[i].label.trim()} ». Garde-n’en qu’une.`;
  return undefined;
}

/**
 * Les prestations retenues, dans l'ordre du catalogue WaitAway puis des prestations créées, chacune avec sa durée
 * indicative. `minutes` : la durée par id de prestation retenue.
 */
export function storePrestations(created: Prestation[], minutes: Record<string, number>): Prestation[] {
  return [...CATALOG, ...created].filter((p) => p.id in minutes).map((p) => ({ ...p, minutes: minutes[p.id] }));
}

/**
 * Bornes du volume horaire hebdomadaire d'un salarié, en heures, et pas du Stepper. Un planning qui le dépasse donne
 * un avertissement sur l'écran Plannings (`volumeWarning`, E6-13).
 */
export const TEAM_HOURS = { min: 1, max: 48, step: 1, default: 35 };

/** Même règle que les autres formulaires de la maquette : quelque chose, une arobase, quelque chose, un point, quelque chose. */
const validEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email.trim());

/** 2 e-mails sont les mêmes sans tenir compte de la casse ni des espaces autour. */
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Invitation que le gérant prépare, avant qu'elle reçoive son id. */
export type InviteDraft = Pick<TeamMember, 'firstName' | 'email' | 'role' | 'status' | 'hours'>;

/** Une erreur d'invitation et le champ qu'elle concerne, pour ne l'afficher qu'une fois ce champ rempli. */
export type InviteError = { field: 'firstName' | 'email' | 'hours'; text: string };

/**
 * Ce qui empêche d'envoyer une invitation : un prénom vide, un e-mail invalide, un e-mail déjà dans l'équipe (celui
 * du gérant compris), ou le volume horaire d'un salarié hors des bornes.
 */
export function inviteError(d: InviteDraft, m: Pick<Manager, 'email' | 'team'>): InviteError | undefined {
  if (d.firstName.trim() === '') return { field: 'firstName', text: 'Donne le prénom de la personne à inviter.' };
  if (!validEmail(d.email)) return { field: 'email', text: 'Cette adresse e-mail n’est pas valide.' };
  if (sameEmail(d.email, m.email) || m.team.some((x) => sameEmail(x.email, d.email)))
    return { field: 'email', text: `${d.email.trim().toLowerCase()} est déjà dans ton équipe.` };
  if (d.status === 'salarie') {
    const n = d.hours;
    if (n === undefined || !Number.isInteger(n) || n < TEAM_HOURS.min || n > TEAM_HOURS.max)
      return { field: 'hours', text: `Le volume horaire va de ${TEAM_HOURS.min} à ${TEAM_HOURS.max} h.` };
  }
  return undefined;
}

/** Le gérant ne peut pas prendre l'e-mail d'une personne qu'il a invitée. */
export function managerEmailError(email: string, m: Pick<Manager, 'team'>): string | undefined {
  const x = m.team.find((t) => sameEmail(t.email, email));
  return x ? `${email.trim().toLowerCase()} est déjà l’adresse de ${x.firstName}, dans ton équipe.` : undefined;
}

/**
 * Lien d'inscription fictif d'une invitation.
 * Écart au backlog : le lien n'est pas à usage unique (E3-2). Dans la démo, il ne mène nulle part.
 */
export const inviteLink = (x: Pick<TeamMember, 'id'>) => `https://waitaway.app/invitation/${x.id}`;

/** Statut d'un membre, tel qu'affiché : « Salarié, 35 h » ou « Indépendant ». */
export const teamStatusText = (x: Pick<TeamMember, 'status' | 'hours'>) =>
  x.status === 'salarie' ? `Salarié, ${x.hours} h` : 'Indépendant';

/** Amplitude d'1 jour d'ouverture : du début de sa 1re plage à la fin de sa dernière. */
export const openingSpan = (d: OpeningDay): OpeningRange => ({ start: d.ranges[0].start, end: d.ranges[d.ranges.length - 1].end });

/**
 * Planning proposé au gérant quand il ouvre l'étape Ton planning : les jours où le salon est ouvert sont travaillés,
 * sur toute l'amplitude du jour, avec les pauses par défaut du coiffeur, au 1er poste. Calculé d'après les heures
 * d'ouverture enregistrées à ce moment-là, pas dans l'état de départ.
 */
export const defaultPlanning = (m: Pick<Manager, 'hours' | 'points'>): PlannedDay[] =>
  m.hours.map((d) => ({ day: d.day, works: d.open, ...openingSpan(d), pauses: defaultPauses(), point: m.points[0]?.id }));

/**
 * Ce qui empêche d'enregistrer 1 jour du planning du gérant : un jour travaillé alors que le salon est fermé, une fin
 * avant le début, un horaire hors des heures d'ouverture du jour, ou un poste qui n'est pas dans le salon.
 * Règle choisie pour un jour à 2 plages : le travail tient dans l'amplitude du jour (`openingSpan`), la fermeture du
 * midi n'est pas vérifiée. Le gérant y met sa pause de midi s'il le veut.
 */
export function planningDayError(d: PlannedDay, m: Pick<Manager, 'hours' | 'points'>): string | undefined {
  if (!d.works) return undefined;
  const open = m.hours[d.day];
  if (!open?.open) return 'Le salon est fermé ce jour.';
  if (d.end <= d.start) return 'L’heure de fin doit venir après l’heure de début.';
  const span = openingSpan(open);
  if (d.start < span.start || d.end > span.end) return `Le salon est ouvert de ${fmt(span.start)} à ${fmt(span.end)} ce jour.`;
  if (!m.points.some((p) => p.id === d.point)) return 'Choisis un de tes postes.';
  return undefined;
}

/**
 * 1re erreur du planning du gérant, précédée du jour. Le gérant qui ne coiffe pas n'a pas de planning : rien à
 * vérifier. Sinon le planning compte les 7 jours, du lundi au dimanche.
 */
export function planningError(cuts: boolean, planning: PlannedDay[] | undefined, m: Pick<Manager, 'hours' | 'points'>): string | undefined {
  if (!cuts) return undefined;
  if (!planning || planning.length !== 7 || planning.some((d, i) => d.day !== i)) return 'Le planning doit compter les 7 jours de la semaine.';
  for (const d of planning) {
    const e = planningDayError(d, m);
    if (e) return `${DAYS[d.day]} : ${e.charAt(0).toLowerCase()}${e.slice(1)}`;
  }
  return undefined;
}

/**
 * Heures prévues sur la semaine : le temps des jours travaillés, moins les pauses actives. Une pause ne compte que
 * pour la part qui tombe dans les heures de travail du jour. Servira aussi au volume horaire d'un salarié (E6-13).
 */
export function weekHours(planning: DayPlan[]): number {
  let minutes = 0;
  for (const d of planning) {
    if (!d.works || d.end <= d.start) continue;
    minutes += d.end - d.start;
    for (const p of d.pauses) if (p.on) minutes -= Math.max(0, Math.min(p.at + p.minutes, d.end) - Math.max(p.at, d.start));
  }
  return minutes / 60;
}

/** Total affiché sous le planning : « 38 h prévues cette semaine », « 41 h 30 prévues cette semaine ». */
export function weekHoursText(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${minutes === 0 ? '0 h' : fmtDuration(minutes)} ${minutes < 120 ? 'prévue' : 'prévues'} cette semaine`;
}

/** Le gérant dans les chevauchements de plannings : `who` vaut `gerant`, comme dans l'historique du tableau de bord. */
export const MANAGER_WHO = 'gerant';

/** 2 coiffeurs sur le même poste, le même jour, en même temps : `a` et `b` sont des `who` (`gerant` ou `TeamMember.id`). */
export type PlanningOverlap = { day: number; a: string; b: string; point: string; start: number; end: number };

/**
 * Les chevauchements de plannings du salon (E6-15) : 2 coiffeurs sur le même poste, le même jour, avec des horaires
 * qui se chevauchent. Le gérant compte s'il coiffe, et chaque membre qui a un planning. Un relais sans chevauchement
 * passe (9h00 à 13h00, puis 14h00 à 19h00). `draft` remplace le planning d'1 coiffeur (`MANAGER_WHO` pour le gérant,
 * qui coiffe alors), pour vérifier l'écran en cours.
 * Règle choisie, la plus simple : les pauses n'annulent pas un chevauchement. 2 coiffeurs sur le même poste de 9h00
 * à 18h00 se chevauchent, même si l'un est en pause quand l'autre travaille.
 */
export function planningOverlaps(m: Manager, draft?: { id: string; planning: PlannedDay[] }): PlanningOverlap[] {
  const plannings: { who: string; planning: PlannedDay[] }[] = [];
  if (draft?.id === MANAGER_WHO) plannings.push({ who: MANAGER_WHO, planning: draft.planning });
  else if (m.cuts && m.planning) plannings.push({ who: MANAGER_WHO, planning: m.planning });
  for (const x of m.team) {
    const planning = draft?.id === x.id ? draft.planning : x.planning;
    if (!x.invited && planning) plannings.push({ who: x.id, planning });
  }
  const out: PlanningOverlap[] = [];
  for (let day = 0; day < 7; day++) {
    const days = plannings
      .map((p) => ({ who: p.who, d: p.planning[day] }))
      .filter((x) => x.d?.works && x.d.point !== undefined && x.d.end > x.d.start);
    for (let i = 0; i < days.length; i++)
      for (let j = i + 1; j < days.length; j++) {
        const x = days[i];
        const y = days[j];
        const start = Math.max(x.d.start, y.d.start);
        const end = Math.min(x.d.end, y.d.end);
        if (x.d.point === y.d.point && start < end) out.push({ day, a: x.who, b: y.who, point: x.d.point!, start, end });
      }
  }
  return out;
}

/**
 * Message d'un chevauchement : « Le samedi, Antoine et toi êtes sur Fauteuil vitrine de 09:00 à 18:00 : 1 seul
 * coiffeur à la fois sur un poste. » Le gérant est « toi », toujours nommé en dernier.
 */
export function overlapText(o: PlanningOverlap, m: Manager): string {
  const [x, y] = o.a === MANAGER_WHO ? [o.b, o.a] : [o.a, o.b];
  const name = (who: string) => m.team.find((t) => t.id === who)?.firstName ?? '';
  const who = y === MANAGER_WHO ? `${name(x)} et toi êtes` : `${name(x)} et ${name(y)} sont`;
  const point = m.points.find((p) => p.id === o.point)?.name ?? 'le même poste';
  return `Le ${DAYS[o.day].toLowerCase()}, ${who} sur ${point} de ${fmt(o.start)} à ${fmt(o.end)} : 1 seul coiffeur à la fois sur un poste.`;
}

/** 1er chevauchement du planning `planning` du coiffeur `who` (`MANAGER_WHO` ou `TeamMember.id`) avec un autre coiffeur. */
function overlapError(m: Manager, who: string, planning: PlannedDay[]): string | undefined {
  const o = planningOverlaps(m, { id: who, planning }).find((x) => x.a === who || x.b === who);
  return o ? overlapText(o, m) : undefined;
}

/**
 * Ce qui empêche d'enregistrer ou de figer le planning d'1 membre : une erreur de jour (mêmes règles que le planning du
 * gérant, `planningError`), ou un chevauchement avec un autre coiffeur du salon, gérant compris.
 */
export function memberPlanningError(m: Manager, id: string, planning: PlannedDay[]): string | undefined {
  return planningError(true, planning, m) ?? overlapError(m, id, planning);
}

/**
 * Ce qui empêche d'enregistrer le planning du gérant (Ton planning) : une erreur de jour (`planningError`), ou un
 * chevauchement avec un membre de l'équipe (E6-15), même message que pour un membre. Le gérant qui ne coiffe pas n'a
 * rien à vérifier.
 */
export function managerPlanningError(m: Manager, cuts: boolean, planning: PlannedDay[] | undefined): string | undefined {
  const e = planningError(cuts, planning, m);
  if (e || !cuts || !planning) return e;
  return overlapError(m, MANAGER_WHO, planning);
}

/**
 * Avertissement non bloquant quand le planning d'un salarié dépasse son volume horaire (E6-13) : « 37 h 30 prévues
 * pour 35 h ». Rien pour un indépendant, ni sans planning. `planning` : celui de l'écran en cours, sinon celui du membre.
 * Écart au backlog : pas d'avertissement pour le gérant qui coiffe, il n'a pas de volume horaire dans la maquette.
 */
export function volumeWarning(x: Pick<TeamMember, 'status' | 'hours' | 'planning'>, planning = x.planning): string | undefined {
  if (x.status !== 'salarie' || x.hours === undefined || !planning) return undefined;
  const minutes = Math.round(weekHours(planning) * 60);
  if (minutes <= x.hours * 60) return undefined;
  return `${fmtDuration(minutes)} ${minutes < 120 ? 'prévue' : 'prévues'} pour ${x.hours} h`;
}

/** Heures prévues d'un salarié par rapport à son volume horaire : « 16 h sur 35 h ». Rien pour un indépendant. */
export function volumeText(x: Pick<TeamMember, 'status' | 'hours' | 'planning'>, planning = x.planning): string | undefined {
  if (x.status !== 'salarie' || x.hours === undefined || !planning) return undefined;
  const minutes = Math.round(weekHours(planning) * 60);
  return `${minutes === 0 ? '0 h' : fmtDuration(minutes)} sur ${x.hours} h`;
}

/** Le membre dont le planning peut s'ouvrir chez le gérant : inscrit (invitation acceptée) et avec un planning. */
const memberWithPlanning = (m: Manager, id: string | undefined) => m.team.find((x) => x.id === id && !x.invited && x.planning !== undefined);

/**
 * Ce que fait le bouton Scan du client. Dans la vraie application, c'est le QR code scanné qui décide.
 * La maquette n'a pas de caméra : elle choisit le QR code attendu selon l'état du ticket.
 */
/**
 * Ce que vise le bouton Scan du client. Une fois sa présence confirmée, il vise toujours le poste du coiffeur :
 * un scan trop tôt est refusé par le garde-fou (S14), qui dit pourquoi.
 */
export function nextScan(s: SimState): 'store' | 'confirm' | 'start' {
  const m = myTicket(s);
  if (!m || m.ticket.startedAt !== undefined || m.ticket.abortAt !== undefined) return 'store';
  return m.ticket.confirmedAt === undefined ? 'confirm' : 'start';
}

/** Le client est invité à confirmer sa présence à 10 min de son tour. Le re-scan du salon n'est accepté qu'à partir de là. */
export const CONFIRM_WINDOW = 10;
/** Sans confirmation à 5 min de son tour, le client est en retard : l'agent est prévenu (`customer.late`, S37). */
export const LATE_AFTER = 5;
/**
 * S14b : le scan du poste est refusé s'il reste plus de 10 min à la prestation en cours, comme la confirmation.
 * C'est ce scan qui clôt le ticket précédent. Décision de Gabi du 16/11/2026 (avant : 15 min ou plus).
 */
export const START_GUARD = 10;
/** Les réglages du rappel personnel, en min avant le tour. */
export const REMINDER_OPTIONS = [20, 25, 30, 35, 40, 45, 50, 55, 60];

/**
 * Re-scan du QR code du salon. Décision de Gabi du 16/11/2026 : la confirmation se fait entre 10 et 5 min avant le
 * tour du client. Avant, elle est refusée. Après 5 min, elle reste acceptée, mais l'agent a déjà été prévenu du retard.
 */
export function canConfirm(f: QueueFile, ticketId: string, now: number): string | null {
  const wait = waitFor(f, ticketId, now);
  if (wait <= CONFIRM_WINDOW) return null;
  return `Trop tôt pour confirmer ta présence : ton tour est vers ${fmt(now + wait)}. Tu pourras scanner à partir de ${fmt(now + wait - CONFIRM_WINDOW)}.`;
}

// ---------- Contrôles, côté « serveur » ----------

/** QA-19 et QA-20. Renvoie un message d'erreur, ou null. */
export function canJoin(s: SimState, fileId: string, ids: string[]): string | null {
  const f = fileById(s, fileId);
  if (!f.open) return `La file de ${f.agentName} est fermée.`;
  if (ids.length === 0) return 'Choisis au moins une prestation.';
  const mine = myTicket(s);
  if (mine && mine.ticket.doneAt === undefined && mine.ticket.abortAt === undefined)
    return 'Tu as déjà un ticket actif. Quitte ta file avant de t’inscrire ailleurs.';
  const dur = durationOf(f, ids);
  const end = projectedStart(f, s.now, dur) + dur;
  if (end > f.endOfDay && !decidesOvertime(f))
    return `${f.agentName} termine à ${fmt(f.endOfDay)} : ta prestation finirait vers ${fmt(end)}. Choisis une prestation plus courte ou une autre file.`;
  if (end > f.endOfDay + OVERTIME_MAX)
    return `${f.agentName} ferme à ${fmt(f.endOfDay)} et prend au plus ${OVERTIME_MAX} min de plus : ta prestation finirait vers ${fmt(end)}. Choisis une prestation plus courte ou une autre file.`;
  return null;
}

/** Heure de fin d'une inscription qui demanderait l'accord de l'agent, sinon `undefined`. */
export function overtimeEnd(f: QueueFile, now: number, ids: string[]): number | undefined {
  if (!decidesOvertime(f)) return undefined;
  const dur = durationOf(f, ids);
  const end = projectedStart(f, now, dur) + dur;
  return end > f.endOfDay ? end : undefined;
}

/** Les garde-fous du démarrage (S14), plus la pause de l'agent. */
export function canStart(f: QueueFile, ticketId: string, now: number): string | null {
  if (position(f, ticketId) !== 1) return 'Ce n’est pas encore ton tour : tu n’es pas en position 1.';
  const run = runningPause(f);
  if (run && now < pauseEnd(run)) return `${f.agentName} est en pause jusqu’à ${fmt(pauseEnd(run))}.`;
  if (run) return `${f.agentName} n’a pas encore repris sa file. Ton tour vient dès son retour.`;
  if (pauseDue(f, now)) return `${f.agentName} prend sa pause. Ton tour vient juste après.`;
  const rem = remaining(f, now);
  if (rem > START_GUARD) return `${f.agentName} termine encore avec un client. Réessaie dans ${rem - START_GUARD} min.`;
  return null;
}

// ---------- Format ----------

export const fmt = (m: number) => {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
};

/** 90 → « 1 h 30 », 45 → « 45 min ». */
export const fmtDuration = (m: number) => {
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${String(rest).padStart(2, '0')}`;
};

// ---------- Actions ----------

export type Action =
  | { type: 'advance'; minutes: number }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'nav'; nav: ClientNav }
  | { type: 'signup'; firstName: string; lastName: string; email: string }
  | { type: 'toggleFavorite'; id: string }
  | { type: 'join'; fileId: string; prestationIds: string[] }
  | { type: 'confirm' }
  | { type: 'clientStart' }
  | { type: 'leave' }
  | { type: 'claim'; prestationIds: string[] }
  | { type: 'rate'; stars?: number; comment?: string; photo?: boolean }
  | { type: 'clearMyTicket' }
  | { type: 'setReminder'; minutes: number | null }
  | { type: 'agentLogin'; email: string }
  | { type: 'agentProfile'; firstName: string; lastName: string; metier: string }
  | { type: 'agentPrestations'; minutes: Record<string, number> }
  | { type: 'agentDay'; plan: DayPlan }
  | { type: 'agentSetupDone' }
  | { type: 'openFile'; durations: Record<string, number>; pauses: PausePlan[]; endOfDay: number }
  | { type: 'startPause'; id: PauseId }
  | { type: 'skipPause'; id: PauseId }
  | { type: 'resume' }
  | { type: 'declareDelay'; minutes: number }
  | { type: 'announceOverrun'; minutes: number }
  | { type: 'applySuggestion'; id: string; accept: boolean }
  | { type: 'incidentClose' }
  | { type: 'decideOvertime'; ticketId: string; accept: boolean }
  | { type: 'reject'; ticketId: string; motif: string }
  | { type: 'agentStart'; ticketId: string }
  | { type: 'dismissLate' }
  | { type: 'agentConfirm'; ticketId: string }
  | { type: 'walkIn'; minutes: number; startNow?: boolean; rejectLate?: boolean }
  | { type: 'closeFile'; current?: 'terminer' | 'rejeter' }
  | { type: 'dropNotif'; id: number }
  | { type: 'managerEdit'; account?: { firstName: string; lastName: string; email: string }; store?: { name: string; address: string } }
  | { type: 'managerStartSetup' }
  /**
   * Ouvre l'écran d'une étape ou d'une entrée du menu. Sans `step` : la page de configuration. `member` : pour
   * `member-planning`. `from` : l'écran d'où il est ouvert, quand Retour doit y ramener (`Manager.from`).
   */
  | { type: 'managerOpen'; step?: ManagerView; member?: string; from?: 'plannings' | 'dashboard' }
  | { type: 'managerSaveHours'; hours: OpeningDay[] }
  /** Les noms des postes, par id de poste. Un poste absent garde son nom. */
  | { type: 'managerSavePoints'; names: Record<string, string> }
  | { type: 'managerBuyFile' }
  /** Les prestations créées par le gérant, et la durée indicative de chaque prestation retenue, par id. */
  | { type: 'managerSavePrestations'; created: Prestation[]; minutes: Record<string, number> }
  /** Le gérant valide une prestation proposée par l'équipe (`Proposal.id`). */
  | { type: 'managerAcceptProposal'; id: string }
  /** Le gérant refuse une prestation proposée par l'équipe, avec un message facultatif. */
  | { type: 'managerRejectProposal'; id: string; message?: string }
  | { type: 'managerInvite'; invite: InviteDraft }
  | { type: 'managerCancelInvite'; id: string }
  | { type: 'managerSaveTeam' }
  /** Le gérant coiffe aussi ou non, et son planning des 7 jours quand il coiffe. */
  | { type: 'managerSavePlanning'; cuts: boolean; planning?: PlannedDay[] }
  /** L'affiche `id` de `qrPosters`. Sans `id` : toutes les affiches. */
  | { type: 'managerPrint'; id?: string }
  | { type: 'managerFinishSetup' }
  /** Saut « 1 semaine plus tard » du scénario gérant : le coiffeur invité accepte son invitation et l'historique apparaît. */
  | { type: 'managerWeekLater' }
  /** Le planning des 7 jours d'1 membre, corrigé par le gérant. */
  | { type: 'managerSaveMemberPlanning'; id: string; planning: PlannedDay[] }
  /** Fige le planning d'1 membre, après avoir enregistré `planning`, celui de l'écran. */
  | { type: 'managerFreezePlanning'; id: string; planning: PlannedDay[] }
  /** Rouvre un planning figé, pour que le membre le modifie. */
  | { type: 'managerReopenPlanning'; id: string };

function notify(s: SimState, to: 'client' | 'agent', title: string, body: string) {
  s.notifs.push({ id: s.nextId++, to, title, body });
}

const isMine = (s: SimState, t: Ticket) => s.me.ticketRef?.ticketId === t.id;

function finish(s: SimState, f: QueueFile, t: Ticket) {
  t.doneAt = s.now;
  // S20 : un dépassement compte dès qu'un retard a été notifié ou annoncé. Il compte pour chaque prestation du ticket.
  if ((t.overrun ?? 0) >= OVERRUN_STEP) {
    f.overruns ??= {};
    for (const id of t.prestationIds) f.overruns[id] = (f.overruns[id] ?? 0) + 1;
  }
  // Questionnaire de satisfaction : hors backlog, décision de Gabi le 16/11/2026. Il part dès que la prestation est
  // close, quelle que soit la clôture : démarrage du client suivant, pause, fermeture de file. Dans la maquette,
  // une prestation se ferme aussi seule à la fin de sa durée (voir `act`).
  if (isMine(s, t)) notify(s, 'client', 'Prestation terminée', `Comment ça s’est passé avec ${f.agentName} ? Donne ton avis en 30 secondes.`);
}

/** Démarre `t`. Clôture enchaînée : la prestation en cours se termine. Une pause en cours aussi. */
function startTicket(s: SimState, f: QueueFile, t: Ticket) {
  const prev = inService(f);
  if (prev) finish(s, f, prev);
  const run = runningPause(f);
  if (run) run.endedAt = s.now;
  t.startedAt = s.now;
  t.confirmedAt ??= s.now;
  if (s.lateAlert?.ticketId === t.id) s.lateAlert = undefined;
}

function rejectTicket(s: SimState, f: QueueFile, t: Ticket, motif: string) {
  t.abortAt = s.now;
  t.abortReason = 'rejected_by_agent';
  t.rejectMotif = motif;
  if (isMine(s, t)) notify(s, 'client', `${f.agentName} a retiré ton ticket`, motif);
  if (s.lateAlert?.ticketId === t.id) s.lateAlert = undefined;
}

/** Démarrer sa pause avec un client en service clôt cette prestation (S24). */
function beginPause(s: SimState, f: QueueFile, p: Pause) {
  const cur = inService(f);
  if (cur) finish(s, f, cur);
  p.startedAt = s.now;
  p.remindedAt ??= s.now;
  s.notifs = s.notifs.filter((n) => n.to !== 'agent');
}

/**
 * Réponse de l'agent à une demande après la fermeture. Acceptée, elle prend la dernière place et vaut confirmation :
 * le client est au salon, il vient d'en parler au coiffeur. Refusée, le client est prévenu.
 */
function decideOvertime(s: SimState, f: QueueFile, t: Ticket, accept: boolean) {
  if (t.overtime !== 'pending') return;
  if (accept) {
    t.overtime = 'accepted';
    t.joinedAt = s.now;
    t.confirmedAt ??= s.now;
    // Le ticket entre dans la file maintenant : son attente de départ part d'ici.
    if (isMine(s, t)) {
      t.joinWait = waitFor(f, t.id, s.now);
      notify(s, 'client', `${f.agentName} a accepté`, 'Tu as ta place dans la file. Patiente dans le salon.');
    }
  } else {
    t.overtime = 'refused';
    t.abortAt = s.now;
    t.abortReason = 'rejected_by_agent';
    t.rejectMotif = 'Pas de place avant la fermeture.';
    if (isMine(s, t)) notify(s, 'client', `${f.agentName} ne peut pas te prendre`, 'Ta prestation finirait trop tard aujourd’hui.');
  }
}

/** Fige la pause devant le ticket qui la chevauchait (voir `plan`). */
function freeze(f: QueueFile, now: number) {
  for (const [p, t] of plan(f, now).early) p.beforeTicketId = t.id;
}

/** L'inscription finirait après la fermeture : elle attend la réponse de l'agent. */
function askOvertime(s: SimState, t: Ticket, end: number) {
  t.overtime = 'pending';
  notify(s, 'agent', `${t.name} demande une place après ta fermeture`, `Il finirait vers ${fmt(end)}. Accepte ou refuse.`);
}

/**
 * QA-33 (E6-9, S25) : fermeture sur incident. Contrairement à la fermeture normale (QA-28), elle sort tous les
 * clients de la file, qui sont prévenus (queue.closed.incident).
 */
function closeOnIncident(s: SimState, f: QueueFile) {
  const cur = inService(f);
  if (cur) finish(s, f, cur);
  const run = runningPause(f);
  if (run) run.endedAt = s.now;
  for (const t of f.tickets.filter((x) => x.startedAt === undefined && x.abortAt === undefined)) {
    t.abortAt = s.now;
    t.abortReason = 'incident';
    t.rejectMotif = `Un imprévu oblige ${f.agentName} à fermer sa file pour aujourd’hui.`;
    if (isMine(s, t)) notify(s, 'client', `${f.agentName} a dû fermer sa file`, t.rejectMotif);
  }
  f.open = false;
  f.closedAt = s.now;
  f.incident = true;
  s.playing = false;
  if (s.lateAlert?.fileId === f.id) s.lateAlert = undefined;
  if (f.id === AGENT_FILE_ID) s.notifs = s.notifs.filter((n) => n.to !== 'agent');
  f.tickets = f.tickets.filter((t) => isMine(s, t));
  f.pauses = [];
}

/**
 * S20 : l'agent sait que sa prestation sera longue et annonce le retard en 1 geste. Comme `declareDelay`, il
 * compte à partir de maintenant, ou de la fin estimée si elle n'est pas encore passée. 1 seule notification ;
 * les notifications automatiques reprennent 5 min après la nouvelle fin estimée.
 */
function announceOverrun(s: SimState, f: QueueFile, minutes: number) {
  const cur = inService(f);
  if (!cur) return;
  const end = Math.max(s.now, serviceEnd(cur)) + minutes;
  cur.overrun = end - cur.startedAt! - cur.duration;
  const mine = overrunTargets(f, s.now).find((t) => isMine(s, t));
  if (mine) {
    mine.eta = s.now + waitFor(f, mine.id, s.now);
    notify(s, 'client', `${f.agentName} annonce ${minutes} min de retard`, `Sa prestation en cours sera plus longue que prévu. Ton tour est estimé vers ${fmt(mine.eta)}.`);
  }
}

/**
 * « Prendre un client présent » (S37) : l'agent crée un ticket anonyme de `minutes` min (S44) et le démarre tout de suite.
 * Le client en retard `late` garde la position 1, sauf si l'agent le retire en même temps (S23).
 */
function takePresentClient(s: SimState, f: QueueFile, minutes: number, late?: Ticket, rejectLate?: boolean) {
  const n = f.tickets.filter((t) => t.anonymous).length + 1;
  const t = mkTicket(f, `Walk-in ${n}`, [], s.now, 'ponctuel', { anonymous: true, walkIn: true, duration: minutes, confirmedAt: s.now });
  f.tickets.push(t);
  startTicket(s, f, t);
  if (late && rejectLate) rejectTicket(s, f, late, 'Client absent');
  else if (late) late.lateDecidedAt = s.now;
  if (s.lateAlert?.fileId === f.id) s.lateAlert = undefined;
}

/**
 * QA-27, règles 3 et 4 : le walk-in scanne le QR code de son ticket. Le ticket prend son nom et ses prestations,
 * et sa durée devient celle des prestations.
 * Règle 11 et S44, décision de Gabi le 16/11/2026 : avec l'application, le client peut sortir du salon sans prévenir.
 * Sa confirmation est retirée et il repasse par le parcours normal : rappel, rescan de l'entrée, signalement de retard.
 * Comme en S38, il reste confirmé si son tour est à moins de 10 min.
 */
function claimTicket(s: SimState, f: QueueFile, t: Ticket, name: string, prestationIds: string[]) {
  t.name = name;
  t.prestationIds = prestationIds;
  t.duration = durationOf(f, prestationIds);
  t.anonymous = false;
  t.claimedAt = s.now;
  if (waitFor(f, t.id, s.now) >= 10) t.confirmedAt = undefined;
}

/** Les gestes prévus des coiffeurs simulés (scénarios client). */
function runAgentEvents(s: SimState) {
  if (!s.agentEvents?.length) return;
  const m = myTicket(s);
  const fired: AgentEvent[] = [];
  for (const e of s.agentEvents) {
    const f = fileById(s, e.fileId);
    if (!f.open) continue;
    if (e.afterMyTurn !== undefined) {
      const mineFirst = m && m.file.id === f.id && waiting(f)[0]?.id === m.ticket.id && m.ticket.confirmedAt === undefined;
      const ready = mineFirst && !inService(f) && !runningPause(f);
      if (!ready) {
        e.armedAt = undefined;
        continue;
      }
      e.armedAt ??= s.now;
      if (s.now - e.armedAt < e.afterMyTurn) continue;
    } else if (e.at === undefined || s.now < e.at) continue;
    fired.push(e);
    if (e.do === 'leave') {
      const t = waiting(f).find((x) => x.name === e.name);
      if (t) {
        t.abortAt = s.now;
        t.abortReason = 'self';
      }
    } else if (e.do === 'announce') announceOverrun(s, f, e.minutes ?? OVERRUN_STEP);
    else if (e.do === 'incident') closeOnIncident(s, f);
    else if (e.do === 'replaceMine' && m && m.file.id === f.id) takePresentClient(s, f, e.minutes ?? 30, m.ticket, true);
  }
  s.agentEvents = s.agentEvents.filter((e) => !fired.includes(e));
}

/** Scénarios client : minutes avant qu'un coiffeur simulé accepte une demande après la fermeture. */
const OVERTIME_AUTO_DELAY = 2;

/** Minutes entre le scan de reprise de l'agent et le scan du poste par le client confirmé en position 1. */
const RESUME_DELAY = 2;

/** Vrai quand c'est la personne qui fait la démo qui tient le téléphone de ce coiffeur. */
const playedByUser = (s: SimState, f: QueueFile) => !s.autoAgent && f.id === AGENT_FILE_ID;

/**
 * Dépassement (`service.overrun`, S20 revu le 16/11/2026). Quand la prestation en cours dépasse de 5 min sa durée
 * estimée (retard annoncé compris), le retard est constaté : 5 min s'ajoutent à la durée estimée et les clients
 * concernés sont prévenus (`overrunTargets`). Puis toutes les 5 min tant qu'elle n'est pas finie. L'agent n'a rien à faire.
 * Entre 2 seuils, le temps d'attente glisse minute par minute (`plan` part de `now` quand la fin estimée est passée).
 * Écart : S20 envoie aussi la notification en push. La maquette n'a que des notifications dans l'application,
 * et seul le client du téléphone les reçoit : les autres n'ont pas d'écran.
 */
function watchOverrun(s: SimState, f: QueueFile) {
  const cur = inService(f);
  if (!cur || s.now < serviceEnd(cur) + OVERRUN_STEP) return;
  cur.overrun = (cur.overrun ?? 0) + OVERRUN_STEP;
  if (overrunTargets(f, s.now).some((t) => isMine(s, t)))
    notify(
      s,
      'client',
      `${f.agentName} a ${OVERRUN_STEP} min de retard`,
      'Sa prestation en cours dure plus longtemps que prévu. Prends ton temps : ton tour arrive dès qu’il a fini.',
    );
}

/** Le client est prévenu quand son tour avance d'au moins `GAIN_MIN` min. */
const GAIN_MIN = 5;

/**
 * Le tour du client avance : quelqu'un devant lui a quitté la file, ou une prestation plus courte a pris sa place.
 * Ce n'est pas dans le backlog : décision de Gabi le 16/11/2026. Un recul ne prévient pas : seuls le dépassement
 * et le retard de pause annoncé le font.
 */
function watchGain(s: SimState, f: QueueFile) {
  const mine = waiting(f).find((t) => isMine(s, t));
  if (!mine) return;
  const eta = s.now + waitFor(f, mine.id, s.now);
  if (mine.eta === undefined || eta > mine.eta) mine.eta = eta;
  else if (eta <= mine.eta - GAIN_MIN) {
    notify(s, 'client', `Ton tour avance de ${mine.eta - eta} min`, `La file a avancé plus vite que prévu. Ton tour est estimé vers ${fmt(eta)}.`);
    mine.eta = eta;
  }
}

/** Ce que font les clients simulés à l'heure courante. */
function act(s: SimState, f: QueueFile) {
  // Écart : ici, une prestation se termine seule quand sa durée est écoulée, plus `extra` si le scénario la fait
  // dépasser. Dans QueueAPI, c'est le démarrage du suivant, la pause ou la fermeture qui la clôt.
  const cur = inService(f);
  if (cur && s.now >= cur.startedAt! + cur.duration + (cur.extra ?? 0)) finish(s, f, cur);
  // Personne ne tient le téléphone de ce coiffeur : sa pause finit seule, à l'heure.
  const over = pauseOverdue(f, s.now);
  if (over && !playedByUser(s, f)) over.endedAt = s.now;
  if (inService(f) || pauseDue(f, s.now)) return;
  // Pause en cours, ou finie mais pas encore reprise par le scan de l'agent : le poste reste fermé.
  if (runningPause(f)) return;
  // Le client confirmé voit le coiffeur revenir : il scanne le poste 2 min après le scan de reprise.
  if (f.pauses.some((p) => p.resumedAt !== undefined && s.now - p.resumedAt < RESUME_DELAY)) return;
  const u1 = waiting(f)[0];
  // Le client simulé en position 1 scanne le QR du poste dès que le poste est libre.
  if (u1 && !isMine(s, u1) && !u1.anonymous && u1.confirmedAt !== undefined) startTicket(s, f, u1);
}

/** Les inscriptions prévues par le scénario. Elles passent par les mêmes contrôles qu'un vrai client. */
function arrive(s: SimState, f: QueueFile) {
  const at = (a: SimState['script'][number]) => a.at ?? f.endOfDay - (a.beforeEnd ?? 0);
  const due = s.script.filter((a) => a.fileId === f.id && at(a) <= s.now);
  if (due.length === 0) return;
  s.script = s.script.filter((a) => !due.includes(a));
  for (const a of due) {
    if (a.minEnd !== undefined && f.endOfDay < a.minEnd) continue; // client prévu pour une journée plus longue
    const dur = durationOf(f, a.prestationIds);
    const start = projectedStart(f, s.now, dur);
    const over = start + dur > f.endOfDay;
    if (over && (!decidesOvertime(f) || start + dur > f.endOfDay + OVERTIME_MAX)) continue; // QA-20, limite de 30 min
    const t = mkTicket(f, a.name, a.prestationIds, s.now, a.behavior, a.extra ? { extra: a.extra } : {});
    if (over) askOvertime(s, t, start + dur);
    else if (start - s.now < 10) t.confirmedAt = s.now; // S38
    f.tickets.push(t);
  }
}

/** Ce que le « serveur » constate à l'heure courante : rappels, retards, appels. */
function observe(s: SimState, f: QueueFile) {
  const due = pauseDue(f, s.now);
  if (due && due.remindedAt === undefined && f.id === AGENT_FILE_ID) {
    due.remindedAt = s.now;
    // pause.reminder. Écart : S24 l'envoie à l'heure souhaitée. Ici, il part quand le créneau calculé arrive.
    notify(s, 'agent', `${PAUSE_LABEL[due.id]} : c’est le moment`, 'Scanne le QR code de ton poste pour la démarrer.');
  }
  if (playedByUser(s, f) && closeDue(f, s.now) && f.closeHintAt === undefined) {
    f.closeHintAt = s.now;
    notify(s, 'agent', 'Plus personne n’attend', 'Ta journée est finie. Touche « Fermer ma file ».');
  }
  // Le walk-in simulé scanne le QR code de son ticket pendant son attente (voir `claimTicket`).
  if (s.claim && f.id === AGENT_FILE_ID) {
    const c = s.claim;
    const t = waiting(f).find((x) => x.anonymous && s.now - x.joinedAt >= c.after);
    if (t) {
      claimTicket(s, f, t, c.name, c.prestationIds);
      s.claim = undefined;
      notify(s, 'agent', `Ton walk-in s’est inscrit : ${t.name}`, `${ticketLabel(f, t)}, ${t.duration} min.`);
    }
  }
  // Scénarios client : personne ne joue les coiffeurs. Ils acceptent seuls les demandes après la fermeture,
  // le temps que le client leur en parle.
  if (s.autoAgent) for (const t of pendingOvertime(f)) if (s.now - t.joinedAt >= OVERTIME_AUTO_DELAY) decideOvertime(s, f, t, true);
  // Leur pause démarre seule. S'ils dépassent, ils finissent d'abord leur prestation.
  const cur = inService(f);
  const busy = cur !== undefined && s.now < cur.startedAt! + cur.duration + (cur.extra ?? 0);
  if (due && s.autoAgent && !busy) beginPause(s, f, due);

  // queue.resumed attendu : la pause est finie, l'agent doit scanner le QR code de son poste.
  const over = pauseOverdue(f, s.now);
  if (over && playedByUser(s, f) && over.endNotifiedAt === undefined) {
    over.endNotifiedAt = s.now;
    notify(s, 'agent', PAUSE_OVER, 'Scanne le QR code de ton poste pour reprendre, ou préviens tes clients de ton retard.');
  }

  waiting(f).forEach((t, i) => {
    const wait = waitFor(f, t.id, s.now);

    // Un ticket anonyme non rattaché n'a pas d'application pour rescanner : seul l'agent le confirme.
    if (!t.anonymous && t.behavior === 'ponctuel' && t.confirmedAt === undefined && wait <= 10) t.confirmedAt = s.now;
    if (t.behavior === 'retard' && t.confirmedAt === undefined && t.lateNotifiedAt !== undefined && s.now - t.lateNotifiedAt >= 8)
      t.confirmedAt = s.now;

    // Rappel personnel : un simple « mets-toi en route », au délai choisi par le client. Il ne l'invite pas à scanner.
    // Écart avec S16 : il invitait à revenir confirmer. Décision de Gabi du 16/11/2026.
    if (
      isMine(s, t) && t.confirmedAt === undefined && t.remindedAt === undefined && t.invitedAt === undefined &&
      t.reminder !== undefined && wait <= t.reminder && wait > CONFIRM_WINDOW
    ) {
      t.remindedAt = s.now;
      notify(s, 'client', 'Mets-toi en route', `Ton tour chez ${f.agentName} est vers ${fmt(s.now + wait)}. Tu pourras confirmer ta présence à partir de ${fmt(s.now + wait - CONFIRM_WINDOW)}.`);
    }

    // Invitation à confirmer : notify.presence, 10 min avant le tour.
    if (isMine(s, t) && t.confirmedAt === undefined && t.invitedAt === undefined && wait <= CONFIRM_WINDOW) {
      t.invitedAt = s.now;
      notify(s, 'client', 'Confirme ta présence', `Ton tour est dans ${wait} min environ. Au salon, touche Scan pour confirmer que tu es là.`);
    }

    // Retardataire : customer.late, seulement chez l'agent (S37), 5 min avant le tour.
    if (i === 0 && f.id === AGENT_FILE_ID && t.confirmedAt === undefined && t.lateNotifiedAt === undefined && wait < LATE_AFTER) {
      t.lateNotifiedAt = s.now;
      s.lateAlert = { fileId: f.id, ticketId: t.id };
      notify(s, 'agent', `${t.name} n’a pas confirmé`, `Son tour est dans ${wait} min.`);
    }

    // S37, « U1 est là à la fin de cette prestation ? Non : choix de l'agent ». Le poste est libre, c'est son
    // tour et il n'est toujours pas là : la décision revient devant l'agent, sans nouvelle notification.
    if (
      i === 0 && f.id === AGENT_FILE_ID && t.confirmedAt === undefined && t.lateNotifiedAt !== undefined &&
      s.lateAlert === undefined && wait === 0 && !inService(f) && s.now - (t.lateDecidedAt ?? t.lateNotifiedAt) >= 5
    )
      s.lateAlert = { fileId: f.id, ticketId: t.id };
  });

  watchGain(s, f);

  // Appel : called.for.service
  const next = waiting(f)[0];
  const free = !inService(f) && !pauseDue(f, s.now) && !runningPause(f);
  if (next && isMine(s, next) && next.calledAt === undefined && free) {
    next.calledAt = s.now;
    notify(s, 'client', 'C’est ton tour', `${f.agentName} est prêt. Touche Scan devant son poste.`);
  }
}

/** 1 minute simulée. */
function step(s: SimState) {
  for (const f of s.files) {
    if (!f.open) continue;
    act(s, f);
    watchOverrun(s, f);
  }
  s.now += 1;
  runAgentEvents(s);
  for (const f of s.files) {
    if (!f.open) continue;
    arrive(s, f);
    observe(s, f);
    freeze(f, s.now);
  }
}

/**
 * Vrai quand l'agent doit décider : une pause à démarrer, un client en retard, une demande après la fermeture,
 * ou sa file à fermer en fin de journée.
 * Une pause finie mais pas reprise n'arrête pas le temps : elle le ralentit (voir `agentLate`).
 */
const needsAgent = (s: SimState) => {
  const f = fileById(s, AGENT_FILE_ID);
  return (
    !s.autoAgent &&
    f.open &&
    (s.lateAlert !== undefined || pauseDue(f, s.now) !== undefined || pendingOvertime(f).length > 0 || closeDue(f, s.now))
  );
};

/** Vrai quand le coiffeur joué par la démo est en retard sur la fin de sa pause : le temps passe au ralenti. */
export const agentLate = (s: SimState) => {
  const f = fileById(s, AGENT_FILE_ID);
  return !s.autoAgent && f.open && pauseOverdue(f, s.now) !== undefined;
};

/** Le temps s'arrête quand l'agent doit décider, et repart quand il l'a fait. */
export function syncClock(prev: SimState, s: SimState) {
  const was = needsAgent(prev);
  const is = needsAgent(s);
  if (!was && is) s.playing = false;
  if (was && !is && fileById(s, AGENT_FILE_ID).open) s.playing = true;
}

/** Avance minute par minute jusqu'à ce que `until` soit vrai. Modifie `s`. */
export function advanceUntil(s: SimState, until: (s: SimState) => boolean, max: number) {
  for (let i = 0; i < max && !until(s); i++) step(s);
}

export function reducer(state: SimState, a: Action): SimState {
  const s: SimState = structuredClone(state);
  const agentFile = () => fileById(s, AGENT_FILE_ID);

  switch (a.type) {
    case 'advance':
      for (let i = 0; i < a.minutes; i++) step(s);
      break;
    case 'setPlaying':
      s.playing = a.playing;
      break;
    case 'nav':
      s.clientNav = a.nav;
      break;
    case 'signup':
      s.me.firstName = a.firstName;
      s.me.lastName = a.lastName;
      s.me.email = a.email;
      break;
    case 'toggleFavorite':
      // Écart : les prestations favorites (QA-10) sont classées « hors démo » dans le backlog.
      s.me.favorites = s.me.favorites.includes(a.id) ? s.me.favorites.filter((x) => x !== a.id) : [...s.me.favorites, a.id];
      break;
    case 'setReminder': {
      // null : pas de rappel pour ce ticket. Le réglage du compte reste le dernier délai choisi.
      if (a.minutes !== null) s.me.reminderMinutes = a.minutes;
      const m = myTicket(s);
      // Un rappel déjà dépassé partirait tout de suite : il est ignoré.
      if (m && m.ticket.remindedAt === undefined && (a.minutes === null || a.minutes < waitFor(m.file, m.ticket.id, s.now)))
        m.ticket.reminder = a.minutes ?? undefined;
      break;
    }
    case 'join': {
      if (canJoin(s, a.fileId, a.prestationIds)) break;
      const f = fileById(s, a.fileId);
      const dur = durationOf(f, a.prestationIds);
      const wait = projectedStart(f, s.now, dur) - s.now;
      const t = mkTicket(f, s.me.firstName ?? 'Toi', a.prestationIds, s.now, 'moi');
      const end = overtimeEnd(f, s.now, a.prestationIds);
      if (end !== undefined) askOvertime(s, t, end);
      // Confirmation à l'inscription : moins de 10 min avant son tour (S38).
      else if (wait < 10) t.confirmedAt = s.now;
      // Le rappel n'a de sens que s'il tombe dans le futur.
      else if (wait > s.me.reminderMinutes) t.reminder = s.me.reminderMinutes;
      f.tickets.push(t);
      if (t.overtime !== 'pending') t.joinWait = waitFor(f, t.id, s.now);
      s.me.ticketRef = { fileId: f.id, ticketId: t.id };
      s.clientNav = { screen: 'joined' };
      // Scénario client : l'inscription lance le temps, comme l'ouverture de file côté coiffeur.
      if (s.autoAgent) s.playing = true;
      break;
    }
    case 'confirm': {
      const m = myTicket(s);
      if (!m || canConfirm(m.file, m.ticket.id, s.now)) break;
      m.ticket.confirmedAt ??= s.now;
      s.clientNav = { screen: 'confirmed' };
      break;
    }
    case 'clientStart': {
      const m = myTicket(s);
      if (!m || canStart(m.file, m.ticket.id, s.now)) break;
      startTicket(s, m.file, m.ticket);
      break;
    }
    case 'leave': {
      const m = myTicket(s);
      if (m) {
        m.ticket.abortAt = s.now;
        m.ticket.abortReason = 'self';
        if (s.lateAlert?.ticketId === m.ticket.id) s.lateAlert = undefined;
      }
      s.me.ticketRef = undefined;
      s.clientNav = { screen: 'account' };
      break;
    }
    case 'claim': {
      const w = s.me.walkIn;
      if (!w) break;
      const f = fileById(s, w.fileId);
      const t = f.tickets.find((x) => x.id === w.ticketId);
      if (!t || a.prestationIds.length === 0) break;
      claimTicket(s, f, t, s.me.firstName ?? 'Toi', a.prestationIds);
      t.behavior = 'moi';
      t.joinWait = waitFor(f, t.id, s.now);
      if (t.confirmedAt === undefined && waitFor(f, t.id, s.now) > s.me.reminderMinutes) t.reminder = s.me.reminderMinutes;
      s.me.walkIn = undefined;
      s.me.ticketRef = { fileId: f.id, ticketId: t.id };
      s.clientNav = { screen: 'joined' };
      if (s.autoAgent) s.playing = true;
      break;
    }
    case 'rate': {
      // Sans note : le client a choisi « Plus tard ».
      const m = myTicket(s);
      if (!m || m.ticket.doneAt === undefined || m.ticket.rating !== undefined) break;
      m.ticket.rating = a.stars
        ? {
            stars: a.stars,
            comment: a.comment?.trim() || undefined,
            photo: a.photo || undefined,
            store: STORE.name,
            agentName: m.file.agentName,
            prestations: prestationsOf(m.file, m.ticket.prestationIds).map((p) => p.label),
            at: s.now,
          }
        : 'skipped';
      break;
    }
    case 'clearMyTicket':
      s.me.ticketRef = undefined;
      s.clientNav = { screen: 'account' };
      break;

    // Écart : l'agent se connecte par un code reçu par e-mail. Le contrat d'API prévoit un mot de passe.
    case 'agentLogin':
      s.agent.loggedIn = true;
      s.agent.email = a.email;
      break;
    case 'agentProfile': {
      s.agent.firstName = a.firstName;
      s.agent.lastName = a.lastName;
      const f = agentFile();
      f.agentName = a.firstName;
      f.metier = a.metier;
      s.agent.setup = 'prestations';
      break;
    }
    case 'agentPrestations':
      agentFile().prestations = CATALOG.filter((p) => a.minutes[p.id] !== undefined).map((p) => ({ ...p, minutes: a.minutes[p.id] }));
      s.agent.setup = 'horaires';
      break;
    case 'agentDay':
      s.agent.week[a.plan.day] = a.plan;
      break;
    // Le gérant corrige les infos saisies à l'achat. L'abonnement ne se change que sur le site de WaitAway.
    case 'managerEdit':
      if (!s.manager) break;
      if (a.account) {
        if (managerEmailError(a.account.email, s.manager) !== undefined) break;
        Object.assign(s.manager, { ...a.account, email: a.account.email.trim().toLowerCase() });
      }
      if (a.store) s.manager.store = { ...a.store };
      break;
    // La configuration commence par l'écran de sa 1re étape.
    case 'managerStartSetup':
      if (s.manager && s.manager.setupDone === undefined) {
        s.manager.setupDone = [];
        s.manager.view = SETUP_STEPS[0].id;
      }
      break;
    // Ouvre l'écran d'une étape en cours ou faite. Sans étape : retour à la page de configuration. Le tableau de bord
    // ne s'ouvre qu'une fois la configuration finie.
    // Les plannings de l'équipe aussi, et le planning d'1 membre inscrit qui en a un.
    // `from` n'est gardé, une fois la configuration finie, que pour Ton planning ouvert depuis Plannings, et pour
    // Prestations et le planning d'1 membre ouverts depuis le tableau de bord (« À traiter ») : tout autre écran
    // ouvert l'efface.
    case 'managerOpen': {
      const m = s.manager;
      if (!m) break;
      if (a.step === undefined) delete m.view;
      else if (a.step === 'dashboard' || a.step === 'plannings') {
        if (setupFinished(m)) m.view = a.step;
      } else if (a.step === 'member-planning') {
        if (!setupFinished(m) || !memberWithPlanning(m, a.member)) break;
        m.view = a.step;
        m.memberId = a.member;
      } else if (setupStatus(m, a.step) !== 'todo') m.view = a.step;
      if (m.view !== 'member-planning') delete m.memberId;
      const kept =
        (a.from === 'plannings' && a.step === 'planning') || (a.from === 'dashboard' && (a.step === 'prestations' || a.step === 'member-planning'));
      if (kept && a.from !== undefined && m.view === a.step && setupFinished(m)) m.from = a.from;
      else delete m.from;
      break;
    }
    // Écart au backlog : les heures d'ouverture limitent le planning du gérant (`planningError`), pas encore celui du
    // coiffeur des autres scénarios (`agent.week`, E6-5). Un planning du gérant déjà enregistré n'est pas revérifié
    // quand les heures changent après coup.
    case 'managerSaveHours': {
      const m = s.manager;
      if (!m || m.setupDone === undefined || a.hours.length !== 7 || a.hours.some((d) => d.ranges.length < 1 || d.ranges.length > 2)) break;
      if (openingHoursError(a.hours) !== undefined) break;
      // Les 2 plages d'un jour sont rangées dans l'ordre de la journée.
      m.hours = a.hours.map((d) => ({ ...d, ranges: [...d.ranges].sort((x, y) => x.start - y.start).map((r) => ({ ...r })) }));
      finishSetupStep(m, 'horaires');
      break;
    }
    // Seuls les noms changent : la liste des postes reste celle du moteur (1 par file de l'abonnement). Les noms sont
    // enregistrés sans les espaces autour. Refus d'un poste inconnu, d'un nom vide, de 2 noms identiques ou de plus
    // de postes que de files.
    case 'managerSavePoints': {
      const m = s.manager;
      if (!m || setupStatus(m, 'postes') === 'todo') break;
      if (Object.keys(a.names).some((id) => !m.points.some((p) => p.id === id))) break;
      const points = m.points.map((p) => ({ id: p.id, name: (a.names[p.id] ?? p.name).trim() }));
      if (pointsError(points, m.files) !== undefined) break;
      m.points = points;
      finishSetupStep(m, 'postes');
      break;
    }
    // Achat simulé : la vraie page d'achat est sur le site de WaitAway (E3-0), pas dans l'application.
    // 1 file de plus dans l'abonnement, et le poste qui va avec. Le nouveau poste doit être enregistré : si Postes
    // était fait, l'étape repasse en cours, sans toucher aux autres étapes.
    // Écart au backlog (E3-0) : dans la démo, l'achat n'est possible que pendant la configuration. Une fois finie, il
    // est refusé : sinon il remettrait Postes en cours, la configuration ne serait plus finie et le saut « 1 semaine
    // plus tard » serait refusé.
    case 'managerBuyFile': {
      const m = s.manager;
      if (!m || !m.setupDone || setupFinished(m) || setupStatus(m, 'postes') === 'todo') break;
      m.files += 1;
      while (m.points.length < m.files) m.points.push(nextPoint(m.points));
      m.setupDone = m.setupDone.filter((id) => id !== 'postes');
      break;
    }
    // Catalogue du Store (E6-1) : les prestations du gérant sont validées d'office. Refus d'une prestation créée
    // invalide (nom vide, doublon, durée hors de la roulette), d'un id inconnu, d'une durée hors de la roulette,
    // d'un catalogue vide et de 2 prestations du même nom. Seules les prestations créées cochées sont gardées.
    // Écart : le catalogue du Store ne remplace pas encore `CATALOG` dans les scénarios coiffeur et client, où l'agent
    // choisit toujours dans le catalogue WaitAway.
    case 'managerSavePrestations': {
      const m = s.manager;
      if (!m || setupStatus(m, 'prestations') === 'todo') break;
      const created: Prestation[] = [];
      for (const p of a.created) {
        if (newPrestationError(p, created) !== undefined || !GROUPS.some((g) => g.id === p.group) || CATALOG.some((c) => c.id === p.id) || created.some((c) => c.id === p.id)) break;
        created.push(p);
      }
      if (created.length !== a.created.length) break;
      const known = new Set([...CATALOG, ...created].map((p) => p.id));
      if (Object.entries(a.minutes).some(([id, n]) => !known.has(id) || !validMinutes(n))) break;
      const prestations = storePrestations(created, a.minutes);
      if (storePrestationsError(prestations) !== undefined) break;
      m.created = created.filter((p) => p.id in a.minutes).map((p) => ({ ...p, label: p.label.trim(), description: p.description.trim() }));
      m.prestations = storePrestations(m.created, a.minutes);
      finishSetupStep(m, 'prestations');
      break;
    }
    // E6-1 : le gérant valide une prestation proposée par l'équipe. Elle entre dans le catalogue du Store comme une
    // prestation qu'il aurait créée (`created`, avec l'id de la proposition), retenue avec la durée proposée, réglable
    // ensuite sur l'écran Prestations comme les autres. Refus d'un id inconnu ou déjà traité, et d'un nom déjà pris
    // (`proposalError`), pour que le catalogue reste enregistrable.
    // Écart au backlog : le côté coiffeur (proposer une prestation) n'est relié à aucun scénario coiffeur. Les
    // propositions viennent du saut « 1 semaine plus tard » (`managerWeekLater`).
    case 'managerAcceptProposal': {
      const m = s.manager;
      const p = m?.proposals?.find((x) => x.id === a.id && x.state === 'en-attente');
      if (!m || !p || proposalError(p, m.created) !== undefined || m.created.some((x) => x.id === p.id)) break;
      m.created.push(proposalToPrestation(p));
      const minutes = { ...Object.fromEntries(m.prestations.map((x) => [x.id, x.minutes])), [p.id]: p.minutes };
      m.prestations = storePrestations(m.created, minutes);
      p.state = 'validee';
      break;
    }
    // E6-1 : le gérant refuse une prestation proposée par l'équipe. Refus d'un id inconnu ou déjà traité.
    // Écart au backlog : le message de refus est gardé sur la proposition, mais il n'est transmis à personne, le côté
    // coiffeur n'étant pas maquetté.
    case 'managerRejectProposal': {
      const p = s.manager?.proposals?.find((x) => x.id === a.id && x.state === 'en-attente');
      if (!p) break;
      p.state = 'refusee';
      const message = a.message?.trim();
      if (message) p.message = message;
      break;
    }
    // Invitation d'un membre de l'équipe par lien d'inscription (E3-2). Refus si `inviteError` trouve une erreur, ou
    // d'un rôle ou d'un statut inconnu. Un indépendant n'a pas de volume horaire.
    // Écart au backlog : le rôle est enregistré mais ne change encore aucun droit (E5-2). L'invitation reste en
    // attente dans la démo, sauf celle du 1er membre de l'équipe (`featuredMember`), acceptée au saut « 1 semaine plus
    // tard » (`managerWeekLater`). Elle n'est reliée à aucun autre scénario.
    case 'managerInvite': {
      const m = s.manager;
      const d = a.invite;
      if (!m || setupStatus(m, 'equipe') === 'todo') break;
      if (!['agent', 'gerant'].includes(d.role) || !['salarie', 'independant'].includes(d.status)) break;
      if (inviteError(d, m) !== undefined) break;
      let n = m.team.length + 1;
      while (m.team.some((x) => x.id === `invite-${n}`)) n++;
      m.team.push({
        id: `invite-${n}`,
        firstName: d.firstName.trim(),
        email: d.email.trim().toLowerCase(),
        role: d.role,
        status: d.status,
        ...(d.status === 'salarie' ? { hours: d.hours } : {}),
        invited: true,
      });
      break;
    }
    // Seule une invitation en attente s'annule.
    case 'managerCancelInvite': {
      const m = s.manager;
      if (!m || setupStatus(m, 'equipe') === 'todo') break;
      m.team = m.team.filter((x) => !(x.id === a.id && x.invited));
      break;
    }
    // Le gérant peut enregistrer seul : une équipe sans invitation est acceptée.
    case 'managerSaveTeam': {
      const m = s.manager;
      if (!m || setupStatus(m, 'equipe') === 'todo') break;
      finishSetupStep(m, 'equipe');
      break;
    }
    // Planning du gérant qui coiffe aussi. Refus si `managerPlanningError` trouve une erreur, chevauchement avec un
    // membre compris (E6-15). Le gérant qui ne coiffe pas n'a pas de planning : celui qu'il avait est retiré.
    // Écart au backlog : la limite aux heures d'ouverture (E6-5) ne vaut encore que pour le planning du gérant, pas
    // pour celui du coiffeur (`agent.week`).
    case 'managerSavePlanning': {
      const m = s.manager;
      if (!m || setupStatus(m, 'planning') === 'todo') break;
      if (managerPlanningError(m, a.cuts, a.planning) !== undefined) break;
      m.cuts = a.cuts;
      if (a.cuts && a.planning) m.planning = structuredClone(a.planning);
      else delete m.planning;
      finishSetupStep(m, 'planning');
      break;
    }
    // Écart au backlog (E3-3) : impression simulée, aucune fenêtre d'impression ne s'ouvre. L'affiche est seulement
    // marquée imprimée. Refus d'un id inconnu. Un poste ajouté plus tard (achat simulé d'1 file) arrive avec une
    // affiche pas encore imprimée.
    case 'managerPrint': {
      const m = s.manager;
      if (!m || setupStatus(m, 'qr') === 'todo') break;
      const ids = qrPosters(m).map((p) => p.id);
      if (a.id !== undefined && !ids.includes(a.id)) break;
      for (const id of a.id === undefined ? ids : [a.id]) if (!m.printed.includes(id)) m.printed.push(id);
      break;
    }
    // Dernière étape de la configuration : le gérant peut terminer sans avoir imprimé ses affiches.
    case 'managerFinishSetup': {
      const m = s.manager;
      if (!m || setupStatus(m, 'qr') === 'todo') break;
      finishSetupStep(m, 'qr');
      break;
    }
    // Saut « 1 semaine plus tard », refusé tant que la configuration n'est pas finie, et une seule fois. Le coiffeur
    // invité (`featuredMember`, le 1er de l'équipe) accepte son invitation, quels que soient son prénom et son e-mail.
    // L'historique figé de `WEEK_HISTORY` est copié pour les jours où le salon est ouvert : le gérant y figure s'il
    // coiffe et travaille ce jour-là (son planning), le coiffeur invité s'il existe. Les autres invitations restent en attente.
    // Écart : simulation, la semaine n'est pas jouée. L'heure et le jour simulés ne changent pas (lundi, 7 jours plus tard).
    case 'managerWeekLater': {
      const m = s.manager;
      if (!m || !setupFinished(m) || m.history) break;
      const member = featuredMember(m);
      // Le coiffeur invité a aussi envoyé son planning (`featuredPlanning`), au 1er poste : il reste à figer.
      if (member) {
        member.invited = false;
        member.planning = featuredPlanning(m.points[0]?.id);
        member.planningState = 'a-figer';
        // Il a aussi proposé 2 prestations absentes du catalogue (`FEATURED_PROPOSALS`), en attente du gérant (E6-1).
        m.proposals = FEATURED_PROPOSALS.map((p) => ({ ...p, memberId: member.id, state: 'en-attente' }));
      }
      m.history = WEEK_HISTORY.map((d) => ({
        day: d.day,
        date: d.date,
        entries: m.hours[d.day].open
          ? [
              ...(m.cuts && m.planning?.[d.day].works ? [{ who: MANAGER_WHO, ...d.gerant }] : []),
              ...(member ? [{ who: member.id, ...d.member }] : []),
            ]
          : [],
      }));
      break;
    }
    // Le gérant corrige le planning d'1 membre (E6-14), figé ou non : son état ne change pas. Refus si
    // `memberPlanningError` trouve une erreur, chevauchement compris (E6-15).
    case 'managerSaveMemberPlanning': {
      const m = s.manager;
      if (!m || !setupFinished(m)) break;
      const x = memberWithPlanning(m, a.id);
      if (!x || memberPlanningError(m, a.id, a.planning) !== undefined) break;
      x.planning = structuredClone(a.planning);
      break;
    }
    // Le planning de l'écran est enregistré puis figé. Refus d'un planning déjà figé, et si `memberPlanningError`
    // trouve une erreur : un chevauchement empêche de figer.
    // Écart au backlog (E6-14) : le côté coiffeur (un planning figé qu'il ne peut plus modifier) n'est relié à aucun
    // scénario coiffeur.
    case 'managerFreezePlanning': {
      const m = s.manager;
      if (!m || !setupFinished(m)) break;
      const x = memberWithPlanning(m, a.id);
      if (!x || x.planningState === 'fige' || memberPlanningError(m, a.id, a.planning) !== undefined) break;
      x.planning = structuredClone(a.planning);
      x.planningState = 'fige';
      break;
    }
    // Seul un planning figé se rouvre. Écart au backlog (E6-14) : le lien envoyé au membre pour qu'il modifie son
    // planning est simulé, l'écran affiche seulement qu'il est parti.
    case 'managerReopenPlanning': {
      const m = s.manager;
      if (!m || !setupFinished(m)) break;
      const x = memberWithPlanning(m, a.id);
      if (x?.planningState === 'fige') x.planningState = 'ouvert';
      break;
    }
    case 'agentSetupDone':
      s.agent.setup = 'done';
      agentFile().endOfDay = todayPlan(s).end;
      break;
    case 'openFile': {
      // La configuration confirmée ne vaut que pour aujourd'hui (S22) : la semaine type ne change pas.
      const f = agentFile();
      f.prestations = f.prestations.map((p) => ({ ...p, minutes: a.durations[p.id] ?? p.minutes }));
      f.pauses = a.pauses.filter((p) => p.on).map((p) => ({ id: p.id, plannedAt: p.at, minutes: p.minutes }));
      f.endOfDay = a.endOfDay;
      f.open = true;
      f.incident = undefined;
      // Le décompte des dépassements vaut pour 1 journée. Une suggestion sans réponse a été montrée à l'ouverture.
      f.overruns = undefined;
      f.closedAt = undefined;
      // Ouvrir sa file lance le temps.
      s.playing = true;
      break;
    }
    case 'startPause': {
      const f = agentFile();
      const p = f.pauses.find((x) => x.id === a.id);
      if (!p || p.startedAt !== undefined || runningPause(f)) break;
      beginPause(s, f, p);
      break;
    }
    case 'skipPause': {
      const p = agentFile().pauses.find((x) => x.id === a.id);
      if (p && p.startedAt === undefined) p.skipped = true;
      break;
    }
    case 'resume': {
      // queue.resumed, après le scan du QR code du poste. Repris avant l'heure prévue, la pause finit tout de suite.
      // C'est toujours le client qui démarre sa prestation (S5) : le client confirmé en position 1 voit le coiffeur
      // revenir et scanne le poste `RESUME_DELAY` min plus tard, en gagnant le temps de pause restant (QA-31).
      const f = agentFile();
      const run = runningPause(f);
      if (!run) break;
      run.endedAt = s.now;
      run.resumedAt = s.now;
      s.notifs = s.notifs.filter((n) => !(n.to === 'agent' && n.title === PAUSE_OVER));
      break;
    }
    case 'declareDelay': {
      // QA-32 : l'agent annonce un retard. La reprise est décalée de `minutes` à partir de maintenant, ou de la fin
      // prévue si elle n'est pas encore passée. À la nouvelle heure, il doit encore scanner pour reprendre.
      const f = agentFile();
      const run = runningPause(f);
      if (!run) break;
      const back = Math.max(s.now, pauseEnd(run)) + a.minutes;
      run.delay = back - run.startedAt! - run.minutes;
      run.endNotifiedAt = undefined;
      s.notifs = s.notifs.filter((n) => !(n.to === 'agent' && n.title === PAUSE_OVER));
      const mine = waiting(f).find((t) => isMine(s, t));
      if (mine)
        notify(s, 'client', `${f.agentName} reprend avec du retard`, `Reprise prévue vers ${fmt(back)}. Ton tour est estimé vers ${fmt(s.now + waitFor(f, mine.id, s.now))}.`);
      break;
    }
    case 'announceOverrun':
      announceOverrun(s, agentFile(), a.minutes);
      break;
    case 'applySuggestion': {
      // S20 : la suggestion n'est jamais appliquée seule. Acceptée ou non, le compteur de la prestation repart à zéro.
      const f = agentFile();
      const sug = durationSuggestions(f).find((x) => x.id === a.id);
      if (!sug) break;
      if (a.accept) f.prestations = f.prestations.map((p) => (p.id === a.id ? { ...p, minutes: sug.to } : p));
      delete f.overruns![a.id];
      break;
    }
    case 'incidentClose':
      closeOnIncident(s, agentFile());
      break;
    case 'decideOvertime': {
      const f = agentFile();
      const t = f.tickets.find((x) => x.id === a.ticketId);
      if (t) decideOvertime(s, f, t, a.accept);
      break;
    }
    case 'reject': {
      const f = agentFile();
      const t = f.tickets.find((x) => x.id === a.ticketId);
      if (t) rejectTicket(s, f, t, a.motif);
      break;
    }
    case 'agentStart': {
      const f = agentFile();
      const t = f.tickets.find((x) => x.id === a.ticketId);
      if (t) startTicket(s, f, t);
      break;
    }
    case 'agentConfirm': {
      // QA-27 règle 12 : l'agent voit le walk-in au salon et confirme son ticket anonyme à sa place.
      const t = agentFile().tickets.find((x) => x.id === a.ticketId);
      if (!t || t.confirmedAt !== undefined) break;
      t.confirmedAt = s.now;
      if (s.lateAlert?.ticketId === t.id) s.lateAlert = undefined;
      break;
    }
    case 'dismissLate': {
      const t = agentFile().tickets.find((x) => x.id === s.lateAlert?.ticketId);
      if (t) t.lateDecidedAt = s.now;
      s.lateAlert = undefined;
      break;
    }
    case 'walkIn': {
      // S44 : l'agent ne choisit qu'une durée. Le ticket anonyme part en fin de file. QA-27 règle 1 (16/11/2026) :
      // confirmé d'office si son tour est dans moins de 10 min, comme en S38. Sinon il est en route, et l'agent
      // confirme sa présence quand son tour approche (règle 12) : le walk-in a pu sortir du salon entre-temps.
      const f = agentFile();
      s.playing = f.open;
      if (a.startNow) {
        takePresentClient(s, f, a.minutes, f.tickets.find((x) => x.id === s.lateAlert?.ticketId), a.rejectLate);
        s.lateAlert = undefined;
        break;
      }
      const n = f.tickets.filter((t) => t.anonymous).length + 1;
      const t = mkTicket(f, `Walk-in ${n}`, [], s.now, 'ponctuel', { anonymous: true, walkIn: true, duration: a.minutes });
      f.tickets.push(t);
      if (waitFor(f, t.id, s.now) < 10) t.confirmedAt = s.now;
      break;
    }
    case 'closeFile': {
      const f = agentFile();
      if (waiting(f).length > 0) break;
      const cur = inService(f);
      if (cur && a.current === 'terminer') finish(s, f, cur);
      if (cur && a.current === 'rejeter') rejectTicket(s, f, cur, 'Fin de journée');
      f.open = false;
      f.closedAt = s.now;
      s.playing = false;
      // La session suivante repart d'une file vide.
      f.tickets = f.tickets.filter((t) => isMine(s, t));
      f.pauses = [];
      break;
    }
    case 'dropNotif':
      s.notifs = s.notifs.filter((n) => n.id !== a.id);
      break;
  }

  for (const f of s.files) if (f.open) freeze(f, s.now);
  syncClock(state, s);
  return s;
}
