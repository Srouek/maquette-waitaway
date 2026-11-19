// Vocabulaire : docs/02-GLOSSAIRE.md de QueueAPI.

export type Group = 'coupe' | 'barbe' | 'soin' | 'autre';

export type Prestation = { id: string; label: string; minutes: number; group: Group; description: string };

/** Comment le client simulé se comporte. `moi` = le client qui tient le téléphone. */
/** `retard` : confirme 8 min après l'alerte. `absent` : ne vient jamais. */
export type Behavior = 'moi' | 'ponctuel' | 'retard' | 'absent';

export type Ticket = {
  id: string;
  seq: number;
  name: string;
  /** Vide pour un walk-in : l'agent ne choisit qu'une durée (S44). */
  prestationIds: string[];
  /** Durée en minutes, fixée par les durées de l'agent (QA-18). */
  duration: number;
  joinedAt: number;
  behavior: Behavior;
  anonymous?: boolean;
  /** Ticket créé par l'agent pour un client entré sans scanner. Reste vrai après le rattachement. */
  walkIn?: boolean;
  /** Inscription qui finirait après la fermeture : en attente de la réponse de l'agent, puis acceptée ou refusée. */
  overtime?: 'pending' | 'accepted' | 'refused';
  /** Le walk-in a scanné le QR code de son ticket : il a maintenant un nom et des prestations (QA-27). */
  claimedAt?: number;
  confirmedAt?: number;
  /** Attente estimée à l'inscription du client, en minutes : le cercle du ticket est plein à cette valeur. Hors backlog. */
  joinWait?: number;
  /** Rappel choisi par le client, en min avant son tour : un simple « mets-toi en route ». Absent : pas de rappel. */
  reminder?: number;
  remindedAt?: number;
  /** Invitation à confirmer sa présence, 10 min avant son tour. Le re-scan du salon n'est accepté qu'à partir d'elle. */
  invitedAt?: number;
  calledAt?: number;
  lateNotifiedAt?: number;
  /** Dernière décision de l'agent sur ce retard (attendre, prendre quelqu'un d'autre). */
  lateDecidedAt?: number;
  startedAt?: number;
  /** Simulation seulement : minutes que la prestation dure réellement en plus de sa durée estimée. */
  extra?: number;
  /** Minutes ajoutées à la durée estimée : par tranches de 5 min constatées, ou annoncées par l'agent (`service.overrun`). */
  overrun?: number;
  /** Heure de passage estimée, telle que le client la connaît. Sert à le prévenir quand son tour avance. */
  eta?: number;
  doneAt?: number;
  /** Avis du client sur sa prestation, ou `skipped` s'il a choisi « Plus tard ». Hors backlog (16/11/2026). */
  rating?: Rating | 'skipped';
  abortAt?: number;
  abortReason?: 'self' | 'rejected_by_agent' | 'incident';
  rejectMotif?: string;
};

/** Avis du client. Il garde ce qu'il note : le salon, le coiffeur et la coupe. Hors backlog, QA-34. */
export type Rating = {
  stars: number;
  comment?: string;
  /** Simulation : seul le fait qu'une photo est jointe est gardé, pas l'image. */
  photo?: boolean;
  store: string;
  agentName: string;
  prestations: string[];
  at: number;
};

export type PauseId = 'matin' | 'midi' | 'aprem';

/** Pause telle que l'agent la règle : dans sa semaine type, puis à l'ouverture de sa file. */
export type PausePlan = { id: PauseId; on: boolean; at: number; minutes: number };

/** Pause de la journée en cours. */
export type Pause = {
  id: PauseId;
  /** Heure souhaitée, en minutes depuis minuit. */
  plannedAt: number;
  minutes: number;
  remindedAt?: number;
  startedAt?: number;
  /** Fin de la pause : l'agent a scanné le QR code de son poste pour reprendre. */
  endedAt?: number;
  /** L'heure de fin est passée et l'agent a été prévenu qu'il doit scanner pour reprendre. */
  endNotifiedAt?: number;
  /** Heure du scan de reprise de l'agent. Absente quand la pause a fini seule (personne ne joue le coiffeur). */
  resumedAt?: number;
  /** Minutes de retard annoncées par l'agent : elles repoussent la fin de la pause. */
  delay?: number;
  skipped?: boolean;
  /** Ticket devant lequel la pause a été placée. Une fois posé, ce choix ne bouge plus. */
  beforeTicketId?: string;
};

/** 1 jour de la semaine type. `day` : 0 = lundi. */
export type DayPlan = { day: number; works: boolean; start: number; end: number; pauses: PausePlan[] };

