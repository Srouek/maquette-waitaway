import { useState } from 'react';
import { byGroup } from '../agent/OpenWizard';
import { STORE } from '../sim/data';
import { canJoin, durationOf, fileById, fmt, inService, overtimeEnd, projectedStart, totalWait, waiting } from '../sim/engine';
import { useSim } from '../sim/store';
import { PrestationIcon, StarIcon } from '../ui/icons';

export function StorePage() {
  const { s, dispatch } = useSim();
  return (
    <main className="screen">
      <button className="back" onClick={() => dispatch({ type: 'nav', nav: { screen: s.me.firstName ? 'account' : 'home' } })}>
        Retour
      </button>
      <h1 className="title">{STORE.name}</h1>
      <p className="muted">{STORE.address}</p>

      <h2 className="section">Choisis ton coiffeur</h2>
      <ul className="files">
        {s.files.map((f) => {
          const n = waiting(f).length + (inService(f) ? 1 : 0);
          const wait = totalWait(f, s.now);
          return (
            <li key={f.id}>
              <button className="file-row" disabled={!f.open} onClick={() => dispatch({ type: 'nav', nav: { screen: 'choose', fileId: f.id } })}>
                <span className="avatar" aria-hidden>
                  {f.agentName[0]}
                </span>
                <span className="file-who">
                  <strong>{f.agentName}</strong>
                  <span className="muted">{f.metier}</span>
                </span>
                {f.open ? (
                  <span className="file-wait">
                    <strong>{wait} min</strong>
                    <span className="muted">{n === 0 ? 'personne devant' : `${n} ${n > 1 ? 'personnes' : 'personne'} devant`}</span>
                  </span>
                ) : (
                  <span className="file-wait muted">Fermé</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Pas besoin de compte pour regarder l&rsquo;attente. Il en faut un pour t&rsquo;inscrire.</p>
    </main>
  );
}

export function Choose({ fileId, preselect, tried }: { fileId: string; preselect?: string[]; tried: boolean }) {
  const { s, dispatch } = useSim();
  const f = fileById(s, fileId);
  const [ids, setIds] = useState<string[]>(preselect ?? []);
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const dur = durationOf(f, ids);
  const start = projectedStart(f, s.now, dur);
  const error = canJoin(s, fileId, ids);
  const over = ids.length > 0 && !error ? overtimeEnd(f, s.now, ids) : undefined;

  const join = () => {
    if (error) return dispatch({ type: 'nav', nav: { screen: 'choose', fileId, tried: true } });
    if (!s.me.firstName) return dispatch({ type: 'nav', nav: { screen: 'signup', fileId, prestationIds: ids } });
    dispatch({ type: 'join', fileId, prestationIds: ids });
  };

  return (
    <main className="screen with-footer">
      <button className="back" onClick={() => dispatch({ type: 'nav', nav: { screen: 'store' } })}>
        Retour
      </button>
      <h1 className="title">Avec {f.agentName}</h1>
      <p className="muted">
        {totalWait(f, s.now)} min d&rsquo;attente en ce moment. Les durées sont celles de {f.agentName}.
      </p>

      {byGroup(f.prestations).map((g) => (
        <section key={g.id} className="group">
          <h2 className="section">{g.label}</h2>
          <ul className="choices">
            {g.items.map((p) => {
              const on = ids.includes(p.id);
              const fav = s.me.favorites.includes(p.id);
              return (
                <li key={p.id} className={`choice-row${on ? ' on' : ''}`}>
                  <button className="choice" aria-pressed={on} onClick={() => toggle(p.id)}>
                    <PrestationIcon id={p.id} size={44} />
                    <span className="choice-text">
                      <span className="choice-top">
                        <span className="choice-label">{p.label}</span>
                        <span className="choice-min">{p.minutes} min</span>
                      </span>
                      <span className="muted small">{p.description}</span>
                    </span>
                  </button>
                  <button
                    className={`icon-btn star${fav ? ' on' : ''}`}
                    aria-pressed={fav}
                    aria-label={fav ? `Retirer ${p.label} des favorites` : `Ajouter ${p.label} aux favorites`}
                    onClick={() => dispatch({ type: 'toggleFavorite', id: p.id })}
                  >
                    <StarIcon on={fav} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="footer">
        {tried && error && <p className="error">{error}</p>}
        {over !== undefined && (
          <p className="warn">
            Ta prestation finirait vers {fmt(over)}, après la fermeture de {f.agentName} ({fmt(f.endOfDay)}). Ta demande lui sera envoyée : tu es au
            salon, parle-lui.
          </p>
        )}
        <div className="footer-sum">
          <span>
            Durée <strong>{dur} min</strong>
          </span>
          <span>
            Ton tour vers <strong>{fmt(start)}</strong>
          </span>
        </div>
        <button className="btn btn-primary btn-lg" onClick={join}>
          {over !== undefined ? 'Demander une place' : 'Prendre ma place'}
        </button>
      </footer>
    </main>
  );
}

const EXAMPLE = { lastName: 'Haddad', firstName: 'Samir', email: 'samir.haddad@exemple.fr', password: 'coiffure2026', confirm: 'coiffure2026' };

/** Création du compte au moment de s'inscrire dans la file : Google, ou formulaire par e-mail (E2-0). */
export function Signup({ fileId, prestationIds }: { fileId: string; prestationIds: string[] }) {
  const { dispatch } = useSim();
  const [byMail, setByMail] = useState(false);
  const [form, setForm] = useState({ lastName: '', firstName: '', email: '', password: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((cur) => ({ ...cur, [k]: e.target.value }));

  const errors = {
    lastName: form.lastName.trim() === '' ? 'Indique ton nom.' : '',
    firstName: form.firstName.trim() === '' ? 'Indique ton prénom.' : '',
    email: /^\S+@\S+\.\S+$/.test(form.email.trim()) ? '' : 'Cette adresse e-mail n’est pas valide.',
    password: form.password.length >= 8 ? '' : 'Au moins 8 caractères.',
    confirm: form.confirm === form.password ? '' : 'Les 2 mots de passe sont différents.',
  };
  const valid = Object.values(errors).every((e) => e === '');

  const finish = (firstName: string, lastName: string, email: string) => {
    dispatch({ type: 'signup', firstName, lastName, email });
    dispatch({ type: 'join', fileId, prestationIds });
  };
  const back = () => dispatch({ type: 'nav', nav: { screen: 'choose', fileId, preselect: prestationIds } });

  if (!byMail)
    return (
      <main className="screen">
        <button className="back" onClick={back}>
          Retour
        </button>
        <h1 className="title">Crée ton compte</h1>
        <p className="muted">Il garde ta place et te prévient quand ton tour approche.</p>
        <div className="actions">
          {/* Écart : la connexion Google ne renvoie pas encore de token utilisable (QA-13). */}
          <button className="btn btn-outline btn-lg" onClick={() => finish(EXAMPLE.firstName, EXAMPLE.lastName, 'samir.haddad@gmail.com')}>
            <span className="google" aria-hidden>
              G
            </span>
            Continuer avec Google
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => setByMail(true)}>
            M&rsquo;inscrire par e-mail
          </button>
        </div>
        <p className="muted small">Déjà un compte ? La connexion se fait par les mêmes boutons.</p>
      </main>
    );

  const field = (k: keyof typeof form, label: string, props: Record<string, string>) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[k]} onChange={set(k)} aria-invalid={tried && errors[k] !== ''} {...props} />
      {tried && errors[k] && <span className="error small">{errors[k]}</span>}
    </label>
  );

  return (
    <main className="screen with-footer">
      <button className="back" onClick={() => setByMail(false)}>
        Retour
      </button>
      <h1 className="title">Inscription par e-mail</h1>
      <button className="link" onClick={() => setForm(EXAMPLE)}>
        Remplir avec un exemple
      </button>
      {field('lastName', 'Nom', { autoComplete: 'family-name' })}
      {field('firstName', 'Prénom', { autoComplete: 'given-name' })}
      {field('email', 'E-mail', { type: 'email', inputMode: 'email', autoComplete: 'email' })}
      {field('password', 'Mot de passe', { type: 'password', autoComplete: 'new-password' })}
      {field('confirm', 'Confirmation du mot de passe', { type: 'password', autoComplete: 'new-password' })}
      <footer className="footer">
        <button
          className="btn btn-primary btn-lg"
          onClick={() => {
            setTried(true);
            if (valid) finish(form.firstName.trim(), form.lastName.trim(), form.email.trim());
          }}
        >
          Créer mon compte
        </button>
      </footer>
    </main>
  );
}
