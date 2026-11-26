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
let semanaCount = 0;
let cur = null, editPac = null, editCon = null, loaded = false, view = 'vInicio', feedMode = 'todas', pTab = 'hist';
const openSet = new Set();
const VIEWS = ['vImport', 'vAgenda', 'vCotizaciones', 'vInventario', 'vFormCita', 'vFormProd', 'vFormCot', 'vFormReceta', 'vInicio', 'vTutores', 'vLista', 'vActividad', 'vControles', 'vEquipo', 'vPerfil', 'vPaciente', 'vFormPac', 'vFormCon'];
const EDITING = ['vPerfil', 'vFormPac', 'vFormCon', 'vFormCita', 'vFormProd', 'vFormCot', 'vFormReceta'];
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
  const navFor = { vPaciente: 'vLista', vFormPac: 'vLista', vFormCon: 'vLista', vFormReceta: 'vLista', vFormCita: 'vAgenda', vFormProd: 'vInventario', vFormCot: 'vCotizaciones', vImport: 'vInventario' }[v] || v;
  if (v === 'vAgenda' && started) loadAgenda().then(() => { if (view === 'vAgenda') renderAgenda(); });
  $$('.nav').forEach((b) => b.classList.toggle('on', b.dataset.nav === navFor));
  $('#fab').classList.toggle('hide', !['vLista', 'vInicio', 'vTutores'].includes(v));
  $('#gres').classList.add('hide');
  window.scrollTo(0, 0);
  refresh();
}
function refresh() {
  if (!started) return;
  ({ vAgenda: renderAgenda, vCotizaciones: renderCots, vInventario: renderInv, vInicio: renderInicio, vTutores: renderTutores, vLista: renderLista, vActividad: renderFeed, vControles: renderCtrl, vEquipo: renderTeam, vPaciente: renderPaciente }[view] || (() => {}))();
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
  try {
    const d = new Date(); d.setDate(d.getDate() - 6);
    const { count } = await sb.from('consultas').select('id', { count: 'exact', head: true }).gte('fecha', isoDate(d));
    semanaCount = count || 0;
  } catch { semanaCount = 0; }
  equipo = Object.fromEntries(eq.map((r) => [r.id, r]));
  me = equipo[myId] || me; isAdmin = me?.rol === 'admin' && me?.activo; canDelete = isAdmin;
  pacientes = pa.map(rowPac); feedDocs = fe.map(rowCon); ctrlDocs = ct.map(rowCon);
  if (cur) await loadPac(cur);
  await loadModulos();
  loaded = true;
}
async function loadPac(id) {
  const [c, e] = await Promise.all([
    q(sb.from('consultas').select('*').eq('paciente_id', id)),
    q(sb.from('eventos').select('*').eq('paciente_id', id).order('en', { ascending: false }).limit(300))
  ]);
  const [r, ci] = await Promise.all([
    sb.from('recetas').select('*').eq('paciente_id', id).order('fecha', { ascending: false }),
    sb.from('citas').select('*').eq('paciente_id', id).order('inicio', { ascending: false }).limit(100)
  ]);
  if (cur === id) { consultas = c.map(rowCon); eventos = e; recetasPac = r.data || []; citasPac = ci.data || []; }
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
  $('#listPac').innerHTML = rows.map((p) => `<button class="pc" data-id="${esc(p.id)}"><span class="${avCls(p)}">${esc(initials(p.nombre))}</span>
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
    <div class="row" style="align-items:flex-start;gap:14px"><span class="${avCls(p)} lg">${esc(initials(p.nombre))}</span>
      <div style="flex:1"><div class="row" style="gap:8px"><h1>${esc(p.nombre)}</h1><span class="pill">Ficha N° ${esc(p.numero)}</span></div>
      <div class="muted">${esc([p.especie, p.raza, p.sexo, ageOf(p)].filter(Boolean).join(' · '))}</div>
      <div class="small" style="margin-top:4px">Tutor: <b>${esc(p.tutor?.nombre) || '—'}</b>${p.tutor?.telefono ? ' · ' + esc(p.tutor.telefono) : ''}</div></div></div>
    <div class="row" style="gap:6px">${alerg ? `<span class="pill bad">Alergia: ${esc(alerg)}</span>` : ''}${ctrl ? `<span class="pill am">Próximo control ${fDate(ctrl)}</span>` : ''}<span class="pill">${list.length} consulta${list.length === 1 ? '' : 's'}</span></div>
    <div class="muted small">Ficha creada por ${esc(who(p.creadoPor) || '—')}${p.creado ? ' el ' + fDate(p.creado.slice(0, 10)) : ''}${p.actualizadoPor ? ` · último cambio por ${esc(who(p.actualizadoPor))} ${ago(p.actualizado)}` : ''}</div>`;
  $('#tabHist').textContent = `Historial (${list.length})`;
  $$('[data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === pTab));
  $('#pHist').classList.toggle('hide', pTab !== 'hist'); $('#pDatos').classList.toggle('hide', pTab !== 'datos'); $('#pReg').classList.toggle('hide', pTab !== 'reg'); $('#pRec').classList.toggle('hide', pTab !== 'rec'); $('#pCit').classList.toggle('hide', pTab !== 'cit');
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
    <div class="row"><button class="b sm" id="btnEditPac">Editar datos</button><button class="b sm" id="btnCambioTutor2">Cambio de dueño</button><button class="b sm" id="btnPrintFicha">Imprimir ficha completa</button>${canDelete ? '<button class="b sm danger sp" id="btnDelPac">Eliminar paciente</button>' : ''}</div>`;
  $('#btnEditPac').onclick = () => openFormPac(p);
  $('#btnCambioTutor2').onclick = () => openFormPac(p, true);
  $('#btnPrintFicha').onclick = () => imprimir(p, sortedCons(), false);
  if (canDelete) $('#btnDelPac').onclick = () => delPaciente(p);
  renderHist(list);
  renderPacExtras();
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
      <div class="row"><button class="b sm" data-act="edit">Editar</button><button class="b sm" data-act="receta">Receta</button><button class="b sm" data-act="print">Imprimir / PDF</button><button class="b sm" data-act="copy">Copiar como texto</button>${canDelete ? '<button class="b sm danger sp" data-act="del">Eliminar</button>' : ''}</div></div></details>`;
  }).join('') + '</div>';
}
$('#histList').addEventListener('toggle', (e) => { const d = e.target; if (d.matches?.('details[data-id]')) d.open ? openSet.add(d.dataset.id) : openSet.delete(d.dataset.id); }, true);
$('#histList').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const det = b.closest('details'), c = consultas.find((x) => x.id === det.dataset.id); if (!c) return;
  if (b.dataset.act === 'edit') { if (ready()) openFormCon(c); }
  if (b.dataset.act === 'receta') { openFormRec(null, c); return; }
  if (b.dataset.act === 'print') imprimir(pacById(cur) || {}, [c], true);
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
  if (!c && pendingMotivo) { $('#fCon [data-k=motivo]').value = pendingMotivo; pendingMotivo = ''; }
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
const feedItem = (c, right) => { const p = pacById(c.pacienteId); return `<button class="fi" data-pid="${esc(c.pacienteId)}"><span class="${avCls(p)}">${esc(initials(p?.nombre))}</span>
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
  $('#ctrlList').innerHTML = ctrlDocs.length ? ctrlDocs.map(ctrlRow).join('') : `<div class="empty">${loaded ? 'No hay controles agendados. Agrega la fecha en “Próximo control” al registrar una consulta.' : 'Cargando…'}</div>`;
}
$('#feed').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b && pacById(b.dataset.pid)) openPaciente(b.dataset.pid); });
$('#ctrlList').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b && pacById(b.dataset.pid)) openPaciente(b.dataset.pid); });

function renderTeam() {
  renderCfg();
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




/* ---------- Inicio, buscador y tutores ---------- */
const avCls = (p) => (p && p.especie === 'Felino' ? 'av fel' : 'av');
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
function renderInicio() {
  const h = new Date().getHours(), first = (me?.nombre || '').split(' ')[0];
  $('#saludo').textContent = (h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches') + (first ? ', ' + first : '');
  const f = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#hoyFecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
  const t = today(), lim = addDays(7);
  const hoy = ctrlDocs.filter((c) => c.proximoControl === t), prox = ctrlDocs.filter((c) => c.proximoControl >= t && c.proximoControl <= lim);
  const cHoy = citasHoy.filter((c) => c.estado !== 'cancelada'), nLow = productos.filter(bajo);
  const K = [
    ['vAgenda', cHoy.length, cHoy.length === 1 ? 'cita agendada para hoy' : 'citas agendadas para hoy', true],
    ['vControles', prox.length, 'controles en los próximos 7 días'],
    ['vActividad', semanaCount, semanaCount === 1 ? 'atención en los últimos 7 días' : 'atenciones en los últimos 7 días'],
    nLow.length ? ['vInventario', nLow.length, nLow.length === 1 ? 'producto con stock bajo' : 'productos con stock bajo', false, 'warn'] : ['vLista', pacientes.length, pacientes.length === 1 ? 'paciente registrado' : 'pacientes registrados']
  ];
  $('#kpis').innerHTML = K.map(([v, n, l, hl, cls]) => `<button class="kpi ${cls || ''}" data-go="${v}"><b>${loaded ? n : '–'}</b><span>${l}</span></button>`).join('');
  const conf = cHoy.filter((c) => c.estado === 'confirmada').length, porConf = cHoy.filter((c) => c.estado === 'agendada').length;
  $('#wsub').textContent = !loaded ? '' : cHoy.length ? `Tienes ${cHoy.length} cita${cHoy.length === 1 ? '' : 's'} hoy: ${conf} confirmada${conf === 1 ? '' : 's'} y ${porConf} por confirmar.` + (prox.length ? ` Hay ${prox.length} control${prox.length === 1 ? '' : 'es'} esta semana.` : '') : 'No hay citas agendadas para hoy.' + (prox.length ? ` Hay ${prox.length} control${prox.length === 1 ? '' : 'es'} esta semana.` : '');
  const ahora = Date.now(), sig = citasHoy.filter((c) => ['agendada', 'confirmada'].includes(c.estado) && new Date(c.inicio).getTime() + (c.duracion_min || 30) * 60000 > ahora).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  const nc = $('#nextCita'); nc.classList.toggle('hide', !sig);
  if (sig) {
    const x = datosCita(sig), mins = Math.round((new Date(sig.inicio) - ahora) / 60000);
    nc.dataset.cita = sig.id;
    nc.innerHTML = `<div><small>${mins > 0 ? (mins < 60 ? `Próxima cita en ${mins} minutos` : `Próxima cita a las ${hhmm(new Date(sig.inicio))}`) : 'Cita en curso'}</small><b>${hhmm(new Date(sig.inicio))} ${esc(x.mascota)}${sig.motivo ? ', ' + esc(sig.motivo.toLowerCase()) : ''}</b><br><span>${esc(x.tutor)}${x.tel ? ', ' + esc(x.tel) : ''}${sig.estado === 'confirmada' ? ' · confirmada' : ''}</span></div>${sig.estado !== 'confirmada' ? '<button type="button" class="b wbtn" data-ca="wa">Enviar recordatorio</button>' : ''}<button type="button" class="b abtn" data-ca="atender">Atender</button>`;
  }
  const [h0, m0] = String(clinica.horaInicio || '09:00').split(':').map(Number), [h1, m1] = String(clinica.horaFin || '19:00').split(':').map(Number);
  const cap = Math.max(1, (h1 * 60 + m1) - (h0 * 60 + m0)), lun = new Date(); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
  $('#inOcc').innerHTML = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((n, i) => { const d = new Date(lun); d.setDate(d.getDate() + i); const iso = isoDate(d);
    const min = citasSemana.filter((c) => c.estado !== 'cancelada' && isoDate(new Date(c.inicio)) === iso).reduce((a, c) => a + (c.duracion_min || 30), 0), p = Math.min(100, Math.round(min / cap * 100));
    return `<div class="occ"><span class="${iso === today() ? '' : 'muted'}" style="${iso === today() ? 'font-weight:800' : ''}">${n}</span><span class="bar"><i class="${p >= 85 ? 'full' : ''}" style="width:${p}%"></i></span><b>${p}%</b></div>`; }).join('');
  $('#inCitas').innerHTML = citasHoy.length ? citasHoy.map(citaCard).join('') : `<div class="empty">${loaded ? 'No hay citas para hoy.' : 'Cargando…'} <button class="linkb" id="inNuevaCita">+ Agendar una cita</button></div>`;
  const nb = $('#inNuevaCita'); if (nb) nb.onclick = () => openFormCita(null, { fecha: today() });
  $('#inLowCard').classList.toggle('hide', !nLow.length);
  $('#inLow').innerHTML = nLow.slice(0, 6).map((x) => `<div class="log"><span class="pill bad">${esc(String(x.stock))} ${esc(x.unidad)}</span><span><b>${esc(x.nombre)}</b><br><span class="muted small">Mínimo: ${esc(String(x.stock_minimo))}</span></span></div>`).join('');
  $('#inCtrl').innerHTML = prox.length ? prox.slice(0, 8).map(ctrlRow).join('')
    : `<div class="empty">${loaded ? 'No hay controles agendados para esta semana.' : 'Cargando…'}</div>`;
  $('#inFeed').innerHTML = feedDocs.length ? feedDocs.slice(0, 6).map((c) => feedItem(c, `${fDate(c.fecha)}<br>${ago(c.creado)}`)).join('')
    : `<div class="empty">${loaded ? 'Aún no hay atenciones. Crea un paciente y registra su primera consulta.' : 'Cargando…'}</div>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) show(b.dataset.go); });
