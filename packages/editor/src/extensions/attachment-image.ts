export const IMAGE_MIME_PREFIX = "image/";

export function isAttachmentImage(mimeType: string): boolean {
  return mimeType.startsWith(IMAGE_MIME_PREFIX);
}
