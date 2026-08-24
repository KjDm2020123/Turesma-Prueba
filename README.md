# Turesma

Aplicacion de turismo con backend en Node.js/Express y frontend en Next.js.

## Estructura

- `backend/`: API, PostgreSQL, autenticacion y archivos subidos.
- `web/`: interfaz Next.js.

## Desarrollo local

Requisitos: Node.js 20 o superior y PostgreSQL si se ejecuta la API localmente.

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

En otra terminal:

```powershell
cd web
npm install
Copy-Item .env.example .env.local
npm run dev
```

La API queda en `http://localhost:4000` y el frontend en `http://localhost:3000`.

Configura las variables de `backend/.env` con datos locales o del proveedor de PostgreSQL. Para el frontend, `web/.env.local` debe contener la URL de la API.

## Comprobaciones

```powershell
cd backend
npm run build

cd ..\web
npm run lint
npm run build
```

No subas `.env`, `.env.local`, contraseñas, tokens ni contenido de `backend/uploads/`. Las variables de producción se configuran como Environment Variables en Render.
