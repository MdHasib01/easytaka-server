import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else if (env.CLOUDINARY_URL) {
  // The SDK reads CLOUDINARY_URL from the environment on its own.
  cloudinary.config({ secure: true });
}

export function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) =>
      err ? reject(err) : resolve(result),
    );
    stream.end(buffer);
  });
}

/** Short-lived signed URL for an `authenticated` (private) asset. */
export function signedUrl(publicId, format) {
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    format,
    expires_at: Math.floor(Date.now() / 1000) + 10 * 60,
  });
}

export function destroy(publicId, options = {}) {
  return cloudinary.uploader.destroy(publicId, { invalidate: true, ...options });
}

export { cloudinary };
