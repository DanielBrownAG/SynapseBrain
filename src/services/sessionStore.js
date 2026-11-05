import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class SessionStore {
  constructor(directory = process.env.SYNAPSE_DATA_DIR || 'data/sessions') {
    this.directory = directory ? path.resolve(directory) : null;
    this.memory = new Map();
    this.locks = new Map();
  }

  validateId(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new Error('Invalid session ID');
    }
    return id;
  }

  file(id) { return path.join(this.directory, `${this.validateId(id)}.json`); }

  get(id) {
    this.validateId(id);
    if (this.directory) {
      try { return JSON.parse(readFileSync(this.file(id), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return structuredClone(this.memory.get(id) || null);
  }

  save(session) {
    this.validateId(session.id);
    session.updatedAt = new Date().toISOString();
    if (this.directory) {
      mkdirSync(this.directory, { recursive: true });
      const filename = this.file(session.id);
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(session), { encoding: 'utf8', mode: 0o600 });
        renameSync(temporary, filename);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
    } else this.memory.set(session.id, structuredClone(session));
    return session;
  }

  create(id = randomUUID()) {
    const session = { id, history: [], memory: {}, activities: [], totalTokens: 0, createdAt: new Date().toISOString() };
    return this.save(session);
  }

  async withLock(id, callback) {
    this.validateId(id);
    const previous = this.locks.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(callback);
    this.locks.set(id, current);
    try { return await current; }
    finally { if (this.locks.get(id) === current) this.locks.delete(id); }
  }

  async clear(id) { return this.withLock(id, () => this.create(id)); }

  async delete(id) {
    return this.withLock(id, () => {
      if (this.directory) {
        try { unlinkSync(this.file(id)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      this.memory.delete(id);
    });
  }
}

export default new SessionStore();
