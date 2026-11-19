/*
 * Rejoue les 4 scénarios du guide hors navigateur, dans plusieurs configurations, et vérifie que chaque étape
 * s'affiche. Lancer avec `npm run replay`.
 *
 * Le script joue le rôle de la personne devant l'écran. À chaque tour, il fait le geste que demande l'étape
 * en cours. S'il n'y en a pas, il touche le bouton de saut de l'étape. Sans bouton de saut, il laisse passer 1 min.
 * Il passe par `guideReducer`, comme les écrans.
 *
 * Il signale :
 * - une étape bloquée : elle ne finit pas après 12 h simulées, ou son saut ne mène nulle part ;
 * - une étape sautée : elle n'a jamais été affichée, parce que sa condition `until` était déjà vraie au moment où
 *   elle devenait l'étape en cours. Une étape marquée `canSkip` dans `scenarios.ts` ou `salon.ts` a le droit de sauter
 *   (le champ dit dans quel cas) : elle est comptée à part.
 * Code de sortie 1 s'il y a une étape bloquée ou une étape sautée sans `canSkip`.
 */
import { AGENT_FILE_ID, ANTOINE_EMAIL, h } from '../src/sim/data';
import {
  canConfirm,
  canJoin,
  canStart,
  closeDue,
  createPrestation,
  defaultPlanning,
  durationSuggestions,
  featuredMember,
  fileById,
  fmt,
  myTicket,
  nextScan,
  pauseDue,
  pauseEnd,
  pauseOverdue,
  pendingOvertime,
  qrPosters,
  runningPause,
  todayPlan,
  type InviteDraft,
} from '../src/sim/engine';
import { BARBERS } from '../src/sim/salon';
import { guideReducer, stepJump, stepText, stepsOf, type GuideAction, type Step } from '../src/sim/scenarios';
import type { ScenarioId, SimState } from '../src/sim/types';

// ---------- Configurations ----------

/** Ce que fait le coiffeur à la fin de sa pause du matin. */
type Matin = 'à l’heure' | 'scan 10 min en retard' | 'scan 25 min en retard' | 'retard de 10 min annoncé' | 'fermeture sur imprévu';

type JourneeCfg = {
  matin: Matin;
  /** Heure de fin choisie à l'ouverture de la file. */
  end: number;
  /** Réponse aux demandes de place après la fermeture (Lucas, Romain). */
  heuresSup: boolean;
  /** Théo absent : le walk-in pris à sa place le retire de la file, ou Théo garde sa place. */
  retireTheo: boolean;
  /** Dernière prestation : la terminer en fermant la file, ou attendre la notification de fin. */
  fermeture: 'terminer' | 'attendre';
};

const MATINS: Matin[] = ['à l’heure', 'scan 10 min en retard', 'scan 25 min en retard', 'retard de 10 min annoncé', 'fermeture sur imprévu'];
const ENDS = [h(19), h(20), h(21), h(22), h(23)];

function journeeConfigs(): JourneeCfg[] {
  const out: JourneeCfg[] = [];
  for (const matin of MATINS)
    for (const end of ENDS)
      for (const heuresSup of [true, false])
        for (const retireTheo of [false, true])
          for (const fermeture of ['attendre', 'terminer'] as const) out.push({ matin, end, heuresSup, retireTheo, fermeture });
  return out;
}

const journeeLabel = (c: JourneeCfg) =>
  `${c.matin}, fin ${fmt(c.end)}, ${c.heuresSup ? 'accepte' : 'refuse'} après la fermeture, ${c.retireTheo ? 'retire' : 'garde'} Théo, ${c.fermeture} la dernière prestation`;

// ---------- Gestes ----------

/**
 * L'étape telle qu'affichée : sa consigne lue dans l'état en cours (`stepText`), et son bouton de saut, absent quand
 * il est masqué (`stepJump`).
 */
type ShownStep = Omit<Step, 'text'> & { text: string };

const shownStep = (st: Step, s: SimState): ShownStep => ({ ...st, text: stepText(st, s), jump: stepJump(st, s) });

/** Un geste, ou `null` : le script touche alors le bouton de saut, ou laisse passer 1 min. */
type Gesture = (s: SimState, st: ShownStep, notes: string[]) => GuideAction | GuideAction[] | null;

