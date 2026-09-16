# DocuVault - Gestor de Documentos

Aplicación para almacenar, organizar y consultar documentos digitales (PDF, fotos de DNI, pasaporte, licencias, documentos escolares, etc.) con estructura jerárquica:

```
Familia → Categoría → Subcategoría → Documento
```

Ejemplo:
```
Familia Pérez
├── Escolar
│   ├── Hijo Mayor (Juan)
│   │   ├── Boleta 2025.pdf
│   │   └── Matrícula.pdf
│   └── Vacunas
└── Documentos de México
    ├── Acta de nacimiento
    └── Pasaporte
```

## Tecnología

- **Frontend**: HTML + CSS + JavaScript (vanilla, SPA)
- **Backend**: [Supabase](https://supabase.com) (auth, PostgreSQL, storage, RLS)

## Configuración paso a paso

### 1. Crear proyecto en Supabase

1. Ve a https://supabase.com → **New Project**
2. Ponle un nombre y contraseña de base de datos
3. Espera a que se cree el proyecto (1-2 min)

### 2. Crear las tablas

Ve a **SQL Editor** → New Query y pega esto:

```sql
-- Tabla de familias (grupos de personas)
create table public.families (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Tabla de categorías (Escolar, Salud, Documentos de México...)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Tabla de subcategorías (Juan, María, 2025, País...)
create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Tabla de documentos
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  subcategory_id uuid references public.subcategories(id) on delete cascade,
  name text not null,
  file_url text not null,
  file_path text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint default 0,
  created_at timestamptz default now()
);

-- Índices para consultas rápidas
create index documents_user_idx on public.documents(user_id);
create index documents_family_idx on public.documents(family_id);
create index documents_category_idx on public.documents(category_id);
create index documents_subcategory_idx on public.documents(subcategory_id);
```

### 3. Activar Row Level Security (RLS)

En el mismo SQL Editor, pega:

```sql
alter table public.families enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.documents enable row level security;

-- Cada usuario solo ve/edita SUS datos
create policy "familias_propias" on public.families
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "categorias_propias" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subcategorias_propias" on public.subcategories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "documentos_propios" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 4. Crear el bucket de Storage

1. Ve a **Storage** → **New bucket**
2. Nombre: `documentos`
3. Marca **Public bucket** (para poder ver PDFs/imágenes)

### 5. Configurar las claves en app.js

Abre `app.js` y edita las dos primeras líneas:

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XXXXXXXX';
```

- **Project URL**: Settings → API → configure Project URL (aparece `https://xxx.supabase.co`)
- **Publishable key**: Settings → API → Section "Publishable and secret API keys" → copia la `Publishable key` (empieza con `sb_publishable_`)

> ⚠️ **No** pegues nunca la *Secret key* en la web: es de administrador y cualquiera que la vea puede manipular tus datos. Solo va en servidores/backends.

> 💡 La **Publishable key** solo funciona si habilitaste RLS y creaste policies en tus tablas (todo incluido en `setup.sql`).

### 6. (Opcional) Registro sin confirmar correo

Por defecto Supabase envía un correo de confirmación al registrar usuarios. Para que funcione al instante:
1. Authentication → Sign In / Providers → Email
2. Desmarca **"Confirm email"** → Save

### 7. Abrir la app

Solo abre `index.html` en tu navegador (doble clic). También puedes subirla a Netlify o Vercel gratis.

## Uso

1. **Regístrate** con correo
2. Se crea automáticamente la familia **"Mi Familia"**
3. Entra a **Familias** → toca tu familia
4. **Agregar categoría**: ej. "Escolar", "Documentos de México", "Salud"
5. Entra a la categoría → **Agregar subcategoría**: ej. "Juan", "Hijo Mayor", "2025"
6. Sube documentos arrastrándolos

## Características

- Login/registro seguro con Supabase Auth
- Almacenamiento en la nube (URL pública)
- Jerarquía de carpetas: Familia → Miembro → Categoría → Subcategoría
- **Miembros**: agrega a hijos, esposa, padres como carpetas propias dentro de cada familia
- **Familia compartida**: invita a tu pareja con su correo; al aceptar, entran con su propia cuenta y ven los mismos documentos
- Vistas individuales por familia, miembro, categoría y subcategoría
- Búsqueda por nombre y filtros combinados
- Vista previa de PDF e imágenes
- Descarga directa desde la tarjeta o la vista previa
- Eliminación y configuración de perfil
- Diseño responsive y en español

## Estructura del proyecto

```
document-manager/
├── index.html   # Interfaz
├── style.css    # Estilos
├── app.js       # Lógica + Supabase
├── setup.sql    # Script inicial (tablas + RLS)
├── setup2.sql   # Script v2: miembros + familias compartidas
└── README.md    # Este archivo
```