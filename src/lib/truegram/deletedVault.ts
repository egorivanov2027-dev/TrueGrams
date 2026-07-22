// ─────────────────────────────────────────────────────────────────────────────
// TrueGram — хранилище удалённых и изменённых сообщений.
//
// Идея простая: клиент уже получил сообщение (текст + метаданные медиа) до
// того, как отправитель его удалил или отредактировал. Мы просто копируем
// то, что уже есть в памяти клиента, в отдельную IndexedDB-базу — до того,
// как apiMessagesManager применит удаление/правку у себя.
//
// Ограничение: если бинарные данные фото/видео/файла к этому моменту уже
// вытеснены из внутреннего кэша tweb (appDocsManager/appPhotosManager),
// сам файл может быть недоступен для повторного скачивания — мы сохраняем
// метаданные сообщения (включая ссылку на медиа), но не гарантируем, что
// байты медиафайла останутся физически доступны навсегда. Для полной
// гарантии нужно отдельно скачивать и складывать сами blob'ы — это
// следующий шаг, если понадобится.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'truegram-vault';
const DB_VERSION = 1;
const STORE_DELETED = 'deleted';
const STORE_EDITED = 'edited';

const TOGGLE_KEY = 'tg_save_deleted_enabled';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if(dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE_DELETED)) {
        db.createObjectStore(STORE_DELETED, {keyPath: 'key'});
      }
      if(!db.objectStoreNames.contains(STORE_EDITED)) {
        db.createObjectStore(STORE_EDITED, {keyPath: 'key'});
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function makeKey(peerId: string | number, mid: number): string {
  return `${peerId}_${mid}`;
}

// ── Включено / выключено (простой флаг в localStorage — читается синхронно
//    из горячего пути onUpdateDeleteMessages/onUpdateEditMessage) ──────────

export function isVaultEnabled(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVaultEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TOGGLE_KEY, enabled ? '1' : '0');
  } catch {}
}

// ── Запись ──────────────────────────────────────────────────────────────

export async function saveDeletedMessage(peerId: string | number, message: any): Promise<void> {
  if(!message || message.mid === undefined && message.id === undefined) return;

  try {
    const db = await openDb();
    const mid = message.mid ?? message.id;
    const tx = db.transaction(STORE_DELETED, 'readwrite');
    tx.objectStore(STORE_DELETED).put({
      key: makeKey(peerId, mid),
      peerId: String(peerId),
      mid,
      message,
      deletedAt: Date.now()
    });
  } catch(err) {
    console.warn('[truegram-vault] failed to save deleted message', err);
  }
}

export async function saveEditedMessage(peerId: string | number, oldMessage: any): Promise<void> {
  if(!oldMessage || (oldMessage.mid === undefined && oldMessage.id === undefined)) return;

  try {
    const db = await openDb();
    const mid = oldMessage.mid ?? oldMessage.id;
    const key = makeKey(peerId, mid);
    const tx = db.transaction(STORE_EDITED, 'readwrite');
    const store = tx.objectStore(STORE_EDITED);

    const existingReq = store.get(key);
    existingReq.onsuccess = () => {
      const existing = existingReq.result;
      const history: any[] = existing?.history ?? [];
      history.push({message: oldMessage, editedAt: Date.now()});
      store.put({key, peerId: String(peerId), mid, history});
    };
  } catch(err) {
    console.warn('[truegram-vault] failed to save edited message', err);
  }
}

// ── Чтение (для будущего UI — раздел "Удалённые" / история правок) ───────

export async function getDeletedMessages(peerId: string | number): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DELETED, 'readonly');
    const req = tx.objectStore(STORE_DELETED).getAll();
    req.onsuccess = () => {
      const all = (req.result as any[]) || [];
      resolve(all.filter((r) => r.peerId === String(peerId)).sort((a, b) => b.deletedAt - a.deletedAt));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getEditHistory(peerId: string | number, mid: number): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EDITED, 'readonly');
    const req = tx.objectStore(STORE_EDITED).get(makeKey(peerId, mid));
    req.onsuccess = () => resolve(req.result?.history ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearVault(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_DELETED, STORE_EDITED], 'readwrite');
  tx.objectStore(STORE_DELETED).clear();
  tx.objectStore(STORE_EDITED).clear();
}
