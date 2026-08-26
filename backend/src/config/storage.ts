export {};

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "turesma-media";

const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const uploadImage = async (file: any, folder: string) => {
  if (!supabase) {
    throw new Error("Supabase Storage no está configurado");
  }

  const extension = String(file.originalname || "").split(".").pop()?.toLowerCase();
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
  const filePath = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${safeExtension}`;

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  return data.publicUrl;
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

module.exports = { uploadImage, deleteImage, getStoragePathFromUrl };