const starts = (st: ShownStep, text: string) => st.text.startsWith(text);

function journeeGesture(c: JourneeCfg): Gesture {
  return (s, st, notes) => {
    const f = fileById(s, AGENT_FILE_ID);

    if (!s.agent.loggedIn) return { type: 'agentLogin', email: s.agent.email };
    // Ouverture, avec les réglages proposés par l'écran, sauf l'heure de fin.
    if (!f.open && f.closedAt === undefined && !f.incident)
      return {
        type: 'openFile',
        durations: Object.fromEntries(f.prestations.map((p) => [p.id, p.minutes])),
        pauses: todayPlan(s).pauses,
        endOfDay: c.end,
      };
    if (!f.open) {
      // File fermée : seule la suggestion de durée reste.
      if (starts(st, 'Ta file est fermée')) return durationSuggestions(f).map((x) => ({ type: 'applySuggestion', id: x.id, accept: true }));
      return null;
    }

    // Pause finie et pas reprise.
    const run = runningPause(f);
    if (run && starts(st, 'Ta pause finit dans 5 min')) {
      if (run.id !== 'matin' || c.matin === 'à l’heure') return { type: 'resume' };
      if (c.matin === 'scan 10 min en retard') return s.now >= pauseEnd(run) + 10 ? { type: 'resume' } : null;
      if (c.matin === 'scan 25 min en retard') return s.now >= pauseEnd(run) + 25 ? { type: 'resume' } : null;
      if (!pauseOverdue(f, s.now)) return null;
      if (c.matin === 'fermeture sur imprévu') return { type: 'incidentClose' };
      // Retard annoncé : à la nouvelle heure, le coiffeur scanne.
      return run.delay ? { type: 'resume' } : { type: 'declareDelay', minutes: 10 };
    }

    if (starts(st, 'Scanne le QR code de ton poste pour démarrer ta pause')) {
      const p = pauseDue(f, s.now) ?? f.pauses.find((x) => x.remindedAt !== undefined && x.startedAt === undefined && !x.skipped);
      if (p) return { type: 'startPause', id: p.id };
    }
    if (starts(st, 'Léo veut un dégradé')) return { type: 'announceOverrun', minutes: 10 };
    if (s.lateAlert && st.text.includes('prends-le en walk-in')) return { type: 'walkIn', minutes: 20, startNow: true, rejectLate: c.retireTheo };
    if (s.lateAlert && st.text.includes('retire-le')) return { type: 'reject', ticketId: s.lateAlert.ticketId, motif: 'Client absent' };
    if (starts(st, 'Un homme entre')) return { type: 'walkIn', minutes: 30 };
    const pending = pendingOvertime(f);
    if (pending.length > 0) return { type: 'decideOvertime', ticketId: pending[0].id, accept: c.heuresSup };
    if (starts(st, 'Dernière prestation')) {
      if (c.fermeture === 'terminer') return { type: 'closeFile', current: 'terminer' };
      return closeDue(f, s.now) ? { type: 'closeFile' } : null;
    }

    // Gestes que le guide ne demande pas, mais que l'écran impose : ils sont notés dans le rapport.
    if (s.lateAlert) {
      const t = f.tickets.find((x) => x.id === s.lateAlert!.ticketId);
      notes.push(`alerte de retard hors guide pour ${t?.name ?? '?'} à ${fmt(s.now)}`);
      return t?.anonymous ? { type: 'agentConfirm', ticketId: t.id } : { type: 'dismissLate' };
    }
    const due = pauseDue(f, s.now);
    if (due && !st.jump) {
      notes.push(`pause ${due.id} démarrée hors guide à ${fmt(s.now)}`);
      return { type: 'startPause', id: due.id };
    }
    if (closeDue(f, s.now) && !st.jump) {
      notes.push(`file fermée hors guide à ${fmt(s.now)}`);
      return { type: 'closeFile' };
    }
    return null;
  };
}

