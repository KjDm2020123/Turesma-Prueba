export {};

const pool = require("./db");

const initDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalogo_roles (
      rol VARCHAR(50) PRIMARY KEY
    );
  `);

  await pool.query(`
    INSERT INTO catalogo_roles (rol)
    VALUES ('admin'), ('cliente'), ('vehiculo'), ('operativo')
    ON CONFLICT (rol) DO NOTHING;
  `);

  // Nota: la limpieza de roles se realiza después de crear las tablas dependientes.

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalogo_roles_alias (
      alias VARCHAR(50) PRIMARY KEY,
      rol VARCHAR(50) NOT NULL REFERENCES catalogo_roles(rol)
    );
  `);

  await pool.query(`
    INSERT INTO catalogo_roles_alias (alias, rol)
    VALUES
      ('admin', 'admin'),
      ('administrador', 'admin'),
      ('operativo', 'operativo'),
      ('gerente_operativo', 'operativo'),
      ('operador', 'operativo'),
      ('cliente', 'cliente'),
      ('hotel', 'cliente'),
      ('vehiculo', 'vehiculo'),
      ('conductor', 'vehiculo')
    ON CONFLICT (alias) DO UPDATE SET rol = EXCLUDED.rol;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalogo_estados_reserva (
      estado VARCHAR(50) PRIMARY KEY
    );
  `);

  await pool.query(`
    INSERT INTO catalogo_estados_reserva (estado)
    VALUES ('pendiente'), ('reprogramacion_pendiente'), ('pendiente_pago'), ('confirmada'), ('en_curso'), ('finalizada'), ('cancelada')
    ON CONFLICT (estado) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
     id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol VARCHAR(50) NOT NULL,
      edad INT,
      capacidad_pasajeros INT,
      hotel_id INT,
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `); 

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS edad INT,
    ADD COLUMN IF NOT EXISTS capacidad_pasajeros INT,
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(50),
    ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(600);
  `);

  // Verificación de identidad del cliente (cédula). estado_verificacion:
  // no_verificado → pendiente (subió cédula) → verificado / rechazado.
  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS cedula VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cedula_url VARCHAR(600),
    ADD COLUMN IF NOT EXISTS estado_verificacion VARCHAR(20) DEFAULT 'no_verificado',
    ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMP,
    ADD COLUMN IF NOT EXISTS verificado_por INT,
    ADD COLUMN IF NOT EXISTS notas_verificacion TEXT;
  `);

  await pool.query(`
    UPDATE usuarios u
    SET rol = a.rol
    FROM catalogo_roles_alias a
    WHERE LOWER(u.rol) = a.alias;
  `);

  await pool.query(`
    UPDATE usuarios
    SET rol = 'vehiculo'
    WHERE LOWER(rol) = 'conductor';
  `);

  await pool.query(`
    UPDATE usuarios
    SET rol = 'cliente'
    WHERE LOWER(rol) NOT IN (SELECT alias FROM catalogo_roles_alias);
  `);

  await pool.query(`
    ALTER TABLE usuarios
    DROP CONSTRAINT IF EXISTS usuarios_rol_check;
  `);

  await pool.query(`
    ALTER TABLE usuarios
    DROP CONSTRAINT IF EXISTS usuarios_rol_fkey;
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_rol_fkey
    FOREIGN KEY (rol) REFERENCES catalogo_roles(rol);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tours (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL,
      descripcion TEXT,
      precio DECIMAL(10, 2) NOT NULL,
      duracion VARCHAR(50),
      capacidad INT,
      ubicacion VARCHAR(200),
      imagen_url VARCHAR(500),
      activo BOOLEAN DEFAULT true,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
      tour_id INT REFERENCES tours(id) ON DELETE CASCADE,
      conductor_id INT REFERENCES usuarios(id),
      fecha_reserva DATE NOT NULL,
      num_personas INT NOT NULL,
      total DECIMAL(10, 2) NOT NULL,
      estado VARCHAR(50) DEFAULT 'pendiente',
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehiculos (
      id SERIAL PRIMARY KEY,
      placa VARCHAR(20) UNIQUE NOT NULL,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      tipo VARCHAR(50) DEFAULT 'van',
      modelo VARCHAR(120) NOT NULL,
      capacidad INT NOT NULL,
      color VARCHAR(60),
      imagen_url VARCHAR(600),
      descripcion TEXT,
      dias_servicio INT[] DEFAULT ARRAY[0,1,2,3,4,5,6],
      estado VARCHAR(50) DEFAULT 'disponible',
      activo BOOLEAN DEFAULT true,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE vehiculos
    DROP CONSTRAINT IF EXISTS vehiculos_estado_check;
  `);

  await pool.query(`
    ALTER TABLE vehiculos
    ADD CONSTRAINT vehiculos_estado_check
    CHECK (estado IN ('disponible', 'en_servicio', 'mantenimiento', 'inactivo'));
  `);

  await pool.query(`
    ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS placa VARCHAR(20),
    ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) DEFAULT 'van',
    ADD COLUMN IF NOT EXISTS modelo VARCHAR(120),
    ADD COLUMN IF NOT EXISTS capacidad INT,
    ADD COLUMN IF NOT EXISTS color VARCHAR(60),
    ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(600),
    ADD COLUMN IF NOT EXISTS descripcion TEXT,
    ADD COLUMN IF NOT EXISTS dias_servicio INT[] DEFAULT ARRAY[0,1,2,3,4,5,6],
    ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'disponible',
    ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    UPDATE vehiculos
    SET tipo = 'van'
    WHERE tipo IS NULL;
  `);

  await pool.query(`
    UPDATE vehiculos
    SET dias_servicio = ARRAY[0,1,2,3,4,5,6]
    WHERE dias_servicio IS NULL
      OR array_length(dias_servicio, 1) IS NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehiculo_disponibilidad (
      id SERIAL PRIMARY KEY,
      vehiculo_id INT NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      disponible BOOLEAN NOT NULL,
      nota VARCHAR(255),
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (vehiculo_id, fecha)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS vehiculo_disponibilidad_vehiculo_fecha_idx
    ON vehiculo_disponibilidad (vehiculo_id, fecha);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_placa_unique_idx
    ON vehiculos (placa)
    WHERE placa IS NOT NULL;
  `);

  await pool.query(`
    UPDATE vehiculos v
    SET usuario_id = u.id
    FROM usuarios u
    WHERE v.usuario_id IS NULL
      AND u.rol = 'vehiculo'
      AND v.modelo = ('Modelo del conductor ' || u.nombre);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conductores (
      id SERIAL PRIMARY KEY,
      usuario_id INT UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
      licencia VARCHAR(120),
      telefono VARCHAR(50),
      estado VARCHAR(50) DEFAULT 'disponible',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE conductores
    DROP CONSTRAINT IF EXISTS conductores_estado_check;
  `);

  await pool.query(`
    ALTER TABLE conductores
    ADD CONSTRAINT conductores_estado_check
    CHECK (estado IN ('disponible', 'en_servicio', 'mantenimiento', 'inactivo'));
  `);

  await pool.query(`
    INSERT INTO conductores (usuario_id, licencia, estado)
    SELECT u.id, 'LIC-' || u.id::text, 'disponible'
    FROM usuarios u
    LEFT JOIN conductores c ON c.usuario_id = u.id
    WHERE u.rol = 'vehiculo'
      AND c.id IS NULL;
  `);

  await pool.query(`
    ALTER TABLE reservas
    ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS tour_id INT REFERENCES tours(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS fecha_reserva DATE,
    ADD COLUMN IF NOT EXISTS fecha_fin DATE,
    ADD COLUMN IF NOT EXISTS num_personas INT,
    ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS vehiculo_id INT REFERENCES vehiculos(id),
    ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS origen VARCHAR(300),
    ADD COLUMN IF NOT EXISTS destino VARCHAR(300);
  `);

  await pool.query(`
    UPDATE reservas
    SET fecha_reserva = COALESCE(fecha_reserva, CURRENT_DATE),
        num_personas = COALESCE(num_personas, 1),
        total = COALESCE(total, 0),
        estado = COALESCE(estado, 'pendiente'),
        fecha_creacion = COALESCE(fecha_creacion, CURRENT_TIMESTAMP);
  `);

  await pool.query(`
    ALTER TABLE reservas
    ALTER COLUMN fecha_reserva SET NOT NULL,
    ALTER COLUMN num_personas SET NOT NULL,
    ALTER COLUMN total SET NOT NULL;
  `);

  await pool.query(`
    UPDATE reservas
    SET estado = CASE
      WHEN LOWER(estado) IN ('pendiente', 'pending') THEN 'pendiente'
      WHEN LOWER(estado) IN ('reprogramacion_pendiente', 'reprogramacion pendiente', 'reprogramacion') THEN 'reprogramacion_pendiente'
      WHEN LOWER(estado) IN ('confirmada', 'confirmado') THEN 'confirmada'
      WHEN LOWER(estado) IN ('en_curso', 'encurso', 'en curso') THEN 'en_curso'
      WHEN LOWER(estado) IN ('finalizada', 'completada', 'completado', 'terminada', 'terminado') THEN 'finalizada'
      WHEN LOWER(estado) IN ('cancelada', 'cancelado') THEN 'cancelada'
      ELSE 'pendiente'
    END;
  `);

  await pool.query(`
    ALTER TABLE reservas
    DROP CONSTRAINT IF EXISTS reservas_estado_check;
  `);

  await pool.query(`
    ALTER TABLE reservas
    DROP CONSTRAINT IF EXISTS reservas_estado_fkey;
  `);

  await pool.query(`
    ALTER TABLE reservas
    ADD CONSTRAINT reservas_estado_fkey
    FOREIGN KEY (estado) REFERENCES catalogo_estados_reserva(estado);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS reservas_fecha_reserva_idx
    ON reservas (fecha_reserva);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS reservas_vehiculo_fecha_idx
    ON reservas (vehiculo_id, fecha_reserva);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS reservas_conductor_fecha_idx
    ON reservas (conductor_id, fecha_reserva);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      email VARCHAR(100) NOT NULL,
      pin_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS password_resets_email_created_idx
    ON password_resets (email, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS password_resets_usuario_created_idx
    ON password_resets (usuario_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensajes_comunicacion (
      id SERIAL PRIMARY KEY,
      sender_user_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      recipient_user_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      reserva_id INT REFERENCES reservas(id) ON DELETE SET NULL,
      mensaje TEXT NOT NULL,
      leido BOOLEAN DEFAULT false,
      leido_en TIMESTAMP,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE mensajes_comunicacion
    ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS leido_en TIMESTAMP,
    ADD COLUMN IF NOT EXISTS link_type VARCHAR(30),
    ADD COLUMN IF NOT EXISTS link_id INT;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS mensajes_comunicacion_sender_idx
    ON mensajes_comunicacion (sender_user_id, creado_en DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS mensajes_comunicacion_recipient_idx
    ON mensajes_comunicacion (recipient_user_id, creado_en DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS mensajes_comunicacion_pair_idx
    ON mensajes_comunicacion (sender_user_id, recipient_user_id, creado_en DESC);
  `);

  // ============ MÓDULO DE MANTENIMIENTO VEHICULAR ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mantenimiento_vehiculos (
      id SERIAL PRIMARY KEY,
      vehiculo_id INT NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
      tipo VARCHAR(50) NOT NULL,
      descripcion TEXT,
      fecha_programada DATE NOT NULL,
      fecha_realizada DATE,
      costo DECIMAL(10, 2),
      estado VARCHAR(50) DEFAULT 'programado',
      tecnico VARCHAR(100),
      observaciones TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS mantenimiento_vehiculos_vehiculo_idx
    ON mantenimiento_vehiculos (vehiculo_id, fecha_programada DESC);
  `);

  // ============ EXPANDIR TABLA CONDUCTORES CON MÉTRICAS ============
  await pool.query(`
    ALTER TABLE conductores
    ADD COLUMN IF NOT EXISTS fecha_licencia_vencimiento DATE,
    ADD COLUMN IF NOT EXISTS fecha_certificado_seguridad DATE,
    ADD COLUMN IF NOT EXISTS rating_promedio DECIMAL(3, 2) DEFAULT 5.0,
    ADD COLUMN IF NOT EXISTS viajes_completados INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS viajes_cancelados INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS horas_conduccion INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado_documentos VARCHAR(50) DEFAULT 'completos';
  `);

  // ============ MÓDULO DE ANÁLISIS DE RUTAS ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutas_analisis (
      id SERIAL PRIMARY KEY,
      origen VARCHAR(200) NOT NULL,
      destino VARCHAR(200) NOT NULL,
      demanda_promedio_diaria DECIMAL(5, 2) DEFAULT 0,
      duracion_promedio_minutos INT,
      costo_combustible_estimado DECIMAL(10, 2),
      ingresos_promedio DECIMAL(10, 2),
      tasa_ocupacion INT DEFAULT 0,
      viajes_totales INT DEFAULT 0,
      estado VARCHAR(50) DEFAULT 'activa',
      ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(origen, destino)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rutas_analisis_ocupacion_idx
    ON rutas_analisis (tasa_ocupacion DESC);
  `);

  // ============ CAMPOS ADICIONALES PARA USUARIOS ============
  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS apellido VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cedula VARCHAR(20),
    ADD COLUMN IF NOT EXISTS usuario VARCHAR(50);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_cedula_unique_idx
    ON usuarios (cedula)
    WHERE cedula IS NOT NULL AND cedula <> '';
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_usuario_unique_idx
    ON usuarios (usuario)
    WHERE usuario IS NOT NULL AND usuario <> '';
  `);

  // ============ CAMPOS ADICIONALES PARA VEHÍCULOS ============
  await pool.query(`
    ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS marca VARCHAR(100),
    ADD COLUMN IF NOT EXISTS anio INT,
    ADD COLUMN IF NOT EXISTS kilometraje INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fecha_matricula DATE,
    ADD COLUMN IF NOT EXISTS fecha_proximo_mantenimiento DATE,
    ADD COLUMN IF NOT EXISTS proximo_km_mantenimiento INT;
  `);

  // El kilometraje de cada servicio queda registrado en el propio historial
  // (no solo en el vehículo), para saber a cuántos km se hizo cada mantenimiento.
  // conductor_usuario_id identifica con certeza quién lo registró (no solo el
  // nombre en "tecnico"), para poder mostrar "Tú" vs. un conductor anterior.
  await pool.query(`
    ALTER TABLE mantenimiento_vehiculos
    ADD COLUMN IF NOT EXISTS kilometraje INT,
    ADD COLUMN IF NOT EXISTS conductor_usuario_id INT REFERENCES usuarios(id);
  `);

  // ============ MÓDULO DE PAGOS DE RESERVA (transferencia / link de pago) ============
  // El cliente paga (mínimo el 50% del total) por transferencia o por un link que
  // envía el admin, y sube una imagen de comprobante. El admin revisa y aprueba
  // o rechaza; solo al aprobarse un pago se recalcula reservas.estado_pago.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_reserva (
      id SERIAL PRIMARY KEY,
      reserva_id INT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
      usuario_id INT NOT NULL REFERENCES usuarios(id),
      monto DECIMAL(10, 2) NOT NULL,
      metodo VARCHAR(30) NOT NULL DEFAULT 'transferencia',
      comprobante_url TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      notas_admin TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revisado_en TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS pagos_reserva_reserva_idx ON pagos_reserva (reserva_id);
  `);

  await pool.query(`
    ALTER TABLE reservas
    ADD COLUMN IF NOT EXISTS monto_pagado DECIMAL(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS link_pago VARCHAR(500);
  `);

  // ============ CAMPOS ADICIONALES PARA CONDUCTORES ============
  await pool.query(`
    ALTER TABLE conductores
    ADD COLUMN IF NOT EXISTS tipo_licencia VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cedula VARCHAR(20),
    ADD COLUMN IF NOT EXISTS apellido VARCHAR(100),
    ADD COLUMN IF NOT EXISTS correo VARCHAR(100);
  `);

  // ============ TABLA DE ASIGNACIÓN DE VEHÍCULOS ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asignacion_vehiculos (
      id SERIAL PRIMARY KEY,
      conductor_id INT NOT NULL REFERENCES conductores(id) ON DELETE CASCADE,
      vehiculo_id INT NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
      fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
      fecha_fin DATE,
      estado VARCHAR(50) DEFAULT 'activa',
      observaciones TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS asignacion_vehiculos_conductor_idx
    ON asignacion_vehiculos (conductor_id, estado);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS asignacion_vehiculos_vehiculo_idx
    ON asignacion_vehiculos (vehiculo_id, estado);
  `);

  // ============ TABLA RUTAS CONDUCTOR REPORTES (si no existe) ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutas_conductor_reportes (
      id SERIAL PRIMARY KEY,
      conductor_usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
      conductor_id INT REFERENCES conductores(id) ON DELETE CASCADE,
      vehiculo_id INT REFERENCES vehiculos(id) ON DELETE SET NULL,
      fecha_viaje DATE NOT NULL DEFAULT CURRENT_DATE,
      origen_provincia VARCHAR(120),
      origen_canton VARCHAR(120),
      origen_parroquia VARCHAR(120),
      origen_detalle VARCHAR(200),
      destino_provincia VARCHAR(120),
      destino_canton VARCHAR(120),
      destino_parroquia VARCHAR(120),
      destino_detalle VARCHAR(200),
      duracion_valor DECIMAL(6, 2),
      duracion_unidad VARCHAR(20) DEFAULT 'horas',
      duracion_minutos_equivalentes INT,
      costo_combustible DECIMAL(10, 2) DEFAULT 0,
      valor_cobrado DECIMAL(10, 2) DEFAULT 0,
      calificacion_cliente DECIMAL(3, 2),
      cliente_nombre VARCHAR(200),
      cliente_telefono VARCHAR(50),
      cliente_email VARCHAR(200),
      observaciones TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ============ TABLA DE COTIZACIONES ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cotizaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      origen VARCHAR(300) NOT NULL,
      destino VARCHAR(300) NOT NULL,
      fecha_servicio DATE NOT NULL,
      num_personas INT NOT NULL DEFAULT 1,
      tipo_vehiculo VARCHAR(60),
      notas TEXT,
      estado VARCHAR(50) DEFAULT 'pendiente',
      precio_estimado DECIMAL(10,2),
      precio_final DECIMAL(10,2),
      respuesta_admin TEXT,
      reserva_id INT REFERENCES reservas(id) ON DELETE SET NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS cotizaciones_usuario_idx
    ON cotizaciones (usuario_id, estado);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS cotizaciones_estado_idx
    ON cotizaciones (estado, creado_en DESC);
  `);

  // Campos extra de cotizaciones (vehículo elegido, valor y duración del servicio)
  await pool.query(`
    ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS vehiculo_id INT REFERENCES vehiculos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS valor_ofrecido DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS duracion_valor DECIMAL(6,2),
    ADD COLUMN IF NOT EXISTS duracion_unidad VARCHAR(20) DEFAULT 'horas';
  `);

  // Negociación de precio (contraofertas) + coordenadas para el mapa
  await pool.query(`
    ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS precio_propuesto DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS turno VARCHAR(20) DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS origen_lat DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS origen_lng DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS destino_lat DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS destino_lng DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS hora_salida VARCHAR(10),
    ADD COLUMN IF NOT EXISTS fecha_fin DATE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cotizacion_negociacion (
      id SERIAL PRIMARY KEY,
      cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      actor VARCHAR(20) NOT NULL,
      precio DECIMAL(10,2),
      mensaje TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS cotizacion_negociacion_idx
    ON cotizacion_negociacion (cotizacion_id, creado_en);
  `);

  // ============ UBICACIÓN DE VEHÍCULOS EN TIEMPO REAL ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehiculo_ubicacion (
      id SERIAL PRIMARY KEY,
      vehiculo_id INT NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
      conductor_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      lat DECIMAL(10, 7) NOT NULL,
      lng DECIMAL(10, 7) NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS vehiculo_ubicacion_vehiculo_idx
    ON vehiculo_ubicacion (vehiculo_id, creado_en DESC);
  `);

  // ============ CALIFICACIÓN DEL CLIENTE A LA RESERVA ============
  await pool.query(`
    ALTER TABLE reservas
    ADD COLUMN IF NOT EXISTS calificacion INT,
    ADD COLUMN IF NOT EXISTS comentario_calificacion TEXT,
    ADD COLUMN IF NOT EXISTS calificado_en TIMESTAMP;
  `);

  // recogido = el conductor ya recogió al cliente. Divide el viaje en curso en
  // dos fases: ir al origen (recoger) y luego ir al destino (llevar).
  await pool.query(`
    ALTER TABLE reservas
    ADD COLUMN IF NOT EXISTS recogido BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS recogido_en TIMESTAMP;
  `);

  // Número de proforma: se asigna la primera vez que el admin genera la
  // proforma de una cotización y continúa la numeración física de la empresa.
  await pool.query(`
    ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS proforma_numero INT;
  `);

  // ============ GALERÍA DE VIAJES (fotos que el admin publica en la landing) ==
  await pool.query(`
    CREATE TABLE IF NOT EXISTS galeria_viajes (
      id SERIAL PRIMARY KEY,
      imagen_url TEXT NOT NULL,
      titulo VARCHAR(120),
      descripcion TEXT,
      orden INT DEFAULT 0,
      activo BOOLEAN DEFAULT TRUE,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS galeria_viajes_orden_idx
    ON galeria_viajes (activo, orden, creado_en DESC);
  `);

  // ============ MATRICULACIÓN VEHICULAR (calendario ANT por último dígito) ====
  // El mes de matriculación de cada vehículo se saca del último dígito de la
  // placa según este calendario, que el admin puede editar (cambia por año/cantón).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matricula_calendario (
      digito INT PRIMARY KEY CHECK (digito BETWEEN 0 AND 9),
      mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12)
    );
  `);

  // Calendario oficial Ecuador 2026 (dígito → mes). ON CONFLICT DO NOTHING para
  // no pisar los ajustes que el admin haga desde el panel.
  await pool.query(`
    INSERT INTO matricula_calendario (digito, mes)
    VALUES (1,2),(2,3),(3,4),(4,5),(5,6),(6,7),(7,8),(8,9),(9,10),(0,11)
    ON CONFLICT (digito) DO NOTHING;
  `);

  // Evita avisos duplicados: un aviso por vehículo y año de matriculación.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matricula_avisos (
      id SERIAL PRIMARY KEY,
      vehiculo_id INT NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
      anio INT NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (vehiculo_id, anio)
    );
  `);

  console.log(" Esquema de base de datos verificado e inicializado");
};

module.exports = {
  initDatabase,
};
