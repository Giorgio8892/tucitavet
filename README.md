# TuCita Vet · Fichas clínicas veterinarias

App web (computador y celular) para registrar pacientes, consultas e historial clínico de una clínica veterinaria, con inicio de sesión por correo y contraseña o con Google, y acceso para todo el equipo.

**Herramientas:** Supabase (base de datos e inicio de sesión) · GitHub (guarda el código) · Vercel (publica la página). Las tres tienen plan gratuito.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página (pantallas y diseño) |
| `app.js` | El funcionamiento de la app |
| `config.js` | **Aquí pegas los datos de tu proyecto de Supabase** |
| `logo.png` | Logo de la clínica |
| `vendor/supabase.js` | Librería oficial de Supabase (v2.119.0), incluida para no depender de otros sitios |
| `vendor/xlsx.full.min.js` | Librería SheetJS (v0.18.5) para generar el respaldo en Excel |
| `privacidad.html` | Política de privacidad y condiciones de uso (enlazada en Google) |
| `supabase/schema.sql` | Crea las tablas y las reglas de seguridad en Supabase |

---

## Paso 1 · Usar tu proyecto de Supabase existente

El plan gratuito de Supabase permite **2 proyectos activos**. Por eso esta app **no necesita un proyecto nuevo**: se instala dentro de tu proyecto **Tu_Cita**, en un espacio separado llamado `vet` (un *schema*). Las tablas de la clínica quedan aparte de las de TuCita peluquerías y no se tocan entre sí.

1. Entra a <https://supabase.com/dashboard> y abre el proyecto **Tu_Cita**.

## Paso 2 · Crear las tablas y la seguridad

1. En el menú izquierdo: **SQL Editor** → **New query**.
2. Abre `supabase/schema.sql`, copia **todo** el contenido, pégalo y presiona **Run**.
3. Debe decir *Success. No rows returned*.
4. **Importante:** ve a **Project Settings → Data API** (o **API**) → **Exposed schemas** → agrega `vet` a la lista (deja los que ya están, como `public`) → **Save**. Sin esto la app no puede leer las tablas.

Esto crea, dentro de `vet`:
- **perfiles**: cada persona del equipo (nombre, cargo, rol admin/miembro, aprobado o pendiente).
- **pacientes**: la ficha de cada mascota, con N° de ficha automático.
- **consultas**: cada atención, con médico tratante y próximo control.
- **eventos**: registro de cambios (quién creó, editó, cambió de dueño o eliminó). No se puede editar ni borrar.

Y reglas de seguridad: **solo personas aprobadas** ven datos, la base de datos firma automáticamente quién crea y modifica cada registro, y solo un administrador puede eliminar pacientes o consultas y aprobar personas.

**Sobre las cuentas compartidas:** las dos apps usan el mismo sistema de usuarios del proyecto. Si un cliente de TuCita peluquerías entra a la app veterinaria, queda "esperando aprobación" y **no ve nada** hasta que un admin de la clínica lo apruebe. Al revés, aprobar a alguien en la clínica no le da acceso a nada de la otra app.

## Paso 3 · Conectar la app con Supabase

1. En el proyecto **Tu_Cita**: **Project Settings** (engranaje) → **API** (o **Data API** / **API Keys**).
2. Copia:
   - **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - La clave pública: **anon public** (o **publishable key**, empieza con `sb_publishable_`).
3. Abre `config.js` y reemplaza:
   ```js
   SUPABASE_URL: 'https://abcdxyz.supabase.co',
   SUPABASE_ANON_KEY: 'la-clave-que-copiaste',
   NOMBRE_CLINICA: 'Vida Sana Veterinaria',
   SCHEMA: 'vet'
   ```

> ⚠️ **Nunca** pegues la clave **service_role** / **secret**. Esa clave salta todas las reglas de seguridad. La clave pública sí puede estar en la página: la protección la dan las reglas del Paso 2.

## Paso 4 · Subir el código a GitHub

1. Entra a <https://github.com> → **New repository**.
   - Name: `tucitavet`
   - Marca **Private**.
   - Crear.
2. En el repositorio vacío: **uploading an existing file** (o **Add file → Upload files**).
3. Arrastra **todo el contenido** de esta carpeta (incluidas las carpetas `vendor` y `supabase`) → **Commit changes**.

## Paso 5 · Publicar con Vercel

1. Entra a <https://vercel.com> → **Sign up with GitHub**.
2. **Add New… → Project** → elige el repositorio `tucitavet` → **Import**.
3. Framework Preset: **Other**. No cambies nada más (no hay build).
4. **Deploy**. En 1 minuto tendrás una dirección como `https://tucitavet.vercel.app`. **Cópiala.**

Desde ahora, cada vez que cambies un archivo en GitHub, Vercel publica la nueva versión solo.

## Paso 6 · Decirle a Supabase cuál es la dirección de la app

En Supabase: **Authentication → URL Configuration**:
- **Site URL**: **no la cambies** si ya la usa tu app de peluquerías.
- **Redirect URLs** → **Add URL**: `https://tucitavet.vercel.app/**` (tu dirección de Vercel).