/** 1 jour du planning du gérant quand il coiffe aussi : son jour type, et le poste (`DistributionPoint.id`) où il travaille. */
export type PlannedDay = DayPlan & { point?: string };

export type QueueFile = {
  id: string;
  agentName: string;
  metier: string;
  prestations: Prestation[];
  pauses: Pause[];
  open: boolean;
  /** Fin de journée, en minutes depuis minuit. */
  endOfDay: number;
  closedAt?: number;
  /** Heure de la notification « Plus personne n'attend » qui invite l'agent à fermer sa file. */
  closeHintAt?: number;
  /** La file a été fermée sur incident (QA-33), pas en fin de journée. */
  incident?: boolean;
  tickets: Ticket[];
  /** Démo : le cas que montre ce coiffeur, affiché sous son nom dans l'écran du salon. */
  demoTag?: string;
  /** Les demandes d'inscription après la fermeture passent par ce coiffeur (en plus de celui du téléphone). */
  decidesOvertime?: boolean;
  /** Dépassements de la journée, par prestation (S20). */
  overruns?: Record<string, number>;
};

/** Compte de l'agent qui tient la vue « Coiffeur ». */
export type AgentAccount = {
  loggedIn: boolean;
  /** Étape de création du compte. `done` : le compte est prêt. */
  setup: 'profil' | 'prestations' | 'horaires' | 'done';
  email: string;
  firstName: string;
  lastName: string;
  week: DayPlan[];
};

export type Notif = {
  id: number;
  to: 'client' | 'agent';
  title: string;
  body: string;
};

export type ClientNav =
  | { screen: 'home' }
  | { screen: 'store' }
  | { screen: 'choose'; fileId: string; preselect?: string[]; tried?: boolean; claim?: true }
  | { screen: 'signup'; fileId: string; prestationIds: string[]; claim?: true }
  | { screen: 'joined' }
  | { screen: 'account' }
  | { screen: 'confirmed' };

/** Inscription d'un client simulé, prévue par le scénario. */
export type Arrival = {
  fileId: string;
  name: string;
  prestationIds: string[];
  behavior: Behavior;
  /** Heure d'inscription. */
  at?: number;
  /** Ou : minutes avant la fin de journée de la file. */
  beforeEnd?: number;
  /** L'arrivée n'a lieu que si la fin de journée de la file est à cette heure ou plus tard. */
  minEnd?: number;
  /** Simulation seulement : minutes que sa prestation durera en plus de sa durée estimée (voir `Ticket.extra`). */
  extra?: number;
};

/**
 * Geste d'un coiffeur simulé. En données, pas en fonction : l'état est sauvegardé en JSON.
 * Il part à l'heure `at`, ou `afterMyTurn` min après que le ticket du client est en position 1, poste libre, sans confirmation.
 */
export type AgentEvent = {
  fileId: string;
  at?: number;
  afterMyTurn?: number;
  /** Heure où la condition de `afterMyTurn` est devenue vraie. */
  armedAt?: number;
  /** `leave` : le client `name` quitte la file. `announce` : retard de `minutes` annoncé sur la prestation en cours.
   * `incident` : fermeture de la file sur imprévu. `replaceMine` : l'agent prend un client présent et retire le ticket du client. */
  do: 'leave' | 'announce' | 'incident' | 'replaceMine';
  name?: string;
  minutes?: number;
};

export type ScenarioId = 'pro-journee' | 'client' | 'pro-compte' | 'gerant';

/** Étape de la configuration du Store par le gérant, dans l'ordre de `SETUP_STEPS` (`data.ts`). */
export type SetupStepId = 'horaires' | 'postes' | 'prestations' | 'equipe' | 'planning' | 'qr';

export type SetupStatus = 'todo' | 'doing' | 'done';

/**
 * Écran du gérant : celui d'une étape de la configuration (en cours ou faite), ou, une fois la configuration finie, le
 * tableau de bord, les plannings de l'équipe ou le planning d'1 membre (`member-planning`, membre dans
 * `Manager.memberId`). Le menu « Équipe » ouvre l'écran de l'étape Équipe ; « Mon salon » est la page de
 * configuration, sans vue (`Manager.view` absent).
 */
export type ManagerView = SetupStepId | 'dashboard' | 'plannings' | 'member-planning';

/**
 * État du planning d'un membre, vu par le gérant (E6-14) : envoyé par le coiffeur et à figer, figé (le coiffeur ne le
 * modifie plus), ou rouvert par le gérant pour que le coiffeur le modifie.
 */