$('#inCtrl').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b && pacById(b.dataset.pid)) openPaciente(b.dataset.pid); });
$('#inFeed').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b && pacById(b.dataset.pid)) openPaciente(b.dataset.pid); });

const normRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
function tutores() {
  const map = new Map();
  pacientes.forEach((p) => {
    const t = p.tutor || {}; if (!t.nombre && !t.rut && !t.telefono) return;
    const key = normRut(t.rut) || (t.nombre || '').trim().toLowerCase() || t.telefono;
    if (!map.has(key)) map.set(key, { ...t, mascotas: [] });
    const g = map.get(key); g.mascotas.push(p);
    ['nombre', 'telefono', 'email', 'direccion', 'rut'].forEach((k) => { if (!g[k] && t[k]) g[k] = t[k]; });
  });
  return [...map.values()].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
}
function renderTutores() {
  const qq = $('#tq').value.trim().toLowerCase(), all = tutores();
  const rows = all.filter((t) => !qq || [t.nombre, t.rut, t.telefono, t.email, ...t.mascotas.map((m) => m.nombre)].some((v) => String(v || '').toLowerCase().includes(qq)));
  $('#countTut').textContent = loaded ? `${all.length} tutor${all.length === 1 ? '' : 'es'}` : '';
  $('#tutList').innerHTML = rows.length ? rows.map((t) => `<div class="fi" style="cursor:default;grid-template-columns:auto minmax(0,1fr)"><span class="av">${esc(initials(t.nombre))}</span><span>
      <b>${esc(t.nombre) || 'Sin nombre'}</b> <span class="muted small">${esc(t.rut)}</span><br>
      <span class="small">${esc([t.telefono, t.email].filter(Boolean).join(' · ')) || '<span class="muted">Sin datos de contacto</span>'}</span>${t.direccion ? `<br><span class="muted small">${esc(t.direccion)}</span>` : ''}
      <span class="chips">${t.mascotas.map((m) => `<button class="chip" data-pid="${esc(m.id)}">${esc(m.nombre)} · ${esc(m.especie || '')}</button>`).join('')}</span></span></div>`).join('')
    : `<div class="empty">${!loaded ? 'Cargando…' : all.length ? 'Ningún tutor coincide con la búsqueda.' : 'Aún no hay tutores. Se agregan solos al registrar un paciente con sus datos de tutor.'}</div>`;
}
$('#tq').addEventListener('input', renderTutores);
$('#tutList').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b) openPaciente(b.dataset.pid); });

let gSel = 0, gHits = [];
function renderGlobal() {
  const qq = $('#gq').value.trim().toLowerCase(), box = $('#gres');
  if (!qq) { box.classList.add('hide'); return; }
  gHits = pacientes.filter((p) => [p.numero, p.nombre, p.tutor?.nombre, p.tutor?.rut, normRut(p.tutor?.rut).toLowerCase(), p.tutor?.telefono, p.microchip?.numero, ...(p.tutoresAnteriores || []).map((t) => t.nombre)]
    .some((v) => String(v ?? '').toLowerCase().includes(qq))).slice(0, 8);
  gSel = Math.min(gSel, Math.max(0, gHits.length - 1));
  box.innerHTML = gHits.length ? gHits.map((p, i) => `<button role="option" aria-selected="${i === gSel}" class="${i === gSel ? 'on' : ''}" data-pid="${esc(p.id)}"><span class="${avCls(p)}">${esc(initials(p.nombre))}</span><b>${esc(p.nombre)} <span class="muted small">N° ${esc(p.numero)} · ${esc(p.especie || '')}</span></b><span class="muted small">Tutor: ${esc(p.tutor?.nombre) || '—'}${p.tutor?.telefono ? ' · ' + esc(p.tutor.telefono) : ''}</span></button>`).join('')
    : `<div class="empty" style="padding:14px">Sin resultados. <button class="linkb" id="gNuevo">+ Crear paciente nuevo</button></div>`;
  box.classList.remove('hide');
  const n = $('#gNuevo'); if (n) n.onclick = () => { const nm = $('#gq').value; $('#gq').value = ''; box.classList.add('hide'); openFormPac(); if (ready()) $('#fPac [data-k=nombre]').value = nm; };
}
$('#gq').addEventListener('input', () => { gSel = 0; renderGlobal(); });
$('#gq').addEventListener('focus', renderGlobal);
$('#gq').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); gSel = Math.max(0, Math.min(gHits.length - 1, gSel + (e.key === 'ArrowDown' ? 1 : -1))); renderGlobal(); }
  if (e.key === 'Enter' && gHits[gSel]) { e.preventDefault(); const id = gHits[gSel].id; $('#gq').value = ''; $('#gres').classList.add('hide'); openPaciente(id); }
  if (e.key === 'Escape') { $('#gres').classList.add('hide'); }
});
$('#gres').addEventListener('mousedown', (e) => e.preventDefault());
$('#gres').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b) { $('#gq').value = ''; $('#gres').classList.add('hide'); openPaciente(b.dataset.pid); } });
$('#gq').addEventListener('blur', () => setTimeout(() => $('#gres').classList.add('hide'), 150));
$('#btnNuevoPac2').onclick = () => openFormPac();

/* ---------- Imprimir / PDF ---------- */
function htmlConsulta(c) {
  const d = c.dieta || {}, k = c.constantes || {};
  const dieta = [['Seca', d.seca], ['Húmeda', d.humeda], ['Casera', d.casera], ['Frecuencia', d.frecuencia], ['Cantidad', d.cantidad], ['Otros', d.otros]].filter((x) => x[1]).map((x) => x[0] + ': ' + x[1]).join(' · ');
  const cons = CONST.filter(([key]) => k[key]).map(([key, l]) => `${l}: ${k[key]}`).join(' · ');
  const trat = c.tratamientoPrevio?.si ? c.tratamientoPrevio.si + (c.tratamientoPrevio.cual ? ' — ' + c.tratamientoPrevio.cual : '') : '';
  const ps = (t, v) => v ? `<div class="pr-sec"><b>${t}</b><p>${esc(v)}</p></div>` : '';
  return `<div class="pr-con"><h2>${fDate(c.fecha)} · ${esc(c.tipo || 'Consulta')}${c.motivo ? ' · ' + esc(c.motivo) : ''}</h2>
    ${ps('Anamnesis remota', c.anamnesisRemota)}${ps('Anamnesis actual', c.anamnesisActual)}${ps('Dieta', dieta)}${ps('Enfermedades previas', c.enfermedadesPrevias)}${ps('Tratamiento para la enfermedad actual', trat)}${ps('Alergias', c.alergias)}
    ${ps('Constantes fisiológicas', cons)}${ps('Examen físico', c.examenFisico)}${ps('Exámenes complementarios', c.examenesComplementarios)}${ps('Prediagnósticos', c.prediagnosticos)}${ps('Indicaciones', c.indicaciones)}${ps('Próximo control', fDate(c.proximoControl))}
    ${ps(isExt(c) ? 'Atendido en' : 'Médico tratante', medicoDe(c))}</div>`;
}
function imprimir(p, lista, conFirma) {
  const t = p.tutor || {}, row = (k, v) => `<tr><td class="k">${k}</td><td>${esc(v) || '—'}</td></tr>`;
  const ultimoMed = lista.length === 1 && !isExt(lista[0]) ? medicoDe(lista[0]) : '';
  $('#printArea').innerHTML = `<div class="pr-head"><img src="logo.png" alt=""><div><h1>${esc(clinicName())}</h1><div>Ficha clínica N° ${esc(p.numero)} · ${lista.length === 1 ? 'Atención del ' + fDate(lista[0].fecha) : 'Historial completo'}</div></div></div>
    <table><tr><td style="width:50%;padding-right:12pt"><table>${row('Paciente', p.nombre)}${row('Especie / raza', [p.especie, p.raza].filter(Boolean).join(' / '))}${row('Sexo', [p.sexo, p.esterilizado === 'Sí' ? 'esterilizado/a' : ''].filter(Boolean).join(', '))}${row('Edad', ageOf(p))}${row('Microchip', p.microchip?.numero)}</table></td>
    <td><table>${row('Tutor', t.nombre)}${row('RUT', t.rut)}${row('Teléfono', t.telefono)}${row('Correo', t.email)}${row('Dirección', t.direccion)}</table></td></tr></table>
    ${lista.map(htmlConsulta).join('') || '<p>Sin consultas registradas.</p>'}
    ${conFirma ? `<div class="pr-firma"><div>${esc(ultimoMed || 'Médico veterinario')}<br>Firma y timbre</div></div>` : ''}
    <div class="pr-foot">Impreso el ${new Date().toLocaleString('es-CL')} por ${esc(me?.nombre || '')} · ${esc(clinicName())}</div>`;
  const img = $('#printArea img');
  const go = () => setTimeout(() => window.print(), 50);
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
}


/* =====================================================================
   MÓDULOS: datos de la clínica, WhatsApp, agenda, inventario, cotizador, recetas
   ===================================================================== */
let citasSemana = [];
let clinica = {}, productos = [], citasHoy = [], citasRango = [], cotizaciones = [], recetasPac = [], citasPac = [];
const clinicName = () => clinica.nombre || CFG.NOMBRE_CLINICA || 'Clínica veterinaria';
const ivaPct = () => Number(clinica.iva ?? 19) || 0;
const CLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const num = (v) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fechaLarga = (d) => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const ESTADOS = { agendada: 'Agendada', confirmada: 'Confirmada', atendida: 'Atendida', no_asistio: 'No asistió', cancelada: 'Cancelada' };
const TIPOS = { insumo: 'Insumo', medicamento: 'Medicamento', servicio: 'Servicio', procedimiento: 'Procedimiento' };

async function loadModulos() {
  const dia0 = new Date(); dia0.setHours(0, 0, 0, 0); const dia1 = new Date(dia0); dia1.setDate(dia1.getDate() + 1);
  const [cf, pr, ch, co] = await Promise.all([
    sb.from('config').select('*').eq('id', 1).maybeSingle(),
    fetchAll('productos', 'nombre').catch(() => []),
    sb.from('citas').select('*').gte('inicio', dia0.toISOString()).lt('inicio', dia1.toISOString()).order('inicio'),
    sb.from('cotizaciones').select('*').order('numero', { ascending: false }).limit(500)
  ]);
  clinica = cf.data?.datos || {};
  productos = pr || [];
  citasHoy = ch.data || [];
  { const l = new Date(dia0); l.setDate(l.getDate() - ((l.getDay() + 6) % 7)); const l2 = new Date(l); l2.setDate(l2.getDate() + 7);
    const { data: ws } = await sb.from('citas').select('*').gte('inicio', l.toISOString()).lt('inicio', l2.toISOString()); citasSemana = ws || []; }
  cotizaciones = co.data || [];
  if (view === 'vAgenda') await loadAgenda();
  const opt = (v) => `<option value="${esc(v)}"></option>`;
  $('#dlPac').innerHTML = pacientes.map((p) => opt(pacLabel(p))).join('');
  $('#dlProd').innerHTML = productos.filter((x) => x.activo).map((x) => opt(x.nombre)).join('');
  if (clinica.nombre) { $$('.brand > span:last-child, .topm b').forEach((el) => { el.firstChild.textContent = clinica.nombre; }); }
  $('#dlMed').innerHTML = productos.filter((x) => x.activo && x.tipo === 'medicamento').map((x) => opt(x.nombre)).join('');
}
const pacLabel = (p) => `${p.nombre} · N° ${p.numero}${p.tutor?.nombre ? ' · ' + p.tutor.nombre : ''}`;
const pacFromLabel = (v) => pacientes.find((p) => pacLabel(p) === v);

