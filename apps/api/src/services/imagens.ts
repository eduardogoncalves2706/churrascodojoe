import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const Bucket = process.env.IMAGENS_BUCKET;
const baseUrl = process.env.IMAGENS_BASE_URL;
const client = new S3Client({});

const TIPOS_ACEITOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export class ErroImagem extends Error { constructor(message: string, public status = 400) { super(message); } }

/**
 * URL pré-assinada pro navegador subir a foto direto pro bucket do site público (sem passar o
 * arquivo pela Lambda) — bucket e permissão em infra/lib/{site,api}-stack.ts. `publicUrl` é onde a
 * foto fica acessível depois do upload (mesmo CloudFront que serve o resto do site).
 */
export async function urlDeUpload(contentType: string, pasta: 'produtos' | 'combos'): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  if (!Bucket || !baseUrl) throw new ErroImagem('Upload de imagem não configurado neste ambiente', 501);
  const ext = TIPOS_ACEITOS[contentType];
  if (!ext) throw new ErroImagem('Formato de imagem não aceito (use JPEG, PNG ou WebP)');
  const key = `uploads/${pasta}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: 300 });
  return { uploadUrl, publicUrl: `${baseUrl}/${key}`, key };
}