const compteGesture: Gesture = (s) => {
  if (!s.agent.loggedIn) return { type: 'agentLogin', email: 'antoine@salonleclos.fr' };
  if (s.agent.setup === 'profil') return { type: 'agentProfile', firstName: 'Antoine', lastName: 'Lefèvre', metier: 'Barbier' };
  if (s.agent.setup === 'prestations') return { type: 'agentPrestations', minutes: { degrade: 30, taper: 25, 'barbe-express': 10 } };
  if (s.agent.setup === 'horaires') return { type: 'agentSetupDone' };
  return null;
};

/** Un cas du scénario gérant : achat simulé d'1 file ou non, et le coiffeur invité à l'étape Équipe. */
type GerantCfg = { achat: boolean; invite: InviteDraft; inverse?: boolean };

/** Le coiffeur que propose la consigne. */
const ANTOINE: InviteDraft = { firstName: 'Antoine', email: ANTOINE_EMAIL, role: 'agent', status: 'salarie', hours: 35 };
/** Un autre coiffeur, indépendant : le scénario ne doit pas dépendre d'Antoine. */
const YANIS: InviteDraft = { firstName: 'Yanis', email: 'yanis@exemple.fr', role: 'agent', status: 'independant' };

/**
 * Le gérant vérifie les infos de son achat sans les changer, puis touche « Configurer mon salon ».
 * Aux heures d'ouverture, il règle le samedi de 9h00 à 18h00 et enregistre : le lundi est déjà fermé.
 * Aux postes, il renomme le 1er en « Fauteuil vitrine » et enregistre. Avec `achat`, il achète d'abord 1 file
 * de plus (achat simulé) et nomme le 2e poste « Fauteuil du fond ».
 * Aux prestations, il coche le dégradé, le taper fade, la coupe classique et la taille de barbe classique, crée
 * « Contour au rasoir » de 15 min dans le bloc barbe, et enregistre.
 * À l'équipe, il invite le coiffeur du cas (`invite` : Antoine, salarié à 35 h, comme le propose la consigne, ou un
 * autre) et enregistre.
 * À son planning, il garde « Je coiffe aussi » et le planning pré-rempli (1er poste, même avec 2 postes), retire le
 * mercredi et enregistre.
 * Aux QR codes, il touche « Tout imprimer », puis « Terminer la configuration ».
 * 1 semaine plus tard, il touche le saut « 1 semaine plus tard », puis ouvre son tableau de bord. Le saut est un geste
 * et non `null` : il ne valide pas l'étape seul, le rejeu le prendrait pour un saut qui ne mène nulle part.
 * Il ouvre ensuite le planning du coiffeur invité (même geste que le lien de « À traiter » ou la carte de Plannings),
 * retire son samedi, enregistre, puis fige le planning. Les étapes 9 à 11 commencent par son prénom : elles sont
 * reconnues à la suite du texte.
 * Enfin, il ouvre l'écran Prestations depuis « À traiter », valide « Contour de barbe au fil » et refuse « Coloration
 * de barbe » avec un message. Avec `inverse`, il fait les choix inverses : la consigne n'est qu'une suggestion.
 */
