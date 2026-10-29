export {};

const pool = require("../config/db");

const getImages = async () => {
  const result = await pool.query(
    "SELECT slot, image_url, position_x, position_y, zoom FROM homepage_showcase_images"
  );
  return result.rows.reduce(
    (images: Record<string, unknown>, row: {
      slot: string;
      image_url: string;
      position_x: number;
      position_y: number;
      zoom: number;
    }) => {
      images[row.slot] = {
        image_url: row.image_url,
        position_x: Number(row.position_x),
        position_y: Number(row.position_y),
        zoom: Number(row.zoom),
      };
      return images;
    },
    { primary: null, secondary: null }
  );
};

const getPublicHomeShowcaseImages = async (_req: any, res: any) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.json(await getImages());
  } catch (error) {
    console.error("Error cargando imágenes destacadas de inicio:", error);
    return res.status(500).json({ error: "No se pudieron cargar las imágenes destacadas" });
  }
};

const getAdminHomeShowcaseImages = async (_req: any, res: any) => {
  try {
    return res.json(await getImages());
  } catch (error) {
    console.error("Error cargando imágenes destacadas para administración:", error);
    return res.status(500).json({ error: "No se pudieron cargar las imágenes destacadas" });
  }
};

const updateHomeShowcaseImage = async (req: any, res: any) => {
  const { slot } = req.params;
  const imageUrl = typeof req.body?.image_url === "string" ? req.body.image_url.trim() : "";
  const positionX = Number(req.body?.position_x);
  const positionY = Number(req.body?.position_y);
  const zoom = Number(req.body?.zoom);

  if (!["primary", "secondary"].includes(slot)) {
    return res.status(400).json({ error: "La posición de la imagen no es válida" });
  }
  if (!imageUrl || imageUrl.length > 2000) {
    return res.status(400).json({ error: "Debes proporcionar una URL de imagen válida" });
  }
  if (
    !Number.isFinite(positionX) || positionX < 0 || positionX > 100
    || !Number.isFinite(positionY) || positionY < 0 || positionY > 100
    || !Number.isFinite(zoom) || zoom < 100 || zoom > 200
  ) {
    return res.status(400).json({ error: "El encuadre de la imagen no es válido" });
  }

  try {
    const parsedUrl = new URL(imageUrl);
    const isLocalHttp = parsedUrl.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !isLocalHttp) {
      return res.status(400).json({ error: "La URL de la imagen debe usar HTTPS" });
    }

    await pool.query(
      `INSERT INTO homepage_showcase_images (slot, image_url, position_x, position_y, zoom, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (slot)
       DO UPDATE SET image_url = EXCLUDED.image_url,
                     position_x = EXCLUDED.position_x,
                     position_y = EXCLUDED.position_y,
                     zoom = EXCLUDED.zoom,
                     actualizado_en = CURRENT_TIMESTAMP`,
      [slot, imageUrl, positionX, positionY, zoom]
    );
    return res.json({
      slot,
      image_url: imageUrl,
      position_x: positionX,
      position_y: positionY,
      zoom,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({ error: "La URL de la imagen no es válida" });
    }
    console.error("Error guardando imagen destacada de inicio:", error);
    return res.status(500).json({ error: "No se pudo guardar la imagen destacada" });
  }
};

module.exports = {
  getPublicHomeShowcaseImages,
  getAdminHomeShowcaseImages,
  updateHomeShowcaseImage,
};
