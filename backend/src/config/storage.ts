export {};

const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "turesma-media";

const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const optimizeImage = async (buffer: Buffer, folder: string) => {
  const isDocument = folder === "cedulas";
  return sharp(buffer)
    .rotate()
    .resize({
      width: isDocument ? 1800 : folder === "perfiles" ? 800 : 1280,
      height: isDocument ? 1800 : folder === "perfiles" ? 800 : 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: isDocument ? 88 : 82, effort: 4 })
    .toBuffer();
};

const uploadBuffer = async (buffer: Buffer, folder: string) => {
  if (!supabase) {
    throw new Error("Supabase Storage no está configurado");
  }

  const filePath = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, buffer, { contentType: "image/webp", upsert: false });

  if (error) throw error;
  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  return data.publicUrl;
};

const uploadImage = async (file: any, folder: string) => {
  if (!supabase) {
    throw new Error("Supabase Storage no está configurado");
  }

  return uploadBuffer(await optimizeImage(file.buffer, folder), folder);
};

const deleteImage = async (filePath: string) => {
  if (!supabase || !filePath) return;
  await supabase.storage.from(bucketName).remove([filePath]);
};

const getStoragePathFromUrl = (imageUrl: string) => {
  const marker = "/storage/v1/object/public/";
  const markerIndex = imageUrl.indexOf(marker);
  if (markerIndex === -1) return null;

  const bucketAndPath = decodeURIComponent(imageUrl.slice(markerIndex + marker.length));
  const separatorIndex = bucketAndPath.indexOf("/");
  return separatorIndex === -1 ? null : bucketAndPath.slice(separatorIndex + 1);
};

module.exports = { uploadImage, uploadBuffer, optimizeImage, deleteImage, getStoragePathFromUrl };