/* ---------- Selector de paciente (cita y cotización) ---------- */
function pickerInit(pre, onChange) {
  const q = $('#' + pre + 'Q');
  const set = (p) => {
    $('#' + pre + 'Sel').innerHTML = p ? `<span class="${avCls(p)}">${esc(initials(p.nombre))}</span><span style="flex:1"><b>${esc(p.nombre)}</b> <span class="muted small">N° ${esc(p.numero)} · ${esc(p.especie || '')}</span><br><span class="small">${esc(p.tutor?.nombre || '')}${p.tutor?.telefono ? ' · ' + esc(p.tutor.telefono) : ''}</span></span><button type="button" class="b sm">Cambiar</button>` : '';
    $('#' + pre + 'Sel').classList.toggle('hide', !p); $('#' + pre + 'Pick').classList.toggle('hide', !!p);
    if (p) { const b = $('#' + pre + 'Sel button'); b.onclick = () => { set(null); onChange(null); q.value = ''; q.focus(); }; }
  };
  q.addEventListener('change', () => { const p = pacFromLabel(q.value); if (p) { set(p); onChange(p); } });
  q.addEventListener('input', () => { const p = pacFromLabel(q.value); if (p) { set(p); onChange(p); } });
  return set;
}

/* ---------- WhatsApp (gratis: abre WhatsApp con el mensaje escrito) ---------- */
function waNumero(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  else if (d.length === 8) d = '569' + d;
  return d.length >= 10 ? d : '';
}
function waTexto(plantilla, { tutor, mascota, fecha, hora }) {
  return String(plantilla || '').replace(/\{tutor\}/g, (tutor || '').split(' ')[0] || '').replace(/\{mascota\}/g, mascota || 'tu mascota')
    .replace(/\{clinica\}/g, clinicName()).replace(/\{fecha\}/g, fecha || '').replace(/\{hora\}/g, hora || '');
}
function abrirWa(tel, texto) {
  const n = waNumero(tel);
  if (!n) { toast('Falta un teléfono válido del tutor (ej: +56 9 1234 5678)'); return false; }
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  return true;
}
const DEF_MSG_CITA = 'Hola {tutor}, te escribimos de {clinica}. Te recordamos la hora de {mascota} el {fecha} a las {hora}. ¿Nos confirmas tu asistencia? Responde SÍ para confirmar o escríbenos para cambiar la hora.';
const DEF_MSG_CTRL = 'Hola {tutor}, te escribimos de {clinica}. A {mascota} le corresponde su control el {fecha}. ¿Te agendamos una hora? Respóndenos por aquí.';
function datosCita(c) {
  const p = pacById(c.paciente_id), d = c.datos || {};
  return { p, mascota: p?.nombre || d.nuevo?.nombre || 'Paciente', tutor: p?.tutor?.nombre || d.nuevo?.tutor || '', tel: p?.tutor?.telefono || d.nuevo?.telefono || '' };
}
async function waCita(c) {
  const x = datosCita(c), ini = new Date(c.inicio);
  if (!abrirWa(x.tel, waTexto(clinica.msgCita || DEF_MSG_CITA, { tutor: x.tutor, mascota: x.mascota, fecha: fechaLarga(ini), hora: hhmm(ini) }))) return;
  try { await q(sb.from('citas').update({ datos: { ...(c.datos || {}), waEnviado: new Date().toISOString() } }).eq('id', c.id)); reloadSoon(); } catch {}
}
function waControl(c) {
  const p = pacById(c.pacienteId); if (!p) return;
  abrirWa(p.tutor?.telefono, waTexto(clinica.msgControl || DEF_MSG_CTRL, { tutor: p.tutor?.nombre, mascota: p.nombre, fecha: fechaLarga(new Date(c.proximoControl + 'T12:00')) }));
}
function ctrlRow(c) {
  const p = pacById(c.pacienteId), t = today();
  return `<div class="fi" style="cursor:default"><span class="${avCls(p)}">${esc(initials(p?.nombre))}</span>
    <span><button class="linkb" style="padding:0;min-height:0;font-size:15px" data-pid="${esc(c.pacienteId)}"><b>${esc(p?.nombre || 'Paciente')}</b></button> <span class="muted small">${p ? 'N° ' + esc(p.numero) : ''}</span><br>
    <span class="small">${esc((c.motivo || c.prediagnosticos || 'Control').split('\n')[0].slice(0, 70))}</span><br><span class="muted small">${esc(p?.tutor?.nombre || '')}${p?.tutor?.telefono ? ' · ' + esc(p.tutor.telefono) : ''}</span></span>
    <span class="when" style="display:grid;gap:6px;justify-items:end"><span class="pill ${c.proximoControl === t ? 'am' : ''}">${c.proximoControl === t ? 'Hoy' : fDate(c.proximoControl)}</span>
    <span class="row" style="gap:6px;justify-content:flex-end"><button class="b sm wa" data-wactl="${esc(c.id)}">WhatsApp</button><button class="b sm" data-agctl="${esc(c.id)}">Agendar</button></span></span></div>`;
}
document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-wactl]'); if (w) { const c = ctrlDocs.find((x) => x.id === w.dataset.wactl); if (c) waControl(c); return; }
  const a = e.target.closest('[data-agctl]'); if (a) { const c = ctrlDocs.find((x) => x.id === a.dataset.agctl); if (c) openFormCita(null, { pacienteId: c.pacienteId, fecha: c.proximoControl, motivo: 'Control' }); return; }
  const pl = e.target.closest('.fi [data-pid].linkb'); if (pl && pacById(pl.dataset.pid)) openPaciente(pl.dataset.pid);
});

