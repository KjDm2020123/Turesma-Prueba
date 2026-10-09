CREATE TABLE IF NOT EXISTS decisiones_sistema (
  id SERIAL PRIMARY KEY,
  tipo_decision VARCHAR(80) NOT NULL,
  entidad_id INT,
  recomendacion JSONB NOT NULL,
  factores JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado VARCHAR(40),
  confirmado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS decisiones_sistema_tipo_fecha_idx
  ON decisiones_sistema (tipo_decision, creado_en DESC);
