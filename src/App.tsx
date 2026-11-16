import { useEffect, useState } from 'react';
import { AgentApp } from './agent/AgentApp';
import { ClientApp } from './client/ClientApp';
import { AGENT_FILE_ID } from './sim/data';
import { fileById, fmt } from './sim/engine';
import { SCENARIOS, SCENARIO_LIST, currentStep, stepsOf } from './sim/scenarios';
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

export function App() {
  const { s, dispatch } = useSim();
  const wide = useWide();
  const step = currentStep(s);
  const [menu, setMenu] = useState(false);
  const scenarioId = s.scenario.id;
  const total = stepsOf(s).length;
  // 1 seul téléphone par scénario : celui du client dans le scénario client, celui du coiffeur dans les autres.
  // Le coiffeur pilote sa file avec son seul téléphone : la démo ne montre pas ce que voient ses clients.
  const clientOnly = scenarioId === 'client';

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
            <span className="guide-text">{step.text}</span>
            {step.jump && (
              <button className="guide-jump" onClick={() => dispatch({ type: 'jump' })}>
                {step.jump}
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
            <button className="guide-jump" onClick={() => setMenu(true)}>
              Autre scénario
            </button>
          </>
        )}
      </div>

      <div className={wide ? 'stage' : 'single'}>
        {wide ? (
          <figure className="device">
            <figcaption>{clientOnly ? 'Téléphone du client' : 'Téléphone du coiffeur'}</figcaption>
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
              onClick={() => {
                dispatch({ type: 'scenario', id: sc.id });
                setMenu(false);
              }}
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
        </Sheet>
      )}
    </div>
  );
}
