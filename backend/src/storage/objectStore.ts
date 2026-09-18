import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config';
import { logger } from '../logger';
import { bucketFor, getBytes, isS3Configured, objectExists, presignedGetUrl, presignedPutUrl, putBytes } from './s3';

export { bucketFor };

export interface PresignedPut {
  key: string;
  bucket: string;
  uploadUrl: string;
  publicUrl: string | null;
  expiresInSeconds: number;
}

function storageConfigured(): boolean {
  const c = getConfig();
  return Boolean(c.STORAGE_ENDPOINT && c.STORAGE_BUCKET_SUBMISSIONS);
}

export function isObjectStorageConfigured(): boolean {
  return storageConfigured();
}

/** S3 (MinIO-compatible) when credentials are set; otherwise local disk (dev/test fallback). */
export function storageBackendName(): 's3' | 'local' {
  return isS3Configured() ? 's3' : 'local';
}

export function sanitizeFileName(fileName: string, fallback = 'file'): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  return safe || fallback;
}

export function submissionObjectKey(assignmentId: string, submissionId: string, fileName: string): string {
  return `submissions/${assignmentId}/${submissionId}/${sanitizeFileName(fileName, 'submission')}`;
}

export function lectureObjectKey(lectureId: string, fileName: string): string {
  return `lectures/${lectureId}/${sanitizeFileName(fileName, 'asset')}`;
}

export function certificateObjectKey(userId: string, courseId: string): string {
  return `certificates/${userId}/${courseId}.pdf`;
}

/** Store bytes via S3 when configured, else under the local artifact dir (same bucket/key layout). */
export async function storeBytes(bucket: string, key: string, bytes: Buffer, contentType: string): Promise<{ backend: 's3' | 'local'; location: string }> {
  if (isS3Configured()) {
    await putBytes(bucket, key, bytes, contentType);
    return { backend: 's3', location: `s3://${bucket}/${key}` };
  }
  const base = getConfig().CERT_STORAGE_DIR || path.join(process.cwd(), 'storage-local');
  const full = path.join(base, bucket, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  return { backend: 'local', location: full };
}

/** Read bytes back through the same abstraction (metadata lives in Postgres; never binaries in the DB). */
export async function readBytes(bucket: string, key: string): Promise<{ bytes: Buffer; contentType: string | undefined; backend: 's3' | 'local' }> {
  if (isS3Configured()) {
    const out = await getBytes(bucket, key);
    return { ...out, backend: 's3' as const };
  }
  const base = getConfig().CERT_STORAGE_DIR || path.join(process.cwd(), 'storage-local');
  const full = path.join(base, bucket, key);
  const bytes = await fs.readFile(full);
  return { bytes, contentType: undefined, backend: 'local' as const };
}

export async function storedObjectExists(bucket: string, key: string): Promise<boolean> {
  if (isS3Configured()) return objectExists(bucket, key);
  const base = getConfig().CERT_STORAGE_DIR || path.join(process.cwd(), 'storage-local');
  try {
    await fs.stat(path.join(base, bucket, key));
    return true;
  } catch {
    return false;
  }
}

/**
 * Submission upload target. With S3 configured this is a REAL presigned PUT
 * URL (browser uploads straight to private storage, no credentials exposed).
 * Without it, the legacy `pending://` placeholder metadata is returned.
 */
export async function buildSubmissionUploadTarget(
  assignmentId: string,
  submissionId: string,
  fileName: string,
): Promise<{ key: string; bucket: string; uploadUrl: string; publicUrl: string | null }> {
  const key = submissionObjectKey(assignmentId, submissionId, fileName);
  const bucket = bucketFor('submissions');
  if (isS3Configured()) {
    const uploadUrl = await presignedPutUrl(bucket, key, 900, 'application/octet-stream');
    logger.info({ bucket, key }, 'submission presigned upload URL issued');
    return { key, bucket, uploadUrl, publicUrl: null };
  }
  const c = getConfig();
  const endpoint = (c.STORAGE_ENDPOINT || '').replace(/\/$/, '');
  if (endpoint) {
    return { key, bucket, uploadUrl: `${endpoint}/${bucket}/${key}`, publicUrl: null };
  }
  return { key, bucket, uploadUrl: `pending://object-storage/${bucket}/${key}`, publicUrl: null };
}

/** Short-lived, access-checked download URL (authz happens in the route before issuing). */
export async function buildDownloadUrl(bucket: string, key: string, expiresInSeconds = 900): Promise<string | null> {
  if (!isS3Configured()) return null;
  return presignedGetUrl(bucket, key, expiresInSeconds);
}

/** Presigned PUT target for instructor lecture assets (authz + ownership checked by the route). */
export async function buildLectureUploadTarget(
  lectureId: string,
  fileName: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<PresignedPut> {
  const key = lectureObjectKey(lectureId, fileName);
  const bucket = bucketFor('videos');
  if (isS3Configured()) {
    const uploadUrl = await presignedPutUrl(bucket, key, expiresInSeconds, contentType);
    return { key, bucket, uploadUrl, publicUrl: null, expiresInSeconds };
  }
  return presignedPutStub(bucket, key, expiresInSeconds);
}

export function presignedPutStub(bucket: string, key: string, expiresInSeconds = 900): PresignedPut {
  const c = getConfig();
  const endpoint = (c.STORAGE_ENDPOINT || '').replace(/\/$/, '');
  return {
    key,
    bucket,
    uploadUrl: endpoint ? `${endpoint}/${bucket}/${key}` : `pending://object-storage/${bucket}/${key}`,
    publicUrl: null,
    expiresInSeconds,
  };
}

export async function writeLocalArtifact(relativeKey: string, bytes: Buffer): Promise<string> {
  const c = getConfig();
  const base = c.CERT_STORAGE_DIR || path.join(process.cwd(), 'storage-local');
  const full = path.join(base, relativeKey);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  return full;
}

export function localArtifactKey(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/');
}
