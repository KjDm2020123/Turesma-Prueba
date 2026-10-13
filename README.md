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

## Inteligencia operativa

El panel administrativo incluye analítica descriptiva y recomendaciones basadas en
datos reales de reservas, flota y mantenimiento. Las rutas protegidas disponibles
son:

- `GET /api/admin/inteligencia/dashboard`
- `GET /api/admin/inteligencia/analitica`
- `GET /api/admin/inteligencia/asignacion-recomendada?fecha=YYYY-MM-DD&pasajeros=N`
- `GET /api/admin/inteligencia/desempeno`
- `GET /api/admin/control-operativo`
- `GET /api/admin/inteligencia/anomalias`
- `POST /api/admin/inteligencia/simular`

El simulador también está disponible desde el módulo independiente
`/admin/simulador`, con escenarios predeterminados, validación de parámetros,
comparación gráfica entre situación actual y proyectada, nivel de riesgo,
recomendación automática y supuestos del cálculo.

El centro de control operativo consolida las operaciones del día, asignaciones
pendientes, disponibilidad de flota, mantenimiento, pagos y un semáforo general.
El simulador es de solo lectura: acepta porcentajes de variación de tarifa,
demanda, combustible y días del periodo para proyectar reservas, ingresos,
margen y riesgo sin modificar datos reales. La detección de anomalías analiza
cancelaciones, pagos antiguos, utilización de vehículos y rutas con baja demanda.

La recomendación de asignación considera capacidad, disponibilidad, mantenimiento,
calificación del conductor y carga operativa. Cada recomendación se registra en
`decisiones_sistema` para permitir trazabilidad y evaluación posterior.

Los comprobantes de pago ya no se sirven como archivos estáticos públicos. Se
entregan mediante URLs temporales o rutas autorizadas, mientras que las imágenes
públicas se limitan a las carpetas de galería, perfiles, vehículos y viajes.

## Comprobaciones

```powershell
cd backend
npm run build

cd ..\web
npm run lint
npm run build
```

No subas `.env`, `.env.local`, contraseñas, tokens ni contenido de `backend/uploads/`. Las variables de producción se configuran como Environment Variables en Render.
