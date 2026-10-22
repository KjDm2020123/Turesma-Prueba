const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "dispatch-flow-integration-test-secret";

const state = {
  reservations: [
    {
      id: 801,
      fecha_reserva: "2026-10-19",
      fecha_servicio: "2026-10-21T09:00:00.000Z",
      fecha_salida: "2026-10-21T09:00:00.000Z",
      fecha_llegada: "2026-10-21T11:00:00.000Z",
      origen: "Quito",
      destino: "Otavalo",
      num_personas: 8,
      total: 240,
      estado: "confirmada",
      vehiculo_id: null,
      conductor_id: null,
      usuario_id: 901,
      cliente_nombre: "Cliente de prueba",
    },
    {
      id: 802,
      fecha_reserva: "2026-10-19",
      fecha_servicio: "2026-10-22T09:00:00.000Z",
      fecha_salida: "2026-10-22T09:00:00.000Z",
      fecha_llegada: "2026-10-22T11:00:00.000Z",
      origen: "Quito",
      destino: "Cotacachi",
      num_personas: 5,
      total: 150,
      estado: "confirmada",
      vehiculo_id: null,
      conductor_id: null,
      usuario_id: 902,
      cliente_nombre: "Segundo cliente",
    },
    {
      id: 803,
      fecha_reserva: "2026-10-19",
      fecha_servicio: "2026-10-21T09:00:00.000Z",
      fecha_salida: "2026-10-21T09:00:00.000Z",
      fecha_llegada: "2026-10-21T11:00:00.000Z",
      origen: "Quito",
      destino: "Latacunga",
      num_personas: 4,
      total: 120,
      estado: "confirmada",
      vehiculo_id: 701,
      conductor_id: 301,
      usuario_id: 903,
      cliente_nombre: "Reserva que ocupa recursos",
    },
  ],
  vehicles: [
    { id: 701, placa: "TEST-701", modelo: "Van test 1", capacidad: 12, estado: "disponible", activo: true, usuario_id: 301 },
    { id: 702, placa: "TEST-702", modelo: "Van test 2", capacidad: 15, estado: "disponible", activo: true, usuario_id: 302 },
  ],
  drivers: [
    { id: 501, usuario_id: 301, estado: "disponible", activo: true, fecha_licencia_vencimiento: "2027-12-31" },
    { id: 502, usuario_id: 302, estado: "disponible", activo: true, fecha_licencia_vencimiento: "2027-12-31" },
  ],
  operations: [],
  decisions: [],
  history: [],
  nextOperationId: 1001,
  nextDecisionId: 2001,
};

const result = (rows = []) => ({ rows, rowCount: rows.length });
const asDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const asTime = (value) => {
  if (value instanceof Date) return value.toISOString().slice(11, 19);
  const text = String(value || "");
  return text.includes("T") ? text.slice(11, 19) : text.slice(0, 8);
};
const intersects = (startA, endA, startB, endB) => !startA || !endA || !startB || !endB || (startA < endB && startB < endA);

const reservationFor = (id) => state.reservations.find((row) => row.id === Number(id));
const operationFor = (id) => state.operations.find((row) => row.id === Number(id));
const vehicleFor = (id) => state.vehicles.find((row) => row.id === Number(id));
const driverForUser = (id) => state.drivers.find((row) => row.usuario_id === Number(id));

const operationView = (operation) => {
  if (!operation) return null;
  const vehicle = vehicleFor(operation.vehiculo_id);
  const driver = state.drivers.find((row) => row.id === operation.conductor_id);
  return {
    ...operation,
    vehiculo_placa: vehicle?.placa || null,
    vehiculo_modelo: vehicle?.modelo || null,
    conductor_usuario_id: driver?.usuario_id || null,
    conductor_nombre: driver ? `Conductor ${driver.usuario_id}` : null,
    conductor_apellido: null,
  };
};