/* ---------- Agenda ---------- */
let agDate = today(), agView = innerWidth >= 900 ? 'semana' : 'dia';
const parseD = (iso) => new Date(iso + 'T00:00');
function agRange() {
  const d = parseD(agDate);
  if (agView === 'dia') { const e = new Date(d); e.setDate(e.getDate() + 1); return [d, e]; }
  if (agView === 'mes') { const f = new Date(d.getFullYear(), d.getMonth(), 1); const s0 = new Date(f); s0.setDate(s0.getDate() - ((f.getDay() + 6) % 7)); const e0 = new Date(s0); e0.setDate(e0.getDate() + 42); return [s0, e0]; }
  const s = new Date(d); const wd = (s.getDay() + 6) % 7; s.setDate(s.getDate() - wd); const e = new Date(s); e.setDate(e.getDate() + 7); return [s, e];
}
async function loadAgenda() {
  const [s, e] = agRange();
  const { data, error } = await sb.from('citas').select('*').gte('inicio', s.toISOString()).lt('inicio', e.toISOString()).order('inicio');
  if (error) { banner(errMsg(error)); return; }
  citasRango = data || [];
}
function citaCard(c) {
  const x = datosCita(c), ini = new Date(c.inicio), fin = new Date(ini.getTime() + (c.duracion_min || 30) * 60000), d = c.datos || {};
  const abierta = !['atendida', 'cancelada', 'no_asistio'].includes(c.estado);
  return `<div class="cita st-${esc(c.estado)}" data-cita="${esc(c.id)}">
    <div class="row" style="gap:8px"><b style="font-variant-numeric:tabular-nums">${hhmm(ini)}–${hhmm(fin)}</b>
      ${x.p ? `<button type="button" class="linkb" style="padding:0;min-height:0;font-size:15px" data-pid="${esc(x.p.id)}"><b>${esc(x.mascota)}</b></button>` : `<b>${esc(x.mascota)}</b> <span class="pill am">Nuevo</span>`}
      <span class="muted small">${esc(c.motivo || '')}</span><span class="st ${esc(c.estado)} sp">${ESTADOS[c.estado] || c.estado}</span></div>
    <span class="small muted">${esc(x.tutor)}${x.tel ? ' · ' + esc(x.tel) : ''}${c.medico_id ? ' · ' + esc(who(c.medico_id)) : ''}${d.waEnviado ? ' · WhatsApp enviado ' + ago(d.waEnviado) : ''}</span>
    <div class="acts">${abierta ? `<button type="button" class="b wa" data-ca="wa">WhatsApp</button>${c.estado !== 'confirmada' ? '<button type="button" class="b" data-ca="confirmada">Confirmó</button>' : ''}<button type="button" class="b pri" data-ca="atender">Atender</button><button type="button" class="b" data-ca="no_asistio">No asistió</button><button type="button" class="b" data-ca="cancelada">Cancelar</button>` : ''}<button type="button" class="b" data-ca="editar">Editar</button></div></div>`;
}
function renderAgenda() {
  $$('[data-agv]').forEach((b) => b.classList.toggle('on', b.dataset.agv === agView));
  const sel = $('#agMed'), keep = sel.value;
  sel.innerHTML = '<option value="">Todo el equipo</option>' + Object.keys(equipo).filter((id) => equipo[id].activo).map((id) => `<option value="${esc(id)}">${esc(who(id))}</option>`).join('');
  sel.value = keep;
  $('#agFecha').value = agDate;
  const [s] = agRange(), med = sel.value;
  const list = citasRango.filter((c) => !med || c.medico_id === med);
  const activas = list.filter((c) => !['cancelada'].includes(c.estado));
  if (agView === 'dia') {
    const d = parseD(agDate), t = fechaLarga(d);
    $('#agTitulo').textContent = (agDate === today() ? 'Hoy, ' : '') + t;
    const [h0, m0] = String(clinica.horaInicio || '09:00').split(':').map(Number), [h1, m1] = String(clinica.horaFin || '19:00').split(':').map(Number);
    const paso = Math.max(5, Number(clinica.duracion) || 30), slots = [];
    for (let m = h0 * 60 + m0; m < h1 * 60 + m1; m += paso) slots.push(m);
    const ini = (c) => { const x = new Date(c.inicio); return x.getHours() * 60 + x.getMinutes(); };
    list.forEach((c) => { const m = ini(c); const near = slots.reduce((a, s2) => (s2 <= m ? s2 : a), slots[0]); if (m < slots[0] || m >= h1 * 60 + m1) slots.push(m); else if (!slots.includes(near)) slots.push(near); });
    const uniq = [...new Set(slots)].sort((a, b) => a - b), nowM = new Date().getHours() * 60 + new Date().getMinutes();
    $('#agBody').innerHTML = '<div class="card" style="padding:6px 14px"><div class="slots">' + uniq.map((m, i) => {
      const next = uniq[i + 1] ?? m + paso, here = list.filter((c) => { const x = ini(c); return x >= m && x < next; });
      const lab = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
      const isNow = agDate === today() && nowM >= m && nowM < next;
      return `<div class="slot ${isNow ? 'now' : ''}"><time>${lab}</time><div>${here.map(citaCard).join('')}${here.length ? '' : `<button type="button" class="slotfree" data-nueva="${lab}">+ Agendar a las ${lab}</button>`}</div></div>`;
    }).join('') + '</div></div>';
  } else if (agView === 'mes') {
    renderMes(list, s);
  } else {
    const dias = [...Array(7)].map((_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
    $('#agTitulo').textContent = `Semana del ${dias[0].getDate()} al ${dias[6].toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`;
    $('#agBody').innerHTML = '<div class="week">' + dias.map((d) => {
      const iso = isoDate(d), cs = list.filter((c) => isoDate(new Date(c.inicio)) === iso);
      return `<div class="wday ${iso === today() ? 'today' : ''}"><h3><button type="button" class="linkb" style="padding:0;min-height:0" data-dia="${iso}">${esc(d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }))}</button> <span class="muted">${cs.filter((c) => c.estado !== 'cancelada').length || ''}</span></h3>
        ${cs.map((c) => { const x = datosCita(c); return `<button type="button" class="wc st-${esc(c.estado)}" data-wcita="${esc(c.id)}"><b>${hhmm(new Date(c.inicio))}</b> ${esc(x.mascota)}<br><span class="muted">${esc(c.motivo || '')}</span></button>`; }).join('')}
        <button type="button" class="slotfree" style="min-height:34px;font-size:13px" data-nuevadia="${iso}">+ Cita</button></div>`;
    }).join('') + '</div>';
  }
  const conf = activas.filter((c) => c.estado === 'confirmada').length, pend = activas.filter((c) => c.estado === 'agendada').length;
  $('#agResumen').textContent = activas.length ? `${activas.length} cita${activas.length === 1 ? '' : 's'} · ${conf} confirmada${conf === 1 ? '' : 's'} · ${pend} por confirmar` : 'Sin citas en este período.';
}
function renderMes(list, s) {
  const ref = parseD(agDate), mes = ref.getMonth();
  const t = ref.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  $('#agTitulo').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  const byDay = {}; list.forEach((c) => { const k = isoDate(new Date(c.inicio)); (byDay[k] = byDay[k] || []).push(c); });
  const max = Math.max(1, ...Object.values(byDay).map((v) => v.filter((c) => c.estado !== 'cancelada').length));
  let semanas = 6; { const last = new Date(s); last.setDate(last.getDate() + 35); if (last.getMonth() !== mes) semanas = 5; }
  const cells = [...Array(semanas * 7)].map((_, i) => {
    const d = new Date(s); d.setDate(d.getDate() + i); const iso = isoDate(d), cs = (byDay[iso] || []).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const n = cs.filter((c) => c.estado !== 'cancelada').length, alpha = n ? (0.06 + 0.3 * n / max).toFixed(2) : 0;
    const chips = cs.slice(0, 3).map((c) => `<span class="mc ${esc(c.estado)}"><b>${hhmm(new Date(c.inicio))}</b> ${esc(datosCita(c).mascota)}</span>`).join('');
    return `<button type="button" class="mday ${d.getMonth() !== mes ? 'out' : ''} ${iso === today() ? 'today' : ''} ${iso === agDate ? 'sel' : ''}" data-mdia="${iso}" style="${n ? `background:linear-gradient(rgba(143,227,198,${alpha}),rgba(143,227,198,${alpha})),var(--card)` : ''}" aria-label="${esc(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))}: ${n} citas">
      <span class="dn"><span>${d.getDate()}</span>${n ? `<i>${n}</i>` : ''}</span>${chips}${cs.length > 3 ? `<span class="more small" style="color:var(--acc);font-weight:700">+${cs.length - 3} más</span>` : ''}<span class="mdots">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`;
  }).join('');
  const sel = (byDay[agDate] || []).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const sinConf = sel.filter((c) => c.estado === 'agendada');
  const dsel = parseD(agDate), tsel = dsel.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#agBody').innerHTML = `<div class="legend" style="margin-bottom:10px"><span><i style="background:#DCF0E3"></i>Confirmada</span><span><i style="border:1px solid #B9D8CC"></i>Por confirmar</span><span><i style="background:var(--soft);opacity:.6"></i>Atendida</span><span><i style="background:var(--warn-bg)"></i>Cancelada o no asistió</span><span class="sp">Mientras más verde el fondo, más lleno el día</span></div>
    <div class="mlay"><div class="month"><div class="wd">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<div>${x}</div>`).join('')}</div><div class="gr">${cells}</div></div>
    <aside class="card g" style="align-content:start"><div><span class="small" style="color:var(--acc);font-weight:700">Día seleccionado</span><h2 style="margin:2px 0 0;font-size:22px">${esc(tsel.charAt(0).toUpperCase() + tsel.slice(1))}</h2><p class="muted small" style="margin:2px 0 0">${sel.length ? `${sel.length} cita${sel.length === 1 ? '' : 's'}${sinConf.length ? `, ${sinConf.length} sin confirmar` : ''}` : 'Sin citas'}</p></div>
      <div>${sel.map(citaCard).join('') || '<div class="empty" style="padding:12px">Día libre.</div>'}</div>
      <button type="button" class="b pri" data-nuevadia="${agDate}">+ Agendar este día</button><button type="button" class="b" data-dia="${agDate}">Ver el día completo</button></aside></div>`;
}
async function agGo(fn) { fn(); await loadAgenda(); renderAgenda(); }
const agStep = (k) => agGo(() => { const d = parseD(agDate); if (agView === 'mes') { d.setDate(1); d.setMonth(d.getMonth() + k); } else d.setDate(d.getDate() + k * (agView === 'dia' ? 1 : 7)); agDate = isoDate(d); });
$('#agPrev').onclick = () => agStep(-1);
$('#agNext').onclick = () => agStep(1);
$('#agHoy').onclick = () => agGo(() => { agDate = today(); });
$('#agFecha').onchange = (e) => { if (e.target.value) agGo(() => { agDate = e.target.value; }); };
$$('[data-agv]').forEach((b) => b.addEventListener('click', () => agGo(() => { agView = b.dataset.agv; })));
$('#agMed').onchange = renderAgenda;
$('#btnNuevaCita').onclick = () => openFormCita();
async function citaAccion(c, a) {
  if (a === 'wa') return waCita(c);
  if (a === 'editar') return openFormCita(c);
  if (a === 'atender') {
    try { await q(sb.from('citas').update({ estado: 'atendida' }).eq('id', c.id)); } catch (err) { return banner(errMsg(err)); }
    let pid = c.paciente_id;
    if (!pid) { toast('Primero registra la ficha del paciente nuevo'); return openFormCita(c); }
    await reloadAll(); await openPaciente(pid); pendingMotivo = c.motivo || ''; openFormCon();
    return;
  }
  try { await q(sb.from('citas').update({ estado: a }).eq('id', c.id)); toast('Cita: ' + ESTADOS[a]); await loadAgenda(); refresh(); } catch (err) { banner(errMsg(err)); }
}
let pendingMotivo = '';
function citaClick(e) {
  const nb = e.target.closest('[data-nueva]'); if (nb) return openFormCita(null, { fecha: agDate, hora: nb.dataset.nueva });
  const md = e.target.closest('[data-mdia]'); if (md) { const prevM = agDate.slice(0, 7); agDate = md.dataset.mdia; if (agDate.slice(0, 7) === prevM) renderAgenda(); else agGo(() => {}); return; }
  const nd = e.target.closest('[data-nuevadia]'); if (nd) return openFormCita(null, { fecha: nd.dataset.nuevadia });
  const dd = e.target.closest('[data-dia]'); if (dd) return agGo(() => { agDate = dd.dataset.dia; agView = 'dia'; });
  const wc = e.target.closest('[data-wcita]'); if (wc) { const c = citasRango.find((x) => x.id === wc.dataset.wcita); if (c) openFormCita(c); return; }
  const pl = e.target.closest('[data-pid]'); if (pl && pacById(pl.dataset.pid)) return openPaciente(pl.dataset.pid);
  const b = e.target.closest('[data-ca]'); if (!b) return;
  const id = b.closest('[data-cita]').dataset.cita, c = [...citasRango, ...citasHoy, ...citasPac].find((x) => x.id === id);
  if (c) citaAccion(c, b.dataset.ca);
}
$('#agBody').addEventListener('click', citaClick);
$('#inCitas').addEventListener('click', citaClick);
$('#nextCita').addEventListener('click', citaClick);
$('#pCit').addEventListener('click', citaClick);

/* Formulario de cita */
let editCita = null, citaPac = null;
const setCitaPac = pickerInit('cita', (p) => { citaPac = p; $('#citaNuevoRow').classList.toggle('hide', !!p); if (p) $('#citaNuevoFs').classList.add('hide'); });
$('#btnCitaNuevo').onclick = () => { $('#citaNuevoFs').classList.remove('hide'); $('#citaNuevoRow').classList.add('hide'); $('#citaPick').classList.add('hide'); $('#cnNombre').focus(); };
function openFormCita(c, pre = {}) {
  if (!ready()) return;
  editCita = c || null; citaPac = null;
  const f = $('#fCita'); f.reset();
  const ini = c ? new Date(c.inicio) : null;
  const defMed = pre.medicoId ?? (me?.cargo === 'Médico veterinario' ? myId : '');
  fillMedicos(c?.medico_id || defMed); $('#citaMed').innerHTML = $('#selMedico').innerHTML;
  fill(f, c ? { fecha: isoDate(ini), hora: hhmm(ini), duracion: String(c.duracion_min), medicoId: c.medico_id || '', motivo: c.motivo, estado: c.estado, notas: c.datos?.notas || '' }
    : { fecha: pre.fecha || agDate || today(), hora: pre.hora || '', duracion: String(clinica.duracion || 30), medicoId: defMed, motivo: pre.motivo || '', estado: 'agendada', notas: '' });
  const p = pacById(c?.paciente_id || pre.pacienteId);
  setCitaPac(p || null); citaPac = p || null;
  const nuevo = c && !c.paciente_id ? c.datos?.nuevo || {} : null;
  $('#citaNuevoFs').classList.toggle('hide', !nuevo); $('#citaNuevoRow').classList.toggle('hide', !!p || !!nuevo);
  if (nuevo) { $('#citaPick').classList.add('hide'); $('#cnNombre').value = nuevo.nombre || ''; $('#cnEspecie').value = nuevo.especie || 'Canino'; $('#cnTutor').value = nuevo.tutor || ''; $('#cnTel').value = nuevo.telefono || ''; }
  else { $('#cnNombre').value = $('#cnTutor').value = $('#cnTel').value = ''; }
  $('#fCitaTitle').textContent = c ? 'Editar cita' : 'Nueva cita';
  $('#citaEstadoL').classList.toggle('hide', !c);
  $('#btnDelCita').classList.toggle('hide', !c || !canDelete);
  $('#citaAviso').classList.add('hide');
  show('vFormCita');
}
$('#fCita').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!ready()) return;
  const d = collect(e.target);
  if (!d.fecha || !d.hora) return toast('Indica fecha y hora');
  const nuevoVis = !$('#citaNuevoFs').classList.contains('hide');
  if (!citaPac && !nuevoVis) return toast('Elige un paciente de la lista o registra uno nuevo');
  if (!citaPac && nuevoVis && !$('#cnNombre').value.trim()) return toast('Escribe el nombre de la mascota');
  const inicio = new Date(`${d.fecha}T${d.hora}:00`), dur = Number(d.duracion) || 30;
  // aviso de choque de horario del mismo médico
  if (d.medicoId && !$('#citaAviso').dataset.ok) {
    const s0 = new Date(inicio); s0.setHours(0, 0, 0, 0); const s1 = new Date(s0); s1.setDate(s1.getDate() + 1);
    const { data } = await sb.from('citas').select('*').eq('medico_id', d.medicoId).gte('inicio', s0.toISOString()).lt('inicio', s1.toISOString());
    const choque = (data || []).find((x) => x.id !== editCita?.id && !['cancelada', 'no_asistio'].includes(x.estado) && new Date(x.inicio) < new Date(inicio.getTime() + dur * 60000) && new Date(new Date(x.inicio).getTime() + x.duracion_min * 60000) > inicio);
    if (choque) { const a = $('#citaAviso'); a.textContent = `${who(d.medicoId)} ya tiene una cita a las ${hhmm(new Date(choque.inicio))} (${datosCita(choque).mascota}). Presiona “Guardar cita” otra vez para agendar igual.`; a.classList.remove('hide'); a.dataset.ok = '1'; return; }
  }
  delete $('#citaAviso').dataset.ok;
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    let pid = citaPac?.id || null;
    const datos = { ...(editCita?.datos || {}), notas: d.notas || '' };
    if (!pid && nuevoVis) datos.nuevo = { nombre: $('#cnNombre').value.trim(), especie: $('#cnEspecie').value, tutor: $('#cnTutor').value.trim(), telefono: $('#cnTel').value.trim() };
    if (!pid && datos.nuevo && editCita) {
      // si ya se está editando una cita de paciente nuevo, ofrecer crear su ficha
      if (await ask('Crear ficha', `¿Crear ahora la ficha de ${datos.nuevo.nombre}? Así la cita queda unida a su historial.`, 'Crear ficha')) {
        const r = await q(sb.from('pacientes').insert({ nombre: datos.nuevo.nombre, datos: { especie: datos.nuevo.especie, tutor: { nombre: datos.nuevo.tutor, telefono: datos.nuevo.telefono }, medicos: [], tutoresAnteriores: [] } }).select().single());
        await logEvt(r.id, 'Ficha creada', 'Desde la agenda'); pid = r.id; delete datos.nuevo;
      }
    } else if (!pid && datos.nuevo) {
      const r = await q(sb.from('pacientes').insert({ nombre: datos.nuevo.nombre, datos: { especie: datos.nuevo.especie, tutor: { nombre: datos.nuevo.tutor, telefono: datos.nuevo.telefono }, medicos: [], tutoresAnteriores: [] } }).select().single());
      await logEvt(r.id, 'Ficha creada', 'Desde la agenda'); pid = r.id; delete datos.nuevo;
    }
    const row = { paciente_id: pid, inicio: inicio.toISOString(), duracion_min: dur, medico_id: d.medicoId || null, motivo: d.motivo || '', datos };
    if (editCita) await q(sb.from('citas').update({ ...row, estado: d.estado || editCita.estado }).eq('id', editCita.id));
    else await q(sb.from('citas').insert(row));
    agDate = d.fecha; await reloadAll(); toast(editCita ? 'Cita actualizada' : 'Cita agendada'); show('vAgenda');
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});
$('#btnDelCita').onclick = async () => {
  if (!editCita || !(await ask('Eliminar cita', 'La cita se borrará de la agenda. Si solo no vendrá, mejor márcala como Cancelada para dejar registro.'))) return;
  try { await q(sb.from('citas').delete().eq('id', editCita.id)); await reloadAll(); show('vAgenda'); toast('Cita eliminada'); } catch (err) { banner(errMsg(err)); }
};