function gerantGesture({ achat, invite, inverse }: GerantCfg): Gesture {
  return (s, st) => {
    const m = s.manager;
    if (!m) return null;
    if (m.setupDone === undefined) return { type: 'managerStartSetup' };
    if (starts(st, 'Règle les heures d’ouverture'))
      return {
        type: 'managerSaveHours',
        hours: m.hours.map((d) => (d.day === 5 ? { ...d, open: true, ranges: [{ start: h(9), end: h(18) }] } : d)),
      };
    if (starts(st, 'Nomme le poste de ton abonnement')) {
      if (achat && m.points.length < 2) return { type: 'managerBuyFile' };
      const names = ['Fauteuil vitrine', 'Fauteuil du fond'];
      return { type: 'managerSavePoints', names: Object.fromEntries(m.points.map((p, i) => [p.id, names[i] ?? p.name])) };
    }
    if (starts(st, 'Choisis les prestations de ton salon')) {
      const contour = createPrestation({ label: 'Contour au rasoir', group: 'barbe', minutes: 15, description: '' }, m.created);
      const minutes = { degrade: 30, taper: 30, classique: 25, 'barbe-classique': 30, [contour.id]: contour.minutes };
      return { type: 'managerSavePrestations', created: [...m.created, contour], minutes };
    }
    if (starts(st, 'Invite Antoine,')) {
      if (!m.team.some((x) => x.email === invite.email)) return { type: 'managerInvite', invite };
      return { type: 'managerSaveTeam' };
    }
    if (starts(st, 'Tu coiffes aussi, sauf le mercredi')) {
      const planning = (m.planning ?? defaultPlanning(m)).map((d) => (d.day === 2 ? { ...d, works: false } : d));
      return { type: 'managerSavePlanning', cuts: true, planning };
    }
    if (starts(st, 'Imprime toutes les affiches')) {
      if (qrPosters(m).some((p) => !m.printed.includes(p.id))) return { type: 'managerPrint' };
      return { type: 'managerFinishSetup' };
    }
    if (starts(st, '1 semaine a passé')) return m.history ? { type: 'managerOpen', step: 'dashboard' } : { type: 'jump' };
    const x = featuredMember(m);
    if (st.text.includes(' a envoyé son planning.') && x) return { type: 'managerOpen', step: 'member-planning', member: x.id };
    if (starts(st, 'Le samedi, ') && st.text.includes(' est sur ton poste en même temps que toi.') && x?.planning) {
      if (x.planning[5].works) {
        const planning = x.planning.map((d) => (d.day === 5 ? { ...d, works: false } : d));
        return { type: 'managerSaveMemberPlanning', id: x.id, planning };
      }
      return { type: 'managerFreezePlanning', id: x.id, planning: x.planning };
    }
    if (st.text.endsWith(' propose 2 prestations. Valide «\u00a0Contour de barbe au fil\u00a0» et refuse «\u00a0Coloration de barbe\u00a0».')) {
      if (m.view !== 'prestations') return { type: 'managerOpen', step: 'prestations', from: 'dashboard' };
      const pending = (label: string) => m.proposals?.find((p) => p.label === label && p.state === 'en-attente');
      const [accepted, rejected] = inverse ? ['Coloration de barbe', 'Contour de barbe au fil'] : ['Contour de barbe au fil', 'Coloration de barbe'];
      const accept = pending(accepted);
      if (accept) return { type: 'managerAcceptProposal', id: accept.id };
      const reject = pending(rejected);
      if (reject) return { type: 'managerRejectProposal', id: reject.id, message: inverse ? 'Pas de fil au salon.' : 'Pas de coloration au salon.' };
    }
    return null;
  };
}

/** Le client choisit la 1re prestation que l'écran accepte. */
function firstAllowed(s: SimState, fileId: string): string[] {
  const f = fileById(s, fileId);
  const p = f.prestations.find((x) => canJoin(s, fileId, [x.id]) === null);
  return [p?.id ?? f.prestations[0].id];
}

function clientGesture(barberId: string): Gesture {
  return (s, st) => {
    // Une étape avec un bouton de saut est une étape d'attente : on saute.
    if (st.jump) return null;
    const nav = s.clientNav;
    const mine = myTicket(s);

    if (nav.screen === 'home') {
      if (s.me.walkIn) return { type: 'nav', nav: { screen: 'choose', fileId: s.me.walkIn.fileId, claim: true } };
      if (!s.scenario.branch) return { type: 'nav', nav: { screen: 'store' } };
    }
    if (nav.screen === 'store' && !s.scenario.branch) return { type: 'nav', nav: { screen: 'choose', fileId: barberId } };
    if (nav.screen === 'choose' && !mine) {
      const ids = firstAllowed(s, nav.fileId);
      const claim = nav.claim ? { claim: true as const } : {};
      if (!s.me.firstName) return { type: 'nav', nav: { screen: 'signup', fileId: nav.fileId, prestationIds: ids, ...claim } };
      return nav.claim ? { type: 'claim', prestationIds: ids } : { type: 'join', fileId: nav.fileId, prestationIds: ids };
    }
    if (nav.screen === 'signup')
      return [
        { type: 'signup', firstName: 'Sam', lastName: 'Martin', email: 'sam@exemple.fr' },
        nav.claim ? { type: 'claim', prestationIds: nav.prestationIds } : { type: 'join', fileId: nav.fileId, prestationIds: nav.prestationIds },
      ];
    if (nav.screen === 'joined') return [{ type: 'setReminder', minutes: s.me.reminderMinutes }, { type: 'nav', nav: { screen: 'account' } }];
    if (nav.screen === 'confirmed') return { type: 'nav', nav: { screen: 'account' } };

    if (!mine) return null;
    const t = mine.ticket;
    if (t.abortAt !== undefined) return { type: 'clearMyTicket' };
    if (t.doneAt !== undefined) return t.rating === undefined ? { type: 'rate', stars: 5, comment: 'Top' } : null;
    const target = nextScan(s);
    if (target === 'confirm' && canConfirm(mine.file, t.id, s.now) === null) return { type: 'confirm' };
    if (target === 'start' && canStart(mine.file, t.id, s.now) === null) return { type: 'clientStart' };
    return null;
  };
}

