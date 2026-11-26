// TuCita Vet · Fichas clínicas veterinarias (Supabase)
{
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const putP = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { a = a[k] ?? (a[k] = {}); }); a[ks[ks.length - 1]] = v; };
const fDate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : esc(s); };
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'recién'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`; const d = Math.round(h / 24); return d < 30 ? `hace ${d} día${d > 1 ? 's' : ''}` : fDate(iso.slice(0, 10)); };
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const monthsSince = (iso) => {
  if (!iso) return null;
  const b = new Date(iso + 'T12:00'), n = new Date();
  if (isNaN(b)) return null;
  let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth(); if (n.getDate() < b.getDate()) m--;
  return m < 0 ? null : m;
};
const ageOf = (p) => {
  const m = monthsSince(p.fechaNac);
  if (m == null) return p.edad || '';
  const y = Math.floor(m / 12), r = m % 12;
  return (y ? y + (y === 1 ? ' año' : ' años') : '') + (y && r ? ' y ' : '') + (r || !y ? r + (r === 1 ? ' mes' : ' meses') : '') + (p.fechaAprox ? ' (aprox.)' : '');
};
const isoDate = (d) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const isExt = (c) => c.tipo === 'Atención en otra clínica';

const VAC = {
  gen: [['antirrabica', 'Antirrábica']],
  fel: [['tripleFelina', 'Triple felina'], ['leucemiaFelina', 'Leucemia felina']],
  can: [['puppyDP', 'Puppy DP'], ['kc', 'KC'], ['sextuple', 'Séxtuple canina'], ['octuple', 'Óctuple canina']]
};
const vacRow = ([k, l]) => `<div class="vac"><span>${l}</span><div class="yn"><label><input type="radio" name="v_${k}" data-k="vacunas.${k}.aplicada" value="Sí">Sí</label><label><input type="radio" name="v_${k}" data-k="vacunas.${k}.aplicada" value="No">No</label></div><input type="date" data-k="vacunas.${k}.fecha" aria-label="Última fecha ${l}"></div>`;
$('#vacGen').innerHTML = VAC.gen.map(vacRow).join('');
$('#vacFel').insertAdjacentHTML('beforeend', VAC.fel.map(vacRow).join(''));
$('#vacCan').insertAdjacentHTML('beforeend', VAC.can.map(vacRow).join(''));
const syncAgeFromDate = () => { const m = monthsSince($('#fNac').value); $('#edadA').value = m == null ? '' : Math.floor(m / 12); $('#edadM').value = m == null ? '' : m % 12; };
const syncDateFromAge = () => {
  const a = $('#edadA').value, mm = $('#edadM').value; if (a === '' && mm === '') return;
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - ((Number(a) || 0) * 12 + (Number(mm) || 0)));
  $('#fNac').value = isoDate(d); $('#fAprox').checked = true;
};
$('#fNac').addEventListener('input', syncAgeFromDate);
$('#edadA').addEventListener('input', syncDateFromAge);
$('#edadM').addEventListener('input', syncDateFromAge);
const syncTipo = () => { const ext = $('#selTipo').value === 'Atención en otra clínica'; $('#medExterno').classList.toggle('hide', !ext); $('#medInterno').classList.toggle('hide', ext); };
$('#selTipo').addEventListener('change', syncTipo);
const syncEspecie = () => { const e = $('#especie').value; $('#vacFel').classList.toggle('hide', e === 'Canino'); $('#vacCan').classList.toggle('hide', e === 'Felino'); };
$('#especie').addEventListener('change', syncEspecie);

function collect(form) {
  const o = {};
  form.querySelectorAll('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    if (el.type === 'radio') { if (el.checked) putP(o, k, el.value); else if (getP(o, k) === undefined) putP(o, k, ''); }
    else putP(o, k, el.value.trim());
  });
  return o;
}
function fill(form, data) {
  form.querySelectorAll('[data-k]').forEach((el) => {
    const v = getP(data, el.dataset.k) ?? '';
    if (el.type === 'radio') el.checked = v === el.value; else el.value = v;
  });
}


/* ---------- Estado ---------- */
const CFG = window.TUCITA_CONFIG || {};
let sb = null, session = null, myId = null, me = null, isAdmin = false, canDelete = false, started = false, rtChannel = null;
let equipo = {}, pacientes = [], feedDocs = [], ctrlDocs = [], consultas = [], eventos = [];
let cur = null, editPac = null, editCon = null, loaded = false, view = 'vLista', feedMode = 'todas', pTab = 'hist';
const openSet = new Set();
const VIEWS = ['vLista', 'vActividad', 'vControles', 'vEquipo', 'vPerfil', 'vPaciente', 'vFormPac', 'vFormCon'];
const EDITING = ['vPerfil', 'vFormPac', 'vFormCon'];
const pacById = (id) => pacientes.find((p) => p.id === id);
const who = (id) => (id && equipo[id]?.nombre) || (id ? 'Usuario' : '');
const whoRole = (id) => equipo[id]?.cargo || '';
const fDateTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); };

/* Conversión entre filas de Supabase y los objetos que usa la pantalla */
const META_P = ['id', 'numero', 'nombre', 'creado', 'creadoPor', 'actualizado', 'actualizadoPor'];
const rowPac = (r) => ({ ...(r.datos || {}), id: r.id, numero: r.numero, nombre: r.nombre, creado: r.creado_en, creadoPor: r.creado_por, actualizado: r.actualizado_en, actualizadoPor: r.actualizado_por });
const datosPac = (o) => { const d = { ...o }; META_P.forEach((k) => delete d[k]); return d; };
const META_C = ['id', 'pacienteId', 'fecha', 'proximoControl', 'medicoId', 'creado', 'creadoPor', 'actualizado', 'actualizadoPor'];
const rowCon = (r) => ({ ...(r.datos || {}), id: r.id, pacienteId: r.paciente_id, fecha: r.fecha, proximoControl: r.proximo_control || '', medicoId: r.medico_id || '', creado: r.creado_en, creadoPor: r.creado_por, actualizado: r.actualizado_en, actualizadoPor: r.actualizado_por });
const conRow = (o) => { const d = { ...o }; META_C.forEach((k) => delete d[k]); return { fecha: o.fecha, proximo_control: o.proximoControl || null, medico_id: o.medicoId || null, datos: d }; };
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
const logEvt = (pid, tipo, detalle) => q(sb.from('eventos').insert({ paciente_id: pid, tipo, detalle: detalle || '', por: myId }));

function show(v) {
  view = v;
  VIEWS.forEach((x) => $('#' + x).classList.toggle('hide', x !== v));
  document.body.classList.toggle('editing', EDITING.includes(v));
  const navFor = v === 'vPaciente' ? 'vLista' : v;
  $$('.nav').forEach((b) => b.classList.toggle('on', b.dataset.nav === navFor));
  $('#fab').classList.toggle('hide', v !== 'vLista');
  window.scrollTo(0, 0);
  refresh();
}
function refresh() {
  if (!started) return;
  ({ vLista: renderLista, vActividad: renderFeed, vControles: renderCtrl, vEquipo: renderTeam, vPaciente: renderPaciente }[view] || (() => {}))();
  renderMe();
}
const toastEl = $('#toast'); let tt;
const toast = (m) => { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('on'), 2400); };
const banner = (m) => { const b = $('#banner'); b.textContent = m || ''; b.classList.toggle('hide', !m); };
const errMsg = (e) => {
  const m = String(e?.message || '');
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto. Pide a un administrador que revise tu acceso.';
  if (/JWT|session/i.test(m)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión a internet. Revisa tu conexión e inténtalo de nuevo.';
  return 'No se pudo guardar: ' + (m || 'error desconocido');
};
function ask(title, text, yes = 'Eliminar') {
  return new Promise((res) => {
    $('#mTitle').textContent = title; $('#mText').textContent = text; $('#mYes').textContent = yes; $('#modal').classList.add('on'); $('#mNo').focus();
    const done = (v) => { $('#modal').classList.remove('on'); $('#mYes').onclick = $('#mNo').onclick = null; res(v); };
    $('#mYes').onclick = () => done(true); $('#mNo').onclick = () => done(false);
  });
}
function ready() {
  if (!me?.activo) { banner('Tu cuenta no está activa. Pide a un administrador que te apruebe.'); return false; }
  return true;
}

/* ---------- Carga de datos ---------- */
async function fetchAll(table, orderCol, asc = true) {
  // Supabase entrega como máximo 1000 filas por consulta: se piden por páginas
  const out = [], step = 1000;
  for (let from = 0; ; from += step) {
    const rows = await q(sb.from(table).select('*').order(orderCol, { ascending: asc }).range(from, from + step - 1));
    out.push(...rows);
    if (rows.length < step) return out;
  }
}
async function loadAll() {
  const [eq, pa, fe, ct] = await Promise.all([
    q(sb.from('perfiles').select('*').order('nombre')),
    fetchAll('pacientes', 'actualizado_en', false),
    q(sb.from('consultas').select('*').order('creado_en', { ascending: false }).limit(60)),
    q(sb.from('consultas').select('*').gte('proximo_control', today()).order('proximo_control').limit(300))
  ]);
  equipo = Object.fromEntries(eq.map((r) => [r.id, r]));
  me = equipo[myId] || me; isAdmin = me?.rol === 'admin' && me?.activo; canDelete = isAdmin;
  pacientes = pa.map(rowPac); feedDocs = fe.map(rowCon); ctrlDocs = ct.map(rowCon);
  if (cur) await loadPac(cur);
  loaded = true;
}
async function loadPac(id) {
  const [c, e] = await Promise.all([
    q(sb.from('consultas').select('*').eq('paciente_id', id)),
    q(sb.from('eventos').select('*').eq('paciente_id', id).order('en', { ascending: false }).limit(300))
  ]);
  if (cur === id) { consultas = c.map(rowCon); eventos = e; }
}
async function reloadAll() { try { await loadAll(); banner(''); } catch (e) { banner(errMsg(e)); } refresh(); }
let rtT; const reloadSoon = () => { clearTimeout(rtT); rtT = setTimeout(() => { if (!EDITING.includes(view)) reloadAll(); }, 500); };

/* ---------- Perfil ---------- */
function renderMe() {
  const n = me?.nombre || 'Mi perfil';
  $('#meAv').textContent = $('#meBtnM').textContent = initials(n);
  $('#meName').textContent = n;
  $('#meRole').textContent = (me?.cargo || '') + (isAdmin ? ' (admin)' : '');
}
let perfilFirst = false;
function openPerfil(first) {
  perfilFirst = !!first;
  const f = $('#fPerfil'); f.reset();
  fill(f, me || {});
  $('#perfilTitle').textContent = first ? 'Bienvenido/a: completa tu perfil' : 'Mi perfil';
  show('vPerfil');
}
$('#meBtn').onclick = $('#meBtnM').onclick = $('#btnPerfil2').onclick = () => openPerfil();
$('#perfilCancel').onclick = () => show(perfilFirst ? 'vLista' : 'vEquipo');
$('#fPerfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = collect(e.target);
  if (!data.nombre) { toast('Escribe tu nombre'); return; }
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    await q(sb.from('perfiles').update({ nombre: data.nombre, cargo: data.cargo, registro: data.registro || '' }).eq('id', myId));
    try { localStorage.setItem('perfilOk_' + myId, '1'); } catch {}
    await loadAll(); toast('Perfil guardado'); show(perfilFirst ? 'vLista' : 'vEquipo');
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});

/* ---------- Pacientes ---------- */
let mode = innerWidth >= 900 ? 'tabla' : 'tarjetas', sortK = 'actualizado', sortDir = -1;
try { mode = localStorage.getItem('vetMode') || mode; } catch {}
const ctrlOf = (id) => { const c = ctrlDocs.find((x) => x.pacienteId === id); return c ? c.proximoControl : ''; };
const COLS = [
  ['numero', 'N° ficha', (p) => p.numero, (p) => Number(p.numero) || 0, 'num'],
  ['nombre', 'Paciente', (p) => p.nombre],
  ['especie', 'Especie', (p) => p.especie],
  ['raza', 'Raza', (p) => p.raza],
  ['sexo', 'Sexo', (p) => p.sexo],
  ['edad', 'Edad', (p) => ageOf(p), (p) => { const m = monthsSince(p.fechaNac); return m == null ? -1 : m; }],
  ['tutor', 'Tutor', (p) => p.tutor?.nombre],
  ['rut', 'RUT tutor', (p) => p.tutor?.rut],
  ['tel', 'Teléfono', (p) => p.tutor?.telefono],
  ['ultima', 'Última atención', (p) => fDate(p.ultima?.fecha), (p) => p.ultima?.fecha || ''],
  ['medico', 'Médico última atención', (p) => p.ultima?.medicoId ? who(p.ultima.medicoId) : (p.ultima?.externo || '')],
  ['control', 'Próximo control', (p) => fDate(ctrlOf(p.id)), (p) => ctrlOf(p.id) || 'z'],
  ['actualizado', 'Actualizado', (p) => ago(p.actualizado), (p) => p.actualizado || '']
];
function filteredPacs() {
  const q = $('#q').value.trim().toLowerCase(), esp = $('#fEsp').value, med = $('#fMed').value;
  const col = COLS.find((c) => c[0] === sortK) || COLS[COLS.length - 1];
  const sv = col[3] || ((p) => String(col[2](p) ?? '').toLowerCase());
  return pacientes.filter((p) => (!q || [p.numero, p.nombre, p.raza, p.tutor?.nombre, p.tutor?.rut, p.tutor?.telefono, p.microchip?.numero, ...(p.tutoresAnteriores || []).map((t) => t.nombre)].some((v) => String(v ?? '').toLowerCase().includes(q)))
    && (!esp || p.especie === esp) && (!med || (p.medicos || []).includes(med)))
    .sort((a, b) => { const x = sv(a), y = sv(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
}
function renderLista() {
  const fm = $('#fMed'), keep = fm.value;
  fm.innerHTML = '<option value="">Todo el equipo</option>' + Object.keys(equipo).sort((a, b) => who(a).localeCompare(who(b))).map((id) => `<option value="${esc(id)}">${esc(who(id))}</option>`).join('');
  fm.value = keep;
  $$('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#tblWrap').classList.toggle('hide', mode !== 'tabla'); $('#listPac').classList.toggle('hide', mode === 'tabla');
  const rows = filteredPacs();
  $('#countPac').textContent = loaded ? pacientes.length + (pacientes.length === 1 ? ' ficha' : ' fichas') : '';
  $('#tblInfo').textContent = loaded ? `${rows.length} de ${pacientes.length} pacientes` : '';
  $('#tblHead').innerHTML = COLS.map(([k, l]) => `<th><button data-sort="${k}" ${k === sortK ? `aria-sort="${sortDir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${k === sortK ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  $('#tblBody').innerHTML = rows.map((p) => `<tr tabindex="0" data-id="${esc(p.id)}">${COLS.map((c) => `<td class="${c[4] || ''}">${c[0] === 'nombre' ? '<b>' + esc(c[2](p)) + '</b>' : esc(c[2](p))}</td>`).join('')}</tr>`).join('');
  $('#listPac').innerHTML = rows.map((p) => `<button class="pc" data-id="${esc(p.id)}"><span class="av">${esc(initials(p.nombre))}</span>
    <span class="row" style="gap:8px"><b>${esc(p.nombre)}</b><span class="muted small">N° ${esc(p.numero)}</span></span>
    <span class="muted small">${esc([p.especie, p.raza, ageOf(p)].filter(Boolean).join(' · '))}</span>
    <span class="small">Tutor: ${esc(p.tutor?.nombre) || '—'}${p.ultima ? ` <span class="muted">· Última atención ${fDate(p.ultima.fecha)}${p.ultima.medicoId ? ' con ' + esc(who(p.ultima.medicoId)) : ''}</span>` : ''}</span></button>`).join('');
  const e = $('#emptyPac');
  e.classList.toggle('hide', rows.length > 0);
  $('#emptyPacTxt').textContent = !loaded ? 'Cargando pacientes…' : pacientes.length ? 'Ningún paciente coincide con la búsqueda.' : 'Aún no hay pacientes. Crea el primero con “+ Nuevo paciente”.';
}
$('#q').addEventListener('input', renderLista);
$('#fEsp').addEventListener('change', renderLista);
$('#fMed').addEventListener('change', renderLista);
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; try { localStorage.setItem('vetMode', mode); } catch {} renderLista(); }));
$('#tblHead').addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; if (sortK === b.dataset.sort) sortDir = -sortDir; else { sortK = b.dataset.sort; sortDir = ['actualizado', 'ultima'].includes(sortK) ? -1 : 1; } renderLista(); });
$('#tblBody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openPaciente(tr.dataset.id); });
$('#tblBody').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') openPaciente(tr.dataset.id); });
$('#btnCopyTbl').addEventListener('click', async () => {
  const rows = filteredPacs(), clean = (v) => String(v ?? '').replace(/[\t\n\r]+/g, ' ');
  const tsv = [COLS.map((c) => c[1]).join('\t'), ...rows.map((p) => COLS.map((c) => clean(c[2](p))).join('\t'))].join('\n');
  try { await navigator.clipboard.writeText(tsv); toast(`${rows.length} filas copiadas: pégalas en Excel`); } catch { toast('El navegador no permitió copiar'); }
});
$('#listPac').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) openPaciente(b.dataset.id); });

const kv = (l, v) => `<div><span>${l}</span><b>${v ? esc(v) : '—'}</b></div>`;
const sortedCons = () => [...consultas].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado).localeCompare(String(a.creado)));
function renderPaciente() {
  const p = pacById(cur);
  if (!p) { $('#pacHead').innerHTML = '<p class="muted">Este paciente ya no existe.</p>'; $('#histList').innerHTML = ''; $('#pDatos').innerHTML = ''; return; }
  const list = sortedCons(), last = list[0];
  const alerg = last && last.alergias && !/^no\.?$/i.test(last.alergias) ? last.alergias : '';
  const ctrl = last?.proximoControl && last.proximoControl >= today() ? last.proximoControl : '';
  $('#pacHead').innerHTML = `
    <div class="row" style="align-items:flex-start;gap:14px"><span class="av lg">${esc(initials(p.nombre))}</span>
      <div style="flex:1"><div class="row" style="gap:8px"><h1>${esc(p.nombre)}</h1><span class="pill">Ficha N° ${esc(p.numero)}</span></div>
      <div class="muted">${esc([p.especie, p.raza, p.sexo, ageOf(p)].filter(Boolean).join(' · '))}</div>
      <div class="small" style="margin-top:4px">Tutor: <b>${esc(p.tutor?.nombre) || '—'}</b>${p.tutor?.telefono ? ' · ' + esc(p.tutor.telefono) : ''}</div></div></div>
    <div class="row" style="gap:6px">${alerg ? `<span class="pill bad">Alergia: ${esc(alerg)}</span>` : ''}${ctrl ? `<span class="pill am">Próximo control ${fDate(ctrl)}</span>` : ''}<span class="pill">${list.length} consulta${list.length === 1 ? '' : 's'}</span></div>
    <div class="muted small">Ficha creada por ${esc(who(p.creadoPor) || '—')}${p.creado ? ' el ' + fDate(p.creado.slice(0, 10)) : ''}${p.actualizadoPor ? ` · último cambio por ${esc(who(p.actualizadoPor))} ${ago(p.actualizado)}` : ''}</div>`;
  $('#tabHist').textContent = `Historial (${list.length})`;
  $$('[data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === pTab));
  $('#pHist').classList.toggle('hide', pTab !== 'hist'); $('#pDatos').classList.toggle('hide', pTab !== 'datos'); $('#pReg').classList.toggle('hide', pTab !== 'reg');
  const tutLine = (t) => esc([t.nombre, t.rut, t.telefono, t.email].filter(Boolean).join(' · ') || 'Sin datos');
  const prevT = [...(p.tutoresAnteriores || [])].reverse();
  const evs = eventos;
  $('#pReg').innerHTML = `<div class="card g"><div class="row"><h2>Tutor actual</h2><button class="b sm sp" id="btnCambioTutor">Registrar cambio de dueño</button></div><p style="margin:0">${tutLine(p.tutor || {})}</p></div>
    <div class="card g"><h2>Dueños anteriores</h2>${prevT.length ? '<div>' + prevT.map((t) => `<div class="log"><span class="av">${esc(initials(t.nombre))}</span><span><b>${tutLine(t)}</b><br><span class="muted small">Tutor hasta el ${fDate(t.hasta)}${t.cambiadoPor ? ' · cambio registrado por ' + esc(who(t.cambiadoPor)) : ''}</span></span></div>`).join('') + '</div>' : '<p class="muted" style="margin:0">Sin cambios de dueño registrados.</p>'}</div>
    <div class="card g"><h2>Registro de cambios en la ficha</h2>${evs.length ? '<div>' + evs.map((e) => `<div class="log"><span class="av" style="width:32px;height:32px;font-size:12px">${esc(initials(who(e.por)))}</span><span><b>${esc(e.tipo)}</b>${e.detalle ? ' — ' + esc(e.detalle) : ''}<br><span class="muted small">${esc(who(e.por) || '—')} · ${fDateTime(e.en)}</span></span></div>`).join('') + '</div>' : '<p class="muted" style="margin:0">Sin cambios registrados todavía.</p>'}</div>`;
  $('#btnCambioTutor').onclick = () => openFormPac(p, true);
  const vacs = [...VAC.gen, ...(p.especie !== 'Canino' ? VAC.fel : []), ...(p.especie !== 'Felino' ? VAC.can : [])]
    .map(([k, l]) => { const v = p.vacunas?.[k] || {}; return kv(l, [v.aplicada, fDate(v.fecha)].filter(Boolean).join(' · ')); }).join('');
  $('#pDatos').innerHTML = `<h2>Reseña</h2>
    <div class="kv">${kv('Edad', ageOf(p))}${kv('Fecha de nacimiento', fDate(p.fechaNac))}${kv('Sexo', p.sexo)}${kv('Raza', p.raza)}${kv('Color', p.color)}${kv('Marca / señas', p.marca)}${kv('Microchip', [p.microchip?.tiene, p.microchip?.numero].filter(Boolean).join(' · '))}${kv('Esterilizado', p.esterilizado)}</div>
    <h2>Tutor</h2>
    <div class="kv">${kv('Nombre', p.tutor?.nombre)}${kv('RUT', p.tutor?.rut)}${kv('Correo', p.tutor?.email)}${kv('Contacto', p.tutor?.telefono)}<div style="grid-column:1/-1"><span>Dirección</span><b>${esc(p.tutor?.direccion) || '—'}</b></div></div>
    <h2>Vacunas y desparasitación</h2>
    <div class="kv">${vacs}${kv('Desparasitación interna', p.desparasitacion?.interna)}${kv('Desparasitación externa', p.desparasitacion?.externa)}${kv('Producto', p.desparasitacion?.producto)}</div>
    <div class="row"><button class="b sm" id="btnEditPac">Editar datos</button><button class="b sm" id="btnCambioTutor2">Cambio de dueño</button>${canDelete ? '<button class="b sm danger sp" id="btnDelPac">Eliminar paciente</button>' : ''}</div>`;
  $('#btnEditPac').onclick = () => openFormPac(p);
  $('#btnCambioTutor2').onclick = () => openFormPac(p, true);
  if (canDelete) $('#btnDelPac').onclick = () => delPaciente(p);
  renderHist(list);
}
$$('[data-ptab]').forEach((b) => b.addEventListener('click', () => { pTab = b.dataset.ptab; renderPaciente(); }));

const sec = (t, v) => v ? `<div><h4>${t}</h4><p>${esc(v)}</p></div>` : '';
const CONST = [['peso', 'Peso (kg)'], ['temp', 'T° (°C)'], ['fc', 'FC'], ['fr', 'FR'], ['pulso', 'Pulso'], ['tllc', 'TLLC'], ['dh', '% DH'], ['mucosas', 'Mucosas'], ['cc', 'CC']];
const medicoDe = (c) => isExt(c) ? `${c.externo?.veterinario || 'Veterinario externo'} (${c.externo?.clinica || 'otra clínica'})` : c.medicoId ? who(c.medicoId) : (c.veterinario || who(c.creadoPor));
function renderHist(list) {
  if (!list.length) { $('#histList').innerHTML = '<div class="empty card">Sin consultas registradas. Usa “+ Nueva consulta” para la primera atención.</div>'; return; }
  $('#histList').innerHTML = '<div class="tl">' + list.map((c) => {
    const d = c.dieta || {}, k = c.constantes || {};
    const dieta = [['Seca', d.seca], ['Húmeda', d.humeda], ['Casera', d.casera], ['Frecuencia', d.frecuencia], ['Cantidad', d.cantidad], ['Otros', d.otros]].filter((x) => x[1]).map((x) => x[0] + ': ' + x[1]).join(' · ');
    const cons = CONST.filter(([key]) => k[key]).map(([key, l]) => `<div><span>${l}</span>${esc(k[key])}</div>`).join('');
    const trat = c.tratamientoPrevio?.si ? c.tratamientoPrevio.si + (c.tratamientoPrevio.cual ? ' — ' + c.tratamientoPrevio.cual : '') : '';
    const titulo = (c.motivo || c.prediagnosticos || c.anamnesisActual || 'Consulta').split('\n')[0].slice(0, 90);
    const firma = `Registrado por ${who(c.creadoPor) || '—'}${c.creado ? ' el ' + fDate(c.creado.slice(0, 10)) : ''}${c.actualizadoPor && c.actualizado !== c.creado ? ` · editado por ${who(c.actualizadoPor)} ${ago(c.actualizado)}` : ''}`;
    return `<details class="hist" data-id="${esc(c.id)}" ${openSet.has(c.id) ? 'open' : ''}><summary>
      <span class="row" style="gap:8px"><b>${fDate(c.fecha)}</b><span class="tag ${isExt(c) ? 'ext' : ''}">${esc(c.tipo || 'Consulta')}</span><span>${esc(titulo)}</span></span>
      <span class="muted small">${esc(medicoDe(c) || 'Sin médico asignado')}${k.peso ? ' · ' + esc(k.peso) + ' kg' : ''}${k.temp ? ' · ' + esc(k.temp) + ' °C' : ''}${c.proximoControl ? ' · Control ' + fDate(c.proximoControl) : ''}</span></summary>
      <div class="hbody">${sec('Motivo de consulta', c.motivo)}${sec('Anamnesis remota', c.anamnesisRemota)}${sec('Anamnesis actual', c.anamnesisActual)}${sec('Dieta', dieta)}${sec('Enfermedades previas', c.enfermedadesPrevias)}${sec('Tratamiento para la enfermedad actual', trat)}${sec('Alergias', c.alergias)}
      ${cons ? `<div><h4>Constantes fisiológicas</h4><div class="cons">${cons}</div></div>` : ''}${sec('Examen físico', c.examenFisico)}${sec('Exámenes complementarios', c.examenesComplementarios)}${sec('Prediagnósticos', c.prediagnosticos)}${sec('Indicaciones', c.indicaciones)}${sec('Próximo control', fDate(c.proximoControl))}${sec(isExt(c) ? 'Atendido en' : 'Médico tratante', medicoDe(c))}
      <p class="muted small" data-firma>${esc(firma)}</p>
      <div class="row"><button class="b sm" data-act="edit">Editar</button><button class="b sm" data-act="copy">Copiar como texto</button>${canDelete ? '<button class="b sm danger sp" data-act="del">Eliminar</button>' : ''}</div></div></details>`;
  }).join('') + '</div>';
}
$('#histList').addEventListener('toggle', (e) => { const d = e.target; if (d.matches?.('details[data-id]')) d.open ? openSet.add(d.dataset.id) : openSet.delete(d.dataset.id); }, true);
$('#histList').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const det = b.closest('details'), c = consultas.find((x) => x.id === det.dataset.id); if (!c) return;
  if (b.dataset.act === 'edit') { if (ready()) openFormCon(c); }
  if (b.dataset.act === 'del') {
    if (!(await ask('Eliminar consulta', `Se borrará la consulta del ${fDate(c.fecha)} y no se puede recuperar.`))) return;
    try {
      await q(sb.from('consultas').delete().eq('id', c.id));
      await logEvt(cur, 'Consulta eliminada', `${fDate(c.fecha)} · ${c.tipo || 'Consulta'}${c.motivo ? ' · ' + c.motivo : ''}`);
      toast('Consulta eliminada'); await reloadAll();
    } catch (err) { banner(errMsg(err)); }
  }
  if (b.dataset.act === 'copy') {
    const p = pacById(cur) || {};
    const parts = [...det.querySelectorAll('.hbody > div:not(.row)')].map((x) => x.querySelector('h4').textContent.toUpperCase() + ':\n' + (x.querySelector('p')?.textContent || [...x.querySelectorAll('.cons div')].map((d) => d.firstChild.textContent + ' ' + d.lastChild.textContent).join(' | ')));
    const txt = [`FICHA CLÍNICA N° ${p.numero} — ${p.nombre} (${p.especie})`, `Tutor: ${p.tutor?.nombre || ''} ${p.tutor?.rut || ''}`, `Fecha: ${fDate(c.fecha)}`, ...parts, det.querySelector('[data-firma]').textContent].join('\n\n');
    try { await navigator.clipboard.writeText(txt); toast('Copiado: pégalo en Word o en un correo'); } catch { toast('El navegador no permitió copiar'); }
  }
});


async function openPaciente(id) {
  if (cur !== id) {
    cur = id; consultas = []; eventos = []; openSet.clear(); pTab = 'hist';
    show('vPaciente');
    try { await loadPac(id); } catch (e) { banner(errMsg(e)); }
  }
  show('vPaciente');
}
async function delPaciente(p) {
  const n = consultas.length;
  if (!(await ask('Eliminar paciente', `Se borrará la ficha de ${p.nombre}${n ? ` y sus ${n} consulta${n > 1 ? 's' : ''}` : ''}, junto con su registro de cambios. No se puede recuperar.`))) return;
  try {
    await q(sb.from('pacientes').delete().eq('id', p.id));
    cur = null; consultas = []; eventos = [];
    await loadAll(); show('vLista'); toast('Paciente eliminado');
  } catch (err) { banner(errMsg(err)); }
}

/* ---------- Formulario paciente ---------- */
let cambioTutor = false;
function openFormPac(p, cambio) {
  if (!ready()) return;
  editPac = p || null; cambioTutor = !!(p && cambio);
  const f = $('#fPac'); f.reset();
  fill(f, p ? (cambioTutor ? { ...p, tutor: {} } : p) : { especie: 'Canino' });
  $('#fAprox').checked = !!p?.fechaAprox;
  syncAgeFromDate();
  $('#edadA').placeholder = p && !p.fechaNac && p.edad ? p.edad : '0';
  $('#cambioTutorNote').classList.toggle('hide', !cambioTutor);
  $('#fPacTitle').textContent = cambioTutor ? 'Cambio de dueño' : p ? 'Editar paciente' : 'Nuevo paciente';
  $('#fPacNum').textContent = p ? 'Ficha N° ' + p.numero : 'N° de ficha automático';
  syncEspecie(); show('vFormPac');
  if (cambioTutor) setTimeout(() => $('#fsTutor').scrollIntoView({ block: 'start' }), 50);
}
$('#btnNuevoPac').onclick = $('#fab').onclick = () => openFormPac();
$('#fPac').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ready()) return;
  const data = collect(e.target);
  if (!data.nombre) { toast('Falta el nombre del paciente'); e.target.querySelector('[data-k=nombre]').focus(); return; }
  data.fechaAprox = $('#fAprox').checked && !!data.fechaNac;
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (editPac) {
      const old = pacById(editPac.id) || editPac;
      const ot = old.tutor || {}, nt = data.tutor || {};
      const changed = !!((ot.nombre || ot.rut) && (cambioTutor || (ot.rut && nt.rut && ot.rut !== nt.rut)));
      let tutoresAnteriores = old.tutoresAnteriores || [];
      if (changed) tutoresAnteriores = [...tutoresAnteriores, { ...ot, hasta: today(), cambiadoPor: myId }];
      await q(sb.from('pacientes').update({ nombre: data.nombre, datos: datosPac({ ...old, ...data, tutoresAnteriores }) }).eq('id', old.id));
      if (changed) await logEvt(old.id, 'Cambio de dueño', `${ot.nombre || 'sin nombre'} → ${nt.nombre || 'sin nombre'}`);
      else {
        const diff = ['nombre', 'especie', 'raza', 'fechaNac', 'sexo', 'esterilizado', 'color', 'marca'].filter((k) => String(old[k] ?? '') !== String(data[k] ?? ''));
        await logEvt(old.id, 'Datos editados', diff.length ? 'Cambió: ' + diff.join(', ') : 'Tutor, vacunas o desparasitación');
      }
      await loadAll(); toast(changed ? 'Cambio de dueño registrado' : 'Paciente actualizado'); openPaciente(old.id);
    } else {
      const r = await q(sb.from('pacientes').insert({ nombre: data.nombre, datos: datosPac({ ...data, medicos: [], tutoresAnteriores: [] }) }).select().single());
      await logEvt(r.id, 'Ficha creada', 'N° ' + r.numero);
      await loadAll(); toast(`Paciente guardado con ficha N° ${r.numero}`); openPaciente(r.id);
    }
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});

/* ---------- Formulario consulta ---------- */
function fillMedicos(sel) {
  const ids = Object.keys(equipo).filter((id) => equipo[id].activo || id === sel)
    .sort((a, b) => (equipo[a].cargo === 'Médico veterinario' ? 0 : 1) - (equipo[b].cargo === 'Médico veterinario' ? 0 : 1) || who(a).localeCompare(who(b)));
  if (sel && !ids.includes(sel)) ids.push(sel);
  $('#selMedico').innerHTML = '<option value="">— Sin asignar —</option>' + ids.map((id) => `<option value="${esc(id)}">${esc(who(id))}${whoRole(id) ? ' · ' + esc(whoRole(id)) : ''}</option>`).join('');
}
function openFormCon(c) {
  if (!ready()) return;
  editCon = c || null;
  const f = $('#fCon'); f.reset();
  const prev = sortedCons()[0];
  const defMed = me?.cargo === 'Médico veterinario' ? myId : (prev?.medicoId || '');
  fillMedicos(c?.medicoId || defMed);
  fill(f, c ? { tipo: 'Consulta', ...c } : { fecha: today(), tipo: 'Consulta', medicoId: defMed, anamnesisRemota: prev?.anamnesisRemota || '', dieta: prev?.dieta || {}, enfermedadesPrevias: prev?.enfermedadesPrevias || '', alergias: prev?.alergias || '' });
  const p = pacById(cur);
  syncTipo();
  $('#fConTitle').textContent = c ? 'Editar consulta' : 'Nueva consulta';
  $('#fConPac').textContent = p ? `${p.nombre} · Ficha N° ${p.numero}` : '';
  show('vFormCon');
}
$('#btnNuevaCon').onclick = () => openFormCon();
$('#fCon').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ready()) return;
  const data = collect(e.target);
  if (!data.fecha) { toast('Falta la fecha de la consulta'); return; }
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  const ext = data.tipo === 'Atención en otra clínica';
  if (ext) data.medicoId = '';
  try {
    if (editCon) {
      await q(sb.from('consultas').update(conRow({ ...editCon, ...data })).eq('id', editCon.id));
      await logEvt(cur, 'Consulta editada', `${fDate(data.fecha)} · ${data.tipo}`);
    } else {
      const r = await q(sb.from('consultas').insert({ paciente_id: cur, ...conRow(data) }).select().single());
      openSet.add(r.id);
    }
    const p = pacById(cur);
    if (p) {
      const isLatest = !p.ultima || data.fecha >= p.ultima.fecha;
      const medicos = [...new Set([...(p.medicos || []), data.medicoId].filter(Boolean))];
      const ultima = isLatest ? { fecha: data.fecha, medicoId: data.medicoId || '', externo: ext ? medicoDe(data) : '' } : p.ultima;
      await q(sb.from('pacientes').update({ datos: datosPac({ ...p, medicos, ultima }) }).eq('id', cur));
    }
    await loadAll(); toast('Consulta guardada'); openPaciente(cur);
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});

$$('[data-cancel]').forEach((b) => b.addEventListener('click', () => (b.form.id === 'fCon' || editPac) && pacById(cur) ? openPaciente(cur) : show('vLista')));
$$('[data-back]').forEach((b) => b.addEventListener('click', () => show('vLista')));
$$('[data-nav]').forEach((b) => b.addEventListener('click', () => show(b.dataset.nav)));

/* ---------- Actividad, controles, equipo ---------- */
const feedItem = (c, right) => { const p = pacById(c.pacienteId); return `<button class="fi" data-pid="${esc(c.pacienteId)}"><span class="av">${esc(initials(p?.nombre))}</span>
  <span><b>${esc(p?.nombre || 'Paciente eliminado')}</b> <span class="muted small">${p ? 'N° ' + esc(p.numero) : ''}</span><br><span class="small">${esc((c.motivo || c.prediagnosticos || 'Consulta').split('\n')[0].slice(0, 80))}</span><br><span class="muted small">${esc(medicoDe(c) || 'Sin médico asignado')}${c.creadoPor && c.creadoPor !== c.medicoId ? ' · registrado por ' + esc(who(c.creadoPor)) : ''}</span></span>
  <span class="muted small when">${right}</span></button>`; };
function renderFeed() {
  $$('[data-feed]').forEach((b) => b.classList.toggle('on', b.dataset.feed === feedMode));
  const list = feedDocs.filter((c) => feedMode === 'todas' || c.medicoId === myId || c.creadoPor === myId);
  $('#feed').innerHTML = list.length ? list.map((c) => feedItem(c, `${fDate(c.fecha)}<br>${ago(c.creado)}`)).join('') : `<div class="empty">${loaded ? 'Todavía no hay consultas registradas.' : 'Cargando…'}</div>`;
}
$$('[data-feed]').forEach((b) => b.addEventListener('click', () => { feedMode = b.dataset.feed; renderFeed(); }));
function renderCtrl() {
  const t = today();
  $('#ctrlList').innerHTML = ctrlDocs.length ? ctrlDocs.map((c) => { const p = pacById(c.pacienteId); return feedItem(c, `<span class="pill ${c.proximoControl === t ? 'am' : ''}">${c.proximoControl === t ? 'Hoy' : fDate(c.proximoControl)}</span>${p?.tutor?.telefono ? '<br>' + esc(p.tutor.telefono) : ''}`); }).join('') : `<div class="empty">${loaded ? 'No hay controles agendados. Agrega la fecha en “Próximo control” al registrar una consulta.' : 'Cargando…'}</div>`;
}
$('#feed').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b && pacById(b.dataset.pid)) openPaciente(b.dataset.pid); });
$('#ctrlList').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b && pacById(b.dataset.pid)) openPaciente(b.dataset.pid); });

function renderTeam() {
  const all = Object.keys(equipo).sort((a, b) => who(a).localeCompare(who(b)));
  const activos = all.filter((id) => equipo[id].activo), pend = all.filter((id) => !equipo[id].activo);
  const row = (id, actions) => `<div class="fi" style="cursor:default"><span class="av">${esc(initials(who(id)))}</span><span><b>${esc(who(id))}</b>${id === myId ? ' <span class="pill">Tú</span>' : ''}${equipo[id].rol === 'admin' ? ' <span class="pill am">Admin</span>' : ''}<br><span class="muted small">${esc(whoRole(id))}${equipo[id].registro ? ' · ' + esc(equipo[id].registro) : ''}${equipo[id].email ? ' · ' + esc(equipo[id].email) : ''}</span></span><span class="row" style="gap:6px;justify-content:flex-end">${actions}</span></div>`;
  $('#teamList').innerHTML = activos.length ? activos.map((id) => row(id, isAdmin && id !== myId ? `<button class="b sm" data-adm="rol" data-id="${esc(id)}">${equipo[id].rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button><button class="b sm danger" data-adm="off" data-id="${esc(id)}">Quitar acceso</button>` : '')).join('') : '<div class="empty">Cargando…</div>';
  $('#pendCard').classList.toggle('hide', !isAdmin || !pend.length);
  renderRespaldo();
  $('#pendList').innerHTML = pend.map((id) => row(id, `<button class="b sm pri" data-adm="on" data-id="${esc(id)}">Aprobar</button>`)).join('');
}
async function adminAction(e) {
  const b = e.target.closest('[data-adm]'); if (!b || !isAdmin) return;
  const id = b.dataset.id, p = equipo[id]; if (!p) return;
  let upd;
  if (b.dataset.adm === 'on') upd = { activo: true };
  if (b.dataset.adm === 'off') { if (!(await ask('Quitar acceso', `${p.nombre} ya no podrá ver ni registrar fichas. Lo que registró se mantiene con su nombre.`, 'Quitar acceso'))) return; upd = { activo: false }; }
  if (b.dataset.adm === 'rol') upd = { rol: p.rol === 'admin' ? 'miembro' : 'admin' };
  try { await q(sb.from('perfiles').update(upd).eq('id', id)); await reloadAll(); toast('Equipo actualizado'); } catch (err) { banner(errMsg(err)); }
}
$('#teamList').addEventListener('click', adminAction);
$('#pendList').addEventListener('click', adminAction);
$('#btnCopyUrl').onclick = async () => { const u = location.origin + location.pathname; try { await navigator.clipboard.writeText(u); toast('Dirección copiada'); } catch { toast(u); } };



/* ---------- Respaldo (solo administradores) ---------- */
const stampFile = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
const clinicSlug = () => (CFG.NOMBRE_CLINICA || 'clinica').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
function bajar(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function cargarXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx.full.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('No se pudo cargar la librería de Excel')); document.head.appendChild(sc); });
}
async function datosRespaldo() {
  const [perfiles, pacs, cons, evs] = await Promise.all([fetchAll('perfiles', 'creado_en'), fetchAll('pacientes', 'numero'), fetchAll('consultas', 'fecha'), fetchAll('eventos', 'en')]);
  return { perfiles, pacs, cons, evs };
}
const fdt = (iso) => iso ? new Date(iso).toLocaleString('es-CL') : '';
const nom = (eq, id) => (id && eq[id]?.nombre) || '';
function hojas({ perfiles, pacs, cons, evs }) {
  const eq = Object.fromEntries(perfiles.map((r) => [r.id, r]));
  const P = pacs.map(rowPac), byId = Object.fromEntries(P.map((p) => [p.id, p]));
  const vacCols = [...VAC.gen, ...VAC.fel, ...VAC.can];
  const pacientes = P.map((p) => {
    const o = {
      'N° ficha': p.numero, 'Nombre': p.nombre, 'Especie': p.especie || '', 'Raza': p.raza || '', 'Sexo': p.sexo || '',
      'Fecha nacimiento': fDate(p.fechaNac), 'Fecha aproximada': p.fechaAprox ? 'Sí' : '', 'Edad': ageOf(p), 'Color': p.color || '', 'Marca / señas': p.marca || '',
      'Microchip': p.microchip?.tiene || '', 'N° microchip': p.microchip?.numero || '', 'Esterilizado': p.esterilizado || '',
      'Tutor': p.tutor?.nombre || '', 'RUT tutor': p.tutor?.rut || '', 'Teléfono': p.tutor?.telefono || '', 'Correo tutor': p.tutor?.email || '', 'Dirección': p.tutor?.direccion || ''
    };
    vacCols.forEach(([k, l]) => { const v = p.vacunas?.[k] || {}; o[l] = [v.aplicada, fDate(v.fecha)].filter(Boolean).join(' '); });
    Object.assign(o, {
      'Desparasitación interna': p.desparasitacion?.interna || '', 'Desparasitación externa': p.desparasitacion?.externa || '', 'Producto desparasitación': p.desparasitacion?.producto || '',
      'Dueños anteriores': (p.tutoresAnteriores || []).map((t) => `${t.nombre || ''} ${t.rut || ''} (hasta ${fDate(t.hasta)})`.trim()).join(' | '),
      'Ficha creada por': nom(eq, p.creadoPor), 'Creada': fdt(p.creado), 'Último cambio por': nom(eq, p.actualizadoPor), 'Último cambio': fdt(p.actualizado)
    });
    return o;
  });
  const consultas = cons.map(rowCon).map((c) => {
    const p = byId[c.pacienteId] || {}, d = c.dieta || {}, k = c.constantes || {}, ext = isExt(c);
    return {
      'N° ficha': p.numero || '', 'Paciente': p.nombre || '', 'Fecha': fDate(c.fecha), 'Tipo': c.tipo || 'Consulta', 'Motivo': c.motivo || '',
      'Médico tratante': ext ? '' : nom(eq, c.medicoId), 'Clínica externa': ext ? c.externo?.clinica || '' : '', 'Veterinario externo': ext ? c.externo?.veterinario || '' : '',
      'Anamnesis remota': c.anamnesisRemota || '', 'Anamnesis actual': c.anamnesisActual || '',
      'Dieta seca': d.seca || '', 'Dieta húmeda': d.humeda || '', 'Dieta casera': d.casera || '', 'Frecuencia': d.frecuencia || '', 'Cantidad': d.cantidad || '', 'Dieta otros': d.otros || '',
      'Enfermedades previas': c.enfermedadesPrevias || '', 'Tratamiento previo': c.tratamientoPrevio?.si || '', 'Cuál tratamiento': c.tratamientoPrevio?.cual || '', 'Alergias': c.alergias || '',
      'Peso (kg)': k.peso || '', 'T° (°C)': k.temp || '', 'FC': k.fc || '', 'FR': k.fr || '', 'Pulso': k.pulso || '', 'TLLC': k.tllc || '', '% DH': k.dh || '', 'Mucosas': k.mucosas || '', 'CC': k.cc || '',
      'Examen físico': c.examenFisico || '', 'Exámenes complementarios': c.examenesComplementarios || '', 'Prediagnósticos': c.prediagnosticos || '', 'Indicaciones': c.indicaciones || '',
      'Próximo control': fDate(c.proximoControl), 'Registrada por': nom(eq, c.creadoPor), 'Creada': fdt(c.creado), 'Último cambio por': nom(eq, c.actualizadoPor), 'Último cambio': fdt(c.actualizado)
    };
  });
  const cambios = evs.map((e) => ({ 'Fecha y hora': fdt(e.en), 'N° ficha': byId[e.paciente_id]?.numero || '', 'Paciente': byId[e.paciente_id]?.nombre || '(eliminado)', 'Cambio': e.tipo, 'Detalle': e.detalle || '', 'Por': nom(eq, e.por) }));
  const equipoH = perfiles.map((r) => ({ 'Nombre': r.nombre, 'Cargo': r.cargo, 'Registro': r.registro || '', 'Correo': r.email || '', 'Rol': r.rol, 'Acceso': r.activo ? 'Activo' : 'Pendiente / sin acceso', 'Desde': fdt(r.creado_en) }));
  return { Pacientes: pacientes, Consultas: consultas, 'Registro de cambios': cambios, Equipo: equipoH };
}
async function exportar(tipo, btn) {
  if (!isAdmin) return;
  btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Preparando…';
  try {
    const data = await datosRespaldo();
    const base = `Respaldo_${clinicSlug()}_${stampFile()}`;
    if (tipo === 'xlsx') {
      await cargarXLSX();
      const wb = XLSX.utils.book_new(), H = hojas(data);
      Object.entries(H).forEach(([nombre, filas]) => {
        const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ '(sin datos)': '' }]);
        const cols = Object.keys(filas[0] || { x: 1 });
        ws['!cols'] = cols.map((c) => ({ wch: Math.min(48, Math.max(c.length, ...filas.slice(0, 200).map((f) => String(f[c] ?? '').length)) + 2) }));
        XLSX.utils.book_append_sheet(wb, ws, nombre);
      });
      XLSX.writeFile(wb, base + '.xlsx', { compression: true });
    } else {
      const json = { app: 'TuCita Vet', clinica: CFG.NOMBRE_CLINICA || '', exportado: new Date().toISOString(), exportado_por: me?.email || '', schema: CFG.SCHEMA || 'vet',
        perfiles: data.perfiles, pacientes: data.pacs, consultas: data.cons, eventos: data.evs };
      bajar(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), base + '.json');
    }
    try { localStorage.setItem('ultimoRespaldo', new Date().toISOString()); } catch {}
    toast(`Respaldo descargado: ${data.pacs.length} pacientes, ${data.cons.length} consultas`);
    renderRespaldo();
  } catch (err) { banner('No se pudo generar el respaldo: ' + (err.message || err)); }
  finally { btn.disabled = false; btn.textContent = txt; }
}
function renderRespaldo() {
  $('#respCard').classList.toggle('hide', !isAdmin);
  let u = null; try { u = localStorage.getItem('ultimoRespaldo'); } catch {}
  const dias = u ? Math.floor((Date.now() - new Date(u)) / 864e5) : null;
  $('#respUltimo').textContent = u ? `Último respaldo desde este equipo: ${fdt(u)}${dias >= 7 ? ' · ya pasó una semana, conviene sacar uno nuevo' : ''}` : 'Aún no has descargado un respaldo desde este equipo.';
  $('#respUltimo').classList.toggle('am', dias == null || dias >= 7);
}
$('#btnRespXlsx').onclick = (e) => exportar('xlsx', e.currentTarget);
$('#btnRespJson').onclick = (e) => exportar('json', e.currentTarget);

/* ---------- Inicio de sesión ---------- */
let authMode = 'in', inRecovery = /type=recovery/.test(location.hash);
const amsg = (el, m, bad) => { const x = $(el); x.textContent = m || ''; x.classList.toggle('hide', !m); x.classList.toggle('bad', !!bad); };
const authErr = (e) => {
  const m = String(e?.message || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Falta confirmar tu correo: revisa tu bandeja de entrada (y spam).';
  if (/already registered|already exists/i.test(m)) return 'Ese correo ya tiene cuenta. Usa “Ingresar”.';
  if (/at least|Password should/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  if (/provider is not enabled/i.test(m)) return 'El inicio con Google aún no está activado en Supabase (ver guía, paso 4).';
  return m || 'No se pudo completar. Inténtalo de nuevo.';
};
function showAuth(panel) {
  document.body.classList.add('auth');
  ['pLogin', 'pClave', 'pPendiente', 'pConfig'].forEach((p) => $('#' + p).classList.toggle('hide', p !== panel));
}
function setAuthMode(m) {
  authMode = m;
  $$('[data-am]').forEach((b) => b.classList.toggle('on', b.dataset.am === m));
  $('#lNombre').classList.toggle('hide', m !== 'up');
  $('#aSubmit').textContent = m === 'up' ? 'Crear cuenta' : 'Ingresar';
  $('#aPass').autocomplete = m === 'up' ? 'new-password' : 'current-password';
  $('#btnOlvide').classList.toggle('hide', m === 'up');
  amsg('#aMsg', '');
}
$$('[data-am]').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.am)));
const backUrl = () => location.origin + location.pathname;
$('#pLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#aEmail').value.trim(), password = $('#aPass').value, nombre = $('#aNombre').value.trim();
  if (!email || !password) return amsg('#aMsg', 'Escribe tu correo y tu contraseña.', true);
  if (authMode === 'up' && !nombre) return amsg('#aMsg', 'Escribe tu nombre y apellido.', true);
  if (authMode === 'up' && password.length < 8) return amsg('#aMsg', 'La contraseña debe tener al menos 8 caracteres.', true);
  const btn = $('#aSubmit'); btn.disabled = true;
  try {
    if (authMode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: nombre }, emailRedirectTo: backUrl() } });
      if (error) throw error;
      if (!data.session) amsg('#aMsg', 'Cuenta creada. Te enviamos un correo para confirmarla: ábrelo y luego vuelve a ingresar.');
    }
  } catch (err) { amsg('#aMsg', authErr(err), true); } finally { btn.disabled = false; }
});
$('#btnGoogle').onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: backUrl() } });
  if (error) amsg('#aMsg', authErr(error), true);
};
$('#btnOlvide').onclick = async () => {
  const email = $('#aEmail').value.trim();
  if (!email) return amsg('#aMsg', 'Escribe tu correo arriba y vuelve a tocar “¿Olvidaste tu contraseña?”.', true);
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: backUrl() });
  amsg('#aMsg', error ? authErr(error) : 'Si el correo tiene cuenta, te llegará un enlace para crear una contraseña nueva.', !!error);
};
$('#pClave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('#nPass').value;
  if (password.length < 8) return amsg('#nMsg', 'La contraseña debe tener al menos 8 caracteres.', true);
  const { error } = await sb.auth.updateUser({ password });
  if (error) return amsg('#nMsg', authErr(error), true);
  inRecovery = false; history.replaceState(null, '', backUrl()); toast('Contraseña actualizada'); started = false; start();
});
const salir = async () => { try { await sb.auth.signOut(); } catch {} location.replace(backUrl()); };
$('#btnSalir').onclick = $('#btnSalir2').onclick = $('#btnSalir3').onclick = salir;
$('#btnReintentar').onclick = () => { started = false; start(); };

async function start() {
  if (started || !session || inRecovery) return;
  myId = session.user.id;
  let perfil = null;
  const { data, error } = await sb.rpc('registrarme');
  if (error) {
    showAuth('pConfig');
    $('#pConfig').innerHTML = '<h2>No se pudo conectar con la base de datos</h2><p style="margin:0">Revisa que ejecutaste <b>schema.sql</b> y que agregaste <b>vet</b> en “Exposed schemas” (guía, paso 2). Detalle: <span id="cfgErr"></span></p><div class="row"><button class="b" id="btnSalir4">Cerrar sesión</button></div>';
    $('#cfgErr').textContent = error.message || ''; $('#btnSalir4').onclick = salir; return;
  }
  perfil = Array.isArray(data) ? data[0] : data;
  me = perfil;
  if (!perfil || !perfil.activo) { $('#pendEmail').textContent = session.user.email || ''; showAuth('pPendiente'); return; }
  started = true;
  document.body.classList.remove('auth');
  show('vLista');
  try { await loadAll(); } catch (e) { banner(errMsg(e)); }
  refresh();
  if (!rtChannel) {
    rtChannel = sb.channel('cambios')
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'pacientes' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'consultas' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'perfiles' }, reloadSoon)
      .subscribe();
  }
  let ok = false; try { ok = localStorage.getItem('perfilOk_' + myId) === '1'; } catch {}
  if (!ok && (!me.nombre || me.nombre === (session.user.email || '').split('@')[0])) openPerfil(true);
}

(async function boot() {
  if (!CFG.SUPABASE_URL || /TU-PROYECTO/.test(CFG.SUPABASE_URL) || !window.supabase) { showAuth('pConfig'); return; }
  if (CFG.NOMBRE_CLINICA) { document.title = CFG.NOMBRE_CLINICA + ' · Fichas clínicas'; $$('.brand > span:last-child, .authc h1, .topm b').forEach((el) => { el.firstChild.textContent = CFG.NOMBRE_CLINICA; }); }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { db: { schema: CFG.SCHEMA || 'vet' } });
  setAuthMode('in');
  sb.auth.onAuthStateChange((event, s) => {
    session = s;
    if (event === 'PASSWORD_RECOVERY') inRecovery = true;
    if (inRecovery) { showAuth('pClave'); return; }
    if (event === 'SIGNED_OUT') { started = false; showAuth('pLogin'); return; }
    if (s && !started) setTimeout(start, 0);
  });
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (inRecovery) showAuth('pClave'); else if (session) start(); else showAuth('pLogin');
})();
}