/* ---------- Inventario ---------- */
const bajo = (x) => x.activo && x.controla_stock && Number(x.stock) <= Number(x.stock_minimo) && Number(x.stock_minimo) > 0;
function renderInv() {
  const qq = $('#iq').value.trim().toLowerCase(), t = $('#iTipo').value, iva = ivaPct();
  const rows = productos.filter((x) => (t === 'inactivo' ? !x.activo : x.activo || t === '') && (!t || t === 'inactivo' || (t === 'bajo' ? bajo(x) : x.tipo === t)) && (!qq || x.nombre.toLowerCase().includes(qq)));
  const nLow = productos.filter(bajo).length;
  $('#invLowPill').textContent = `${nLow} con stock bajo`; $('#invLowPill').classList.toggle('hide', !nLow);
  $('#invBody').innerHTML = rows.map((x) => `<tr data-prod="${esc(x.id)}" tabindex="0" style="${x.activo ? '' : 'opacity:.55'}"><td><b>${esc(x.nombre)}</b></td><td>${TIPOS[x.tipo] || x.tipo}</td>
    <td class="money ${bajo(x) ? 'low' : ''}">${x.controla_stock ? esc(String(x.stock)) + ' ' + esc(x.unidad) : '—'}</td><td class="money">${x.controla_stock ? esc(String(x.stock_minimo)) : '—'}</td>
    <td class="money">${CLP(x.precio)}</td><td class="money">${CLP(x.precio * (1 + iva / 100))}</td>
    <td>${x.controla_stock ? `<span class="row" style="gap:6px;flex-wrap:nowrap"><button class="b sm" data-mov="entrada">+ Entrada</button><button class="b sm" data-mov="salida">− Salida</button></span>` : ''}</td></tr>`).join('');
  $('#invEmpty').classList.toggle('hide', rows.length > 0);
  if (!rows.length && productos.length) $('#invEmpty').textContent = 'Ningún producto coincide con el filtro.';
}
$('#iq').addEventListener('input', renderInv); $('#iTipo').addEventListener('change', renderInv);
$('#invBody').addEventListener('click', (e) => {
  const tr = e.target.closest('[data-prod]'); if (!tr) return; const x = productos.find((y) => y.id === tr.dataset.prod); if (!x) return;
  const m = e.target.closest('[data-mov]'); if (m) return openMov(x, m.dataset.mov);
  openFormProd(x);
});
let movProd = null;
function openMov(x, tipo) {
  if (!ready()) return;
  movProd = x; $('#movProd').textContent = `${x.nombre} · stock actual: ${x.stock} ${x.unidad}`;
  $('#movTipo').value = tipo; $('#movCant').value = ''; $('#movMotivo').value = ''; $('#movMsg').classList.add('hide');
  $('#movModal').classList.add('on'); $('#movCant').focus();
}
$('#movNo').onclick = () => $('#movModal').classList.remove('on');
$('#fMov').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cant = num($('#movCant').value), tipo = $('#movTipo').value;
  if (!cant) { $('#movMsg').textContent = 'Escribe una cantidad distinta de cero.'; return $('#movMsg').classList.remove('hide'); }
  try {
    await q(sb.from('movimientos').insert({ producto_id: movProd.id, tipo, cantidad: cant, motivo: $('#movMotivo').value.trim(), por: myId }));
    $('#movModal').classList.remove('on'); await reloadAll(); toast('Stock actualizado');
  } catch (err) { $('#movMsg').textContent = errMsg(err); $('#movMsg').classList.remove('hide'); }
});
let editProd = null;
const syncProd = () => { const st = $('#prodStock').checked; $('#prodStockRow').classList.toggle('hide', !st); $('#prodConIva').textContent = CLP(num($('#prodPrecio').value) * (1 + ivaPct() / 100)); };
$('#prodStock').onchange = syncProd; $('#prodPrecio').oninput = syncProd;
$('#prodTipo').onchange = () => { if (!editProd) $('#prodStock').checked = ['insumo', 'medicamento'].includes($('#prodTipo').value); syncProd(); };
async function openFormProd(x) {
  if (!ready()) return;
  editProd = x || null; const f = $('#fProd'); f.reset();
  fill(f, x ? { ...x, stock_minimo: x.stock_minimo, costo: x.costo, precio: x.precio } : { tipo: 'insumo', unidad: 'unidad' });
  $('#prodStock').checked = x ? x.controla_stock : true; $('#prodActivo').checked = x ? x.activo : true;
  $('#prodStockIniL').classList.toggle('hide', !!x); $('#fProdTitle').textContent = x ? x.nombre : 'Nuevo producto o servicio';
  $('#btnDelProd').classList.toggle('hide', !x || !canDelete); $('#prodMovs').classList.toggle('hide', !x);
  syncProd(); show('vFormProd');
  if (x) {
    const { data } = await sb.from('movimientos').select('*').eq('producto_id', x.id).order('en', { ascending: false }).limit(30);
    $('#prodMovList').innerHTML = (data || []).map((m) => `<div class="log"><span class="pill ${m.cantidad < 0 ? 'bad' : ''}">${m.cantidad > 0 ? '+' : ''}${esc(String(m.cantidad))}</span><span><b>${esc({ entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }[m.tipo])}</b>${m.motivo ? ' — ' + esc(m.motivo) : ''}<br><span class="muted small">${esc(who(m.por))} · ${fDateTime(m.en)}</span></span></div>`).join('') || '<p class="muted">Sin movimientos todavía.</p>';
  }
}
$('#btnNuevoProd').onclick = () => openFormProd();
$('#fProd').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!ready()) return;
  const d = collect(e.target);
  if (!d.nombre) return toast('Falta el nombre');
  const row = { nombre: d.nombre, tipo: d.tipo, unidad: d.unidad || 'unidad', controla_stock: $('#prodStock').checked, stock_minimo: num(d.stock_minimo), costo: num(d.costo), precio: num(d.precio), activo: $('#prodActivo').checked };
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (editProd) await q(sb.from('productos').update(row).eq('id', editProd.id));
    else {
      const r = await q(sb.from('productos').insert(row).select().single());
      const ini = num($('#prodStockIni').value);
      if (row.controla_stock && ini > 0) await q(sb.from('movimientos').insert({ producto_id: r.id, tipo: 'entrada', cantidad: ini, motivo: 'Stock inicial', por: myId }));
    }
    await reloadAll(); toast('Guardado'); show('vInventario');
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});
$('#btnDelProd').onclick = async () => {
  if (!editProd || !(await ask('Eliminar producto', `Se borrará “${editProd.nombre}” y su historial de movimientos. Si solo ya no lo usan, mejor desmarca “Activo”.`))) return;
  try { await q(sb.from('productos').delete().eq('id', editProd.id)); await reloadAll(); show('vInventario'); toast('Producto eliminado'); } catch (err) { banner(errMsg(err)); }
};

/* ---------- Cotizaciones ---------- */
const COT_EST = { borrador: 'Borrador', enviada: 'Enviada', aceptada: 'Aceptada', rechazada: 'Rechazada' };
function renderCots() {
  $('#cotBody').innerHTML = cotizaciones.map((c) => { const p = pacById(c.paciente_id), d = c.datos || {};
    return `<tr data-cot="${esc(c.id)}" tabindex="0"><td>${esc(String(c.numero))}</td><td>${fDate(c.fecha)}</td><td><b>${esc(p?.nombre || d.clienteNombre || '—')}</b>${p ? ' <span class="muted small">' + esc(p.tutor?.nombre || '') + '</span>' : ''}</td>
    <td><span class="st ${c.estado === 'rechazada' ? 'cancelada' : c.estado === 'aceptada' ? 'confirmada' : ''}">${COT_EST[c.estado]}</span></td><td class="money"><b>${CLP(c.total)}</b></td><td>${esc(who(c.creado_por))}</td></tr>`; }).join('');
  $('#cotEmpty').classList.toggle('hide', cotizaciones.length > 0);
}
$('#cotBody').addEventListener('click', (e) => { const tr = e.target.closest('[data-cot]'); if (tr) { const c = cotizaciones.find((x) => x.id === tr.dataset.cot); if (c) openFormCot(c); } });
$('#btnNuevaCot').onclick = () => openFormCot();
let editCot = null, cotPac = null;
const setCotPac = pickerInit('cot', (p) => { cotPac = p; });
function itemRow(it = {}) {
  return `<tr><td><input class="it-desc" autocomplete="off" value="${esc(it.descripcion || '')}" placeholder="Ej: Esterilización hembra, Jeringa 3 ml" aria-label="Descripción"></td>
    <td><input class="it-cant" type="number" min="0" step="any" value="${esc(String(it.cantidad ?? 1))}" inputmode="decimal" aria-label="Cantidad"></td>
    <td><input class="it-precio" type="number" min="0" step="1" value="${esc(String(it.precio ?? ''))}" inputmode="numeric" aria-label="Precio unitario neto"></td>
    <td class="money it-sub" style="padding-top:12px"></td><td><button type="button" class="b sm it-del" aria-label="Quitar ítem">✕</button></td></tr>`;
}
function cotCalc() {
  const items = [...$$('#cotItems tr')].map((tr) => ({ descripcion: tr.querySelector('.it-desc').value.trim(), cantidad: num(tr.querySelector('.it-cant').value), precio: num(tr.querySelector('.it-precio').value) }))
    .map((it) => { const pr = productos.find((x) => x.nombre === it.descripcion); return { ...it, producto_id: pr?.id || null, tipo: pr?.tipo || '' }; });
  $$('#cotItems tr').forEach((tr, i) => { tr.querySelector('.it-sub').textContent = CLP(items[i].cantidad * items[i].precio); });
  const sub = items.reduce((a, it) => a + it.cantidad * it.precio, 0), dp = Math.min(100, Math.max(0, num($('#cotDesc').value)));
  const desc = Math.round(sub * dp / 100), neto = sub - desc, iva = Math.round(neto * ivaPct() / 100), total = neto + iva;
  $('#cotTot').innerHTML = `<span>Subtotal neto</span><span class="money">${CLP(sub)}</span>${desc ? `<span>Descuento ${dp}%</span><span class="money">−${CLP(desc)}</span><span>Neto</span><span class="money">${CLP(neto)}</span>` : ''}<span>IVA ${ivaPct()}%</span><span class="money">${CLP(iva)}</span><span class="tt">Total</span><span class="money tt">${CLP(total)}</span>`;
  return { items: items.filter((it) => it.descripcion || it.precio), sub, descPct: dp, desc, neto, iva, total };
}
$('#cotItems').addEventListener('input', (e) => {
  const tr = e.target.closest('tr');
  if (e.target.classList.contains('it-desc')) { const pr = productos.find((x) => x.nombre === e.target.value); if (pr && !num(tr.querySelector('.it-precio').value)) tr.querySelector('.it-precio').value = pr.precio; }
  cotCalc();
});
$('#cotItems').addEventListener('click', (e) => { if (e.target.closest('.it-del')) { e.target.closest('tr').remove(); cotCalc(); } });
$('#btnAddItem').onclick = () => { $('#cotItems').insertAdjacentHTML('beforeend', itemRow()); $('#cotItems tr:last-child .it-desc').focus(); cotCalc(); };
$('#cotDesc').oninput = cotCalc;
function openFormCot(c) {
  if (!ready()) return;
  editCot = c || null; const f = $('#fCot'); f.reset(); const d = c?.datos || {};
  fill(f, c ? { ...d, fecha: c.fecha, estado: c.estado } : { fecha: today(), validez: 15, estado: 'borrador' });
  $('#cotDesc').value = d.descPct || '';
  const p = pacById(c?.paciente_id); setCotPac(p || null); cotPac = p || null;
  $('#cotItems').innerHTML = (d.items?.length ? d.items : [{}]).map(itemRow).join('');
  $('#fCotTitle').textContent = c ? 'Cotización' : 'Nueva cotización'; $('#fCotNum').textContent = c ? 'N° ' + c.numero : 'N° automático';
  ['btnCotPrint', 'btnCotWa'].forEach((id) => $('#' + id).classList.toggle('hide', !c)); $('#btnDelCot').classList.toggle('hide', !c || !canDelete);
  cotCalc(); show('vFormCot');
}
$('#fCot').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!ready()) return;
  const d = collect(e.target), calc = cotCalc();
  if (!calc.items.length) return toast('Agrega al menos un ítem');
  const datos = { clienteNombre: d.clienteNombre, clienteTel: d.clienteTel, validez: Number(d.validez) || 15, notas: d.notas, items: calc.items, descPct: calc.descPct, sub: calc.sub, desc: calc.desc, neto: calc.neto, ivaPct: ivaPct(), iva: calc.iva };
  const row = { paciente_id: cotPac?.id || null, fecha: d.fecha || today(), estado: d.estado || 'borrador', total: calc.total, datos };
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    let saved;
    if (editCot) saved = await q(sb.from('cotizaciones').update(row).eq('id', editCot.id).select().single());
    else saved = await q(sb.from('cotizaciones').insert(row).select().single());
    if (saved.paciente_id) await logEvt(saved.paciente_id, editCot ? 'Cotización editada' : 'Cotización creada', `N° ${saved.numero} · ${CLP(saved.total)}`);
    await reloadAll(); toast(`Cotización N° ${saved.numero} guardada`); openFormCot(cotizaciones.find((x) => x.id === saved.id) || saved);
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});
$('#btnDelCot').onclick = async () => {
  if (!editCot || !(await ask('Eliminar cotización', `Se borrará la cotización N° ${editCot.numero}.`))) return;
  try { await q(sb.from('cotizaciones').delete().eq('id', editCot.id)); await reloadAll(); show('vCotizaciones'); toast('Cotización eliminada'); } catch (err) { banner(errMsg(err)); }
};
$('#btnCotWa').onclick = async () => {
  const c = editCot; if (!c) return; const d = c.datos || {}, p = pacById(c.paciente_id);
  const tel = p?.tutor?.telefono || d.clienteTel, nombre = p?.tutor?.nombre || d.clienteNombre || '';
  const lineas = (d.items || []).map((it) => `• ${it.descripcion} x${it.cantidad}: ${CLP(it.cantidad * it.precio)}`).join('\n');
  const txt = `Hola ${nombre.split(' ')[0] || ''}, te enviamos la cotización N° ${c.numero} de ${clinicName()}${p ? ' para ' + p.nombre : ''}:\n\n${lineas}\n\nNeto: ${CLP(d.neto)}\nIVA ${d.ivaPct}%: ${CLP(d.iva)}\n*Total: ${CLP(c.total)}*\n\nVálida por ${d.validez || 15} días.${d.notas ? '\n' + d.notas : ''}`;
  if (abrirWa(tel, txt) && c.estado === 'borrador') { try { await q(sb.from('cotizaciones').update({ estado: 'enviada' }).eq('id', c.id)); await reloadAll(); } catch {} }
};
$('#btnCotPrint').onclick = () => { if (editCot) imprimirCot(editCot); };