const pool = {
  async query(sql, params = []) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("with candidatos as")) {
      const [dateValue, passengers, startValue, endValue, operationId] = params;
      const date = asDate(dateValue);
      const start = startValue ? asTime(startValue) : null;
      const end = endValue ? asTime(endValue) : null;
      const candidates = state.vehicles
        .filter((vehicle) => vehicle.activo && vehicle.estado === "disponible" && vehicle.capacidad >= passengers)
        .filter((vehicle) => {
          const reservationConflict = state.reservations.some((reservation) => {
            const reservationDate = asDate(reservation.fecha_salida || reservation.fecha_servicio || reservation.fecha_reserva);
            if (reservation.vehiculo_id !== vehicle.id || reservationDate !== date || ["cancelada", "finalizada"].includes(reservation.estado)) return false;
            if (operationFor(operationId)?.reserva_id === reservation.id) return false;
            return intersects(start, end, reservation.fecha_salida && asTime(reservation.fecha_salida), reservation.fecha_llegada && asTime(reservation.fecha_llegada));
          });
          const operationConflict = state.operations.some((operation) =>
            operation.id !== Number(operationId)
            && operation.fecha_programada === date
            && ["programada", "asignada", "en_curso", "incidencia"].includes(operation.estado)
            && operation.vehiculo_id === vehicle.id
            && intersects(start, end, operation.hora_inicio, operation.hora_fin)
          );
          return !reservationConflict && !operationConflict;
        })
        .map((vehicle) => {
          const driver = state.drivers.find((row) => row.usuario_id === vehicle.usuario_id);
          return {
            vehiculo_id: vehicle.id,
            placa: vehicle.placa,
            modelo: vehicle.modelo,
            tipo: "van",
            capacidad: vehicle.capacidad,
            fecha_proximo_mantenimiento: "2027-12-31",
            conductor_id: driver?.usuario_id || null,
            conductor_nombre: driver ? `Conductor ${driver.usuario_id}` : null,
            rating: 4.5,
            calificacion_registrada: true,
            carga_30_dias: 1,
            kilometraje: 10000,
            mantenimiento_ok: 1,
            puntaje_capacidad: 6,
            puntaje_calificacion: 22.5,
            puntaje_mantenimiento: 25,
            puntaje_carga: 19,
            puntaje: 72.5,
          };
        })
        .slice(0, 5);
      return result(candidates);
    }

    if (query.startsWith("insert into decisiones_sistema")) {
      const decision = {
        id: state.nextDecisionId++,
        tipo_decision: "asignacion_vehiculo",
        entidad_id: params[0],
        recomendacion: JSON.parse(params[1]),
        factores: JSON.parse(params[2]),
        resultado: null,
      };
      state.decisions.push(decision);
      return result([{ id: decision.id }]);
    }

    if (query.startsWith("select r.id, r.fecha_reserva")) {
      const rows = state.reservations
        .filter((reservation) => reservation.estado === "confirmada")
        .filter((reservation) => {
          const cancelledOperation = state.operations.some((operation) => operation.reserva_id === reservation.id && operation.estado === "cancelada");
          const activeOperation = state.operations.some((operation) => operation.reserva_id === reservation.id && operation.estado !== "cancelada");
          return (!reservation.vehiculo_id || !reservation.conductor_id || cancelledOperation) && !activeOperation;
        })
        .map((reservation) => ({
          ...reservation,
          operacion_cancelada_id: state.operations
            .filter((operation) => operation.reserva_id === reservation.id && operation.estado === "cancelada")
            .sort((a, b) => b.id - a.id)[0]?.id || null,
          vehiculo_placa: vehicleFor(reservation.vehiculo_id)?.placa || null,
        }));
      return result(rows);
    }

    throw new Error(`Unexpected pool query in integration test: ${query}`);
  },
  async connect() {
    let snapshot;
    return {
      async query(sql, params = []) {
        const query = sql.replace(/\s+/g, " ").trim().toLowerCase();

        if (query === "begin") {
          snapshot = structuredClone(state);
          return result();
        }
        if (query === "commit") return result();
        if (query === "rollback") {
          if (snapshot) {
            for (const key of Object.keys(state)) delete state[key];
            Object.assign(state, snapshot);
          }
          return result();
        }
        if (query.startsWith("select id, fecha_reserva, fecha_servicio")) {
          const reservation = reservationFor(params[0]);
          return result(reservation ? [{ ...reservation }] : []);
        }
        if (query.startsWith("select id from operaciones where reserva_id")) {
          return result(state.operations.filter((operation) => operation.reserva_id === Number(params[0])).map(({ id }) => ({ id })));
        }
        if (query.startsWith("insert into operaciones")) {
          const [reservationId, , , reservationDate, , origin, destination, passengers, createdBy] = params;
          const reservation = reservationFor(reservationId);
          const scheduled = reservation.fecha_salida || reservation.fecha_servicio || reservationDate;
          const start = reservation.fecha_salida ? asTime(reservation.fecha_salida) : null;
          const finish = reservation.fecha_llegada && asDate(reservation.fecha_llegada) === asDate(scheduled)
            ? asTime(reservation.fecha_llegada)
            : null;
          const operation = {
            id: state.nextOperationId++,
            reserva_id: Number(reservationId),
            tipo_servicio: "reserva",
            fecha_programada: asDate(scheduled),
            hora_inicio: start,
            hora_fin: finish,
            origen: origin,
            destino: destination,
            pasajeros: Number(passengers),
            estado: "programada",
            vehiculo_id: null,
            conductor_id: null,
            creado_por: createdBy,
          };
          state.operations.push(operation);
          return result([{ id: operation.id }]);
        }
        if (query.startsWith("insert into operacion_historial")) {
          state.history.push({
            operacion_id: Number(params[0]),
            accion: params[2],
            estado_anterior: params[3],
            estado_nuevo: params[4],
            detalle: JSON.parse(params[5]),
          });
          return result();
        }
        if (query.startsWith("select o.*, v.placa")) {
          return result([operationView(operationFor(params[0]))].filter(Boolean));
        }
        if (query.startsWith("select * from operaciones where id")) {
          const operation = operationFor(params[0]);
          return result(operation ? [{ ...operation }] : []);
        }
        if (query.startsWith("select id, placa, capacidad, estado, activo")) {
          const vehicle = vehicleFor(params[0]);
          return result(vehicle ? [{ ...vehicle, mantenimiento_vencido: false }] : []);
        }
        if (query.startsWith("select c.id, c.usuario_id, c.estado")) {
          const driver = driverForUser(params[0]);
          return result(driver ? [{ ...driver }] : []);
        }
        if (query.startsWith("select o.id, o.vehiculo_id, o.conductor_id")) {
          const [operationId, date, startValue, endValue, activeStates, vehicleId, driverId] = params;
          const start = startValue ? asTime(startValue) : null;
          const end = endValue ? asTime(endValue) : null;
          const conflict = state.operations.find((operation) =>
            operation.id !== Number(operationId)
            && operation.fecha_programada === asDate(date)
            && activeStates.includes(operation.estado)
            && (operation.vehiculo_id === Number(vehicleId) || operation.conductor_id === driverForUser(driverId)?.id)
            && intersects(start, end, operation.hora_inicio, operation.hora_fin)
          );
          return result(conflict ? [{
            ...conflict,
            placa: vehicleFor(conflict.vehiculo_id)?.placa,
            conductor_nombre: `Conductor ${driverForUser(driverId)?.usuario_id}`,
          }] : []);
        }
        if (query.startsWith("select r.id as reserva_id, r.vehiculo_id, v.placa")) {
          const [operationId, dateValue, startValue, endValue, vehicleId, driverUserId, driverId] = params;
          const operation = operationFor(operationId);
          const date = asDate(dateValue);
          const start = startValue ? asTime(startValue) : null;
          const end = endValue ? asTime(endValue) : null;
          const conflict = state.reservations.find((reservation) => {
            const reservationDate = asDate(reservation.fecha_salida || reservation.fecha_servicio || reservation.fecha_reserva);
            if (reservation.id === operation?.reserva_id
              || reservationDate !== date
              || ["cancelada", "finalizada"].includes(reservation.estado)) return false;
            const conductorOcupado = reservation.conductor_id === Number(driverUserId)
              || reservation.conductor_id === Number(driverId);
            if (reservation.vehiculo_id !== Number(vehicleId) && !conductorOcupado) return false;
            return intersects(
              start,
              end,
              reservation.fecha_salida && asTime(reservation.fecha_salida),
              reservation.fecha_llegada && asTime(reservation.fecha_llegada)
            );
          });
          return result(conflict ? [{ reserva_id: conflict.id, vehiculo_id: conflict.vehiculo_id, placa: vehicleFor(conflict.vehiculo_id)?.placa }] : []);
        }
        if (query.startsWith("update operaciones set vehiculo_id")) {
          const operation = operationFor(params[2]);
          Object.assign(operation, { vehiculo_id: Number(params[0]), conductor_id: Number(params[1]), estado: "asignada" });
          return result();
        }
        if (query.startsWith("select id, estado from reservas")) {
          const reservation = reservationFor(params[0]);
          return result(reservation ? [{ id: reservation.id, estado: reservation.estado }] : []);
        }
        if (query.includes("information_schema.table_constraints")) {
          return result([{ referenced_table: "usuarios" }]);
        }
        if (query.startsWith("update reservas set vehiculo_id = $1, conductor_id")) {
          const reservation = reservationFor(params[2]);
          Object.assign(reservation, { vehiculo_id: Number(params[0]), conductor_id: Number(params[1]) });
          return result();
        }
        if (query.startsWith("update decisiones_sistema")) {
          const [decisionId, vehicleId, confirmedBy, reason, operationId, date, passengers, start, end] = params;
          const decision = state.decisions.find((row) => row.id === Number(decisionId));
          if (!decision || decision.resultado !== null
            || decision.recomendacion.operacion_id !== Number(operationId)
            || decision.recomendacion.fecha !== asDate(date)
            || decision.recomendacion.pasajeros !== Number(passengers)
            || decision.recomendacion.hora_inicio !== (start ? asTime(start).slice(0, 5) : null)
            || decision.recomendacion.hora_fin !== (end ? asTime(end).slice(0, 5) : null)) return result();
          const isRecommended = decision.recomendacion.vehiculo.vehiculo_id === Number(vehicleId);
          const isAlternative = decision.recomendacion.alternativas.some((item) => item.vehiculo_id === Number(vehicleId));
          if (!isRecommended && (!isAlternative || !String(reason).trim())) return result();
          decision.entidad_id = Number(vehicleId);
          decision.resultado = isRecommended ? "aceptada" : "alternativa";
          decision.confirmado_por = Number(confirmedBy);
          decision.factores.decision_operador = { vehiculo_id: Number(vehicleId), motivo: reason || null, operacion_id: Number(operationId) };
          return result([{ id: decision.id }]);
        }
        if (query.startsWith("update operaciones set estado = $1,")) {
          const operation = operationFor(params[1]);
          operation.estado = params[0];
          return result();
        }
        if (query.startsWith("update reservas set estado = $1")) {
          const reservation = reservationFor(params[1]);
          reservation.estado = params[0];
          return result();
        }
        if (query.startsWith("update reservas set vehiculo_id = null, conductor_id = null where id = $1 and estado = 'confirmada'")) {
          const reservation = reservationFor(params[0]);
          if (reservation?.estado === "confirmada") Object.assign(reservation, { vehiculo_id: null, conductor_id: null });
          return result();
        }
        if (query.startsWith("update reservas set vehiculo_id = null, conductor_id = null where id = $1")) {
          const reservation = reservationFor(params[0]);
          if (reservation) Object.assign(reservation, { vehiculo_id: null, conductor_id: null });
          return result();
        }
        if (query.startsWith("update operaciones set estado = 'programada'")) {
          const operation = operationFor(params[0]);
          Object.assign(operation, { estado: "programada", vehiculo_id: null, conductor_id: null });
          return result();
        }

        throw new Error(`Unexpected client query in integration test: ${query}`);
      },
      release() {},
    };
  },
};

