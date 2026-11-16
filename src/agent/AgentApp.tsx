import { useEffect, useState } from 'react';
import { AGENT_FILE_ID, DAYS, STORE } from '../sim/data';
import { fileById, fmt, todayPlan } from '../sim/engine';
import { useSim } from '../sim/store';
import { Toasts, useScan } from '../ui/kit';
import { Onboarding } from './Onboarding';
import { OpenWizard } from './OpenWizard';
import { DurationSuggestions, QueueScreen } from './Queue';

export function AgentApp() {
  const { s } = useSim();
  const f = fileById(s, AGENT_FILE_ID);
  const scan = useScan();
  const [configuring, setConfiguring] = useState(false);
  const loggedIn = s.agent.loggedIn;

  // Un scénario rechargé repart de la connexion : l'ouverture en cours est abandonnée.
  useEffect(() => {
    if (!loggedIn) setConfiguring(false);
  }, [loggedIn]);

  let screen;
  if (!loggedIn) screen = <Login />;
  else if (s.agent.setup !== 'done') screen = <Onboarding />;
  else if (f.open) screen = <QueueScreen file={f} />;
  else if (configuring) screen = <OpenWizard file={f} onDone={() => setConfiguring(false)} />;
  else {
    const day = todayPlan(s);
    screen = (
      <main className="screen home agent-closed">
        <header className="agent-head">
          <span className="avatar" aria-hidden>
            {f.agentName[0]}
          </span>
          <span>
            <strong>{f.agentName}</strong>
            <span className="muted">
              {f.metier}, {STORE.name}
            </span>
          </span>
        </header>
        <div className="home-body">
          <h1 className="display">Ta file est fermée.</h1>
          <p className="lead">
            {f.closedAt !== undefined ? `Fermée à ${fmt(f.closedAt)}.` : 'Pour l’ouvrir, scanne le QR code collé à ton poste.'}
          </p>
          <DurationSuggestions file={f} />
          <p className="muted">
            {DAYS[s.weekday]} : {day.works ? `${fmt(day.start)} à ${fmt(day.end)}, ${f.prestations.length} prestations.` : 'jour de repos dans tes horaires.'}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-lg" onClick={() => scan.start('QR du poste de ' + f.agentName, () => setConfiguring(true))}>
            Ouvrir ma file
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app app-agent">
      <Toasts to="agent" />
      {screen}
      {scan.node}
    </div>
  );
}

const DEMO_EMAIL = 'antoine@salonleclos.fr';
const DEMO_CODE = '482159';

/**
 * Connexion de l'agent : e-mail, puis code à 6 chiffres reçu par e-mail.
 * Le gérant a validé l'adresse au préalable : un agent ne crée pas son compte seul (QA-16).
 */
function Login() {
  const { s, dispatch } = useSim();
  const [email, setEmail] = useState(s.agent.email);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const isNew = s.agent.setup !== 'done';
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  if (!sent)
    return (
      <main className="screen with-footer">
        <header className="brand">
          <span className="brand-mark" aria-hidden>
            W
          </span>
          WaitAway Pro
        </header>
        <h1 className="title">{isNew ? 'Crée ton compte coiffeur' : 'Connexion'}</h1>
        <p className="muted">
          {isNew ? `Le gérant de ${STORE.name} a validé ton adresse. Saisis-la pour recevoir ton code.` : 'On t’envoie un code par e-mail, sans mot de passe.'}
        </p>
        <label className="field">
          <span>Ton e-mail</span>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@salon.fr" />
        </label>
        {email.trim() === '' && (
          <button className="link" onClick={() => setEmail(DEMO_EMAIL)}>
            Utiliser l&rsquo;adresse de démo
          </button>
        )}
        <footer className="footer">
          <button className="btn btn-primary btn-lg" disabled={!emailOk} onClick={() => setSent(true)}>
            Recevoir mon code
          </button>
        </footer>
      </main>
    );

  return (
    <main className="screen with-footer">
      <button className="back" onClick={() => setSent(false)}>
        Retour
      </button>
      <h1 className="title">Ton code</h1>
      <p className="muted">
        Envoyé à <strong>{email.trim()}</strong>. Il est valable 10 min.
      </p>
      <label className="field">
        <span>Code à 6 chiffres</span>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
        />
      </label>
      <button className="mail" onClick={() => setCode(DEMO_CODE)}>
        <span className="muted small">E-mail reçu, simulé pour la démo</span>
        <strong>Ton code WaitAway : {DEMO_CODE.slice(0, 3)} {DEMO_CODE.slice(3)}</strong>
        <span className="link">Utiliser ce code</span>
      </button>
      <footer className="footer">
        <button className="btn btn-primary btn-lg" disabled={code.length !== 6} onClick={() => dispatch({ type: 'agentLogin', email: email.trim() })}>
          {isNew ? 'Continuer' : 'Me connecter'}
        </button>
      </footer>
    </main>
  );
}