/* ---------- Recetas ---------- */
let editRec = null, recConsulta = null;
function medRow(m = {}) {
  const inp = (cls, v, ph, extra = '') => `<td><input class="${cls}" value="${esc(v || '')}" placeholder="${ph}" ${extra}></td>`;
  return `<tr>${inp('m-med', m.medicamento, 'Nombre', 'autocomplete="off" aria-label="Medicamento"')}${inp('m-pres', m.presentacion, 'Comp. 50 mg', 'aria-label="Presentación"')}${inp('m-dosis', m.dosis, '1/2 comp.', 'aria-label="Dosis"')}${inp('m-via', m.via, 'Oral', 'aria-label="Vía"')}${inp('m-frec', m.frecuencia, 'Cada 12 h', 'aria-label="Frecuencia"')}${inp('m-dur', m.duracion, '7 días', 'aria-label="Duración"')}<td><button type="button" class="b sm m-del" aria-label="Quitar">✕</button></td></tr>`;
}
$('#btnAddMed').onclick = () => { $('#recItems').insertAdjacentHTML('beforeend', medRow()); $('#recItems tr:last-child .m-med').focus(); };
$('#recItems').addEventListener('click', (e) => { if (e.target.closest('.m-del')) e.target.closest('tr').remove(); });
function openFormRec(r, consulta) {
  if (!ready()) return;
  editRec = r || null; recConsulta = consulta || null;
  const f = $('#fRec'); f.reset(); const d = r?.datos || {}, p = pacById(cur);
  const med = r?.medico_id || consulta?.medicoId || (me?.cargo === 'Médico veterinario' ? myId : '');
  fillMedicos(med); $('#recMed').innerHTML = $('#selMedico').innerHTML;
  fill(f, { fecha: r?.fecha || today(), medicoId: med, indicaciones: d.indicaciones || (consulta && !r ? consulta.indicaciones || '' : '') });
  $('#recItems').innerHTML = (d.items?.length ? d.items : [{}]).map(medRow).join('');
  $('#fRecTitle').textContent = r ? `Receta N° ${r.numero}` : 'Nueva receta'; $('#fRecPac').textContent = p ? `${p.nombre} · Ficha N° ${p.numero}` : '';
  $('#btnRecPrint').classList.toggle('hide', !r);
  show('vFormReceta');
}
$('#fRec').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!ready()) return;
  const d = collect(e.target);
  const items = [...$$('#recItems tr')].map((tr) => ({ medicamento: tr.querySelector('.m-med').value.trim(), presentacion: tr.querySelector('.m-pres').value.trim(), dosis: tr.querySelector('.m-dosis').value.trim(), via: tr.querySelector('.m-via').value.trim(), frecuencia: tr.querySelector('.m-frec').value.trim(), duracion: tr.querySelector('.m-dur').value.trim() })).filter((m) => m.medicamento);
  if (!items.length && !d.indicaciones) return toast('Agrega al menos un medicamento o indicaciones');
  const row = { paciente_id: cur, consulta_id: editRec?.consulta_id || recConsulta?.id || null, fecha: d.fecha || today(), medico_id: d.medicoId || null, datos: { items, indicaciones: d.indicaciones || '' } };
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const saved = editRec ? await q(sb.from('recetas').update(row).eq('id', editRec.id).select().single()) : await q(sb.from('recetas').insert(row).select().single());
    await logEvt(cur, editRec ? 'Receta editada' : 'Receta emitida', `N° ${saved.numero} · ${items.map((m) => m.medicamento).join(', ')}`);
    await loadPac(cur); toast(`Receta N° ${saved.numero} guardada`); openFormRec(saved);
  } catch (err) { banner(errMsg(err)); } finally { btn.disabled = false; }
});
$('#btnRecPrint').onclick = () => { if (editRec) imprimirReceta(editRec); };

/* ---------- Pestañas del paciente: recetas y citas ---------- */
function renderPacExtras() {
  $('#tabRec').textContent = `Recetas (${recetasPac.length})`;
  const prox = citasPac.filter((c) => new Date(c.inicio) >= new Date(today() + 'T00:00') && !['cancelada', 'atendida', 'no_asistio'].includes(c.estado));
  $('#tabCit').textContent = `Citas${prox.length ? ' (' + prox.length + ')' : ''}`;
  $('#pRec').innerHTML = `<div class="row"><button class="b pri" id="btnNuevaRec">+ Nueva receta</button></div><div class="card" style="padding:6px 14px"><div class="feed">${recetasPac.length ? recetasPac.map((r) => `<div class="fi" style="cursor:default"><span class="pill">N° ${esc(String(r.numero))}</span><span><b>${fDate(r.fecha)}</b> · ${esc((r.datos?.items || []).map((m) => m.medicamento).join(', ') || 'Indicaciones')}<br><span class="muted small">${esc(who(r.medico_id) || '')}</span></span><span class="row" style="gap:6px"><button class="b sm" data-rprint="${esc(r.id)}">Imprimir</button><button class="b sm" data-redit="${esc(r.id)}">Abrir</button></span></div>`).join('') : '<div class="empty">Sin recetas. Se crean desde aquí o desde una consulta del historial.</div>'}</div></div>`;
  $('#btnNuevaRec').onclick = () => openFormRec();
  $('#pCit').innerHTML = `<div class="row"><button class="b pri" id="btnCitaPac">+ Agendar cita</button></div><div class="card" style="padding:10px 14px">${citasPac.length ? citasPac.map(citaCard).join('') : '<div class="empty">Sin citas registradas para este paciente.</div>'}</div>`;
  $('#btnCitaPac').onclick = () => openFormCita(null, { pacienteId: cur, fecha: today() });
}
$('#pRec').addEventListener('click', (e) => {
  const a = e.target.closest('[data-rprint]'); if (a) { const r = recetasPac.find((x) => x.id === a.dataset.rprint); if (r) imprimirReceta(r); }
  const b = e.target.closest('[data-redit]'); if (b) { const r = recetasPac.find((x) => x.id === b.dataset.redit); if (r) openFormRec(r); }
});

/* ---------- Impresiones: receta y cotización ---------- */
function prHeader(titulo, sub) {
  const linea = [clinica.rut ? 'RUT ' + clinica.rut : '', clinica.direccion, clinica.telefono, clinica.email].filter(Boolean).map(esc).join(' · ');
  return `<div class="pr-head"><img src="logo.png" alt=""><div style="flex:1"><h1>${esc(clinicName())}</h1>${linea ? `<div style="font-size:9.5pt;color:#444">${linea}</div>` : ''}</div><div style="text-align:right"><b style="font-size:13pt">${titulo}</b><br>${sub}</div></div>`;
}
function lanzarImpresion() { const img = $('#printArea img'); const go = () => setTimeout(() => window.print(), 50); if (img && !img.complete) { img.onload = go; img.onerror = go; } else go(); }
function imprimirReceta(r) {
  const p = pacById(r.paciente_id) || {}, t = p.tutor || {}, d = r.datos || {}, m = equipo[r.medico_id] || {};
  const row = (k, v) => `<tr><td class="k">${k}</td><td>${esc(v) || '—'}</td></tr>`;
  $('#printArea').innerHTML = prHeader('RECETA MÉDICO VETERINARIA', `N° ${esc(String(r.numero))} · ${fDate(r.fecha)}`) +
    `<table><tr><td style="width:50%;padding-right:12pt"><table>${row('Paciente', p.nombre)}${row('Especie / raza', [p.especie, p.raza].filter(Boolean).join(' / '))}${row('Edad', ageOf(p))}${row('Ficha N°', String(p.numero || ''))}</table></td><td><table>${row('Tutor', t.nombre)}${row('RUT', t.rut)}${row('Teléfono', t.telefono)}</table></td></tr></table>
    <h2>Rp.</h2><ol style="padding-left:16pt;margin:0">${(d.items || []).map((x) => `<li style="margin-bottom:8pt"><b>${esc(x.medicamento)}</b>${x.presentacion ? ' — ' + esc(x.presentacion) : ''}<br>${esc([x.dosis && 'Dosis: ' + x.dosis, x.via && 'Vía: ' + x.via, x.frecuencia, x.duracion && 'por ' + x.duracion].filter(Boolean).join(' · '))}</li>`).join('')}</ol>
    ${d.indicaciones ? `<h2>Indicaciones</h2><p style="white-space:pre-wrap;margin:0">${esc(d.indicaciones)}</p>` : ''}
    <div class="pr-firma"><div>${esc(m.nombre || 'Médico veterinario')}${m.registro ? '<br>' + esc(m.registro) : ''}<br>Firma y timbre</div></div>
    <div class="pr-foot">Emitida el ${fDate(r.fecha)} · ${esc(clinicName())}</div>`;
  lanzarImpresion();
}
function imprimirCot(c) {
  const p = pacById(c.paciente_id), d = c.datos || {};
  const venc = new Date(c.fecha + 'T12:00'); venc.setDate(venc.getDate() + (Number(d.validez) || 15));
  $('#printArea').innerHTML = prHeader('COTIZACIÓN', `N° ${esc(String(c.numero))} · ${fDate(c.fecha)}`) +
    `<table><tr><td class="k">Cliente</td><td>${esc(p?.tutor?.nombre || d.clienteNombre || '—')}${p?.tutor?.rut ? ' · RUT ' + esc(p.tutor.rut) : ''}</td></tr>${p ? `<tr><td class="k">Paciente</td><td>${esc(p.nombre)} (${esc(p.especie || '')}${p.raza ? ', ' + esc(p.raza) : ''}) · Ficha N° ${esc(String(p.numero))}</td></tr>` : ''}<tr><td class="k">Válida hasta</td><td>${venc.toLocaleDateString('es-CL')}</td></tr></table>
    <h2>Detalle</h2><table style="border-collapse:collapse"><tr style="font-weight:700;border-bottom:1px solid #999"><td>Descripción</td><td style="text-align:right">Cant.</td><td style="text-align:right">Precio unit.</td><td style="text-align:right">Subtotal</td></tr>
    ${(d.items || []).map((it) => `<tr style="border-bottom:1px solid #ddd"><td>${esc(it.descripcion)}</td><td style="text-align:right">${esc(String(it.cantidad))}</td><td style="text-align:right">${CLP(it.precio)}</td><td style="text-align:right">${CLP(it.cantidad * it.precio)}</td></tr>`).join('')}</table>
    <table style="width:auto;margin:10pt 0 0 auto">${d.desc ? `<tr><td class="k">Subtotal neto</td><td style="text-align:right">${CLP(d.sub)}</td></tr><tr><td class="k">Descuento ${d.descPct}%</td><td style="text-align:right">−${CLP(d.desc)}</td></tr>` : ''}<tr><td class="k">Neto</td><td style="text-align:right">${CLP(d.neto)}</td></tr><tr><td class="k">IVA ${d.ivaPct}%</td><td style="text-align:right">${CLP(d.iva)}</td></tr><tr><td class="k"><b>Total</b></td><td style="text-align:right;font-size:13pt"><b>${CLP(c.total)}</b></td></tr></table>
    ${d.notas ? `<h2>Notas</h2><p style="white-space:pre-wrap;margin:0">${esc(d.notas)}</p>` : ''}
    <div class="pr-foot">Valores en pesos chilenos. Precios sujetos a evaluación clínica del paciente. Preparada por ${esc(who(c.creado_por) || me?.nombre || '')} · ${esc(clinicName())}</div>`;
  lanzarImpresion();
}

