import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { CATALOG, GROUPS } from '../sim/catalog';
import { DAYS, SETUP_STEPS } from '../sim/data';
import {
  BOUTIQUE_POSTER,
  PRESTATION_MINUTES,
  TEAM_HOURS,
  copyOpeningRanges,
  createPrestation,
  currentSetupStep,
  dashboard,
  defaultPlanning,
  fileBoughtText,
  fmt,
  inviteError,
  managerEmailError,
  inviteLink,
  managerPlanningError,
  memberPlanningError,
  newPrestationError,
  openingDayError,
  openingSpan,
  overlapText,
  pendingProposals,
  proposalError,
  proposalToPrestation,
  planningDayError,
  planningOverlaps,
  MANAGER_WHO,
  pointsError,
  qrPosters,
  pointsLimitText,
  secondOpeningRange,
  setupFinished,
  setupStatus,
  storePrestations,
  storePrestationsError,
  teamStatusText,
  volumeText,
  volumeWarning,
  weekHours,
  weekHoursText,
  type InviteDraft,
  type InviteError,
  type PrestationDraft,
} from '../sim/engine';
import { useSim } from '../sim/store';
import type { Manager, ManagerView, OpeningDay, PlannedDay, PlanningState, Prestation, Proposal, SetupStatus, SetupStepId, TeamMember } from '../sim/types';
import { DayEditor } from '../agent/Onboarding';
import { byGroup } from '../agent/OpenWizard';
import { CrossIcon, PencilIcon, PrestationIcon } from '../ui/icons';
import { DurationWheel, QrFake, Sheet, Stepper, TimeWheel } from '../ui/kit';

const STATUS_LABEL: Record<SetupStatus, string> = { todo: 'À faire', doing: 'En cours', done: 'Fait' };
const STATUS_CHIP: Record<SetupStatus, string> = { todo: 'chip-wait', doing: 'chip-doing', done: 'chip-ok' };

/** `scroller` : le conteneur qui défile (`.screen` sur téléphone, `.desk-page` sur ordinateur). */
type ScreenProps = { m: Manager; wide: boolean; scroller?: RefObject<HTMLElement> };

/** L'écran de chaque étape. */
const SCREENS: Record<SetupStepId, ComponentType<ScreenProps>> = {
  horaires: OpeningHours,
  postes: Points,
  prestations: Prestations,
  equipe: Team,
  planning: MyPlanning,
  qr: QrCodes,
};

/**
 * Le gérant, juste après le paiement de son abonnement sur le site de WaitAway : il vérifie les infos de l'achat,
 * lance la configuration de son salon, puis règle ses heures d'ouverture, nomme ses postes, choisit ses prestations,
 * invite son équipe, fait son planning s'il coiffe aussi, imprime les affiches des QR codes et termine la
 * configuration. Sur ordinateur, les étapes de la configuration sont à gauche et ouvrent leur écran.
 * Une fois la configuration finie, un menu remplace les étapes : Tableau de bord, Équipe (l'écran de l'étape Équipe),
 * Plannings (les plannings de l'équipe, d'où s'ouvre celui de chaque membre) et Mon salon (la page de configuration,
 * d'où se rouvrent les étapes). Il est à gauche sur ordinateur, en bas sur téléphone. Pendant la configuration, pas
 * de menu.
 */
export function ManagerApp({ wide }: { wide: boolean }) {
  const { s } = useSim();
  const m = s.manager;
  const scroller = useRef<HTMLElement>(null);
  // Chaque écran s'ouvre en haut de page, même si le précédent était défilé.
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [m?.view, m?.memberId]);
  if (!m) return null;

  const finished = setupFinished(m);
  const onDashboard = m.view === 'dashboard';
  // Les écrans du menu qui ne sont pas des étapes : ni « Étape n/6 », ni kicker « Mon salon » au-dessus.
  const menuScreen = onDashboard || m.view === 'plannings' || m.view === 'member-planning';
  const Screen = m.view !== undefined && !menuScreen ? SCREENS[m.view as SetupStepId] : undefined;
  const page = onDashboard ? (
    <Dashboard m={m} />
  ) : m.view === 'plannings' ? (
    <Plannings m={m} />
  ) : m.view === 'member-planning' ? (
    <MemberPlanningScreen m={m} wide={wide} scroller={scroller} />
  ) : Screen ? (
    <Screen m={m} wide={wide} scroller={scroller} />
  ) : (
    <Welcome m={m} wide={wide} />
  );
  const index = SETUP_STEPS.findIndex((x) => x.id === m.view);
  // Le tableau de bord, les plannings et QR codes rouverts après la configuration n'ont pas de bouton en bas de page :
  // pas de `with-footer`, la page garde sa marge du bas.
  const footer = !(onDashboard || m.view === 'plannings' || (m.view === 'qr' && finished));

  if (wide)
    return (
      <div className="desk">
        <aside className="desk-side" aria-label={finished ? 'Menu du salon' : 'Configuration du salon'}>
          <header className="brand">
            <span className="brand-mark" aria-hidden>
              W
            </span>
            WaitAway Pro
          </header>
          <p className="desk-caption">Ordinateur du gérant</p>
          {finished ? <MainMenu m={m} /> : <SetupSteps m={m} />}
        </aside>
        <main ref={scroller} className="desk-page">
          {page}
        </main>
      </div>
    );

  return (
    <div className={finished ? 'app with-tabs' : 'app'}>
      <main ref={scroller} className={footer ? 'screen with-footer' : 'screen'}>
        {/* Une fois la configuration finie, un écran d'étape rouvert n'est plus une étape : pas d'« Étape n/6 ». */}
        {!menuScreen && !(finished && index >= 0) && (
          <p className="kicker">
            {index < 0 ? (finished ? 'Mon salon' : 'Configuration du salon') : `Étape ${index + 1}/${SETUP_STEPS.length} : ${SETUP_STEPS[index].label}`}
          </p>
        )}
        {page}
      </main>
      {finished && <MainMenu m={m} tabs />}
    </div>
  );
}

/** Le menu, une fois la configuration finie. Sans vue : « Mon salon », la page de configuration. */
const MENU: { view?: ManagerView; label: string }[] = [
  { view: 'dashboard', label: 'Tableau de bord' },
  { view: 'equipe', label: 'Équipe' },
  { view: 'plannings', label: 'Plannings' },
  { label: 'Mon salon' },
];

/**
 * L'écran est ouvert depuis Plannings : les plannings de l'équipe, celui d'1 membre (sauf ouvert depuis « À traiter »),
 * ou Ton planning ouvert depuis sa carte.
 */
const fromPlannings = (m: Manager) =>
  m.view === 'plannings' || (m.view === 'member-planning' && m.from !== 'dashboard') || m.from === 'plannings';

/**
 * L'entrée active du menu : Tableau de bord quand son écran est affiché ou que Prestations ou le planning d'1 membre a
 * été ouvert depuis « À traiter », Équipe quand son écran est affiché, Plannings pour les plannings de l'équipe, celui d'1 membre et Ton
 * planning ouvert depuis Plannings, Mon salon pour la page de configuration et les écrans des autres étapes, qui
 * s'ouvrent depuis elle.
 */
const menuOn = (m: Manager, view?: ManagerView) => {
  if (view === 'plannings') return fromPlannings(m);
  if (view === 'dashboard') return m.view === 'dashboard' || m.from === 'dashboard';
  if (view !== undefined) return m.view === view;
  return !fromPlannings(m) && m.from !== 'dashboard' && (m.view === undefined || !['dashboard', 'equipe'].includes(m.view));
};