// ---------- Rejeu ----------

type Run = {
  scenario: ScenarioId;
  label: string;
  /** Clé de chaque étape affichée : `branche:index`. */
  shown: Set<string>;
  /** Les étapes du scénario, à la fin du rejeu. */
  steps: Step[];
  /** L'état à la fin du rejeu, pour lire les consignes qui en dépendent. */
  final: SimState;
  branch: string;
  /** Index au-delà duquel les étapes ne comptent pas : le scénario s'est arrêté avant (fermeture sur imprévu). */
  stopAt: number;
  blocked?: string;
  notes: string[];
  endedAt: number;
};

const MAX_TURNS = 20000;
/** `npm run replay -- --detail` : les sauts autorisés, et tous les cas où chaque étape a sauté. */
const DETAIL = process.argv.includes('--detail');
/** 12 h simulées sur la même étape : elle est bloquée. */
const MAX_STALL = 720;

function play(scenario: ScenarioId, label: string, gesture: Gesture): Run {
  let s = guideReducer(undefined as unknown as SimState, { type: 'scenario', id: scenario });
  const key = (x: SimState) => `${x.scenario.branch ?? ''}:${x.scenario.beat}`;
  const shown = new Set([key(s)]);
  const notes: string[] = [];
  let stallSince = s.now;
  let lastKey = key(s);
  let blocked: string | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const steps = stepsOf(s);
    if (s.scenario.beat >= steps.length) break;
    const st = shownStep(steps[s.scenario.beat], s);
    const g = gesture(s, st, notes);
    const actions: GuideAction[] = g === null ? [st.jump ? { type: 'jump' } : { type: 'advance', minutes: 1 }] : Array.isArray(g) ? g : [g];
    const before = key(s);
    for (const a of actions) s = guideReducer(s, a);
    shown.add(key(s));

    if (key(s) !== lastKey) {
      lastKey = key(s);
      stallSince = s.now;
      continue;
    }
    const why = g === null && st.jump ? `le saut « ${st.jump} » ne valide pas l’étape` : s.now - stallSince >= MAX_STALL ? '12 h simulées sans finir' : null;
    if (why && key(s) === before) {
      blocked = `étape ${s.scenario.beat} « ${st.text.slice(0, 70)} » : ${why} (${fmt(s.now)})`;
      break;
    }
  }

  const steps = stepsOf(s);
  const incident = scenario === 'pro-journee' && fileById(s, AGENT_FILE_ID).incident !== undefined;
  // Fermeture sur imprévu : le guide passe d'un coup à la fin, les étapes restantes n'ont pas à s'afficher.
  // Étape la plus avancée affichée avant l'arrêt du guide.
  const lastShown = Math.max(
    ...[...shown]
      .filter((k) => k.startsWith(`${s.scenario.branch ?? ''}:`))
      .map((k) => Number(k.split(':')[1]))
      .filter((i) => i < steps.length),
  );
  const stopAt = incident ? lastShown : steps.length;
  if (!blocked && s.scenario.beat < steps.length) blocked = `le rejeu s’arrête à l’étape ${s.scenario.beat} après ${MAX_TURNS} tours`;
  return { scenario, label, shown, steps, final: s, branch: s.scenario.branch ?? '', stopAt, blocked, notes, endedAt: s.now };
}

