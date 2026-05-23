# Prestaciones Comparador Vite

Aplicación Vite + React + Supabase para buscar, comparar y actualizar precios de prestaciones por prestador.

## Base consolidada

- Registros normalizados: **37,307**
- Prestadores: **19**
- Códigos únicos: **21,382**
- Códigos presentes en más de un prestador: **2,721**

Archivos incluidos: ver `supabase/dataset_summary.json`.

## Funciones

- Buscador por código, descripción, prestador y ámbito.
- Matriz comparativa por código.
- Detección de opción más barata.
- Fallback local con `public/compiled_data.json` si todavía no conectaste Supabase.
- RPC `aumentar_precios_prestador` para aumentos masivos.

## Configuración Supabase

1. Crear un proyecto en Supabase.
2. Ir a **SQL Editor** y ejecutar completo `supabase/schema.sql`.
3. Ir a **Table Editor > prestaciones > Import data**.
4. Subir `supabase/seed_prestaciones.csv`.
5. Confirmar columnas:
   - prestador
   - ambito
   - vigencia
   - codigo
   - descripcion
   - precio
   - moneda
   - archivo_origen

## Configuración local

```bash
npm install
cp .env.example .env
npm run dev
```

Variables:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

Si no completás `.env`, la app funciona igual en modo demo usando el JSON local.

## Subir a GitHub

```bash
git init
git add .
git commit -m "prestaciones comparador"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/prestaciones-comparador-vite.git
git push -u origin main
```

## Deploy en Vercel

1. Importar el repositorio desde Vercel.
2. Framework: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Agregar variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy.

## Futuras cargas

Para agregar más Excel: copiar los `.xlsx` a una carpeta de importación y volver a generar `compiled_data.json` y `seed_prestaciones.csv` con el normalizador. La estructura de Supabase no cambia.

## Actualización solicitada: filtros en 0

El buscador ahora incluye filtros para todas las dimensiones disponibles en la base consolidada:

- Prestador
- Ámbito / tipo
- Vigencia
- Moneda
- Archivo / convenio de origen
- Precio desde
- Precio hasta

Por defecto todos los filtros quedan configurados en `0`. En la aplicación, `0` significa “sin filtro aplicado”. El botón **Reset 0** vuelve todos los filtros a ese estado inicial.
