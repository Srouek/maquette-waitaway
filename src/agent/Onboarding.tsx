import { useState } from 'react';
import { CATALOG } from '../sim/catalog';
import { AGENT_FILE_ID, DAYS, PAUSE_LABEL } from '../sim/data';
import { fileById, fmt } from '../sim/engine';
import { useSim } from '../sim/store';
import type { DayPlan } from '../sim/types';
import { PencilIcon, PrestationIcon } from '../ui/icons';
import { Stepper, TimeWheel } from '../ui/kit';
import { PauseEditor, byGroup } from './OpenWizard';

/** Création du compte de l'agent, après la connexion : profil, prestations, horaires. */
export function Onboarding() {
  const { s } = useSim();
  if (s.agent.setup === 'profil') return <Profil />;
  if (s.agent.setup === 'prestations') return <Prestations />;
  return <Horaires />;
}

const METIERS = ['Barbier', 'Coiffeur', 'Coiffeuse'];

function Profil() {
  const { s, dispatch } = useSim();
  const [firstName, setFirstName] = useState(s.agent.firstName);
  const [lastName, setLastName] = useState(s.agent.lastName);
  const [metier, setMetier] = useState(METIERS[0]);
  const ok = firstName.trim() !== '' && lastName.trim() !== '';

  return (
    <main className="screen with-footer">
      <p className="kicker">Ton compte, étape 1 sur 3</p>
      <h1 className="title">Ton profil</h1>
      <p className="muted">Les clients voient ton prénom et ton métier quand ils choisissent leur coiffeur.</p>
      <label className="field">
        <span>Prénom</span>
        <input autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ex. Antoine" />
      </label>
      <label className="field">
        <span>Nom</span>
        <input autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ex. Lefèvre" />
      </label>
      <div className="field">
        <span>Métier</span>
        <div className="seg" role="group" aria-label="Métier">
          {METIERS.map((m) => (
            <button key={m} className={m === metier ? 'on' : ''} aria-pressed={m === metier} onClick={() => setMetier(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {!ok && (
        <button
          className="link"
          onClick={() => {
            setFirstName('Antoine');
            setLastName('Lefèvre');
          }}
        >
          Remplir avec un exemple
        </button>
      )}
      <footer className="footer">
        <button
          className="btn btn-primary btn-lg"
          disabled={!ok}
          onClick={() => dispatch({ type: 'agentProfile', firstName: firstName.trim(), lastName: lastName.trim(), metier })}
        >
          Continuer
        </button>
      </footer>
    </main>
  );
}

function Prestations() {
  const { s, dispatch } = useSim();
  const current = fileById(s, AGENT_FILE_ID).prestations;
  const [minutes, setMinutes] = useState<Record<string, number>>(Object.fromEntries(current.map((p) => [p.id, p.minutes])));
  const count = Object.keys(minutes).length;

  const toggle = (id: string, def: number) =>
    setMinutes((cur) => {
      const next = { ...cur };
      if (id in next) delete next[id];
      else next[id] = def;
      return next;
    });
  const bump = (id: string, d: number) => setMinutes((cur) => ({ ...cur, [id]: Math.max(5, cur[id] + d) }));

  return (
    <main className="screen with-footer">
      <p className="kicker">Ton compte, étape 2 sur 3</p>
      <h1 className="title">Tes prestations</h1>
      <p className="muted">Coche celles que tu proposes. La durée est celle que les clients verront, tu peux l&rsquo;ajuster.</p>

      {byGroup(CATALOG).map((g) => {
        const all = g.items.every((p) => p.id in minutes);
        return (
          <section key={g.id} className="group">
            <div className="group-head">
              <h2 className="section">{g.label}</h2>
              <button
                className="link"
                onClick={() =>
                  setMinutes((cur) => {
                    const next = { ...cur };
                    for (const p of g.items) {
                      if (all) delete next[p.id];
                      else next[p.id] ??= p.minutes;
                    }
                    return next;
                  })
                }
              >
                {all ? 'Tout retirer' : 'Tout cocher'}
              </button>
            </div>
            <ul className="choices">
              {g.items.map((p) => {
                const on = p.id in minutes;
                return (
                  <li key={p.id} className={`choice-row${on ? ' on' : ''}`}>
                    <button className="choice" aria-pressed={on} onClick={() => toggle(p.id, p.minutes)}>
                      <span className="check" aria-hidden />
                      <PrestationIcon id={p.id} size={40} />
                      <span className="choice-label">{p.label}</span>
                    </button>
                    {on && (
                      <Stepper
                        label={p.label}
                        value={`${minutes[p.id]} min`}
                        onMinus={minutes[p.id] > 5 ? () => bump(p.id, -5) : undefined}
                        onPlus={() => bump(p.id, 5)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <footer className="footer">
        {/* Sans prestation, l'ouverture d'une file est refusée (QA-17, règle 7). */}
        <button className="btn btn-primary btn-lg" disabled={count === 0} onClick={() => dispatch({ type: 'agentPrestations', minutes })}>
          {count === 0 ? 'Coche au moins 1 prestation' : `Continuer avec ${count} ${count > 1 ? 'prestations' : 'prestation'}`}
        </button>
      </footer>
    </main>
  );
}

function Horaires() {
  const { s, dispatch } = useSim();
  const [editing, setEditing] = useState<number | null>(null);

  if (editing !== null)
    return (
      <DayEditor
        plan={s.agent.week[editing]}
        onCancel={() => setEditing(null)}
        onSave={(plan) => {
          dispatch({ type: 'agentDay', plan });
          setEditing(null);
        }}
      />
    );

  return (
    <main className="screen with-footer">
      <p className="kicker">Ton compte, étape 3 sur 3</p>
      <h1 className="title">Tes horaires</h1>
      <p className="muted">Une semaine type, déjà remplie. Le crayon ouvre un jour pour changer ses heures et ses pauses.</p>

      <ul className="week">
        {s.agent.week.map((d) => {
          const taken = d.pauses.filter((p) => p.on);
          return (
            <li key={d.day} className={`week-day${d.works ? '' : ' off'}`}>
              <span className="week-info">
                <strong>{DAYS[d.day]}</strong>
                {d.works ? (
                  <>
                    <span>
                      {fmt(d.start)} à {fmt(d.end)}
                    </span>
                    <span className="muted small">{taken.length === 0 ? 'Sans pause' : `Pauses : ${taken.map((p) => fmt(p.at)).join(', ')}`}</span>
                  </>
                ) : (
                  <span className="muted">Repos</span>
                )}
              </span>
              <button className="icon-btn" aria-label={`Modifier ${DAYS[d.day]}`} onClick={() => setEditing(d.day)}>
                <PencilIcon />
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="footer">
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'agentSetupDone' })}>
          Terminer
        </button>
      </footer>
    </main>
  );
}

/** 1 jour de la semaine type : début, 3 pauses, fin. */
function DayEditor({ plan, onCancel, onSave }: { plan: DayPlan; onCancel: () => void; onSave: (p: DayPlan) => void }) {
  const [d, setD] = useState<DayPlan>(() => structuredClone(plan));
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const invalid = d.works && d.end <= d.start;

  const timeRow = (key: 'start' | 'end', label: string) => (
    <li className="pause-edit">
      <button className="pause-edit-head" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
        <strong>{label}</strong>
        <span className="time-value">{fmt(d[key])}</span>
      </button>
      {open === key && (
        <div className="pause-edit-body">
          <TimeWheel label={label} value={d[key]} onChange={(v) => setD({ ...d, [key]: v })} />
        </div>
      )}
    </li>
  );

  return (
    <main className="screen with-footer">
      <button className="back" onClick={onCancel}>
        Retour
      </button>
      <h1 className="title">{DAYS[d.day]}</h1>

      <div className="pause-edit">
        <div className="pause-edit-head">
          <strong>Je travaille ce jour</strong>
          <button type="button" role="switch" aria-checked={d.works} aria-label="Je travaille ce jour" className="switch" onClick={() => setD({ ...d, works: !d.works })} />
        </div>
      </div>

      {d.works && (
        <ul className="pause-edits">
          {timeRow('start', 'Heure de début')}
          {d.pauses.map((p) => (
            <PauseEditor key={p.id} pause={p} onChange={(np) => setD({ ...d, pauses: d.pauses.map((x) => (x.id === np.id ? np : x)) })} />
          ))}
          {timeRow('end', 'Heure de fin')}
        </ul>
      )}
      {invalid && <p className="error">L&rsquo;heure de fin doit venir après l&rsquo;heure de début.</p>}
      {d.works && d.pauses.some((p) => p.on && (p.at < d.start || p.at >= d.end)) && (
        <p className="warn">
          {d.pauses
            .filter((p) => p.on && (p.at < d.start || p.at >= d.end))
            .map((p) => PAUSE_LABEL[p.id])
            .join(', ')}{' '}
          : hors de tes heures de travail.
        </p>
      )}

      <footer className="footer">
        <button className="btn btn-primary btn-lg" disabled={invalid} onClick={() => onSave(d)}>
          Valider
        </button>
      </footer>
    </main>
  );
}
