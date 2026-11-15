import { useState } from 'react';
import { GROUPS } from '../sim/catalog';
import { MIDI_MAX, MIDI_MIN, PAUSE_LABEL } from '../sim/data';
import { fmt, fmtDuration, todayPlan } from '../sim/engine';
import { useSim } from '../sim/store';
import type { PausePlan, Prestation, QueueFile } from '../sim/types';
import { PrestationIcon } from '../ui/icons';
import { Stepper, TimeWheel } from '../ui/kit';

/** Prestations rangées par bloc : Coupe, Barbe, Soin. */
export function byGroup(list: Prestation[]) {
  return GROUPS.map((g) => ({ ...g, items: list.filter((p) => p.group === g.id) })).filter((g) => g.items.length > 0);
}

/** 1 pause : interrupteur, heure souhaitée à la roulette, et durée pour la pause de midi. */
export function PauseEditor({ pause, onChange }: { pause: PausePlan; onChange: (p: PausePlan) => void }) {
  const label = PAUSE_LABEL[pause.id];
  const midi = pause.id === 'midi';
  return (
    <li className={`pause-edit${pause.on ? '' : ' off'}`}>
      <div className="pause-edit-head">
        <span>
          <strong>{label}</strong>
          <span className="muted small">{midi ? `${fmtDuration(pause.minutes)}, ${fmtDuration(MIDI_MAX)} au plus` : fmtDuration(pause.minutes)}</span>
        </span>
        <button type="button" role="switch" aria-checked={pause.on} aria-label={label} className="switch" onClick={() => onChange({ ...pause, on: !pause.on })} />
      </div>
      {pause.on && (
        <div className="pause-edit-body">
          <span className="muted small">Début souhaité</span>
          <TimeWheel label={label} value={pause.at} onChange={(at) => onChange({ ...pause, at })} />
          {midi && (
            <div className="pause-edit-dur">
              <span className="muted small">Durée</span>
              <Stepper
                label="la pause de midi"
                value={fmtDuration(pause.minutes)}
                onMinus={pause.minutes > MIDI_MIN ? () => onChange({ ...pause, minutes: pause.minutes - 15 }) : undefined}
                onPlus={pause.minutes < MIDI_MAX ? () => onChange({ ...pause, minutes: pause.minutes + 15 }) : undefined}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Confirmation de la configuration du jour, en 3 pages : prestations, pauses, heure de fin (E6-6, S22). */
export function OpenWizard({ file, onDone }: { file: QueueFile; onDone: () => void }) {
  const { s, dispatch } = useSim();
  const day = todayPlan(s);
  const [page, setPage] = useState(0);
  const [durations, setDurations] = useState<Record<string, number>>(Object.fromEntries(file.prestations.map((p) => [p.id, p.minutes])));
  const [pauses, setPauses] = useState<PausePlan[]>(day.pauses.map((p) => ({ ...p })));
  const [end, setEnd] = useState(day.works ? day.end : file.endOfDay);
  const bump = (id: string, d: number) => setDurations((cur) => ({ ...cur, [id]: Math.max(5, cur[id] + d) }));
  const taken = pauses.filter((p) => p.on);

  const titles = ['Tes prestations', 'Tes pauses', 'Ton heure de fin'];
  const leads = [
    'Vérifie tes durées pour aujourd’hui. Les clients verront ces temps.',
    'À quelle heure veux-tu les prendre ? Si une prestation tombe dessus, la pause se décale.',
    'Après cette heure, plus personne ne peut s’inscrire dans ta file.',
  ];

  return (
    // `key` : chaque page repart du haut.
    <main key={page} className="screen with-footer">
      <button className="back" onClick={() => (page === 0 ? onDone() : setPage(page - 1))}>
        Retour
      </button>
      <p className="kicker">Ouverture, étape {page + 1} sur 3</p>
      <h1 className="title">{titles[page]}</h1>
      <p className="muted">{leads[page]}</p>

      {page === 0 &&
        byGroup(file.prestations).map((g) => (
          <section key={g.id} className="group">
            <h2 className="section">{g.label}</h2>
            <ul className="steppers">
              {g.items.map((p) => (
                <li key={p.id} className="stepper">
                  <PrestationIcon id={p.id} size={40} />
                  <span className="choice-label">{p.label}</span>
                  <Stepper
                    label={p.label}
                    value={`${durations[p.id]} min`}
                    onMinus={durations[p.id] > 5 ? () => bump(p.id, -5) : undefined}
                    onPlus={() => bump(p.id, 5)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

      {page === 1 && (
        <ul className="pause-edits">
          {pauses.map((p) => (
            <PauseEditor key={p.id} pause={p} onChange={(np) => setPauses((cur) => cur.map((x) => (x.id === np.id ? np : x)))} />
          ))}
        </ul>
      )}

      {page === 2 && (
        <>
          <div className="panel wheel-panel">
            <TimeWheel label="Heure de fin" value={end} onChange={setEnd} rows={5} />
          </div>
          <div className="panel">
            <p>
              <strong>Ta journée</strong>
            </p>
            <p className="muted">
              {file.prestations.length} prestations. Fin à {fmt(end)}.
            </p>
            {taken.length === 0 ? (
              <p className="muted">Aucune pause.</p>
            ) : (
              <ul className="muted">
                {taken.map((p) => (
                  <li key={p.id}>
                    {PAUSE_LABEL[p.id]} : {fmt(p.at)}, {fmtDuration(p.minutes)}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">Ces réglages valent pour aujourd&rsquo;hui. Ta semaine type ne change pas.</p>
          </div>
        </>
      )}

      <footer className="footer">
        {page < 2 ? (
          <button className="btn btn-primary btn-lg" onClick={() => setPage(page + 1)}>
            Suivant
          </button>
        ) : (
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              dispatch({ type: 'openFile', durations, pauses, endOfDay: end });
              onDone();
            }}
          >
            Ouvrir ma file
          </button>
        )}
      </footer>
    </main>
  );
}
