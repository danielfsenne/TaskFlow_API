import { Response } from 'express';
import { StoredFile } from './file-storage';

export function sendStored(res: Response, file: StoredFile) {
  if (file.size !== undefined) res.setHeader('Content-Length', file.size);
  file.body.on('error', () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  file.body.pipe(res);
}
