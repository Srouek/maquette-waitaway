import { useEffect, useState } from 'react';
import { AgentApp } from './agent/AgentApp';
import { ClientApp } from './client/ClientApp';
import { ManagerApp } from './manager/ManagerApp';
import { AGENT_FILE_ID } from './sim/data';
import { fileById, fmt } from './sim/engine';
import { SCENARIOS, SCENARIO_LIST, SCREEN_LABEL, currentStep, scenarioStarted, stepJump, stepText, stepsOf } from './sim/scenarios';
import type { ScenarioId } from './sim/types';
import { useSim } from './sim/store';
import { Sheet } from './ui/kit';

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Page d'accueil du site : la démo en 1 phrase, puis les scénarios. */
function Home({ onResume, onPlay }: { onResume?: () => void; onPlay: (id: ScenarioId) => void }) {
  const { s } = useSim();
  return (
    <main className="home-page">
      <div className="home-page-inner">
        <header className="brand">
          <span className="brand-mark" aria-hidden>
            W
          </span>
          WaitAway
        </header>
        <p className="lead">
          Une maquette cliquable pour essayer WaitAway avec des coiffeurs et leurs clients. La file est simulée dans le navigateur.
        </p>
        <div className="home-cards">
          {onResume && (
            <button className="home-card home-card-resume" onClick={onResume}>
              <strong>Reprendre « {SCENARIOS[s.scenario.id].label} »</strong>
              <span className="small">Le scénario reprend à l&rsquo;étape où il s&rsquo;est arrêté.</span>
            </button>
          )}
          {SCENARIO_LIST.map((sc) => (
            <button key={sc.id} className="home-card" onClick={() => onPlay(sc.id)}>
              <span className="home-card-screen">{SCREEN_LABEL[sc.screen]}</span>
              <strong>{sc.label}</strong>
              <span className="muted small">{sc.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

export function App() {
  const { s, dispatch } = useSim();
  const wide = useWide();
  const step = currentStep(s);
  const jump = step && stepJump(step, s);
  const [menu, setMenu] = useState(false);
  // État d'interface, pas de la simulation : il n'est pas sauvegardé, l'accueil s'affiche à chaque chargement de la page.
  const [home, setHome] = useState(true);
  const scenarioId = s.scenario.id;
  const total = stepsOf(s).length;
  // 1 seul écran par scénario (`screen` dans scenarios.ts) : le téléphone du client dans le scénario client, l'écran du
  // gérant dans le scénario gérant (sans cadre de téléphone à 900 px et plus), le téléphone du coiffeur dans les autres.
  // Le coiffeur pilote sa file avec son seul téléphone : la démo ne montre pas ce que voient ses clients.
  const screen = SCENARIOS[scenarioId].screen;
  const clientOnly = screen === 'client';
  // Le gérant configure son salon sur ordinateur : pas de cadre de téléphone, la page prend toute la largeur.
  const manager = screen === 'manager';

  const play = (id: ScenarioId) => {
    dispatch({ type: 'scenario', id });
    setMenu(false);
    setHome(false);
  };
  const goHome = () => {
    // Le temps s'arrête sur l'accueil : « Reprendre » retrouve le scénario au même moment.
    if (s.playing) dispatch({ type: 'setPlaying', playing: false });
    setMenu(false);
    setHome(true);
  };

  if (home) return <Home onResume={scenarioStarted(s) ? () => setHome(false) : undefined} onPlay={play} />;

  return (
    <div className="shell">
      <div className="demobar" role="toolbar" aria-label="Contrôles de la démo">
        <span className="clock" aria-label="Heure simulée">
          {fmt(s.now)}
        </span>
        <button className="demobtn" aria-label="Avancer de 5 minutes" onClick={() => dispatch({ type: 'advance', minutes: 5 })}>
          {wide ? '+5 min' : '+5'}
        </button>
        <button
          className="demobtn"
          aria-pressed={s.playing}
          aria-label={s.playing ? 'Mettre en pause le temps' : 'Faire avancer le temps'}
          onClick={() => dispatch({ type: 'setPlaying', playing: !s.playing })}
        >
          {s.playing ? '❚❚' : '▶'}
        </button>
        <button className="demobtn" aria-label="Scénarios" onClick={() => setMenu(true)}>
          ⋯
        </button>
      </div>

      <div className="guide" aria-live="polite">
        <span className="guide-count">{step ? `${s.scenario.beat + 1}/${total}` : '✓'}</span>
        {step ? (
          <>
            <span className="guide-text">{stepText(step, s)}</span>
            {jump && (
              <button className="guide-jump" onClick={() => dispatch({ type: 'jump' })}>
                {jump}
              </button>
            )}
          </>
        ) : (
          <>
            <span className="guide-text">
              {fileById(s, AGENT_FILE_ID).incident
                ? `Ta file est fermée sur imprévu : « ${SCENARIOS[scenarioId].label} » s’arrête là. Relance-le pour essayer une autre décision.`
                : `« ${SCENARIOS[scenarioId].label} » est terminé.`}
            </span>
            <button className="guide-jump" onClick={goHome}>
              Autre scénario
            </button>
          </>
        )}
      </div>

      <div className={wide && !manager ? 'stage' : 'single'}>
        {manager ? (
          <ManagerApp wide={wide} />
        ) : wide ? (
          <figure className="device">
            <figcaption>{SCREEN_LABEL[screen]}</figcaption>
            <div className="device-screen">{clientOnly ? <ClientApp /> : <AgentApp />}</div>
          </figure>
        ) : clientOnly ? (
          <ClientApp />
        ) : (
          <AgentApp />
        )}
      </div>

      {menu && (
        <Sheet title="Jouer un scénario" onClose={() => setMenu(false)}>
          {SCENARIO_LIST.map((sc) => (
            <button
              key={sc.id}
              className="preset"
              onClick={() => play(sc.id)}
            >
              <strong>
                {sc.label}
                {sc.id === scenarioId && <span className="you"> (en cours, repart du début)</span>}
              </strong>
              <span className="muted">{sc.hint}</span>
            </button>
          ))}
          <p className="muted small">
            Le bandeau sous l&rsquo;heure donne l&rsquo;étape suivante : une consigne à faire sur le téléphone, ou un bouton pour sauter dans le
            temps. « +5 min » et ▶ restent libres.
          </p>
          <button className="btn btn-outline" onClick={goHome}>
            Accueil
          </button>
        </Sheet>
      )}
    </div>
  );
}