/** Le menu du gérant : à gauche sur ordinateur, en bas sur téléphone (`tabs`). */
function MainMenu({ m, tabs }: { m: Manager; tabs?: boolean }) {
  const { dispatch } = useSim();
  return (
    <nav className={tabs ? 'mgr-tabs' : 'mgr-menu'} aria-label="Menu du salon">
      {MENU.map((x) => {
        const on = menuOn(m, x.view);
        return (
          <button key={x.label} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined} onClick={() => dispatch({ type: 'managerOpen', step: x.view })}>
            {x.label}
          </button>
        );
      })}
    </nav>
  );
}

const waitText = (wait?: number) => (wait === undefined ? 'Pas de client' : `${wait} min`);
const servedText = (n: number) => `${n} ${n > 1 ? 'clients servis' : 'client servi'}`;

/**
 * Le tableau de bord (E3-5), une fois la configuration finie : les 7 derniers jours, l'attente moyenne et les clients
 * servis du salon, l'attente moyenne par jour en barres, puis par coiffeur. Les tickets clôturés sur incident ne
 * comptent pas, une mention le dit. Avant le saut « 1 semaine plus tard », il n'y a pas d'historique : l'écran le dit
 * au lieu d'afficher des chiffres. Aucune note d'avis : pendant le pilote, personne ne voit les notes.
 */
