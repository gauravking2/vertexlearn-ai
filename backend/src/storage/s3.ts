import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config';

export interface ObjectRef {
  bucket: string;
  key: string;
}

/** True when server-side S3/MinIO credentials + endpoint are configured. */
export function isS3Configured(): boolean {
  const c = getConfig();
  return Boolean(c.STORAGE_ENDPOINT && c.STORAGE_ACCESS_KEY && c.STORAGE_SECRET_KEY);
}

function serverClient(): S3Client {
  const c = getConfig();
  return new S3Client({
    endpoint: c.STORAGE_ENDPOINT.replace(/\/$/, ''),
    region: c.STORAGE_REGION || 'us-east-1',
    credentials: { accessKeyId: c.STORAGE_ACCESS_KEY, secretAccessKey: c.STORAGE_SECRET_KEY },
    forcePathStyle: c.STORAGE_FORCE_PATH_STYLE !== 'false',
  });
}

/**
 * Client used ONLY for presigning browser-facing URLs. Signing is pure
 * crypto — the backend never calls these URLs itself — so we sign against
 * the public endpoint (what the browser can reach), which may differ from
 * the server-side endpoint (e.g. http://minio:9000 vs http://localhost:9000).
 */
function presignClient(): S3Client {
  const c = getConfig();
  const endpoint = (c.STORAGE_PUBLIC_ENDPOINT || c.STORAGE_ENDPOINT).replace(/\/$/, '');
  return new S3Client({
    endpoint,
    region: c.STORAGE_REGION || 'us-east-1',
    credentials: {
      accessKeyId: c.STORAGE_ACCESS_KEY || 'unconfigured',
      secretAccessKey: c.STORAGE_SECRET_KEY || 'unconfigured',
    },
    forcePathStyle: c.STORAGE_FORCE_PATH_STYLE !== 'false',
  });
}

export function bucketFor(kind: 'videos' | 'materials' | 'submissions' | 'certificates'): string {
  const c = getConfig();
  switch (kind) {
    case 'videos':
      return c.STORAGE_BUCKET_VIDEOS || 'videos';
    case 'materials':
      return c.STORAGE_BUCKET_MATERIALS || 'materials';
    case 'submissions':
      return c.STORAGE_BUCKET_SUBMISSIONS || 'submissions';
    case 'certificates':
      return c.STORAGE_BUCKET_CERTIFICATES || 'certificates';
  }
}

/** Create the bucket if it does not exist. Buckets stay private; access is via signed URLs. */
export async function ensureBucket(bucket: string): Promise<void> {
  const client = serverClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function putBytes(bucket: string, key: string, bytes: Buffer, contentType: string): Promise<void> {
  await ensureBucket(bucket);
  await serverClient().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
}

export async function getBytes(bucket: string, key: string): Promise<{ bytes: Buffer; contentType: string | undefined }> {
  const out = await serverClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = out.Body;
  if (!body) throw new Error('Empty object body');
  // Body is a stream in Node.js; collect it without new dependencies.
  const chunks: Buffer[] = [];
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return { bytes: Buffer.concat(chunks), contentType: out.ContentType };
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await serverClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function presignedPutUrl(bucket: string, key: string, expiresInSeconds: number, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(presignClient(), cmd, { expiresIn: expiresInSeconds });
}

export async function presignedGetUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(presignClient(), cmd, { expiresIn: expiresInSeconds });
}

export async function listBuckets(): Promise<string[]> {
  const { ListBucketsCommand } = await import('@aws-sdk/client-s3');
  const out = await serverClient().send(new ListBucketsCommand({}));
  return (out.Buckets ?? []).map((b) => b.Name ?? '').filter(Boolean);
}
