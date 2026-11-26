export function contentDisposition(fileName: string, inline: boolean) {
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