export type PlanningState = 'a-figer' | 'fige' | 'ouvert';

/** Chiffres d'1 coiffeur sur 1 jour : clients servis, somme de leurs attentes en minutes, tickets clôturés sur incident. */
export type DayFigures = { served: number; waitMinutes: number; incidents: number };

/**
 * 1 jour de l'historique du tableau de bord. `day` : 0 = lundi, `date` : jour du mois. 1 ligne par coiffeur qui a
 * travaillé ce jour-là : `who` vaut `gerant` pour le gérant, sinon l'id du membre de l'équipe (`TeamMember.id`).
 * Un jour où le salon était fermé n'a pas de ligne.
 */
export type HistoryDay = { day: number; date: number; entries: (DayFigures & { who: string })[] };

/** 1 plage d'ouverture, en minutes depuis minuit (comme `h()` de `data.ts`). */
export type OpeningRange = { start: number; end: number };

/**
 * Heures d'ouverture d'1 jour du Store. Forme choisie pour la maquette : 1 plage, ou 2 quand le salon ferme le midi.
 * Un jour fermé garde ses plages, pour les retrouver s'il rouvre.
 */
export type OpeningDay = {
  /** 0 = lundi, comme `DAYS` de `data.ts`. */
  day: number;
  open: boolean;
  ranges: OpeningRange[];
};

/** 1 point de distribution du Store (« poste » à l'écran). 1 point de distribution = 1 file de l'abonnement. */
export type DistributionPoint = { id: string; name: string };

/**
 * 1 membre de l'équipe du Store, invité par le gérant (E3-2). Le gérant lui-même n'y est pas : il vient de `Manager`.
 * `hours` : volume horaire hebdomadaire déclaré, pour un salarié seulement (E6-13).
 */
export type TeamMember = {
  id: string;
  firstName: string;
  email: string;
  role: 'agent' | 'gerant';
  status: 'salarie' | 'independant';
  hours?: number;
  /**
   * Invitation envoyée, pas encore acceptée. Le coiffeur invité du scénario (`featuredMember`, le 1er de l'équipe)
   * l'accepte au saut « 1 semaine plus tard » (`managerWeekLater`).
   */
  invited: boolean;
  /**
   * Planning envoyé par le membre, du lundi au dimanche. Le poste de chaque jour est un `DistributionPoint.id`.
   * Absent tant que le membre n'a rien envoyé : dans la démo, seul le coiffeur invité du scénario (`featuredMember`)
   * en a un, au saut « 1 semaine plus tard ».
   */
  planning?: PlannedDay[];
  /** État de ce planning. Absent sans planning. */
  planningState?: PlanningState;
};

/**
 * Prestation proposée au gérant par 1 membre de l'équipe (`memberId` : `TeamMember.id`), avec sa durée. En attente
 * jusqu'à ce que le gérant la valide ou la refuse. `message` : le mot facultatif du gérant au refus.
 */
export type Proposal = {
  id: string;
  label: string;
  group: Group;
  minutes: number;
  memberId: string;
  state: 'en-attente' | 'validee' | 'refusee';
  message?: string;
};

/**
 * Le gérant : un agent avec le rôle Gérant sur 1 Store. Son compte et son Store sont créés au paiement de
 * l'abonnement, sur le site de WaitAway. Backlog : stories E3-0 (achat, ajoutée le 18/11, sans ticket Notion encore)
 * et E3-1 (configuration du Store, passée au gérant le 18/11, ticket QA-11).
 */