const databaseModule = require.resolve("../dist/config/db");
require.cache[databaseModule] = {
  id: databaseModule,
  filename: databaseModule,
  loaded: true,
  exports: pool,
  children: [],
  paths: [],
};

const adminRoutes = require("../dist/routes/admin.routes");
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);

let server;
let baseUrl;
const token = jwt.sign({ id: 99, email: "dispatch-test@example.invalid", rol: "admin" }, process.env.JWT_SECRET);

test("despacha, recomienda, asigna, sincroniza estados y reabre usando HTTP con base aislada", async (t) => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const request = async (path, { method = "GET", body, authenticated = true } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };

  await t.test("bloquea acceso sin token", async () => {
    const response = await request("/api/admin/operaciones/reservas-pendientes", { authenticated: false });
    assert.equal(response.status, 401);
  });

  await t.test("confirma el recorrido de reserva hasta asignación y finalización", async () => {
    const pending = await request("/api/admin/operaciones/reservas-pendientes");
    assert.equal(pending.status, 200);
    assert.ok(pending.body.data.some((reservation) => reservation.id === 801));

    const created = await request("/api/admin/operaciones/reservas/801/despachar", { method: "POST", body: {} });
    assert.equal(created.status, 201);
    const operationId = created.body.data.id;
    assert.equal(created.body.data.reserva_id, 801);
    assert.equal(created.body.data.estado, "programada");

    const duplicate = await request("/api/admin/operaciones/reservas/801/despachar", { method: "POST", body: {} });
    assert.equal(duplicate.status, 409);

    const unavailableVehicle = await request(`/api/admin/operaciones/${operationId}/asignar`, {
      method: "PATCH",
      body: { vehiculo_id: 701, conductor_id: 302 },
    });
    assert.equal(unavailableVehicle.status, 409);
    assert.match(unavailableVehicle.body.error, /No Disponible.*vehículo/i);

    const unavailableDriver = await request(`/api/admin/operaciones/${operationId}/asignar`, {
      method: "PATCH",
      body: { vehiculo_id: 702, conductor_id: 301 },
    });
    assert.equal(unavailableDriver.status, 409);
    assert.match(unavailableDriver.body.error, /No Disponible.*conductor/i);
    assert.equal(operationFor(operationId).vehiculo_id, null);

    const recommendation = await request(`/api/admin/inteligencia/asignacion-recomendada?fecha=2026-10-21&pasajeros=8&hora_inicio=09%3A00&hora_fin=11%3A00&operacion_id=${operationId}`);
    assert.equal(recommendation.status, 200);
    const suggestedVehicleId = recommendation.body.data.vehiculo.vehiculo_id;
    assert.ok(recommendation.body.data.decisionId);

    const assigned = await request(`/api/admin/operaciones/${operationId}/asignar`, {
      method: "PATCH",
      body: {
        vehiculo_id: suggestedVehicleId,
        conductor_id: recommendation.body.data.vehiculo.conductor_id,
        decision_id: recommendation.body.data.decisionId,
        decision_reason: "",
      },
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    assert.equal(assigned.body.data.estado, "asignada");
    assert.equal(assigned.body.data.vehiculo_id, suggestedVehicleId);
    assert.equal(state.reservations[0].vehiculo_id, suggestedVehicleId);
    assert.equal(state.decisions[0].resultado, "aceptada");

    const started = await request(`/api/admin/operaciones/${operationId}/estado`, { method: "PATCH", body: { estado: "en_curso" } });
    assert.equal(started.status, 200);
    assert.equal(state.reservations[0].estado, "en_curso");

    const completed = await request(`/api/admin/operaciones/${operationId}/estado`, { method: "PATCH", body: { estado: "completada" } });
    assert.equal(completed.status, 200);
    assert.equal(state.reservations[0].estado, "finalizada");
  });

  await t.test("devuelve una reserva cancelada a la cola y reabre la operación existente", async () => {
    const created = await request("/api/admin/operaciones/reservas/802/despachar", { method: "POST", body: {} });
    assert.equal(created.status, 201);
    const operationId = created.body.data.id;

    const cancelled = await request(`/api/admin/operaciones/${operationId}/estado`, { method: "PATCH", body: { estado: "cancelada" } });
    assert.equal(cancelled.status, 200);
    assert.equal(state.reservations[1].vehiculo_id, null);
    assert.equal(state.reservations[1].conductor_id, null);

    const pending = await request("/api/admin/operaciones/reservas-pendientes");
    const reopenedReservation = pending.body.data.find((reservation) => reservation.id === 802);
    assert.equal(reopenedReservation.operacion_cancelada_id, operationId);

    const reopened = await request(`/api/admin/operaciones/${operationId}/reabrir`, { method: "PATCH", body: {} });
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.data.estado, "programada");
    assert.equal(state.operations.filter((operation) => operation.reserva_id === 802).length, 1);
    assert.equal(state.history.some((entry) => entry.operacion_id === operationId && entry.accion === "reapertura_despacho"), true);

    const recommendation = await request(`/api/admin/inteligencia/asignacion-recomendada?fecha=2026-10-22&pasajeros=5&hora_inicio=09%3A00&hora_fin=11%3A00&operacion_id=${operationId}`);
    assert.equal(recommendation.status, 200);
    const alternativeVehicle = recommendation.body.data.alternativas[0];
    assert.ok(alternativeVehicle);

    const missingReason = await request(`/api/admin/operaciones/${operationId}/asignar`, {
      method: "PATCH",
      body: {
        vehiculo_id: alternativeVehicle.vehiculo_id,
        conductor_id: alternativeVehicle.conductor_id,
        decision_id: recommendation.body.data.decisionId,
      },
    });
    assert.equal(missingReason.status, 409);
    assert.equal(operationFor(operationId).vehiculo_id, null);

    const assignedAlternative = await request(`/api/admin/operaciones/${operationId}/asignar`, {
      method: "PATCH",
      body: {
        vehiculo_id: alternativeVehicle.vehiculo_id,
        conductor_id: alternativeVehicle.conductor_id,
        decision_id: recommendation.body.data.decisionId,
        decision_reason: "Se distribuye la carga de trabajo de la flota.",
      },
    });
    assert.equal(assignedAlternative.status, 200);
    assert.equal(assignedAlternative.body.data.vehiculo_id, alternativeVehicle.vehiculo_id);
    assert.equal(state.decisions[1].resultado, "alternativa");
    assert.equal(state.decisions[1].factores.decision_operador.motivo, "Se distribuye la carga de trabajo de la flota.");
  });
});
