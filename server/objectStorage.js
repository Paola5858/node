import { createHash, randomUUID } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

let client

function getClient() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET
  if (!bucket) throw Object.assign(new Error('OBJECT_STORAGE_BUCKET não foi configurado.'), { status: 503 })
  if (!client) {
    client = new S3Client({
      region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.OBJECT_STORAGE_ENDPOINT),
      credentials: process.env.OBJECT_STORAGE_ACCESS_KEY && process.env.OBJECT_STORAGE_SECRET_KEY
        ? { accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY }
        : undefined,
    })
  }
  return { client, bucket }
}

export async function preserveOriginal({ organizationId, fileName, contentType, bytes }) {
  if (!organizationId || !Buffer.isBuffer(bytes) || bytes.length === 0) throw new TypeError('Arquivo original inválido.')
  const hasControlCharacter = typeof fileName === 'string' && [...fileName].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  if (typeof fileName !== 'string' || fileName.length > 255 || hasControlCharacter || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
    throw new TypeError('Nome ou tipo do arquivo inválido.')
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const key = `${organizationId}/originals/${randomUUID()}-${sha256}`
  const { client: s3, bucket } = getClient()
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bytes,
    ContentType: contentType,
    Metadata: { 'original-filename': encodeURIComponent(fileName), sha256 },
    IfNoneMatch: '*',
  }))
  return { key, sha256, size: bytes.length, contentType }
}

export async function retrieveOriginal({ organizationId, objectKey }) {
  if (!organizationId || typeof objectKey !== 'string' || !objectKey.startsWith(`${organizationId}/originals/`)) {
    throw Object.assign(new Error('arquivo original não encontrado.'), { status: 404 })
  }
  const { client: s3, bucket } = getClient()
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }))
    if (!object.Body) throw new Error('o armazenamento retornou um arquivo sem conteúdo.')
    return {
      bytes: Buffer.from(await object.Body.transformToByteArray()),
      contentType: object.ContentType || 'application/octet-stream',
    }
  } catch (cause) {
    if (cause.name === 'NoSuchKey' || cause.$metadata?.httpStatusCode === 404) {
      throw Object.assign(new Error('arquivo original não encontrado.'), { status: 404 })
    }
    throw cause
  }
}
