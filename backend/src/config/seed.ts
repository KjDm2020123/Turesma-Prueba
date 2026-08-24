/**
 * Script de datos de prueba para TURESMA
 * Ejecutar: npm run seed (desde backend/)
 */
export {};

const pool = require("./db");
const bcrypt = require("bcrypt");

const log = (msg: string) => console.log(`[SEED] ${msg}`);

async function seed() {
  const client = await pool.connect();
  try {
    log("Iniciando seed de datos de prueba...");
    const hash = await bcrypt.hash("123456", 10);

    // ── 1. USUARIOS ───────────────────────────────────────────────────
    const usuariosDef = [
      { nombre: "Admin Turesma",  email: "admin@turesma.com",  rol: "admin"   },
      { nombre: "Carlos Mendoza", email: "carlos@turesma.com", rol: "vehiculo" },
      { nombre: "Luis Bravo",     email: "luis@turesma.com",   rol: "vehiculo" },
      { nombre: "María García",   email: "maria@cliente.com",  rol: "cliente"  },
      { nombre: "Pedro Alvarado", email: "pedro@cliente.com",  rol: "cliente"  },
      { nombre: "Ana Torres",     email: "ana@cliente.com",    rol: "cliente"  },
    ];

    const uIds: Record<string, number> = {};
    for (const u of usuariosDef) {
      const ex = await client.query("SELECT id FROM usuarios WHERE email=$1", [u.email]);
      if (ex.rowCount === 0) {
        const r = await client.query(
          "INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES ($1,$2,$3,$4,true) RETURNING id",
          [u.nombre, u.email, hash, u.rol]
        );
        uIds[u.email] = r.rows[0].id;
        log(`Usuario creado: ${u.nombre}`);
      } else {
        uIds[u.email] = ex.rows[0].id;
        log(`Usuario ya existe: ${u.email}`);
      }
    }

    // ── 2. VEHÍCULOS ─────────────────────────────────────────────────
    const vehiculosDef = [
      { placa: "ABC-1234", tipo: "van",     modelo: "Toyota Hiace 2022",      capacidad: 15, color: "Blanco", estado: "disponible",  descripcion: "Furgoneta ejecutiva con A/C y GPS",             uid: uIds["carlos@turesma.com"] },
      { placa: "DEF-5678", tipo: "bus",     modelo: "Hino RK Bus 2021",       capacidad: 40, color: "Azul",   estado: "disponible",  descripcion: "Bus turístico de lujo para grupos grandes",      uid: uIds["luis@turesma.com"]   },
      { placa: "GHI-9012", tipo: "suv",     modelo: "Toyota Land Cruiser 2023", capacidad: 6, color: "Negro", estado: "disponible",  descripcion: "SUV ejecutivo para traslados VIP",               uid: null },
      { placa: "JKL-3456", tipo: "minibus", modelo: "JAC Minibus 2022",       capacidad: 19, color: "Blanco", estado: "en_servicio", descripcion: "Minibús ideal para tours grupales por la costa", uid: null },
    ];

    const vIds: number[] = [];
    for (const v of vehiculosDef) {
      const ex = await client.query("SELECT id FROM vehiculos WHERE placa=$1", [v.placa]);
      if (ex.rowCount === 0) {
        const r = await client.query(
          `INSERT INTO vehiculos (placa, tipo, modelo, capacidad, color, estado, descripcion, usuario_id, activo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
          [v.placa, v.tipo, v.modelo, v.capacidad, v.color, v.estado, v.descripcion, v.uid]
        );
        vIds.push(r.rows[0].id);
        log(`Vehículo creado: ${v.placa}`);
      } else {
        vIds.push(ex.rows[0].id);
        log(`Vehículo ya existe: ${v.placa}`);
      }
    }

    // ── 3. CONDUCTORES ────────────────────────────────────────────────
    const conductoresDef = [
      { uid: uIds["carlos@turesma.com"], licencia: "LIC-00123", rating: 4.8, viajes: 85, venc: "2027-06-15" },
      { uid: uIds["luis@turesma.com"],   licencia: "LIC-00456", rating: 4.5, viajes: 62, venc: "2026-03-20" },
    ];

    // Mapa de usuario_id → conductor.id
    const conductorIdPorUsuario: Record<number, number> = {};
    for (const c of conductoresDef) {
      const ex = await client.query("SELECT id FROM conductores WHERE usuario_id=$1", [c.uid]);
      if (ex.rowCount === 0) {
        const r = await client.query(
          `INSERT INTO conductores (usuario_id, licencia, estado, rating_promedio, viajes_completados, fecha_licencia_vencimiento)
           VALUES ($1,$2,'disponible',$3,$4,$5) RETURNING id`,
          [c.uid, c.licencia, c.rating, c.viajes, c.venc]
        );
        conductorIdPorUsuario[c.uid] = r.rows[0].id;
        log(`Conductor creado id=${r.rows[0].id} (usuario ${c.uid})`);
      } else {
        conductorIdPorUsuario[c.uid] = ex.rows[0].id;
        log(`Conductor ya existe: usuario_id=${c.uid} → conductor.id=${ex.rows[0].id}`);
      }
    }

    // IDs de conductores (tabla conductores)
    const cIdCarlos = conductorIdPorUsuario[uIds["carlos@turesma.com"]] ?? null;
    const cIdLuis   = conductorIdPorUsuario[uIds["luis@turesma.com"]]   ?? null;

    // ── 4. RESERVAS ──────────────────────────────────────────────────
    const dias = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

    // conductor_id en reservas apunta a conductores.id (NO a usuarios.id)
    const reservasDef = [
      { uid: uIds["maria@cliente.com"], vid: vIds[0], cid: cIdCarlos, estado: "confirmada", fecha: dias(2),   origen: "Manta, Malecón",        destino: "Puerto López",     personas: 8,  total: 120 },
      { uid: uIds["pedro@cliente.com"], vid: vIds[1], cid: cIdLuis,   estado: "pendiente",  fecha: dias(5),   origen: "Manta, Aeropuerto",     destino: "Portoviejo",       personas: 25, total: 350 },
      { uid: uIds["ana@cliente.com"],   vid: vIds[2], cid: null,       estado: "pendiente",  fecha: dias(3),   origen: "Manta, Hotel Oro Verde", destino: "Montecristi",      personas: 4,  total: 80  },
      { uid: uIds["maria@cliente.com"], vid: vIds[0], cid: cIdCarlos, estado: "finalizada", fecha: dias(-7),  origen: "Manta, Tarqui",         destino: "Jipijapa",         personas: 10, total: 150 },
      { uid: uIds["pedro@cliente.com"], vid: vIds[1], cid: cIdLuis,   estado: "finalizada", fecha: dias(-14), origen: "Manta, Puerto Pesquero", destino: "Bahía de Caráquez", personas: 35, total: 500 },
      { uid: uIds["ana@cliente.com"],   vid: vIds[2], cid: null,       estado: "cancelada",  fecha: dias(-3),  origen: "Manta, Centro",         destino: "Canoa",            personas: 3,  total: 90  },
    ];

    let reservasCreadas = 0;
    for (const r of reservasDef) {
      try {
        await client.query(
          `INSERT INTO reservas (usuario_id, vehiculo_id, conductor_id, estado, fecha_reserva, origen, destino, num_personas, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [r.uid, r.vid, r.cid, r.estado, r.fecha, r.origen, r.destino, r.personas, r.total]
        );
        reservasCreadas++;
      } catch (e: any) {
        log(`Reserva skip: ${e.message}`);
      }
    }
    log(`${reservasCreadas} reservas creadas`);

    // ── 5. MANTENIMIENTO ─────────────────────────────────────────────
    try {
      await client.query(
        `INSERT INTO mantenimiento_vehiculos (vehiculo_id, tipo, descripcion, fecha_programada, costo, estado)
         VALUES
         ($1,'preventivo','Cambio de aceite y filtros',$2,150.00,'programado'),
         ($3,'correctivo','Revisión de frenos',$4,200.00,'programado'),
         ($5,'preventivo','Mantenimiento mayor 50.000 km',$6,300.00,'programado')`,
        [vIds[0], dias(7), vIds[1], dias(-2), vIds[2], dias(30)]
      );
      log("Mantenimientos creados");
    } catch (e: any) { log(`Mantenimiento skip: ${e.message}`); }

    log("\n✅ Seed completado exitosamente!");
    log("\nCredenciales de acceso:");
    log("  Admin:     admin@turesma.com    / 123456");
    log("  Conductor: carlos@turesma.com  / 123456");
    log("  Conductor: luis@turesma.com    / 123456");
    log("  Cliente:   maria@cliente.com   / 123456");
    log("  Cliente:   pedro@cliente.com   / 123456");
    log("  Cliente:   ana@cliente.com     / 123456");

  } catch (error) {
    console.error("[SEED] Error:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