/** Les étapes jamais affichées. Pour le scénario client, les étapes du préfixe ont la clé de branche vide. */
function skipped(r: Run): { index: number; step: Step }[] {
  const out: { index: number; step: Step }[] = [];
  // Un cas bloqué n'a pas affiché la suite : elle n'est pas comptée comme sautée.
  if (r.blocked) return out;
  r.steps.forEach((step, index) => {
    if (index >= r.stopAt) return;
    if (r.shown.has(`${r.branch}:${index}`) || r.shown.has(`:${index}`)) return;
    out.push({ index, step });
  });
  return out;
}

// ---------- Rapport ----------

function report(title: string, runs: Run[]): boolean {
  const blocked = runs.filter((r) => r.blocked);
  // Étape sautée → les cas où elle a sauté.
  const bySkip = new Map<string, { step: Step; text: string; index: number; labels: string[] }>();
  for (const r of runs)
    for (const { index, step } of skipped(r)) {
      const k = `${r.branch}#${index}`;
      const e = bySkip.get(k) ?? { step, text: stepText(step, r.final), index, labels: [] };
      e.labels.push(r.label);
      bySkip.set(k, e);
    }
  const unexpected = [...bySkip.values()].filter((e) => !e.step.canSkip);
  const expected = [...bySkip.values()].filter((e) => e.step.canSkip);
  const notes = new Map<string, number>();
  for (const r of runs)
    for (const n of r.notes) {
      // Une note par geste, sans son heure : on compte les cas.
      const k = n.replace(/ à \d+:\d+$/, '');
      notes.set(k, (notes.get(k) ?? 0) + 1);
    }

  const ok = blocked.length === 0 && unexpected.length === 0;
  const total = runs[0]?.steps.length ?? 0;
  console.log(`\n${ok ? '✓' : '✗'} ${title} : ${runs.length - blocked.length}/${runs.length} cas terminés${runs.length === 1 ? `, ${total} étapes` : ''}`);
  for (const r of blocked) console.log(`  BLOQUÉ  ${r.label}\n          ${r.blocked}`);
  const show = (e: { text: string; index: number; labels: string[] }) =>
    `étape ${e.index} « ${e.text.slice(0, 70)} » : ${e.labels.length}/${runs.length} cas` +
    (DETAIL ? e.labels.map((l) => `\n            ${l}`).join('') : e.labels.length <= 3 ? ` (${e.labels.join(' | ')})` : `, dont : ${e.labels[0]}`);
  for (const e of unexpected) console.log(`  SAUTÉE  ${show(e)}`);
  if (DETAIL) for (const e of expected) console.log(`  sautée, autorisé (${e.step.canSkip})  ${show(e)}`);
  else if (expected.length > 0) console.log(`  ${expected.length} étape(s) sautée(s) dans les cas prévus par \`canSkip\` (--detail pour la liste)`);
  for (const [n, count] of notes) console.log(`  note    ${n} : ${count} cas`);
  return ok;
}

const journee = journeeConfigs().map((c) => play('pro-journee', journeeLabel(c), journeeGesture(c)));
// Pas de sortie terminée sans prestation : chaque branche du scénario client est rejouée seule.
const client = BARBERS.map((b) => play('client', `${b.name} (${b.tag})`, clientGesture(b.id)));
const compte = [play('pro-compte', 'création du compte', compteGesture)];
const gerant = [
  play('gerant', 'installation du salon, 1 poste', gerantGesture({ achat: false, invite: ANTOINE })),
  play('gerant', 'installation du salon, achat simulé d’1 file, 2 postes', gerantGesture({ achat: true, invite: ANTOINE })),
  play('gerant', 'installation du salon, 1 poste, Yanis invité, indépendant', gerantGesture({ achat: false, invite: YANIS })),
  play('gerant', 'installation du salon, 1 poste, choix inverses sur les prestations proposées', gerantGesture({ achat: false, invite: ANTOINE, inverse: true })),
];

const results = [
  report('Coiffeur : ma journée', journee),
  ...BARBERS.map((b, i) => report(`Client : ${b.name}, ${b.tag}`, [client[i]])),
  report('Coiffeur : je crée mon compte', compte),
  report('Gérant : j’installe mon salon', gerant),
];
const failed = results.filter((x) => !x).length;
console.log(failed === 0 ? '\nTout passe.' : `\n${failed} scénario(s) à corriger.`);
process.exit(failed === 0 ? 0 : 1);
