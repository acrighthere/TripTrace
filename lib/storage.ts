import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const BUCKET = process.env.S3_BUCKET ?? "triptrace";

const region = process.env.S3_REGION ?? "us-east-1";
const credentials = {
  accessKeyId: process.env.S3_ACCESS_KEY ?? "",
  secretAccessKey: process.env.S3_SECRET_KEY ?? "",
};

// Presigned URLs embed the host in the signature, so they must be signed
// against the endpoint the *browser* reaches (localhost:9000 in compose,
// while the server itself talks to minio:9000). With real S3/R2 both
// endpoints are the same. forcePathStyle is required for MinIO.
//
// requestChecksumCalculation: newer SDKs (>=3.729) default to embedding a
// CRC32 checksum into presigned PUT signatures — computed over an EMPTY body
// at signing time, so the browser's actual upload always fails with 403.
// WHEN_REQUIRED restores the classic behavior.
const internalClient = new S3Client({
  region,
  credentials,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const presignClient = new S3Client({
  region,
  credentials,
  endpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

/**
 * Presigned PUT pinned to the declared content type and length — a client
 * sending different bytes than declared fails the signature check.
 */
export function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(
    presignClient,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    {
      expiresIn: 600,
      // The presigner drops content-type from the signature by default;
      // forcing it into the signed headers makes MinIO/S3 reject uploads
      // whose declared type differs from what was presigned.
      unhoistableHeaders: new Set(["content-type", "content-length"]),
      signableHeaders: new Set(["content-type", "content-length"]),
    }
  );
}

export function presignDownload(key: string): Promise<string> {
  return getSignedUrl(
    presignClient,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
}

/** Returns null when the object doesn't exist. */
export async function headObject(key: string): Promise<HeadObjectCommandOutput | null> {
  try {
    return await internalClient.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    return null;
  }
}

/** Best-effort delete — a leftover object is logged, never surfaced. */
export async function deleteObject(key: string): Promise<void> {
  try {
    await internalClient.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error(`[storage] failed to delete object ${key}`, err);
  }
}
