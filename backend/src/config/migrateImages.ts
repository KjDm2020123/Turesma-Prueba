export {};

const pool = require("./db");
const { optimizeImage, uploadBuffer } = require("./storage");

const applyChanges = process.argv.includes("--apply");

type ImageRecord = {
  table: string;
  id: number;
  column: string;
  url: string;
  folder: string;
};

const sources = [
  { table: "vehiculos", column: "imagen_url", folder: "vehiculos" },
  { table: "galeria_viajes", column: "imagen_url", folder: "galeria" },
  { table: "usuarios", column: "imagen_url", folder: "perfiles" },
  { table: "usuarios", column: "cedula_url", folder: "cedulas" },
];

const isSupabaseImage = (url: string) => url.includes("/storage/v1/object/public/");

const loadRecords = async (): Promise<ImageRecord[]> => {
  const records: ImageRecord[] = [];
  for (const source of sources) {
    const result = await pool.query(
      `SELECT id, ${source.column} AS url
       FROM ${source.table}
       WHERE ${source.column} IS NOT NULL
         AND ${source.column} <> ''`
    );
    for (const row of result.rows) {
      if (isSupabaseImage(String(row.url))) {
        records.push({ ...source, id: row.id, url: row.url });
      }
    }
  }
  return records;
};

const migrate = async () => {
  const records = await loadRecords();
  console.log(`${applyChanges ? "Procesando" : "Encontradas"} ${records.length} imágenes de Supabase.`);

  if (!applyChanges) {
    console.log("Modo simulación: ejecuta `npm run migrate:images -- --apply` para aplicar los cambios.");
    return;
  }

  let migrated = 0;
  let failed = 0;
  for (const record of records) {
    try {
      const response = await fetch(record.url);
      if (!response.ok) throw new Error(`descarga HTTP ${response.status}`);
      const original = Buffer.from(await response.arrayBuffer());
      const optimized = await optimizeImage(original, record.folder);
      const newUrl = await uploadBuffer(optimized, record.folder);
      await pool.query(
        `UPDATE ${record.table} SET ${record.column} = $1 WHERE id = $2 AND ${record.column} = $3`,
        [newUrl, record.id, record.url]
      );
      migrated += 1;
      console.log(`[OK] ${record.table}.${record.column} #${record.id}`);
    } catch (error: any) {
      failed += 1;
      console.error(`[ERROR] ${record.table}.${record.column} #${record.id}: ${error.message}`);
    }
  }

  console.log(`Migradas: ${migrated}. Fallidas: ${failed}. Los archivos originales se conservaron.`);
};

migrate()
  .catch((error: any) => {
    console.error("Migración detenida:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());