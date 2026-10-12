import inventory from '../../tests/fixtures/game-manifest.json';
import { readZip, ROM_LIMITS, ZipError } from './zip';
export { ROM_LIMITS } from './zip';

export const ROM_DATABASE = 'nocpu-local-roms';
export const ROM_DATABASE_VERSION = 1;
export const ROM_STORE = 'archives';
export interface ValidatedRomMember { expectedName: string; actualName: string; crc32: string; sizeBytes: number }
export interface RomEntry {
  gameId: string; status: 'ready' | 'missing' | 'not-required'; storage: 'session' | 'device' | null;
  fileName: string | null; archiveBytes: number | null; members: ValidatedRomMember[]; message?: string;
}
export type RomResult<T> = { ok: true; value: T } | { ok: false; code: string; error: string };
/** A fresh, canonical-name copy for a single local worker launch. */
export interface RuntimeRomMember { expectedName: string; bytes: Uint8Array }
export interface RomLibrary {
  list(): Promise<RomEntry[]>;
  importArchive(gameId: string, file: File, remember?: boolean): Promise<RomResult<RomEntry>>;
  remove(gameId: string): Promise<RomResult<RomEntry>>;
  exportArchive(gameId: string): Promise<RomResult<{ blob: Blob; fileName: string }>>;
  runtimeMembers(gameId: string): Promise<RomResult<RuntimeRomMember[]>>;
  close(): void;
}
interface Requirement { expected_member: string; accepted_crc32: string[]; dump_variants: { crc32: string; size_bytes: number }[] }
interface AuditedGame { id: string; roms: Requirement[] }
interface ArchiveRecord { version: 1; gameId: string; fileName: string; bytes: ArrayBuffer }
interface SessionArchive { record: ArchiveRecord; message?: string }
const games = inventory.games as unknown as readonly AuditedGame[];
const gameMap = new Map(games.map((game) => [game.id, game]));
const failure = (code: string, error: string): { ok: false; code: string; error: string } => ({ ok: false, code, error });
function blank(gameId: string, message?: string): RomEntry {
  return { gameId, status: gameMap.get(gameId)?.roms.length ? 'missing' : 'not-required', storage: null, fileName: null, archiveBytes: null, members: [], ...(message ? { message } : {}) };
}
function filename(name: string, gameId: string): string { return (name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 128) || `${gameId}.zip`); }

/** CRC and observed dump-size pairs are compatibility evidence, never gameplay evidence. */
export function validateRomArchive(gameId: string, bytes: ArrayBuffer | Uint8Array): ValidatedRomMember[] {
  const game = gameMap.get(gameId);
  if (!game) throw new ZipError('unknown-game', 'Choose a game from the library.');
  if (!game.roms.length) throw new ZipError('not-required', 'This game does not need a ROM archive.');
  const members = readZip(bytes);
  return game.roms.map((requirement) => {
    const match = members.find((member) => requirement.accepted_crc32.includes(member.crc32)
      && requirement.dump_variants.some((variant) => variant.crc32 === member.crc32 && variant.size_bytes === member.bytes.length));
    if (!match) {
      const wrongSize = members.some((member) => requirement.accepted_crc32.includes(member.crc32));
      throw new ZipError(wrongSize ? 'rom-size-mismatch' : 'rom-missing', wrongSize
        ? `${requirement.expected_member} has a compatible checksum but an unrecognized dump size.`
        : `Missing compatible bytes for ${requirement.expected_member}. A matching filename alone is insufficient.`);
    }
    return { expectedName: requirement.expected_member, actualName: match.name, crc32: match.crc32, sizeBytes: match.bytes.length };
  });
}
function checked(record: unknown, gameId: string, storage: 'session' | 'device', message?: string): { entry: RomEntry; record: ArchiveRecord } {
  if (!record || typeof record !== 'object') throw new ZipError('stored-invalid', 'Saved ROM data is missing or invalid. Re-import the archive.');
  const candidate = record as Partial<ArchiveRecord>;
  if (candidate.version !== 1 || candidate.gameId !== gameId || typeof candidate.fileName !== 'string' || candidate.fileName.length > 128 || !(candidate.bytes instanceof ArrayBuffer)) throw new ZipError('stored-invalid', 'Saved ROM data is invalid or from an unsupported version. Re-import the archive.');
  const members = validateRomArchive(gameId, candidate.bytes);
  return { record: candidate as ArchiveRecord, entry: { gameId, status: 'ready', storage, fileName: candidate.fileName, archiveBytes: candidate.bytes.byteLength, members, ...(message ? { message } : {}) } };
}
function unavailable(message = 'Device storage is unavailable. Import an archive for this visit or try again.'): Error { return new Error(message); }