La app le indica a Supabase que vuelva a su propia dirección, y Supabase solo lo permite si está en esa lista. Sin esto, los correos de confirmación y de "olvidé mi contraseña" llevarían a la otra app.

En **Authentication → Sign In / Providers → Email**: deja activado **Email** y **Confirm email**.

> Los correos automáticos (confirmación, recuperar contraseña) son los mismos para las dos apps. Si quieres, en **Authentication → Emails** cambia el texto para que diga "TuCita" en general.

## Paso 7 · Iniciar sesión con Google (opcional, recomendado)

**A. En Google Cloud** (<https://console.cloud.google.com>, con la cuenta Google de la clínica):
1. Crea un proyecto nuevo: `TuCita Vet`.
2. **APIs & Services → OAuth consent screen** (o **Google Auth Platform → Branding**):
   - User type: **External**.
   - App name: `Vida Sana Veterinaria`, correo de soporte, logo (opcional).
   - Scopes: solo los básicos (`email`, `profile`, `openid`). No agregues otros.
   - Publica la app (**Publish app** / *In production*).
3. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: `https://tucitavet.vercel.app`
   - Authorized redirect URIs: la dirección que muestra Supabase en el paso B (termina en `/auth/v1/callback`, por ejemplo `https://abcdxyz.supabase.co/auth/v1/callback`).
   - Crear → copia **Client ID** y **Client secret**.

**B. En Supabase:** **Authentication → Sign In / Providers → Google** → activa, pega Client ID y Client secret → **Save**. Ahí mismo aparece la *Callback URL* que va en el paso A.3.

> Si tu app de peluquerías **ya tiene** Google activado en este proyecto, no crees otro: abre ese mismo OAuth client en Google Cloud y solo agrega `https://tucitavet.vercel.app` en *Authorized JavaScript origins*.

Como solo pide nombre y correo, el inicio con Google no necesita la verificación de permisos sensibles de Google.

## Paso 8 · Primer ingreso: tú quedas como administrador

1. Abre tu dirección de Vercel.
2. **Crear cuenta** (o **Continuar con Google**, o **Ingresar** si ya tienes cuenta en Tu_Cita). **La primera persona que entra a la app veterinaria queda como administradora** automáticamente. Hazlo tú antes de compartir la dirección.
3. Confirma tu correo si te lo pide, entra y completa tu perfil (nombre y cargo).

## Paso 9 · Sumar al equipo

1. En la app: **Equipo → Copiar dirección de la app** y envíala por WhatsApp.
2. Cada persona crea su cuenta (correo o Google). Queda **Esperando aprobación**.
3. Tú (admin) vas a **Equipo → Aprobar**. Puedes nombrar a otros administradores o quitar el acceso a quien se vaya (lo que registró se mantiene firmado con su nombre).

---

## Cuidados importantes

- **Respaldos (una vez por semana):** el plan gratuito de Supabase no incluye respaldos diarios automáticos. Hay dos formas de sacarlos:
  1. **Desde la app (recomendado):** entra como administrador → **Equipo → Respaldo de datos**.
     - **Descargar Excel (.xlsx):** hojas de Pacientes, Consultas, Registro de cambios y Equipo, cada dato en su columna.
     - **Descargar respaldo completo (.json):** copia técnica exacta, para restaurar si hiciera falta.
     Guarda ambos en una carpeta con la fecha en Drive u OneDrive.
  2. **Desde Supabase:** **Editor de tablas** → arriba a la izquierda cambia el schema de `public` a **`vet`** → abre cada tabla (`pacientes`, `consultas`, `eventos`, `perfiles`) → **Exportar → Exportar como CSV**. Ojo: los datos de cada ficha vienen en una sola columna `datos` (formato JSON).
- **Proyecto en pausa:** Supabase pausa los proyectos gratuitos después de 1 semana sin uso. Como ahora comparte proyecto con Tu_Cita, basta con que cualquiera de las dos apps se use. Si se pausa, se reactiva desde el panel de Supabase.
- **Espacio:** el plan gratuito tiene 500 MB de base de datos para todo el proyecto (hoy usas 29 MB). Las fichas son texto y ocupan poco; si algún día se llena, ahí conviene pasar a Pro o a un proyecto propio.
- **Datos personales:** la app guarda RUT, teléfonos y direcciones de tutores. Aprueba solo a personas de la clínica y quita el acceso a quien deje de trabajar ahí.
- **Contraseñas:** Supabase las guarda cifradas. Nadie, ni el administrador, puede verlas. Quien la olvide usa "¿Olvidaste tu contraseña?".

## Próximos pasos posibles

- Botón "Agendar en Google Calendar" para los próximos controles (requiere un permiso sensible de Google y, para más de 100 usuarios, verificación de la app).
- Recordatorios por WhatsApp a los tutores.
- Cotizador de intervenciones (IVA + insumos).
- Varias clínicas en una misma instalación (para vender TuCita Vet como servicio).
