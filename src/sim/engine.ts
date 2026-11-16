import { CATALOG } from './catalog';
import { AGENT_FILE_ID, PAUSE_LABEL, mkTicket } from './data';
import type { AgentEvent, ClientNav, DayPlan, Pause, PauseId, PausePlan, QueueFile, SimState, Ticket } from './types';

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

/** Minutes restantes sur la durée estimée de la prestation en cours (négatif = dépassement). Pour l'écran du coiffeur. */
export const remainingRaw = (f: QueueFile, now: number) => {
  const t = inService(f);
  return t ? t.startedAt! + t.duration - now : 0;
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

/**
 * Ce que fait le bouton Scan du client. Dans la vraie application, c'est le QR code scanné qui décide.
 * La maquette n'a pas de caméra : elle choisit le QR code attendu selon l'état du ticket.
 */
export function nextScan(s: SimState): 'store' | 'confirm' | 'start' {
  const m = myTicket(s);
  if (!m || m.ticket.startedAt !== undefined || m.ticket.abortAt !== undefined) return 'store';
  if (m.ticket.confirmedAt === undefined) return 'confirm';
  return position(m.file, m.ticket.id) === 1 ? 'start' : 'confirm';
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
  if (rem >= 15) return `${f.agentName} termine encore avec un client. Réessaie dans ${rem - 14} min.`;
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
  | { type: 'rate'; stars?: number; comment?: string }
  | { type: 'clearMyTicket' }
  | { type: 'setReminder'; minutes: number }
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
  | { type: 'dropNotif'; id: number };

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
    if (isMine(s, t)) notify(s, 'client', `${f.agentName} a accepté`, 'Tu as ta place dans la file. Patiente dans le salon.');
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
    const t = mkTicket(f, a.name, a.prestationIds, s.now, a.behavior);
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

    // Rappel : notify.presence
    if (isMine(s, t) && t.confirmedAt === undefined && t.remindedAt === undefined && wait <= s.me.reminderMinutes) {
      t.remindedAt = s.now;
      notify(s, 'client', 'Ton tour approche', `Encore ${wait} min environ. Reviens au salon et touche Scan.`);
    }

    // Retardataire : customer.late, seulement chez l'agent (S37)
    if (i === 0 && f.id === AGENT_FILE_ID && t.confirmedAt === undefined && t.lateNotifiedAt === undefined && wait < 10) {
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
    case 'setReminder':
      s.me.reminderMinutes = a.minutes;
      break;
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
      f.tickets.push(t);
      s.me.ticketRef = { fileId: f.id, ticketId: t.id };
      s.clientNav = { screen: 'joined' };
      break;
    }
    case 'confirm': {
      const m = myTicket(s);
      if (m) m.ticket.confirmedAt ??= s.now;
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
      s.me.walkIn = undefined;
      s.me.ticketRef = { fileId: f.id, ticketId: t.id };
      s.clientNav = { screen: 'joined' };
      break;
    }
    case 'rate': {
      // Sans note : le client a choisi « Plus tard ».
      const m = myTicket(s);
      if (!m || m.ticket.doneAt === undefined || m.ticket.rating !== undefined) break;
      m.ticket.rating = a.stars ? { stars: a.stars, comment: a.comment?.trim() || undefined, at: s.now } : 'skipped';
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