/* ---------- Datos de la clínica (admin) ---------- */
function renderCfg() {
  $('#cfgCard').classList.toggle('hide', !isAdmin);
  if (isAdmin && document.activeElement?.closest?.('#cfgCard') == null) fill($('#cfgCard'), { nombre: clinicName(), iva: 19, horaInicio: '09:00', horaFin: '19:00', duracion: 30, msgCita: DEF_MSG_CITA, msgControl: DEF_MSG_CTRL, ...clinica });
}
$('#cfgCard').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!isAdmin) return;
  const d = collect(e.target); d.iva = num(d.iva); d.duracion = Number(d.duracion) || 30;
  try { await q(sb.from('config').update({ datos: { ...clinica, ...d } }).eq('id', 1)); await reloadAll(); toast('Datos de la clínica guardados'); } catch (err) { banner(errMsg(err)); }
});

/* ---------- Menú "Más" en celular ---------- */
$('#btnMas').onclick = () => {
  $('#moreList').innerHTML = $$('.side .nav.mm').map((b) => `<button class="nav ${b.classList.contains('on') ? 'on' : ''}" data-more="${b.dataset.nav}">${b.innerHTML}</button>`).join('') + '<button class="nav" data-more="salir">Cerrar sesión</button>';
  $('#moreSheet').classList.add('on');
};
$('#moreSheet').addEventListener('click', (e) => {
  const b = e.target.closest('[data-more]'); $('#moreSheet').classList.remove('on');
  if (b) { if (b.dataset.more === 'salir') salir(); else show(b.dataset.more); }
});
$$('[data-cancel-to]').forEach((b) => b.addEventListener('click', () => (b.dataset.cancelTo === 'vPaciente' && pacById(cur) ? openPaciente(cur) : show(b.dataset.cancelTo))));


/* =====================================================================
   IMPORTAR INVENTARIO DESDE EXCEL + BUSCADOR DESPLEGABLE
   ===================================================================== */