export type Manager = {
  firstName: string;
  lastName: string;
  email: string;
  store: { name: string; address: string };
  /** Nombre de files de l'abonnement. */
  files: number;
  /**
   * Étapes de configuration enregistrées. Absent : la configuration n'a pas commencé. L'étape en cours est la 1re
   * qui n'y est pas. Une étape peut repasser en cours après coup (Postes, après l'achat d'1 file) sans que les
   * étapes faites après elle le perdent. Les 6 étapes dedans : tout est fait.
   */
  setupDone?: SetupStepId[];
  /** Écran affiché : une étape en cours ou déjà faite, ou un écran du menu. Absent : la page de configuration (Bienvenue). */
  view?: ManagerView;
  /** Le membre dont le planning est affiché, quand `view` vaut `member-planning` (`TeamMember.id`). */
  memberId?: string;
  /**
   * L'écran d'où `view` a été ouvert, quand ce n'est pas la page de configuration : Plannings, pour Ton planning ouvert
   * depuis la carte du gérant, ou le tableau de bord, pour Prestations ou le planning d'1 membre ouverts depuis
   * « À traiter ». Retour et l'enregistrement y ramènent, et le menu le met en avant. Absent : Retour ramène à la page
   * de configuration, ou à Plannings pour le planning d'1 membre.
   */
  from?: 'plannings' | 'dashboard';
  /** Heures d'ouverture du Store, du lundi au dimanche. Pré-remplies : elles ne comptent qu'une fois enregistrées. */
  hours: OpeningDay[];
  /**
   * Points de distribution du Store, jamais plus que `files`. Créés d'après l'abonnement, ou ajoutés par l'achat
   * d'1 file : ils ne comptent qu'une fois enregistrés.
   */
  points: DistributionPoint[];
  /**
   * Catalogue du Store (E6-1), dans lequel les agents choisiront leurs prestations. Forme choisie pour la maquette :
   * les prestations retenues par le gérant, chacune avec sa durée indicative (`minutes`), celle proposée aux agents,
   * qui règlent ensuite la leur. Vide tant que l'étape Prestations n'est pas enregistrée.
   */
  prestations: Prestation[];
  /**
   * Prestations créées par le gérant en plus du catalogue WaitAway (`CATALOG`), retenues ou non. Une proposition de
   * l'équipe validée y entre aussi, avec l'id de la proposition.
   */
  created: Prestation[];
  /**
   * Prestations proposées par l'équipe (E6-1), absentes du catalogue WaitAway. Absent tant que personne n'a rien
   * proposé : dans la démo, le coiffeur invité du scénario (`featuredMember`) en propose 2 au saut « 1 semaine plus tard ».
   */
  proposals?: Proposal[];
  /** Les membres invités, dans l'ordre d'invitation. Le gérant n'y est pas : l'écran l'affiche d'après son compte. */
  team: TeamMember[];
  /** Le gérant coiffe aussi : il a un planning, comme un agent. Vrai au départ. */
  cuts: boolean;
  /**
   * Planning du gérant (glossaire : Planning), du lundi au dimanche. Absent tant que l'étape Ton planning n'est pas
   * enregistrée, ou quand le gérant ne coiffe pas.
   */
  planning?: PlannedDay[];
  /**
   * Affiches des QR codes déjà imprimées (impression simulée) : « boutique » pour le QR Boutique, et l'id du poste
   * pour chaque QR File/Station. Un poste ajouté après coup a une affiche pas encore imprimée.
   */
  printed: string[];
  /**
   * Les 7 derniers jours du salon, pour le tableau de bord (E3-5). Absent tant que le gérant n'a pas fait le saut
   * « 1 semaine plus tard » : le tableau de bord est alors vide. Historique inventé (`WEEK_HISTORY` de `data.ts`).
   */
  history?: HistoryDay[];
};

export type SimState = {
  /** Heure simulée, en minutes depuis minuit. */
  now: number;
  /** Jour simulé. 0 = lundi. */
  weekday: number;
  files: QueueFile[];
  agent: AgentAccount;
  /** Le gérant, dans le scénario « Gérant : j'installe mon salon » seulement. */
  manager?: Manager;
  me: {
    firstName?: string;
    lastName?: string;
    email?: string;
    favorites: string[];
    reminderMinutes: number;
    ticketRef?: { fileId: string; ticketId: string };
    /** Le client est un walk-in : l'agent lui a créé ce ticket anonyme, il n'a pas encore scanné son QR code (QA-27). */
    walkIn?: { fileId: string; ticketId: string };
  };
  clientNav: ClientNav;
  notifs: Notif[];
  /** Ticket signalé par `customer.late`, en attente d'une décision de l'agent. */
  lateAlert?: { fileId: string; ticketId: string };
  /** Inscriptions à venir. */
  script: Arrival[];
  /** Rattachement prévu par le scénario : le walk-in qui attend depuis `after` min s'inscrit dans l'application. */
  claim?: { after: number; name: string; prestationIds: string[] };
  /** Ce que font les coiffeurs que personne ne joue, dans les scénarios client. */
  agentEvents?: AgentEvent[];
  /** Vrai quand personne ne tient le téléphone du coiffeur : il prend ses pauses seul. */
  autoAgent: boolean;
  /** Scénario en cours et étape du guide. `branch` : le coiffeur choisi dans le scénario client, qui décide du cas joué. */
  scenario: { id: ScenarioId; beat: number; branch?: string };
  nextId: number;
  playing: boolean;
};
