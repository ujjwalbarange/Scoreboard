/**
 * Asynchronous Serialized Atomic File Writer
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Guarantees:
 * 1. Writes to the same destination path are strictly serialized in FIFO order,
 *    preventing out-of-order saves when the operator inputs rapid keyboard commands.
 * 2. Every write is staged to a temporary file in the same directory, flushed
 *    to disk via filehandle.sync(), closed, and atomically renamed over the target.
 * 3. Cleans up any leftover temp file if an error occurs and returns a clear
 *    diagnostic result without corrupting the existing destination file.
 */

import fs from 'node:fs';
import path from 'node:path';

export class AtomicFileWriter {
  constructor() {
    /** @type {Map<string, Promise<any>>} */
    this.writeQueues = new Map();
    this.writeCounter = 0;
  }

  /**
   * Returns true if a write operation is currently queued or executing for `targetPath`.
   * @param {string} targetPath
   * @returns {boolean}
   */
  isWriteInFlight(targetPath) {
    const resolved = path.resolve(targetPath);
    return this.writeQueues.has(resolved);
  }

  /**
   * Enqueues and executes an atomic write to `targetPath`.
   * @param {string} targetPath
   * @param {string} content
   * @returns {Promise<{ ok: boolean, filePath: string, bytesWritten?: number, savedAt?: string, error?: string }>}
   */
  writeAtomically(targetPath, content) {
    const resolvedPath = path.resolve(targetPath);
    const previousTask =
      this.writeQueues.get(resolvedPath) || Promise.resolve();

    const currentTask = previousTask
      .catch(() => {
        // Ensure prior failure does not wedge the queue for subsequent retries
      })
      .then(() => this._performAtomicWrite(resolvedPath, content));

    // Track in-flight promise and clean up when settled
    const trackedPromise = currentTask.finally(() => {
      if (this.writeQueues.get(resolvedPath) === trackedPromise) {
        this.writeQueues.delete(resolvedPath);
      }
    });

    this.writeQueues.set(resolvedPath, trackedPromise);
    return trackedPromise;
  }

  /**
   * Internal atomic write implementation:
   * temp file -> write -> sync -> close -> rename
   * @param {string} resolvedPath
   * @param {string} content
   */
  async _performAtomicWrite(resolvedPath, content) {
    const dir = path.dirname(resolvedPath);
    const base = path.basename(resolvedPath);
    this.writeCounter += 1;
    const tempFileName = `.tmp-${process.pid}-${Date.now()}-${this.writeCounter}-${base}`;
    const tempFilePath = path.join(dir, tempFileName);

    let fileHandle = null;
    try {
      await fs.promises.mkdir(dir, { recursive: true });

      fileHandle = await fs.promises.open(tempFilePath, 'w', 0o644);
      const buffer = Buffer.from(String(content), 'utf-8');
      const { bytesWritten } = await fileHandle.write(
        buffer,
        0,
        buffer.length,
        0
      );
      await fileHandle.sync();
      await fileHandle.close();
      fileHandle = null;

      await fs.promises.rename(tempFilePath, resolvedPath);

      return {
        ok: true,
        filePath: resolvedPath,
        bytesWritten,
        savedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (fileHandle) {
        try {
          await fileHandle.close();
        } catch {
          // Ignore close error on cleanup
        }
      }
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {
        // Ignore unlink error if temp file was not created
      }

      return {
        ok: false,
        filePath: resolvedPath,
        error:
          err instanceof Error
            ? err.message
            : 'Atomic file persistence failed.',
      };
    }
  }
}
