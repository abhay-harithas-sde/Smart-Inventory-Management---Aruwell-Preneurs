import api from "./api";

/** Upload a file directly to Cloudinary using a backend-signed request. Returns secure_url. */
export async function uploadImageSigned(file, folder = "products") {
  const sig = (await api.post("/uploads/sign", { folder })).data;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.api_key);
  fd.append("timestamp", sig.timestamp);
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);

  const resp = await fetch(sig.upload_url, { method: "POST", body: fd });
  if (!resp.ok) throw new Error(`Cloudinary upload failed (${resp.status})`);
  const data = await resp.json();
  return data.secure_url;
}
