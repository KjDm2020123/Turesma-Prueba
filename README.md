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
- `GET /api/admin/inteligencia/asignacion-recomendada?fecha=YYYY-MM-DD&pasajeros=N&hora_inicio=HH:MM&hora_fin=HH:MM&operacion_id=N`
- `PATCH /api/admin/inteligencia/asignacion-recomendada/:id/decision`
- `GET /api/admin/operaciones/reservas-pendientes`
- `POST /api/admin/operaciones/reservas/:id/despachar`
- `PATCH /api/admin/operaciones/:id/reabrir`
- `PATCH /api/admin/operaciones/:id/asignar`
- `GET /api/admin/inteligencia/desempeno`
- `GET /api/admin/control-operativo`
- `GET /api/admin/inteligencia/anomalias`

El centro de control operativo consolida las operaciones del día, asignaciones
pendientes, disponibilidad de flota, mantenimiento, pagos y un semáforo general.
La detección de anomalías analiza cancelaciones, pagos antiguos, utilización de
vehículos y rutas con baja demanda.

El despacho muestra reservas confirmadas que aún necesitan vehículo o conductor.
Al preparar una reserva se crea una operación vinculada, evitando registrar el
mismo servicio dos veces. En la asignación, el administrador puede pedir una
recomendación calculada para la fecha, horario y número de pasajeros. La
recomendación considera capacidad, disponibilidad, mantenimiento, calificación
del conductor y carga operativa; puede aceptarse o reemplazarse por una de las
alternativas, indicando el motivo. La asignación final siempre requiere
confirmación y el backend valida capacidad, mantenimiento, licencia y conflictos
de horario. La decisión y la asignación se registran juntas para mantener su
trazabilidad. Si se cancela un despacho, una reserva que siga confirmada vuelve
a la cola y permite reabrir la operación existente, conservando su historial.

Los comprobantes de pago ya no se sirven como archivos estáticos públicos. Se
entregan mediante URLs temporales o rutas autorizadas, mientras que las imágenes
públicas se limitan a las carpetas de galería, perfiles, vehículos y viajes.

## Exportación de reservas

El módulo administrativo de reservas permite descargar un Excel con formato de
marca TURESMA, encabezados, filtros y filas alternadas. La exportación respeta
los filtros actuales de estado y búsqueda de la pantalla. También está disponible
mediante `GET /api/admin/reportes/exportar-csv?tipo=reservas&formato=xlsx`.

## Recibos de pago

Cada pago aprobado genera un recibo PDF descargable desde el historial de pagos
del cliente y desde el panel administrativo de pagos. El recibo incluye el pago,
la reserva, el método y el total acumulado, y solo está disponible cuando el pago
ha sido aprobado. Las rutas requieren autenticación y verifican la propiedad de
la reserva para el acceso del cliente:

- `GET /api/usuarios/mis-reservas/:id/pagos/:pagoId/recibo`
- `GET /api/admin/pagos/:id/recibo`

El recibo funciona como constancia de pago aprobado y no reemplaza una factura
tributaria ni el comprobante emitido por la entidad financiera.

## Comprobaciones

```powershell
cd backend
npm run build

cd ..\web
npm run lint
npm run build
```

No subas `.env`, `.env.local`, contraseñas, tokens ni contenido de `backend/uploads/`. Las variables de producción se configuran como Environment Variables en Render.
