import { getAuthHeaders } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const descargarArchivo = async (path: string, filenameFallback: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: getAuthHeaders() });
    if (!res.ok) return { ok: false, error: "No se pudo generar el reporte" };

    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : filenameFallback;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo descargar el archivo" };
  }
};

// CSV y XLSX requieren token de sesión, por eso se descargan usando fetch.
export const descargarCSV = descargarArchivo;
export const descargarExcel = (path: string, filenameFallback: string) =>
  descargarArchivo(path, filenameFallback);
