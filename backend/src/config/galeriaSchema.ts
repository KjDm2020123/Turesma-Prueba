export {};

const pool = require("./db");

let videoColumnsReady: Promise<void> | null = null;

const ensureGaleriaVideoColumns = (): Promise<void> => {
  if (!videoColumnsReady) {
    videoColumnsReady = pool.query(`
      ALTER TABLE galeria_viajes
      ADD COLUMN IF NOT EXISTS video_offset_x INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS video_offset_y INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS video_zoom INT NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS video_format VARCHAR(12) NOT NULL DEFAULT 'horizontal',
      ADD COLUMN IF NOT EXISTS video_aspect_ratio NUMERIC(6,4) NOT NULL DEFAULT 1.7778,
      ADD COLUMN IF NOT EXISTS video_poster_url TEXT;
    `).then(() => undefined).catch((error: unknown) => {
      videoColumnsReady = null;
      throw error;
    });
  }

  return videoColumnsReady;
};

module.exports = { ensureGaleriaVideoColumns };
