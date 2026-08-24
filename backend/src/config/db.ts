export {};

const { Pool } = require("pg");

// Las bases de datos en la nube (Neon, Render, Railway, Supabase…) exigen SSL.
// En local NO se usa SSL. Se activa con DB_SSL=true en el hosting.
const useSSL = String(process.env.DB_SSL || "").toLowerCase() === "true";
const sslConfig = useSSL ? { rejectUnauthorized: false } : undefined;

let pool: any;

if (process.env.DATABASE_URL) {
  // Muchos hostings entregan un único "connection string". Si está presente,
  // se usa ese directamente (más simple que cargar las 5 variables sueltas).
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
  });
} else {
  const requiredEnvVars = ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD", "DB_PORT"];
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Faltan variables de entorno de base de datos: ${missingEnvVars.join(", ")}`
    );
  }

  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    ssl: sslConfig,
  });
}

// Test de conexión
pool.query("SELECT NOW()", (err: any) => {
  if (err) {
    console.error(" Error conectando a PostgreSQL:", err);
  } else {
    console.log(" PostgreSQL conectado exitosamente");
  }
});

module.exports = pool;