/** Browser-only retention and checked local worker handoff. No fetch or upload. */
export function createRomLibrary(factory?: IDBFactory | null): RomLibrary {
  const session = new Map<string, SessionArchive>();
  let database: IDBDatabase | undefined;
  let opening: Promise<IDBDatabase> | undefined;
  let closed = false;
  let chain: Promise<unknown> = Promise.resolve();
  function sequence<T>(work: () => Promise<T>): Promise<T> {
    const operation = chain.then(work, work); chain = operation.catch(() => undefined); return operation;
  }
  function browserFactory(): IDBFactory | null {
    if (factory !== undefined) return factory;
    try { return typeof indexedDB !== 'undefined' ? indexedDB : null; } catch { return null; }
  }
  function open(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(unavailable());
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const idb = browserFactory();
      if (!idb) { reject(unavailable()); return; }
      let settled = false;
      const timer = setTimeout(() => finish(undefined, unavailable('Device storage did not respond. Import for this visit or try again.')), 2500);
      function finish(db?: IDBDatabase, error?: Error): void {
        if (settled) { db?.close(); return; }
        settled = true; clearTimeout(timer);
        if (error || !db || closed) { db?.close(); reject(error ?? unavailable()); return; }
        database = db;
        db.onversionchange = () => { db.close(); if (database === db) database = undefined; };
        db.onclose = () => { if (database === db) database = undefined; };
        resolve(db);
      }
      try {
        const request = idb.open(ROM_DATABASE, ROM_DATABASE_VERSION);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(ROM_STORE)) request.result.createObjectStore(ROM_STORE, { keyPath: 'gameId' }); };
        request.onerror = () => finish(undefined, unavailable());
        request.onblocked = () => finish(undefined, unavailable('Device storage is busy in another tab. Close it or import for this visit.'));
        request.onsuccess = () => {
          if (request.result.objectStoreNames.contains(ROM_STORE)) finish(request.result);
          else { request.result.close(); finish(undefined, unavailable('Saved ROM storage is invalid. Import for this visit.')); }
        };
      } catch { finish(undefined, unavailable()); }
    }).finally(() => { opening = undefined; });
    return opening;
  }
  async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      let request: IDBRequest<T>;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { try { tx.abort(); } catch { /* Already ended. */ } end(unavailable('Device storage did not respond. Try again.')); } }, 2500);
      const end = (error?: Error): void => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(request.result); };
      try {
        tx = db.transaction(ROM_STORE, mode); request = work(tx.objectStore(ROM_STORE));
        tx.oncomplete = () => end(); tx.onerror = () => end(unavailable()); tx.onabort = () => end(unavailable());
        request.onerror = () => end(unavailable());
      } catch { end(unavailable()); }
    });
  }
  async function current(gameId: string): Promise<{ entry: RomEntry; record?: ArchiveRecord; storageUnavailable?: boolean }> {
    if (!gameMap.get(gameId)?.roms.length) return { entry: blank(gameId) };
    const local = session.get(gameId);
    if (local) {
      try { return checked(local.record, gameId, 'session', local.message); }
      catch { session.delete(gameId); return { entry: blank(gameId, 'Session ROM data is invalid. Re-import the archive.') }; }
    }
    try {
      const stored = await transaction('readonly', (store) => store.get(gameId));
      if (stored === undefined) return { entry: blank(gameId) };
      try { return checked(stored, gameId, 'device'); }
      catch {
        // A confirmed saved record may be removed even when its bytes cannot be trusted.
        return { entry: { ...blank(gameId, 'Saved ROM data is invalid or unavailable. Re-import the archive.'), storage: 'device' } };
      }
    } catch { return { entry: blank(gameId, 'Device storage is unavailable. Import for this visit or try again.'), storageUnavailable: true }; }
  }
  return {
    list: () => sequence(async () => {
      // Probe once so an inaccessible/busy store cannot add one timeout per game.
      let accessible = true;
      try { await open(); } catch { accessible = false; }
      const entries: RomEntry[] = [];
      for (const game of games) {
        if (accessible || session.has(game.id) || !game.roms.length) {
          const value = await current(game.id);
          entries.push(value.entry);
          // An opened database can also be unresponsive. Stop on its first failed read.
          if (value.storageUnavailable) accessible = false;
        } else entries.push(blank(game.id, 'Device storage is unavailable. Import for this visit or try again.'));
      }
      return entries;
    }),
    importArchive: (gameId, file, remember = false) => sequence(async () => {
      if (closed) return failure('storage-closed', 'Local ROM storage is closed. Reload to import an archive.');
      if (!gameMap.has(gameId)) return failure('unknown-game', 'Choose a game from the library.');
      if (!gameMap.get(gameId)!.roms.length) return failure('not-required', 'This game does not need a ROM archive.');
      if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size < 22 || file.size > ROM_LIMITS.archiveBytes) return failure('archive-too-large', 'Choose a complete ZIP no larger than 2 MiB.');
      let record: ArchiveRecord;
      let entry: RomEntry;
      try {
        const bytes = await file.arrayBuffer();
        record = { version: 1, gameId, fileName: filename(file.name, gameId), bytes };
        entry = checked(record, gameId, 'session').entry;
      } catch (error) { return failure(error instanceof ZipError ? error.code : 'read-failed', error instanceof ZipError ? error.message : 'The ZIP could not be read. Try selecting it again.'); }
      if (closed) return failure('storage-closed', 'Local ROM storage is closed. Reload to import an archive.');
      if (remember) {
        try {
          await transaction('readwrite', (store) => store.put(record));
          session.delete(gameId); entry.storage = 'device';
          return { ok: true, value: entry };
        } catch {
          entry.message = 'Archive is ready for this visit, but could not be saved on this device. Re-import after closing the app.';
        }
      } else {
        const previous = await current(gameId);
        if (previous.entry.storage === 'device') entry.message = 'This replacement is for this visit. The older saved archive remains until you remove it or replace it with Remember enabled.';
      }
      session.set(gameId, { record, message: entry.message });
      return { ok: true, value: entry };
    }),
    remove: (gameId) => sequence(async () => {
      if (!gameMap.has(gameId)) return failure('unknown-game', 'Choose a game from the library.');
      if (!gameMap.get(gameId)!.roms.length) return { ok: true, value: blank(gameId) };
      try { await transaction('readwrite', (store) => store.delete(gameId)); }
      catch {
        // Do not claim device bytes were deleted after a denied/failed transaction.
        if (!session.has(gameId)) return failure('remove-failed', 'Saved archive could not be removed. Allow device storage and try again.');
        session.delete(gameId);
        return { ok: true, value: blank(gameId, 'Session archive removed. Device storage is unavailable, so any older saved archive could not be removed.') };
      }
      session.delete(gameId); return { ok: true, value: blank(gameId) };
    }),
    exportArchive: (gameId) => sequence(async () => {
      if (!gameMap.has(gameId)) return failure('unknown-game', 'Choose a game from the library.');
      if (!gameMap.get(gameId)!.roms.length) return failure('not-required', 'This game does not need a ROM archive.');
      const value = await current(gameId);
      if (!value.record || value.entry.status !== 'ready') return failure('rom-missing', 'No valid archive is available. Re-import the ZIP first.');
      return { ok: true, value: { blob: new Blob([value.record.bytes.slice(0)], { type: 'application/zip' }), fileName: value.record.fileName } };
    }),
    runtimeMembers: (gameId) => sequence(async () => {
      if (closed) return failure('storage-closed', 'Local ROM storage is closed. Reload to import an archive.');
      if (!gameMap.has(gameId)) return failure('unknown-game', 'Choose a game from the library.');
      if (!gameMap.get(gameId)!.roms.length) return { ok: true, value: [] };
      const value = await current(gameId);
      if (!value.record || value.entry.status !== 'ready') return failure('rom-missing', value.entry.message
        ?? 'Import your compatible ROM ZIP in Local ROMs before playing this game.');
      try {
        // Revalidate at launch, including records restored from device storage.
        // Expected names are ABI aliases: player filenames never become paths.
        const validated = validateRomArchive(gameId, value.record.bytes);
        const members = readZip(value.record.bytes);
        return { ok: true, value: validated.map((member) => ({ expectedName: member.expectedName,
          bytes: members.find((candidate) => candidate.name === member.actualName)!.bytes.slice() })) };
      } catch (error) { return failure(error instanceof ZipError ? error.code : 'stored-invalid',
        'The local ROM set could not be validated for play. Re-import your compatible ZIP.'); }
    }),
    close() { closed = true; database?.close(); database = undefined; session.clear(); },
  };
}