function Dashboard({ m }: { m: Manager }) {
  const { dispatch } = useSim();
  const d = dashboard(m);
  if (!d)
    return (
      <div className="mgr-head">
        <h1 className="title">Tableau de bord</h1>
        <p className="lead">Les chiffres arrivent après tes 1ers clients.</p>
      </div>
    );

  const proposals = pendingProposals(m).length;
  const toFreeze = m.team.filter((x) => !x.invited && x.planningState === 'a-figer');
  // Hauteur des barres : la plus longue attente de la semaine prend toute la hauteur.
  const max = Math.max(1, ...d.days.map((x) => x.wait ?? 0));
  return (
    <>
      <div className="mgr-head">
        <h1 className="title">Tableau de bord</h1>
        <p className="lead">7 derniers jours</p>
        <p className="muted">{d.period}</p>
      </div>

      <div className="mgr-stats">
        <section className="mgr-block mgr-stat">
          <h2 className="mgr-stat-label">Attente moyenne</h2>
          <p className="mgr-stat-value">{waitText(d.wait)}</p>
        </section>
        <section className="mgr-block mgr-stat">
          <h2 className="mgr-stat-label">Clients servis</h2>
          <p className="mgr-stat-value">{d.served}</p>
        </section>
      </div>
      {d.incidents && <p className="muted small">{d.incidents}</p>}

      <section className="mgr-block">
        <h2 className="mgr-block-title">Attente moyenne par jour, en minutes</h2>
        <ol className="mgr-bars">
          {d.days.map((x) => (
            <li key={x.day} className={`mgr-bar${x.closed ? ' off' : ''}`}>
              <span className="visually-hidden">
                {DAYS[x.day]} {x.date} : {x.closed ? 'fermé' : `${waitText(x.wait)}, ${servedText(x.served)}`}
              </span>
              <span className="mgr-bar-value" aria-hidden>
                {x.closed ? 'Fermé' : (x.wait ?? 0)}
              </span>
              <span className="mgr-bar-track" aria-hidden>
                {!x.closed && <span className="mgr-bar-fill" style={{ height: `${((x.wait ?? 0) / max) * 100}%` }} />}
              </span>
              <span className="mgr-bar-day" aria-hidden>
                {DAYS[x.day].slice(0, 3)}.<br />
                {x.date}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mgr-block">
        <h2 className="mgr-block-title">Par coiffeur</h2>
        <ul className="mgr-agents">
          {d.agents.map((x) => (
            <li key={x.who} className="mgr-agent">
              <strong>
                {x.name}
                {x.who === 'gerant' && <span className="you"> (toi)</span>}
              </strong>
              <span>Attente moyenne : {waitText(x.wait)}</span>
              <span className="muted">{servedText(x.served)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Hors backlog : 1 ligne pour les prestations proposées par l'équipe (E6-1), qui ouvre l'écran Prestations, puis
          1 ligne par planning à figer (E6-14), qui ouvre ce planning. Chaque ligne disparaît une fois traitée, et le
          bloc aussi quand il n'y a plus rien à traiter. */}
      {(proposals > 0 || toFreeze.length > 0) && (
        <section className="mgr-block">
          <h2 className="mgr-block-title">À traiter</h2>
          <ul className="mgr-todo">
            {proposals > 0 && (
              <li>
                <button className="mgr-todo-link" onClick={() => dispatch({ type: 'managerOpen', step: 'prestations', from: 'dashboard' })}>
                  {proposals} {proposals > 1 ? 'prestations proposées' : 'prestation proposée'} par ton équipe
                </button>
              </li>
            )}
            {toFreeze.map((x) => (
              <li key={x.id}>
                <button className="mgr-todo-link" onClick={() => dispatch({ type: 'managerOpen', step: 'member-planning', member: x.id, from: 'dashboard' })}>
                  Planning {ofName(x.firstName)} à figer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Les 6 étapes. Une étape en cours ou faite ouvre son écran. Seule l'étape dont l'écran
 * est affiché est mise en avant : aucune sur la page de configuration.
 */
function SetupSteps({ m }: { m: Manager }) {
  const { dispatch } = useSim();
  return (
    <ol className="mgr-steps">
      {SETUP_STEPS.map((st, i) => {
        const status = setupStatus(m, st.id);
        const on = st.id === m.view;
        const body = (
          <>
            <span className="mgr-step-num" aria-hidden>
              {i + 1}
            </span>
            <span className="mgr-step-label">{st.label}</span>
            <span className={`chip ${STATUS_CHIP[status]}`}>{STATUS_LABEL[status]}</span>
          </>
        );
        return (
          <li key={st.id}>
            {status === 'todo' ? (
              <div className={`mgr-step${on ? ' on' : ''}`} aria-current={on ? 'step' : undefined}>
                {body}
              </div>
            ) : (
              <button
                className={`mgr-step${on ? ' on' : ''}`}
                aria-current={on ? 'step' : undefined}
                onClick={() => dispatch({ type: 'managerOpen', step: st.id })}
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * La page de configuration (« Mon salon » dans le menu, une fois la configuration finie). Sur ordinateur, pendant la
 * configuration, les étapes sont dans la colonne de gauche, pas dans la page ; une fois finie, le menu prend la colonne
 * et les étapes passent dans la page, pour rouvrir heures, postes, prestations ou QR codes.
 * Elle revient au début de la configuration, au retour d'une étape et après « Terminer la configuration ». Quand
 * toutes les étapes sont faites, elle annonce que le salon est prêt.
 */
function Welcome({ m, wide }: { m: Manager; wide: boolean }) {
  const { dispatch } = useSim();
  const current = currentSetupStep(m);
  const finished = setupFinished(m);
  const unprinted = qrPosters(m).some((p) => !m.printed.includes(p.id));
  // Configuration pas commencée : « Configurer mon salon ». Commencée : « Reprendre la configuration », qui ouvre la
  // 1re étape pas encore faite. Finie : « Imprimer mes affiches » tant qu'une affiche n'est pas imprimée, sinon
  // « Ouvrir mon tableau de bord ».
  const [label, action] =
    m.setupDone === undefined
      ? (['Configurer mon salon', { type: 'managerStartSetup' }] as const)
      : current !== undefined
        ? (['Reprendre la configuration', { type: 'managerOpen', step: current }] as const)
        : unprinted
          ? (['Imprimer mes affiches', { type: 'managerOpen', step: 'qr' }] as const)
          : (['Ouvrir mon tableau de bord', { type: 'managerOpen', step: 'dashboard' }] as const);
  return (
    <>
      <div className="mgr-head">
        <h1 className="title">Bienvenue {m.firstName}.</h1>
        <p className="lead">
          {current === undefined
            ? 'Ton salon est prêt. Tes clients pourront s’inscrire dès qu’un coiffeur ouvrira sa file.'
            : 'Ton salon est prêt à être configuré.'}
        </p>
      </div>

      <div className="mgr-blocks">
        <AccountBlock m={m} />
        <StoreBlock m={m} />
        <section className="mgr-block">
          <h2 className="mgr-block-title">Ton abonnement</h2>
          <p>
            {m.files} {m.files > 1 ? 'files' : 'file'}
          </p>
          <p className="muted small">Pour le changer, passe par le site de WaitAway.</p>
        </section>
      </div>

      {(!wide || finished) && (
        <section className="mgr-config">
          <h2 className="section">La configuration</h2>
          <SetupSteps m={m} />
        </section>
      )}

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button className="btn btn-primary btn-lg" onClick={() => dispatch(action)}>
          {label}
        </button>
      </footer>
    </>
  );
}

/**
 * Bouton d'enregistrement d'un écran d'étape. Pendant la configuration, l'étape suivante s'ouvre après. Une fois finie,
 * rien ne s'enchaîne (`finishSetupStep`) : « Enregistrer » seul.
 */
const saveText = (m: Manager) => (setupFinished(m) ? 'Enregistrer' : 'Enregistrer et continuer');

const rangesText = (d: OpeningDay) => d.ranges.map((r) => `${fmt(r.start)} à ${fmt(r.end)}`).join(', puis ');

/**
 * Heures d'ouverture du salon, du lundi au dimanche. Les changements restent sur l'écran jusqu'à « Enregistrer et continuer ».
 * Même présentation que les horaires du coiffeur (`Horaires` dans `agent/Onboarding.tsx`).
 */
function OpeningHours({ m, wide }: ScreenProps) {
  const { dispatch } = useSim();
  const [hours, setHours] = useState<OpeningDay[]>(() => structuredClone(m.hours));
  const [editing, setEditing] = useState<number | null>(null);
  const put = (d: OpeningDay) => hours.map((x) => (x.day === d.day ? d : x));

  if (editing !== null)
    return (
      <OpeningDayEditor
        key={editing}
        day={hours[editing]}
        wide={wide}
        onCancel={() => setEditing(null)}
        onSave={(d) => {
          setHours(put(d));
          setEditing(null);
        }}
        onCopy={(d) => {
          setHours(copyOpeningRanges(put(d), d.day));
          setEditing(null);
        }}
      />
    );

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen' })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">Heures d&rsquo;ouverture</h1>
        <p className="muted">Une semaine déjà remplie. Le crayon ouvre un jour pour l&rsquo;ouvrir ou le fermer, et changer ses heures.</p>
      </div>

      <ul className="week">
        {hours.map((d) => (
          <li key={d.day} className={`week-day${d.open ? '' : ' off'}`}>
            <span className="week-info">
              <strong>{DAYS[d.day]}</strong>
              {d.open ? <span>{rangesText(d)}</span> : <span className="muted">Fermé</span>}
            </span>
            <button className="icon-btn" aria-label={`Modifier ${DAYS[d.day]}`} onClick={() => setEditing(d.day)}>
              <PencilIcon />
            </button>
          </li>
        ))}
      </ul>

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'managerSaveHours', hours })}>
          {saveText(m)}
        </button>
      </footer>
    </>
  );
}

/**
 * Les postes du salon (points de distribution), créés d'après l'abonnement : 1 par file. Les noms restent sur l'écran
 * jusqu'à l'enregistrement. L'achat simulé d'1 file, lui, compte tout de suite et ajoute le poste suivant. Il n'est
 * proposé que pendant la configuration.
 */
function Points({ m, wide }: ScreenProps) {
  const { dispatch } = useSim();
  const [names, setNames] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'limit' | 'bought' | null>(null);
  const points = m.points.map((p) => ({ ...p, name: names[p.id] ?? p.name }));
  const error = pointsError(points, m.files);

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen' })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">Postes</h1>
        <p className="muted">Chaque poste aura son QR code, à coller à côté. Tes coiffeurs le scannent pour ouvrir leur file, tes clients pour démarrer leur prestation.</p>
      </div>

      <ul className="week">
        {points.map((p) => (
          <li key={p.id} className="week-day">
            {editing === p.id ? (
              <label className="field week-info">
                <span>Nom du poste</span>
                <input
                  autoFocus
                  value={p.name}
                  onChange={(e) => setNames({ ...names, [p.id]: e.target.value })}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                />
              </label>
            ) : (
              <>
                <span className="week-info">
                  <strong>{p.name.trim() || 'Sans nom'}</strong>
                </span>
                <button className="icon-btn" aria-label={`Renommer ${p.name.trim() || 'le poste'}`} onClick={() => setEditing(p.id)}>
                  <PencilIcon />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Le nombre de postes suit toujours le nombre de files : un poste de plus demande 1 file de plus. */}
      <button className="btn btn-outline" onClick={() => setSheet('limit')}>
        Ajouter un poste
      </button>

      {error && <p className="error">{error}</p>}

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button className="btn btn-primary btn-lg" disabled={error !== undefined} onClick={() => dispatch({ type: 'managerSavePoints', names })}>
          {saveText(m)}
        </button>
      </footer>

      {sheet === 'limit' && (
        <Sheet title="Ajouter un poste" onClose={() => setSheet(null)}>
          <p>{pointsLimitText(m.files)}</p>
          {/* Achat simulé : la vraie page d'achat est sur le site de WaitAway (E3-0). Écart au backlog : dans la démo,
              il n'est possible que pendant la configuration (`managerBuyFile`). Une fois finie, le panneau le dit. */}
          {setupFinished(m) ? (
            <>
              <p className="muted">Dans la démo, l&rsquo;achat d&rsquo;une file se fait pendant la configuration.</p>
              <button className="btn btn-primary btn-lg" onClick={() => setSheet(null)}>
                Compris
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                dispatch({ type: 'managerBuyFile' });
                setSheet('bought');
              }}
            >
              Ajouter une file sur le site
            </button>
          )}
        </Sheet>
      )}
      {sheet === 'bought' && (
        <Sheet title="File ajoutée" onClose={() => setSheet(null)}>
          <p>{fileBoughtText(m.files)}</p>
          <p className="muted">{m.points[m.points.length - 1].name} est dans ta liste. Le crayon permet de le renommer.</p>
          {/* L'achat remet Postes en cours (`managerBuyFile`) : toujours vrai, que les étapes suivantes soient commencées ou non. */}
          <p>Enregistre tes postes pour continuer la configuration.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setSheet(null)}>
            Compris
          </button>
        </Sheet>
      )}
    </>
  );
}

/**
 * Le catalogue du salon : les prestations du catalogue WaitAway à cocher, par bloc, et celles que le gérant crée.
 * Les changements restent sur l'écran jusqu'à « Enregistrer et continuer ». Même présentation que les prestations du coiffeur
 * (`Prestations` dans `agent/Onboarding.tsx`). Rien n'est coché au départ ; rouvert, l'écran montre le catalogue enregistré.
 * Une prestation créée a une croix qui la retire de la liste. L'erreur de catalogue vide n'apparaît qu'après une 1re
 * action sur l'écran : avant, « Enregistrer et continuer » reste seulement grisé.
 * En tête, les prestations proposées par l'équipe et pas encore traitées (E6-1), 1 carte chacune. « Valider » la fait
 * entrer tout de suite dans le catalogue enregistré (`managerAcceptProposal`), et l'ajoute aussi à la liste de l'écran,
 * cochée avec la durée proposée, comme une prestation créée. « Refuser » ouvre un panneau avec un message facultatif.
 * Valider est grisé quand le nom est déjà dans la liste de l'écran, prestations créées pas encore enregistrées comprises.
 * Une carte traitée est remplacée sur place par une ligne de confirmation, sans bouton et de la même hauteur : la carte
 * suivante ne remonte pas sous le doigt. Les lignes restent jusqu'à la sortie de l'écran, la section aussi.
 * Ouvert depuis « À traiter », Retour et « Enregistrer » ramènent au tableau de bord (`Manager.from`).
 */
function Prestations({ m, wide }: ScreenProps) {
  const { dispatch } = useSim();
  // Les propositions en attente à l'ouverture de l'écran restent affichées une fois traitées, en ligne de confirmation.
  const [shown] = useState(() => new Set(pendingProposals(m).map((p) => p.id)));
  const proposals = (m.proposals ?? []).filter((p) => p.state === 'en-attente' || shown.has(p.id));
  // Hauteur de chaque carte au moment du geste, que garde sa ligne de confirmation.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const keepHeight = (id: string, el: HTMLElement) => {
    const card = el.closest('li');
    if (card) setHeights((cur) => ({ ...cur, [id]: card.offsetHeight }));
  };
  const [refusing, setRefusing] = useState<Proposal | null>(null);
  const [created, setCreated] = useState<Prestation[]>(() => structuredClone(m.created));
  const [minutes, setMinutes] = useState<Record<string, number>>(() => Object.fromEntries(m.prestations.map((p) => [p.id, p.minutes])));
  const [creating, setCreating] = useState(false);
  const [touched, setTouched] = useState(false);
  const chosen = storePrestations(created, minutes);
  const error = storePrestationsError(chosen);
  const count = chosen.length;

  const toggle = (id: string, def: number) => {
    setTouched(true);
    setMinutes((cur) => {
      const next = { ...cur };
      if (id in next) delete next[id];
      else next[id] = def;
      return next;
    });
  };
  const bump = (id: string, d: number) => {
    setTouched(true);
    setMinutes((cur) => ({ ...cur, [id]: cur[id] + d }));
  };
  const remove = (id: string) => {
    setTouched(true);
    setCreated((cur) => cur.filter((p) => p.id !== id));
    setMinutes((cur) => {
      const next = { ...cur };
      delete next[id];
      return next;
    });
  };
  const accept = (p: Proposal) => {
    dispatch({ type: 'managerAcceptProposal', id: p.id });
    setCreated((cur) => [...cur, proposalToPrestation(p)]);
    setMinutes((cur) => ({ ...cur, [p.id]: p.minutes }));
  };
  const proposer = (p: Proposal) => m.team.find((x) => x.id === p.memberId)?.firstName;

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen', step: m.from })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">Prestations</h1>
        <p className="muted">Coche celles de ton salon. Elles sont validées d&rsquo;office : tes coiffeurs choisiront dans cette liste.</p>
        <p className="muted">La durée est indicative : chaque coiffeur réglera ensuite la sienne.</p>
      </div>

      {proposals.length > 0 && (
        <section className="group">
          <h2 className="section">Proposées par ton équipe</h2>
          <ul className="mgr-proposals">
            {proposals.map((p) => {
              if (p.state !== 'en-attente')
                return (
                  <li key={p.id} className="mgr-proposal mgr-proposal-done" role="status" style={{ minHeight: heights[p.id] }}>
                    {p.state === 'validee' ? `«\u00a0${p.label}\u00a0» ajoutée à ton catalogue.` : `«\u00a0${p.label}\u00a0» refusée.`}
                  </li>
                );
              // Vérifié sur la liste de l'écran : le moteur ne voit que le catalogue enregistré.
              const clash = proposalError(p, created);
              return (
                <li key={p.id} className="mgr-proposal">
                  <div className="mgr-proposal-head">
                    <PrestationIcon id={p.id} group={p.group} size={40} />
                    <div className="mgr-proposal-text">
                      <strong>{p.label}</strong>
                      <span>{p.minutes} min</span>
                      <span className="muted">Proposée par {proposer(p) ?? 'ton équipe'}</span>
                    </div>
                  </div>
                  {clash && <p className="error">{clash}</p>}
                  <div className="mgr-proposal-actions">
                    <button
                      className="btn btn-outline"
                      onClick={(e) => {
                        keepHeight(p.id, e.currentTarget);
                        setRefusing(p);
                      }}
                    >
                      Refuser
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={clash !== undefined}
                      onClick={(e) => {
                        keepHeight(p.id, e.currentTarget);
                        accept(p);
                      }}
                    >
                      Valider
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {byGroup([...CATALOG, ...created]).map((g) => (
        <section key={g.id} className="group">
          <h2 className="section">{g.label}</h2>
          <ul className="choices mgr-choices">
            {g.items.map((p) => {
              const on = p.id in minutes;
              return (
                <li key={p.id} className={`choice-row${on ? ' on' : ''}`}>
                  <button className="choice" aria-pressed={on} onClick={() => toggle(p.id, p.minutes)}>
                    <span className="check" aria-hidden />
                    <PrestationIcon id={p.id} group={p.group} size={40} />
                    <span className="choice-label">{p.label}</span>
                    {!on && <span className="choice-min">{p.minutes} min</span>}
                  </button>
                  {created.some((c) => c.id === p.id) && (
                    <button className="icon-btn" aria-label={`Supprimer ${p.label}`} onClick={() => remove(p.id)}>
                      <CrossIcon />
                    </button>
                  )}
                  {on && (
                    <Stepper
                      label={p.label}
                      value={`${minutes[p.id]} min`}
                      onMinus={minutes[p.id] > PRESTATION_MINUTES.min ? () => bump(p.id, -PRESTATION_MINUTES.step) : undefined}
                      onPlus={minutes[p.id] < PRESTATION_MINUTES.max ? () => bump(p.id, PRESTATION_MINUTES.step) : undefined}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <button className="btn btn-outline" onClick={() => setCreating(true)}>
        Créer une prestation
      </button>

      <p className="mgr-count">
        {count} {count > 1 ? 'prestations' : 'prestation'} dans ton salon
      </p>
      {error && touched && <p className="error">{error}</p>}

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button
          className="btn btn-primary btn-lg"
          disabled={error !== undefined}
          onClick={() => {
            setTouched(true);
            dispatch({ type: 'managerSavePrestations', created, minutes });
          }}
        >
          {saveText(m)}
        </button>
      </footer>

      {creating && (
        <NewPrestation
          created={created}
          onClose={() => setCreating(false)}
          onCreate={(p) => {
            setTouched(true);
            setCreated([...created, p]);
            setMinutes({ ...minutes, [p.id]: p.minutes });
            setCreating(false);
          }}
        />
      )}

      {refusing && (
        <RejectProposal
          p={refusing}
          who={proposer(refusing)}
          onClose={() => setRefusing(null)}
          onReject={(message) => {
            dispatch({ type: 'managerRejectProposal', id: refusing.id, message });
            setRefusing(null);
          }}
        />
      )}
    </>
  );
}

/** Panneau du refus d'une prestation proposée par l'équipe : un message facultatif pour le coiffeur qui l'a proposée. */
function RejectProposal({ p, who, onClose, onReject }: { p: Proposal; who?: string; onClose: () => void; onReject: (message: string) => void }) {
  const [message, setMessage] = useState('');
  return (
    <Sheet title={`Refuser «\u00a0${p.label}\u00a0»`} onClose={onClose}>
      <label className="field">
        <span>{who ? `Dis à ${who} pourquoi (facultatif)` : 'Dis pourquoi (facultatif)'}</span>
        <textarea rows={3} autoFocus value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <button className="btn btn-danger btn-lg" onClick={() => onReject(message)}>
        Refuser la proposition
      </button>
    </Sheet>
  );
}

/** Panneau « Créer une prestation » : nom, bloc, durée indicative et description facultative. */
function NewPrestation({ created, onClose, onCreate }: { created: Prestation[]; onClose: () => void; onCreate: (p: Prestation) => void }) {
  const [d, setD] = useState<PrestationDraft>({ label: '', group: 'coupe', minutes: 30, description: '' });
  const error = newPrestationError(d, created);

  return (
    <Sheet title="Créer une prestation" onClose={onClose}>
      <label className="field">
        <span>Nom</span>
        <input autoFocus value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Ex. Contour au rasoir" />
      </label>
      <div className="field">
        <span>Bloc</span>
        <div className="seg mgr-seg" role="group" aria-label="Bloc">
          {GROUPS.map((g) => (
            <button key={g.id} className={g.id === d.group ? 'on' : ''} aria-pressed={g.id === d.group} onClick={() => setD({ ...d, group: g.id })}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Durée indicative</span>
        <DurationWheel label="Durée indicative" value={d.minutes} onChange={(v) => setD({ ...d, minutes: v })} />
      </div>
      <label className="field">
        <span>Description (facultative)</span>
        <textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </label>
      {/* Un nom vide n'affiche pas d'erreur : le bouton reste grisé jusqu'à ce qu'il soit tapé. */}
      {error && d.label.trim() !== '' && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-lg" disabled={error !== undefined} onClick={() => onCreate(createPrestation(d, created))}>
        Créer
      </button>
    </Sheet>
  );
}

const ROLE_LABEL: Record<TeamMember['role'], string> = { agent: 'Coiffeur', gerant: 'Gérant' };

/**
 * L'équipe du salon : le gérant, puis les personnes invitées. Chaque invitation part tout de suite (`managerInvite`)
 * et reste en attente dans la démo, sauf celle du 1er invité, acceptée au saut « 1 semaine plus tard ». « Enregistrer et
 * continuer » est toujours actif : le gérant peut travailler seul. Une fois la configuration finie, l'entrée Équipe du
 * menu ouvre cet écran, et « Enregistrer » y reste.
 */
function Team({ m, wide }: ScreenProps) {
  const { dispatch } = useSim();
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (x: TeamMember) => {
    try {
      await navigator.clipboard.writeText(inviteLink(x));
    } catch {
      /* presse-papiers refusé : la démo affiche quand même « Lien copié », pour ne pas perturber la présentation (Gabi) */
    }
    setCopied(x.id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen' })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">Équipe</h1>
        <p className="muted">Invite tes coiffeurs : chacun reçoit un lien par e-mail pour créer son compte. Tu peux aussi enregistrer seul.</p>
      </div>

      <ul className="week">
        <li className="week-day">
          <span className="week-info mgr-lines">
            <strong>
              {m.firstName} {m.lastName} <span className="you">(toi)</span>
            </strong>
            <span className="muted">{ROLE_LABEL.gerant}</span>
          </span>
        </li>
        {m.team.map((x) => (
          <li key={x.id} className="week-day mgr-member">
            <span className="week-info mgr-lines">
              <strong>{x.firstName}</strong>
              <span className="muted">{x.email}</span>
              <span>{ROLE_LABEL[x.role]}</span>
              <span>{teamStatusText(x)}</span>
              {x.invited && (
                <span>
                  <span className="chip chip-wait">Invitation envoyée</span>
                </span>
              )}
            </span>
            {x.invited && (
              <span className="mgr-member-actions">
                <button className="btn btn-outline" onClick={() => copy(x)}>
                  {copied === x.id ? 'Lien copié' : 'Copier le lien'}
                </button>
                <button className="icon-btn" aria-label={`Annuler l’invitation ${ofName(x.firstName)}`} onClick={() => dispatch({ type: 'managerCancelInvite', id: x.id })}>
                  <CrossIcon />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <button className="btn btn-outline" onClick={() => setInviting(true)}>
        Inviter un coiffeur
      </button>

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'managerSaveTeam' })}>
          {saveText(m)}
        </button>
      </footer>

      {inviting && (
        <NewInvite
          m={m}
          onClose={() => setInviting(false)}
          onSend={(invite) => {
            dispatch({ type: 'managerInvite', invite });
            setInviting(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Le planning du gérant, s'il coiffe aussi : la semaine jour par jour, avec l'éditeur du coiffeur (`DayEditor` dans
 * `agent/Onboarding.tsx`), borné aux heures d'ouverture du salon. Les jours où le salon est fermé ne s'ouvrent pas, sauf s'ils sont encore travaillés (heures changées après coup), pour corriger l'erreur.
 * Pré-rempli à l'ouverture de l'écran d'après les heures d'ouverture enregistrées (`defaultPlanning`) ; rouvert,
 * l'écran montre le planning enregistré. Les changements restent sur l'écran jusqu'à « Enregistrer et continuer ». L'erreur
 * n'apparaît qu'après une 1re action : avant, « Enregistrer et continuer » reste seulement grisé. Exception : un planning
 * enregistré qui n'est plus valable (heures d'ouverture changées après) montre son erreur dès l'ouverture.
 * Un chevauchement avec un membre de l'équipe (E6-15) bloque l'enregistrement, comme pour le planning d'un membre ;
 * déjà là à l'ouverture, il s'affiche tout de suite. Ouvert depuis Plannings, Retour y ramène (`Manager.from`).
 */
function MyPlanning({ m, wide, scroller }: ScreenProps) {
  const { dispatch } = useSim();
  const [cuts, setCuts] = useState(m.cuts);
  const [planning, setPlanning] = useState<PlannedDay[]>(() => structuredClone(m.planning ?? defaultPlanning(m)));
  const [touched, setTouched] = useState(() => m.planning !== undefined && managerPlanningError(m, m.cuts, m.planning) !== undefined);
  const error = managerPlanningError(m, cuts, planning);
  const { edit, editor } = usePlanningEditor({
    m,
    wide,
    scroller,
    planning,
    onChange: (p) => {
      setTouched(true);
      setPlanning(p);
    },
  });

  if (editor) return editor;

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen', step: m.from })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">Ton planning</h1>
        <p className="muted">
          Si tu coiffes aussi, ta semaine est déjà remplie d&rsquo;après les heures d&rsquo;ouverture. Le crayon ouvre un jour pour changer ses heures
          {m.points.length >= 2 ? ', ses pauses et ton poste.' : ' et ses pauses.'}
        </p>
      </div>

      <div className="pause-edit">
        <button
          type="button"
          role="switch"
          aria-checked={cuts}
          className="pause-edit-head switch-row"
          onClick={() => {
            setTouched(true);
            setCuts(!cuts);
          }}
        >
          <strong>Je coiffe aussi</strong>
          <span className="switch" aria-hidden />
        </button>
      </div>

      {cuts && (
        <>
          <PlanningDays m={m} planning={planning} onEdit={edit} />
          <p className="mgr-count">{weekHoursText(weekHours(planning))}</p>
        </>
      )}

      {error && touched && <p className="error">{error}</p>}

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button
          className="btn btn-primary btn-lg"
          disabled={error !== undefined}
          onClick={() => {
            setTouched(true);
            dispatch({ type: 'managerSavePlanning', cuts, planning: cuts ? planning : undefined });
          }}
        >
          {saveText(m)}
        </button>
      </footer>
    </>
  );
}

/**
 * L'éditeur d'un jour pour les plannings vus par le gérant (Ton planning, planning d'1 membre) : `DayEditor` borné aux
 * heures d'ouverture du jour, avec le choix du poste à partir de 2 postes. `edit` ouvre un jour ; `editor` est
 * l'éditeur à afficher à la place de la page, absent quand aucun jour n'est ouvert. `onChange` reçoit la semaine avec
 * le jour validé. `of` : prénom du membre, pour que l'éditeur parle de lui (`DayEditorOptions`).
 * L'éditeur s'ouvre en haut de page ; au retour, la liste reprend la position où on l'avait laissée.
 */
function usePlanningEditor({
  m,
  wide,
  scroller,
  planning,
  onChange,
  of,
}: {
  m: Manager;
  wide: boolean;
  scroller?: RefObject<HTMLElement>;
  planning: PlannedDay[];
  onChange: (planning: PlannedDay[]) => void;
  of?: string;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const listTop = useRef(0);

  // Avant l'affichage, pour que la page ne saute pas : l'éditeur en haut, la liste à sa position d'avant.
  useLayoutEffect(() => {
    scroller?.current?.scrollTo(0, editing === null ? listTop.current : 0);
  }, [editing, scroller]);

  const edit = (day: number) => {
    listTop.current = scroller?.current?.scrollTop ?? 0;
    setEditing(day);
  };

  const editor =
    editing === null ? undefined : (
      <DayEditor
        key={editing}
        plan={planning[editing]}
        options={{
          // Un jour fermé, encore travaillé (heures changées après coup), n'a pas d'heures d'ouverture à montrer.
          bounds: m.hours[editing].open ? openingSpan(m.hours[editing]) : undefined,
          points: m.points,
          error: (d) => planningDayError(d, m),
          inPage: { wide },
          of,
        }}
        onCancel={() => setEditing(null)}
        onSave={(d) => {
          onChange(planning.map((x) => (x.day === d.day ? d : x)));
          setEditing(null);
        }}
      />
    );

  return { edit, editor };
}

/** « d’Antoine », « de Léa ». */
const ofName = (name: string) => (/^[aeiouàâéèêîôûh]/i.test(name) ? `d’${name}` : `de ${name}`);

const PLANNING_STATE_LABEL: Record<PlanningState, string> = { 'a-figer': 'À figer', fige: 'Figé', ouvert: 'Ouvert à la modification' };
const PLANNING_STATE_CHIP: Record<PlanningState, string> = { 'a-figer': 'chip-doing', fige: 'chip-ok', ouvert: 'chip-wait' };

/**
 * Les plannings de l'équipe (E6-13 à E6-15), une fois la configuration finie : 1 carte par coiffeur. Le gérant, s'il
 * coiffe, renvoie vers Ton planning. Un membre inscrit avec un planning montre son état, ses heures par rapport à son
 * volume horaire (salarié seulement) et ses alertes, et ouvre son planning. Un membre encore invité n'a pas de
 * planning.
 */
function Plannings({ m }: { m: Manager }) {
  const { dispatch } = useSim();
  const overlaps = planningOverlaps(m);
  const alerts = (who: string) =>
    overlaps
      .filter((o) => o.a === who || o.b === who)
      .map((o, i) => (
        <span key={i} className="error">
          {overlapText(o, m)}
        </span>
      ));

  return (
    <>
      <div className="mgr-head">
        <h1 className="title">Plannings</h1>
        <p className="muted">Le planning de chaque coiffeur du salon. Touche-le pour le voir, le corriger ou le figer.</p>
      </div>

      <ul className="mgr-plannings">
        {m.cuts && (
          <li>
            <button className="mgr-planning-card" onClick={() => dispatch({ type: 'managerOpen', step: 'planning', from: 'plannings' })}>
              <strong>
                {m.firstName} <span className="you">(toi)</span>
              </strong>
              <span className="muted">Ton planning</span>
              {alerts(MANAGER_WHO)}
            </button>
          </li>
        )}
        {m.team.map((x) => {
          const head = <strong>{x.firstName}</strong>;
          if (x.invited || !x.planning || !x.planningState)
            return (
              <li key={x.id} className="mgr-planning-card">
                {head}
                {x.invited ? <span className="chip chip-wait">En attente d&rsquo;inscription</span> : <span className="muted">Pas encore de planning</span>}
              </li>
            );
          const hours = volumeText(x);
          const warning = volumeWarning(x);
          return (
            <li key={x.id}>
              <button className="mgr-planning-card" onClick={() => dispatch({ type: 'managerOpen', step: 'member-planning', member: x.id })}>
                {head}
                <span className={`chip ${PLANNING_STATE_CHIP[x.planningState]}`}>{PLANNING_STATE_LABEL[x.planningState]}</span>
                {hours && <span>{hours}</span>}
                {alerts(x.id)}
                {warning && <span className="warn">{warning}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Le planning du membre de `Manager.memberId`. Remonté à chaque membre (`key`), pour repartir de son planning enregistré. */
function MemberPlanningScreen({ m, wide, scroller }: ScreenProps) {
  const x = m.team.find((t) => t.id === m.memberId);
  if (!x?.planning || !x.planningState) return null;
  return <MemberPlanning key={x.id} m={m} x={x as MemberWithPlanning} wide={wide} scroller={scroller} />;
}

type MemberWithPlanning = TeamMember & Required<Pick<TeamMember, 'planning' | 'planningState'>>;

/**
 * Le planning d'1 membre, ouvert par le gérant depuis Plannings ou « À traiter » (E6-14) : sa semaine, corrigeable avec
 * l'éditeur de Ton planning (`DayEditor`), bornée aux heures d'ouverture, avec le choix du poste à partir de 2 postes.
 * « Enregistrer » garde les corrections, sans changer l'état du planning. L'interrupteur « Planning figé » enregistre
 * la semaine de l'écran et la fige, ou rouvre un planning figé. « Rouvrir et prévenir » (suivi du prénom) le rouvre aussi, et
 * dit que le lien est parti (simulé).
 * L'erreur n'apparaît qu'après une 1re action, sauf un chevauchement déjà là à l'ouverture, affiché tout de suite :
 * sinon le gérant ne comprend pas pourquoi « Planning figé » est refusé. Le moteur revalide et refuse (`memberPlanningError`).
 * Retour ramène à l'écran d'ouverture : Plannings, ou le tableau de bord depuis « À traiter » (`Manager.from`).
 */
function MemberPlanning({ m, x, wide, scroller }: { m: Manager; x: MemberWithPlanning; wide: boolean; scroller?: RefObject<HTMLElement> }) {
  const { dispatch } = useSim();
  const [planning, setPlanning] = useState<PlannedDay[]>(() => structuredClone(x.planning));
  const [touched, setTouched] = useState(() => planningOverlaps(m).some((o) => o.a === x.id || o.b === x.id));
  const [sent, setSent] = useState(false);
  const error = memberPlanningError(m, x.id, planning);
  const warning = volumeWarning(x, planning);
  const frozen = x.planningState === 'fige';
  const changed = JSON.stringify(planning) !== JSON.stringify(x.planning);

  const { edit, editor } = usePlanningEditor({
    m,
    wide,
    scroller,
    planning,
    of: x.firstName,
    onChange: (p) => {
      setTouched(true);
      setPlanning(p);
    },
  });

  if (editor) return editor;

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen', step: m.from ?? 'plannings' })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">Planning {ofName(x.firstName)}</h1>
        <span>
          <span className={`chip ${PLANNING_STATE_CHIP[x.planningState]}`}>{PLANNING_STATE_LABEL[x.planningState]}</span>
        </span>
        <p className="muted">
          Le crayon ouvre un jour pour corriger ses heures{m.points.length >= 2 ? ', ses pauses et son poste.' : ' et ses pauses.'} Une fois figé,{' '}
          {x.firstName} ne peut plus le modifier.
        </p>
      </div>

      <div className="pause-edit">
        <button
          type="button"
          role="switch"
          aria-checked={frozen}
          className="pause-edit-head switch-row"
          onClick={() => {
            setTouched(true);
            dispatch(frozen ? { type: 'managerReopenPlanning', id: x.id } : { type: 'managerFreezePlanning', id: x.id, planning });
          }}
        >
          <strong>Planning figé</strong>
          <span className="switch" aria-hidden />
        </button>
      </div>
      {error && touched && <p className="error">{error}</p>}
      {frozen && (
        <button
          className="btn btn-outline"
          onClick={() => {
            dispatch({ type: 'managerReopenPlanning', id: x.id });
            setSent(true);
          }}
        >
          Rouvrir et prévenir {x.firstName}
        </button>
      )}

      <PlanningDays m={m} planning={planning} onEdit={edit} />
      <p className="mgr-count">{volumeText(x, planning) ?? weekHoursText(weekHours(planning))}</p>
      {warning && <p className="warn">{warning}</p>}

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button
          className="btn btn-primary btn-lg"
          disabled={error !== undefined || !changed}
          onClick={() => {
            setTouched(true);
            dispatch({ type: 'managerSaveMemberPlanning', id: x.id, planning });
          }}
        >
          Enregistrer
        </button>
      </footer>

      {/* Écart au backlog (E6-14) : le lien est simulé, rien n'est envoyé. */}
      {sent && (
        <Sheet title={`Lien envoyé à ${x.firstName}`} onClose={() => setSent(false)}>
          <p className="muted">Simulation : {x.firstName} reçoit un lien pour modifier son planning, maintenant ouvert à la modification.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setSent(false)}>
            Compris
          </button>
        </Sheet>
      )}
    </>
  );
}

/**
 * La semaine d'un planning, jour par jour : heures, poste (à partir de 2 postes) et pauses. Le crayon ouvre un jour.
 * Les jours où le salon est fermé ne s'ouvrent pas, sauf s'ils sont encore travaillés (heures changées après coup),
 * pour pouvoir les retirer.
 */
function PlanningDays({ m, planning, onEdit }: { m: Manager; planning: PlannedDay[]; onEdit: (day: number) => void }) {
  const pointName = (id?: string) => m.points.find((p) => p.id === id)?.name;
  return (
    <ul className="week">
      {planning.map((d) => {
        const closed = !m.hours[d.day].open;
        const taken = d.pauses.filter((p) => p.on);
        return (
          <li key={d.day} className={`week-day${d.works && !closed ? '' : ' off'}`}>
            <span className="week-info">
              <strong>{DAYS[d.day]}</strong>
              {closed ? (
                <span className="muted">Salon fermé</span>
              ) : d.works ? (
                <>
                  <span>
                    {fmt(d.start)} à {fmt(d.end)}
                    {m.points.length >= 2 && pointName(d.point) ? `, ${pointName(d.point)}` : ''}
                  </span>
                  <span className="muted small">{taken.length === 0 ? 'Sans pause' : `Pauses : ${taken.map((p) => fmt(p.at)).join(', ')}`}</span>
                </>
              ) : (
                <span className="muted">Repos</span>
              )}
            </span>
            {(!closed || d.works) && (
              <button className="icon-btn" aria-label={`Modifier ${DAYS[d.day]}`} onClick={() => onEdit(d.day)}>
                <PencilIcon />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Les affiches des QR codes : le QR Boutique pour l'entrée du salon, puis le QR File/Station de chaque poste.
 * « Imprimer » et « Tout imprimer » simulent l'impression : un panneau la confirme et l'affiche reçoit la pastille
 * « Imprimée ». « Terminer la configuration » est toujours actif, même sans impression, et ramène à la page de
 * configuration.
 */
function QrCodes({ m, wide }: ScreenProps) {
  const { dispatch } = useSim();
  const posters = qrPosters(m);
  // Les affiches que le panneau confirme : 1 seule, ou toutes avec « Tout imprimer ».
  const [sheet, setSheet] = useState<string[] | null>(null);
  const [order, setOrder] = useState(false);
  const print = (id?: string) => {
    dispatch({ type: 'managerPrint', id });
    setSheet(id === undefined ? posters.map((p) => p.id) : [id]);
  };

  return (
    <>
      <button className="back" onClick={() => dispatch({ type: 'managerOpen' })}>
        Retour
      </button>
      <div className="mgr-head">
        <h1 className="title">QR codes</h1>
        <p className="muted">Imprime chaque affiche et colle-la à sa place : l&rsquo;entrée du salon, puis chaque poste.</p>
      </div>

      <ul className="mgr-posters">
        {posters.map((p) => {
          const boutique = p.id === BOUTIQUE_POSTER;
          return (
            <li key={p.id} className="mgr-poster-card">
              <div className="mgr-poster">
                {boutique && <p className="mgr-poster-place">Entrée du salon</p>}
                <h2 className="mgr-poster-title">{p.title}</h2>
                <QrFake seed={p.id} />
                <p>{p.text}</p>
              </div>
              {!boutique && <p className="muted small">Tes coiffeurs le scannent pour ouvrir leur file.</p>}
              <div className="mgr-poster-actions">
                {m.printed.includes(p.id) && <span className="chip chip-ok">Imprimée</span>}
                <button className="btn btn-outline" aria-label={`Imprimer l’affiche ${p.title}`} onClick={() => print(p.id)}>
                  Imprimer
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button className="btn btn-outline" onClick={() => print()}>
        Tout imprimer
      </button>
      <p className="muted small">Renommer un poste ne change pas son QR code : rien à réimprimer.</p>
      <button className="btn btn-outline" onClick={() => setOrder(true)}>
        Commander une affiche ou un kakemono
      </button>

      {/* Rouvert après la configuration, l'écran n'a rien à enregistrer : l'impression compte dès qu'on la touche. Retour suffit. */}
      {!setupFinished(m) && (
        <footer className={wide ? 'mgr-footer' : 'footer'}>
          <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'managerFinishSetup' })}>
            Terminer la configuration
          </button>
        </footer>
      )}

      {sheet && (
        <Sheet title={sheet.length > 1 ? 'Affiches prêtes à imprimer (simulation)' : 'Affiche prête à imprimer (simulation)'} onClose={() => setSheet(null)}>
          <p className="muted">{posters.filter((p) => sheet.includes(p.id)).map((p) => p.title).join(', ')}</p>
          <button className="btn btn-primary btn-lg" onClick={() => setSheet(null)}>
            Compris
          </button>
        </Sheet>
      )}
      {/* Simulation : la commande (E3-7) se fait sur le site de WaitAway, qui n'est pas maquetté. */}
      {order && (
        <Sheet title="Sur le site de WaitAway (simulation)" onClose={() => setOrder(false)}>
          <p className="muted">
            Tu y commandes une affiche imprimée, autocollante ou non, ou un kakemono, pour afficher ton QR code en grand aux couleurs de ton salon. Chaque commande est payante.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => setOrder(false)}>
            Compris
          </button>
        </Sheet>
      )}
    </>
  );
}

/**
 * Panneau « Inviter un coiffeur » : prénom, e-mail, rôle, statut et, pour un salarié, volume horaire hebdomadaire.
 * Une erreur n'apparaît qu'une fois son champ quitté (ou réglé, pour le volume horaire) : avant, « Envoyer
 * l'invitation » reste seulement grisé. Le rôle Coiffeur correspond à l'agent du glossaire.
 */
function NewInvite({ m, onClose, onSend }: { m: Manager; onClose: () => void; onSend: (d: InviteDraft) => void }) {
  const [d, setD] = useState<InviteDraft>({ firstName: '', email: '', role: 'agent', status: 'salarie', hours: TEAM_HOURS.default });
  const [left, setLeft] = useState<InviteError['field'][]>([]);
  const leave = (f: InviteError['field']) => setLeft((l) => (l.includes(f) ? l : [...l, f]));
  const put = (patch: Partial<InviteDraft>) => setD({ ...d, ...patch });
  const error = inviteError(d, m);
  const hours = d.hours ?? TEAM_HOURS.default;

  const seg = <K extends 'role' | 'status'>(key: K, label: string, options: [InviteDraft[K], string][]) => (
    <div className="field">
      <span>{label}</span>
      <div className="seg mgr-seg" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} className={d[key] === v ? 'on' : ''} aria-pressed={d[key] === v} onClick={() => put({ [key]: v } as Partial<InviteDraft>)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet title="Inviter un coiffeur" onClose={onClose}>
      <label className="field">
        <span>Prénom</span>
        <input autoFocus value={d.firstName} onChange={(e) => put({ firstName: e.target.value })} onBlur={() => leave('firstName')} />
      </label>
      <label className="field">
        <span>E-mail</span>
        <input type="email" inputMode="email" value={d.email} onChange={(e) => put({ email: e.target.value })} onBlur={() => leave('email')} />
      </label>
      {seg('role', 'Rôle', [
        ['agent', ROLE_LABEL.agent],
        ['gerant', ROLE_LABEL.gerant],
      ])}
      {seg('status', 'Statut', [
        ['salarie', 'Salarié'],
        ['independant', 'Indépendant'],
      ])}
      {d.status === 'salarie' && (
        <div className="field mgr-hours">
          <span>Volume horaire par semaine</span>
          <Stepper
            label="le volume horaire"
            verbs={['Baisser', 'Augmenter']}
            value={`${hours} h`}
            onMinus={hours > TEAM_HOURS.min ? () => (leave('hours'), put({ hours: hours - TEAM_HOURS.step })) : undefined}
            onPlus={hours < TEAM_HOURS.max ? () => (leave('hours'), put({ hours: hours + TEAM_HOURS.step })) : undefined}
          />
        </div>
      )}
      {error && left.includes(error.field) && <p className="error">{error.text}</p>}
      <button
        className="btn btn-primary btn-lg"
        disabled={error !== undefined}
        onClick={() => onSend(d.status === 'salarie' ? { ...d, hours } : { ...d, hours: undefined })}
      >
        Envoyer l&rsquo;invitation
      </button>
    </Sheet>
  );
}

/** 1 jour : ouvert ou fermé, 1 ou 2 plages. Même roulette que les horaires du coiffeur (`DayEditor` dans `agent/Onboarding.tsx`). */
function OpeningDayEditor({
  day,
  wide,
  onCancel,
  onSave,
  onCopy,
}: {
  day: OpeningDay;
  wide: boolean;
  onCancel: () => void;
  onSave: (d: OpeningDay) => void;
  onCopy: (d: OpeningDay) => void;
}) {
  const [d, setD] = useState<OpeningDay>(() => structuredClone(day));
  const [open, setOpen] = useState<string | null>(null);
  const error = openingDayError(d);
  const second = d.ranges.length === 1 ? secondOpeningRange(d.ranges[0]) : undefined;
  const setRange = (i: number, key: 'start' | 'end', v: number) =>
    setD({ ...d, ranges: d.ranges.map((r, j) => (j === i ? { ...r, [key]: v } : r)) });

  const timeRow = (i: number, key: 'start' | 'end', label: string) => {
    const id = `${i}-${key}`;
    return (
      <li className="pause-edit">
        <button className="pause-edit-head" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
          <strong>{label}</strong>
          <span className="time-value">{fmt(d.ranges[i][key])}</span>
        </button>
        {open === id && (
          <div className="pause-edit-body">
            <TimeWheel label={label} value={d.ranges[i][key]} onChange={(v) => setRange(i, key, v)} />
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <button className="back" onClick={onCancel}>
        Retour
      </button>
      <h1 className="title">{DAYS[d.day]}</h1>

      <div className="pause-edit">
        <button type="button" role="switch" aria-checked={d.open} className="pause-edit-head switch-row" onClick={() => setD({ ...d, open: !d.open })}>
          <strong>Ouvert ce jour</strong>
          <span className="switch" aria-hidden />
        </button>
      </div>

      {d.open && (
        <>
          {d.ranges.map((_, i) => (
            <section key={i} className="group">
              {d.ranges.length > 1 && <h2 className="section">{i === 0 ? '1re plage' : '2e plage'}</h2>}
              <ul className="pause-edits">
                {timeRow(i, 'start', 'Ouverture')}
                {timeRow(i, 'end', 'Fermeture')}
              </ul>
              {i === 1 && (
                <button
                  className="btn btn-danger-outline"
                  onClick={() => {
                    setOpen(null);
                    setD({ ...d, ranges: [d.ranges[0]] });
                  }}
                >
                  Retirer la 2e plage
                </button>
              )}
            </section>
          ))}
          {second && (
            <button
              className="btn btn-outline"
              onClick={() => {
                setOpen(null);
                setD({ ...d, ranges: second });
              }}
            >
              Ajouter une 2e plage
            </button>
          )}
          {error && <p className="error">{error}</p>}
          <div className="mgr-copy">
            <button className="btn btn-outline" disabled={error !== undefined} onClick={() => onCopy(d)}>
              Copier sur les jours ouverts
            </button>
            <p className="muted small">Les autres jours ouverts prennent les mêmes heures. Les jours fermés restent fermés.</p>
          </div>
        </>
      )}

      <footer className={wide ? 'mgr-footer' : 'footer'}>
        <button className="btn btn-primary btn-lg" disabled={error !== undefined} onClick={() => onSave(d)}>
          Valider
        </button>
      </footer>
    </>
  );
}

/** Bloc rempli depuis l'achat. « Modifier » ouvre les champs, « Enregistrer » les garde, « Annuler » les oublie. */
function Block({
  title,
  view,
  editing,
  onEdit,
  onCancel,
  onSave,
  canSave,
  children,
}: {
  title: string;
  view: ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mgr-block">
      <div className="mgr-block-head">
        <h2 className="mgr-block-title">{title}</h2>
        {!editing && (
          <button className="btn btn-outline" onClick={onEdit}>
            Modifier
          </button>
        )}
      </div>
      {editing ? (
        <>
          {children}
          <div className="mgr-block-actions">
            <button className="btn btn-outline" onClick={onCancel}>
              Annuler
            </button>
            <button className="btn btn-primary" disabled={!canSave} onClick={onSave}>
              Enregistrer
            </button>
          </div>
        </>
      ) : (
        view
      )}
    </section>
  );
}

function AccountBlock({ m }: { m: Manager }) {
  const { dispatch } = useSim();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(m.firstName);
  const [lastName, setLastName] = useState(m.lastName);
  const [email, setEmail] = useState(m.email);
  const emailTaken = managerEmailError(email, m);
  const ok = firstName.trim() !== '' && lastName.trim() !== '' && /^\S+@\S+\.\S+$/.test(email.trim()) && !emailTaken;

  return (
    <Block
      title="Ton compte"
      editing={editing}
      onEdit={() => {
        setFirstName(m.firstName);
        setLastName(m.lastName);
        setEmail(m.email);
        setEditing(true);
      }}
      onCancel={() => setEditing(false)}
      canSave={ok}
      onSave={() => {
        dispatch({ type: 'managerEdit', account: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() } });
        setEditing(false);
      }}
      view={
        <div className="mgr-lines">
          <p>
            {m.firstName} {m.lastName}
          </p>
          <p className="muted">{m.email}</p>
        </div>
      }
    >
      <label className="field">
        <span>Prénom</span>
        <input autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </label>
      <label className="field">
        <span>Nom</span>
        <input autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </label>
      <label className="field">
        <span>E-mail</span>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {emailTaken && <p className="error">{emailTaken}</p>}
    </Block>
  );
}

function StoreBlock({ m }: { m: Manager }) {
  const { dispatch } = useSim();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.store.name);
  const [address, setAddress] = useState(m.store.address);
  const ok = name.trim() !== '' && address.trim() !== '';

  return (
    <Block
      title="Ton salon"
      editing={editing}
      onEdit={() => {
        setName(m.store.name);
        setAddress(m.store.address);
        setEditing(true);
      }}
      onCancel={() => setEditing(false)}
      canSave={ok}
      onSave={() => {
        dispatch({ type: 'managerEdit', store: { name: name.trim(), address: address.trim() } });
        setEditing(false);
      }}
      view={
        <div className="mgr-lines">
          <p>{m.store.name}</p>
          <p className="muted">{m.store.address}</p>
        </div>
      }
    >
      <label className="field">
        <span>Nom du salon</span>
        <input autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Adresse</span>
        <input autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
    </Block>
  );
}
