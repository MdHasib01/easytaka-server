import { uploadBuffer } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { queryEnum } from '../utils/http.js';

const FOLDERS = ['proofs', 'personas', 'content', 'avatars', 'products', 'messages', 'brands', 'logos', 'misc'];

/** Uploads up to 5 images (multipart field "files") to Cloudinary and returns their URLs. */
export async function upload(req, res) {
  if (!env.cloudinaryEnabled) throw new ApiError(503, 'File uploads are not configured on this server');

  const files = req.files ?? [];
  if (!files.length) throw ApiError.badRequest('Attach at least one image in the "files" field');
  const folder = queryEnum(req.query.folder, FOLDERS, 'folder') ?? 'misc';

  let results;
  try {
    results = await Promise.all(
      files.map((file) =>
        uploadBuffer(file.buffer, { folder: `easytaka/${folder}`, resource_type: 'image' }),
      ),
    );
  } catch (err) {
    throw new ApiError(502, `Upload failed: ${err.message}`);
  }

  res.status(201).json(
    results.map((r) => ({
      url: r.secure_url,
      publicId: r.public_id,
      width: r.width,
      height: r.height,
      format: r.format,
      bytes: r.bytes,
    })),
  );
}