const normTxt = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const parseNum = (v) => {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[^\d,.\-]/g, '');
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^\-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
};
const tipoDe = (v) => { const t = normTxt(v); if (!t) return ''; if (/medic|farmac|vacun|antib|f[aá]rm/.test(t)) return 'medicamento'; if (/proced|cirug|operac/.test(t)) return 'procedimiento'; if (/servic|consult|atenc/.test(t)) return 'servicio'; return 'insumo'; };
const IMP_FIELDS = [
  ['nombre', 'Nombre (obligatorio)', /^(nombre|producto|insumo|descripci|art[ií]culo|item|detalle)/],
  ['tipo', 'Tipo', /^(tipo|categor|familia|clase)/],
  ['unidad', 'Unidad', /^(unidad|u\.?\s*medida|medida|formato)/],
  ['stock', 'Stock actual', /^(stock|cantidad|existencia|saldo|inventario)/],
  ['stock_minimo', 'Stock mínimo', /(minimo|min\.?$|critico|alerta)/],
  ['costo', 'Costo neto', /^(costo|precio\s*(de\s*)?compra|valor\s*compra|compra)/],
  ['precio', 'Precio neto de venta', /^(precio|valor|venta|pvp|tarifa)/]
];
let impHeaders = [], impRows = [], impMap = {}, impRes = [], impFileName = '';
function impSteps(n) { $$('#impSteps > div').forEach((d, i) => { d.className = i < n ? 'done' : i === n ? 'now' : ''; d.querySelector('b').textContent = i < n ? '✓' : String(i + 1); }); }
function impAutoMap() {
  impMap = {}; const used = new Set(); const H = impHeaders.map(normTxt);
  ['stock_minimo', 'nombre', 'tipo', 'unidad', 'costo', 'precio', 'stock'].forEach((k) => {
    const re = IMP_FIELDS.find((f) => f[0] === k)[2];
    const i = H.findIndex((h, j) => !used.has(j) && h && re.test(h));
    impMap[k] = i; if (i >= 0) used.add(i);
  });
}
function impAnalyze() {
  const val = (r, k) => (impMap[k] >= 0 ? r[impMap[k]] : '');
  const existentes = new Map(productos.map((p) => [normTxt(p.nombre), p])), vistos = new Set();
  impRes = impRows.map((r, idx) => {
    const nombre = String(val(r, 'nombre') ?? '').trim();
    const o = { fila: idx + 2, nombre, tipo: tipoDe(val(r, 'tipo')), unidad: String(val(r, 'unidad') || '').trim(), stock: parseNum(val(r, 'stock')), stock_minimo: parseNum(val(r, 'stock_minimo')), costo: parseNum(val(r, 'costo')), precio: parseNum(val(r, 'precio')), raw: r };
    if (r.every((c) => String(c ?? '').trim() === '')) return null;
    if (!nombre) return { ...o, estado: 'error', motivo: 'Falta el nombre' };
    const key = normTxt(nombre);
    if (vistos.has(key)) return { ...o, estado: 'error', motivo: 'Nombre repetido en el archivo' };
    vistos.add(key);
    for (const k of ['stock', 'stock_minimo', 'costo', 'precio']) if (impMap[k] >= 0 && String(val(r, k) ?? '').trim() !== '' && isNaN(o[k])) return { ...o, estado: 'error', motivo: `“${val(r, k)}” no es un número válido` };
    const ex = existentes.get(key);
    return ex ? { ...o, estado: 'actualiza', ex } : { ...o, estado: 'nuevo' };
  }).filter(Boolean);
}
const EST_IMP = { nuevo: ['Nuevo', 'confirmada'], actualiza: ['Actualiza stock y precio', ''], error: ['', 'cancelada'] };
function renderImport() {
  const tiene = impRows.length > 0;
  $('#impMapBox').classList.toggle('hide', !tiene); $('#impPrevBox').classList.toggle('hide', !tiene); $('#impSum').classList.toggle('hide', !tiene);
  $('#impFile').textContent = tiene ? impFileName : 'Elige tu archivo .xlsx o .csv';
  $('#impFileSub').textContent = tiene ? `${impRows.length} filas con datos` : 'O arrástralo aquí. La primera fila debe tener los nombres de las columnas.';
  if (!tiene) { impSteps(0); return; }
  impSteps(1);
  const opts = (sel) => '<option value="-1">— No importar —</option>' + impHeaders.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h || `Columna ${i + 1}`)}</option>`).join('');
  $('#impMap').innerHTML = IMP_FIELDS.map(([k, l]) => `<div class="mapr"><span title="${esc(l)}">${esc(l)}</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--acc)"><path d="M19 12H5M11 6l-6 6 6 6"/></svg><label><span class="hide">Columna para ${esc(l)}</span><select data-impf="${k}" style="min-height:40px">${opts(impMap[k])}</select></label></div>`).join('');
  impAnalyze();
  const n = impRes.filter((r) => r.estado === 'nuevo').length, a = impRes.filter((r) => r.estado === 'actualiza').length, e = impRes.filter((r) => r.estado === 'error').length;
  const prev = [...impRes.filter((r) => r.estado === 'error'), ...impRes.filter((r) => r.estado !== 'error')].slice(0, 12);
  const f = (v, money) => (isNaN(v) ? '<span class="muted">—</span>' : money ? CLP(v) : esc(String(v)));
  $('#impPrev').innerHTML = prev.map((r) => `<tr><td><b>${esc(r.nombre) || '<span class="muted">(vacío)</span>'}</b><br><span class="muted small">Fila ${r.fila}</span></td><td>${esc(TIPOS[r.tipo] || (r.ex ? TIPOS[r.ex.tipo] : 'Insumo'))}</td><td class="money">${f(r.stock)}</td><td class="money">${f(r.stock_minimo)}</td><td class="money">${f(r.precio, 1)}</td><td><span class="st ${EST_IMP[r.estado][1]}">${esc(r.estado === 'error' ? r.motivo : EST_IMP[r.estado][0])}</span></td></tr>`).join('');
  $('#impPrevInfo').textContent = `Mostrando ${prev.length} de ${impRes.length} filas${e ? ', primero las con error' : ''}`;
  const sinNombre = impMap.nombre < 0;
  $('#impSum').innerHTML = `<h2 style="margin:0">Resumen</h2>
    ${sinNombre ? '<p class="msg bad" style="margin:0">Elige qué columna tiene el <b>nombre</b> del producto.</p>' : ''}
    <div class="g" style="gap:10px"><div class="row"><span>Productos nuevos</span><b class="sp" style="font-size:22px;color:#1F7A47">${n}</b></div><div class="row"><span>Se actualizan</span><b class="sp" style="font-size:22px;color:var(--acc)">${a}</b></div><div class="row"><span>Con error, no se importan</span><b class="sp" style="font-size:22px;color:var(--warn)">${e}</b></div></div>
    <p class="muted small" style="margin:0">En los que ya existen se actualizan precio, costo, mínimo y stock. El cambio de stock queda registrado como ajuste, con tu nombre.</p>
    <button type="button" class="b pri" id="btnImpGo" ${sinNombre || !(n + a) ? 'disabled' : ''}>Importar ${n + a} producto${n + a === 1 ? '' : 's'}</button>
    ${e ? '<button type="button" class="b" id="btnImpErr">Descargar filas con error (.xlsx)</button>' : ''}
    <button type="button" class="linkb" id="btnImpOtro">Elegir otro archivo</button>`;
}
async function impLeer(file) {
  if (!file) return;
  try {
    await cargarXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    if (rows.length < 2) { toast('El archivo no tiene filas con datos'); return; }
    impHeaders = rows[0].map((h) => String(h ?? '').trim());
    const w = impHeaders.length; impRows = rows.slice(1).map((r) => [...r, ...Array(Math.max(0, w - r.length)).fill('')].slice(0, Math.max(w, r.length))).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    impFileName = `${file.name}${wb.SheetNames.length > 1 ? ` (hoja “${wb.SheetNames[0]}”)` : ''}`;
    impAutoMap(); renderImport();
  } catch (err) { banner('No se pudo leer el archivo: ' + (err.message || err) + '. Guárdalo como .xlsx o .csv e inténtalo de nuevo.'); }
}
$('#impInput').addEventListener('change', (e) => { impLeer(e.target.files[0]); e.target.value = ''; });
const dz = $('#impDrop');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => impLeer(e.dataTransfer.files[0]));
$('#impMap').addEventListener('change', (e) => { const s = e.target.closest('[data-impf]'); if (s) { impMap[s.dataset.impf] = Number(s.value); renderImport(); } });
$('#btnImport').onclick = () => { if (!ready()) return; impHeaders = []; impRows = []; renderImport(); show('vImport'); };
$('#btnPlantilla').onclick = async () => {
  await cargarXLSX();
  const ws = XLSX.utils.aoa_to_sheet([['Nombre', 'Tipo', 'Unidad', 'Stock', 'Stock mínimo', 'Costo neto', 'Precio neto'], ['Jeringa 3 ml', 'Insumo', 'unidad', 120, 30, 80, 150], ['Vacuna óctuple', 'Medicamento', 'dosis', 24, 5, 7000, 15000], ['Consulta general', 'Servicio', 'atención', '', '', '', 18000], ['Esterilización hembra hasta 10 kg', 'Procedimiento', 'cirugía', '', '', '', 85000]]);
  ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 13 }, { wch: 11 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario'); XLSX.writeFile(wb, 'Plantilla_inventario_TuCitaVet.xlsx');
};
$('#impSum').addEventListener('click', async (e) => {
  if (e.target.closest('#btnImpOtro')) return $('#impInput').click();
  if (e.target.closest('#btnImpErr')) {
    await cargarXLSX();
    const errs = impRes.filter((r) => r.estado === 'error');
    const ws = XLSX.utils.aoa_to_sheet([[...impHeaders, 'Error'], ...errs.map((r) => [...r.raw, `Fila ${r.fila}: ${r.motivo}`])]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Con error'); XLSX.writeFile(wb, 'Filas_con_error.xlsx'); return;
  }
  const go = e.target.closest('#btnImpGo'); if (!go || !ready()) return;
  go.disabled = true;
  const has = (k) => impMap[k] >= 0, nuevos = impRes.filter((r) => r.estado === 'nuevo'), upd = impRes.filter((r) => r.estado === 'actualiza');
  const nz = (v) => (isNaN(v) ? 0 : v);
  let hechos = 0; const total = nuevos.length + upd.length;
  const prog = () => { go.textContent = `Importando… ${hechos} de ${total}`; };
  try {
    for (let i = 0; i < nuevos.length; i += 100) {
      const lote = nuevos.slice(i, i + 100);
      const filas = lote.map((r) => { const tipo = r.tipo || 'insumo'; return { nombre: r.nombre, tipo, unidad: r.unidad || 'unidad', controla_stock: (has('stock') && !isNaN(r.stock)) || ['insumo', 'medicamento'].includes(tipo), stock_minimo: nz(r.stock_minimo), costo: nz(r.costo), precio: nz(r.precio), activo: true }; });
      const ins = await q(sb.from('productos').insert(filas).select('id,nombre'));
      const idDe = new Map(ins.map((x) => [normTxt(x.nombre), x.id]));
      const movs = lote.filter((r) => has('stock') && nz(r.stock) > 0).map((r) => ({ producto_id: idDe.get(normTxt(r.nombre)), tipo: 'entrada', cantidad: r.stock, motivo: `Importado desde Excel (${impFileName.slice(0, 60)})`, por: myId })).filter((m) => m.producto_id);
      if (movs.length) await q(sb.from('movimientos').insert(movs));
      hechos += lote.length; prog();
    }
    for (const r of upd) {
      const ch = {};
      if (has('precio') && !isNaN(r.precio)) ch.precio = r.precio;
      if (has('costo') && !isNaN(r.costo)) ch.costo = r.costo;
      if (has('stock_minimo') && !isNaN(r.stock_minimo)) ch.stock_minimo = r.stock_minimo;
      if (has('unidad') && r.unidad) ch.unidad = r.unidad;
      if (has('tipo') && r.tipo) ch.tipo = r.tipo;
      if (Object.keys(ch).length) await q(sb.from('productos').update(ch).eq('id', r.ex.id));
      if (has('stock') && !isNaN(r.stock)) {
        const diff = r.stock - Number(r.ex.stock || 0);
        if (!r.ex.controla_stock) await q(sb.from('productos').update({ controla_stock: true }).eq('id', r.ex.id));
        if (diff) await q(sb.from('movimientos').insert({ producto_id: r.ex.id, tipo: 'ajuste', cantidad: diff, motivo: 'Ajuste por importación desde Excel', por: myId }));
      }
      hechos++; prog();
    }
    impSteps(3);
    await reloadAll(); toast(`Listo: ${nuevos.length} nuevos y ${upd.length} actualizados`); show('vInventario');
  } catch (err) { banner(`Se importaron ${hechos} de ${total} antes del error: ${errMsg(err)}`); go.disabled = false; go.textContent = 'Reintentar'; await reloadAll(); }
});

/* ---------- Buscador desplegable (cotizaciones y recetas) ---------- */
const combo = $('#combo'); let cbInput = null, cbItems = [], cbSel = 0;
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function cbSource(inp) { const act = productos.filter((p) => p.activo); return inp.classList.contains('m-med') ? (act.some((p) => p.tipo === 'medicamento') ? act.filter((p) => p.tipo === 'medicamento') : act) : act; }
function cbHide() { combo.classList.remove('on'); cbInput = null; }
function cbPlace() {
  if (!cbInput) return; const r = cbInput.getBoundingClientRect(), w = Math.min(Math.max(r.width, 340), innerWidth - 16);
  combo.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; combo.style.width = w + 'px';
  const below = innerHeight - r.bottom > 240 || r.top < 260; combo.style.top = below ? r.bottom + 4 + 'px' : ''; combo.style.bottom = below ? '' : innerHeight - r.top + 4 + 'px';
}
function cbShow(inp) {
  cbInput = inp; const qv = normTxt(inp.value), src = cbSource(inp);
  cbItems = src.filter((p) => !qv || normTxt(p.nombre).includes(qv)).sort((a, b) => normTxt(a.nombre).indexOf(qv) - normTxt(b.nombre).indexOf(qv) || a.nombre.localeCompare(b.nombre)).slice(0, 8);
  if (!cbItems.length || (cbItems.length === 1 && cbItems[0].nombre === inp.value)) { combo.classList.remove('on'); return; }
  cbSel = Math.min(cbSel, cbItems.length - 1);
  const hl = (n) => { const t = inp.value.trim(); if (!t) return esc(n); const m = n.match(new RegExp(escRe(t), 'i')); return m ? esc(n.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>' + esc(n.slice(m.index + m[0].length)) : esc(n); };
  combo.innerHTML = cbItems.map((p, i) => `<button type="button" role="option" aria-selected="${i === cbSel}" class="${i === cbSel ? 'on' : ''}" data-cb="${i}"><span>${hl(p.nombre)}</span><b class="money">${CLP(p.precio)}</b><small class="${bajo(p) ? 'low' : ''}">${esc(TIPOS[p.tipo] || p.tipo)}${p.controla_stock ? `, ${esc(String(p.stock))} ${esc(p.unidad)}${bajo(p) ? ', bajo el mínimo' : ''}` : ''}</small><small style="text-align:right">neto</small></button>`).join('') + '<div class="muted small" style="padding:6px 10px 2px">Flechas para moverte, Enter para elegir</div>';
  combo.classList.add('on'); cbPlace();
}
function cbPick(i) {
  const p = cbItems[i]; if (!p || !cbInput) return; const inp = cbInput;
  inp.value = p.nombre;
  if (inp.classList.contains('it-desc')) { const pr = inp.closest('tr').querySelector('.it-precio'); pr.value = p.precio; }
  cbHide(); inp.dispatchEvent(new Event('input', { bubbles: true })); cbHide();
  const next = inp.closest('tr').querySelector(inp.classList.contains('it-desc') ? '.it-cant' : '.m-pres'); if (next) next.focus();
}
const isCb = (el) => el && el.matches && el.matches('.it-desc, .m-med');
document.addEventListener('focusin', (e) => { if (isCb(e.target)) { cbSel = 0; cbShow(e.target); } });
document.addEventListener('input', (e) => { if (isCb(e.target) && e.isTrusted) { cbSel = 0; cbShow(e.target); } });
document.addEventListener('keydown', (e) => {
  if (!isCb(e.target) || !combo.classList.contains('on')) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cbSel = (cbSel + (e.key === 'ArrowDown' ? 1 : -1) + cbItems.length) % cbItems.length; cbShow(e.target); }
  else if (e.key === 'Enter') { e.preventDefault(); cbPick(cbSel); }
  else if (e.key === 'Escape') cbHide();
});
document.addEventListener('focusout', (e) => { if (isCb(e.target)) setTimeout(() => { if (document.activeElement !== cbInput) cbHide(); }, 120); });
combo.addEventListener('mousedown', (e) => e.preventDefault());
combo.addEventListener('click', (e) => { const b = e.target.closest('[data-cb]'); if (b) cbPick(Number(b.dataset.cb)); });
addEventListener('resize', cbPlace); addEventListener('scroll', cbPlace, true);

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
  const [perfiles, pacs, cons, evs, citas, prods, movs, recs, cots] = await Promise.all([fetchAll('perfiles', 'creado_en'), fetchAll('pacientes', 'numero'), fetchAll('consultas', 'fecha'), fetchAll('eventos', 'en'),
    fetchAll('citas', 'inicio'), fetchAll('productos', 'nombre'), fetchAll('movimientos', 'en'), fetchAll('recetas', 'numero'), fetchAll('cotizaciones', 'numero')]);
  return { perfiles, pacs, cons, evs, citas, prods, movs, recs, cots };
}
const fdt = (iso) => iso ? new Date(iso).toLocaleString('es-CL') : '';
const nom = (eq, id) => (id && eq[id]?.nombre) || '';
function hojas({ perfiles, pacs, cons, evs, citas = [], prods = [], movs = [], recs = [], cots = [] }) {
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
  const prodById = Object.fromEntries(prods.map((x) => [x.id, x]));
  const citasH = citas.map((c) => { const p = byId[c.paciente_id]; const d = c.datos || {}; const ini = new Date(c.inicio);
    return { 'Fecha': ini.toLocaleDateString('es-CL'), 'Hora': hhmm(ini), 'Duración (min)': c.duracion_min, 'Paciente': p?.nombre || d.nuevo?.nombre || '', 'Tutor': p?.tutor?.nombre || d.nuevo?.tutor || '', 'Teléfono': p?.tutor?.telefono || d.nuevo?.telefono || '', 'Motivo': c.motivo, 'Médico': nom(eq, c.medico_id), 'Estado': ESTADOS[c.estado] || c.estado, 'WhatsApp enviado': d.waEnviado ? fdt(d.waEnviado) : '', 'Agendada por': nom(eq, c.creado_por) }; });
  const recH = recs.flatMap((r) => { const p = byId[r.paciente_id]; const items = r.datos?.items?.length ? r.datos.items : [{}];
    return items.map((m) => ({ 'N° receta': r.numero, 'Fecha': fDate(r.fecha), 'Paciente': p?.nombre || '', 'N° ficha': p?.numero || '', 'Médico': nom(eq, r.medico_id), 'Medicamento': m.medicamento || '', 'Presentación': m.presentacion || '', 'Dosis': m.dosis || '', 'Vía': m.via || '', 'Frecuencia': m.frecuencia || '', 'Duración': m.duracion || '', 'Indicaciones': r.datos?.indicaciones || '' })); });
  const cotH = cots.map((c) => { const p = byId[c.paciente_id]; const d = c.datos || {};
    return { 'N°': c.numero, 'Fecha': fDate(c.fecha), 'Paciente': p?.nombre || '', 'Cliente': p?.tutor?.nombre || d.clienteNombre || '', 'Estado': c.estado, 'Ítems': (d.items || []).map((it) => `${it.descripcion} x${it.cantidad}`).join(' | '), 'Neto': d.neto || 0, 'IVA': d.iva || 0, 'Total': c.total, 'Creada por': nom(eq, c.creado_por) }; });
  const invH = prods.map((x) => ({ 'Nombre': x.nombre, 'Tipo': TIPOS[x.tipo] || x.tipo, 'Unidad': x.unidad, 'Controla stock': x.controla_stock ? 'Sí' : 'No', 'Stock': x.controla_stock ? Number(x.stock) : '', 'Stock mínimo': x.controla_stock ? Number(x.stock_minimo) : '', 'Costo neto': Number(x.costo), 'Precio neto': Number(x.precio), 'Activo': x.activo ? 'Sí' : 'No' }));
  const movH = movs.map((m) => ({ 'Fecha y hora': fdt(m.en), 'Producto': prodById[m.producto_id]?.nombre || '', 'Tipo': m.tipo, 'Cantidad': Number(m.cantidad), 'Motivo': m.motivo, 'Por': nom(eq, m.por) }));
  return { Pacientes: pacientes, Consultas: consultas, Citas: citasH, Recetas: recH, Cotizaciones: cotH, Inventario: invH, 'Movimientos de stock': movH, 'Registro de cambios': cambios, Equipo: equipoH };
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
        perfiles: data.perfiles, pacientes: data.pacs, consultas: data.cons, eventos: data.evs,
        citas: data.citas, productos: data.prods, movimientos: data.movs, recetas: data.recs, cotizaciones: data.cots, config: clinica };
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
  ['pLogin', 'pRecuperar', 'pClave', 'pPendiente', 'pConfig'].forEach((p) => $('#' + p).classList.toggle('hide', p !== panel));
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
$('#btnOlvide').onclick = () => { $('#rEmail').value = $('#aEmail').value.trim(); amsg('#rMsg', ''); showAuth('pRecuperar'); $('#rEmail').focus(); };
$('#btnVolverLogin').onclick = () => { if ($('#rEmail').value) $('#aEmail').value = $('#rEmail').value; showAuth('pLogin'); };
$('#pRecuperar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#rEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return amsg('#rMsg', 'Escribe un correo válido.', true);
  const btn = $('#rSubmit'); btn.disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: backUrl() });
  btn.disabled = false;
  amsg('#rMsg', error ? authErr(error) : `Listo. Si ${email} tiene cuenta, te llegará un correo con un enlace para crear tu nueva contraseña. Revisa también spam. El enlace vence en 1 hora.`, !!error);
});
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

let starting = null;
function start() {
  if (starting) return starting;
  starting = start2().finally(() => { starting = null; });
  return starting;
}
async function start2() {
  if (started || !session || inRecovery) return;
  myId = session.user.id;
  let perfil = null;
  let { data, error } = await sb.rpc('registrarme');
  if (error && /duplicate key|perfiles_pkey/i.test(error.message || '')) {
    ({ data, error } = await sb.rpc('registrarme'));
  }
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
  show('vInicio');
  try { await loadAll(); } catch (e) { banner(errMsg(e)); }
  refresh();
  if (!rtChannel) {
    rtChannel = sb.channel('cambios')
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'pacientes' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'consultas' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'perfiles' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'citas' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'productos' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: CFG.SCHEMA || 'vet', table: 'cotizaciones' }, reloadSoon)
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
