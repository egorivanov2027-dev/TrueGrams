// Импорт Telethon/Pyrogram .session файлов в TrueGrams

declare global {
  interface Window {
    initSqlJs: (config: {locateFile: (f: string) => string}) => Promise<any>;
    _sqlJsReady: any;
  }
}

const SQL_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0';

async function loadSqlJs(): Promise<any> {
  if(window._sqlJsReady) return window._sqlJsReady;

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${SQL_CDN}/sql-wasm.js`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Не удалось загрузить sql.js'));
    document.head.appendChild(s);
  });

  window._sqlJsReady = await window.initSqlJs({
    locateFile: (f: string) => `${SQL_CDN}/${f}`
  });

  return window._sqlJsReady;
}

interface ParsedSession {
  dcId: number;
  authKey: Uint8Array;
  userId: number;
}

async function parseSessionFile(file: File): Promise<ParsedSession> {
  const SQL = await loadSqlJs();
  const buf = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buf));

  try {
    const res = db.exec('SELECT dc_id, auth_key, user_id FROM sessions LIMIT 1');
    if(!res.length || !res[0].values.length) {
      throw new Error('Сессия не найдена. Убедись что это .session файл от Telethon или Pyrogram');
    }
    const [dcId, authKeyBlob, userId] = res[0].values[0] as [number, Uint8Array, number];
    return {dcId: Number(dcId), authKey: authKeyBlob, userId: Number(userId) || 0};
  } finally {
    db.close();
  }
}

async function injectIntoIndexedDB(
  dbName: string,
  dcId: number,
  authKeyArr: number[],
  userId: number
): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => resolve();
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const stores = Array.from(db.objectStoreNames);
      if(!stores.length) { db.close(); return resolve(); }
      try {
        const tx = db.transaction(stores, 'readwrite');
        const store = tx.objectStore(stores[0]);
        store.put(authKeyArr, `dc${dcId}_auth_key`);
        store.put(dcId, 'dc_id');
        store.put({id: userId, dcID: dcId}, 'user_auth');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      } catch { db.close(); resolve(); }
    };
  });
}

async function injectSession(session: ParsedSession): Promise<void> {
  const {dcId, authKey, userId} = session;
  const authKeyArr = Array.from(authKey);

  // localStorage — разные форматы в разных версиях tweb
  for(const prefix of ['', 'tt-']) {
    localStorage.setItem(`${prefix}dc${dcId}_auth_key`, JSON.stringify(authKeyArr));
    localStorage.setItem(`${prefix}dc_id`, String(dcId));
    localStorage.setItem(`${prefix}user_auth`, JSON.stringify({id: userId, dcID: dcId}));
  }

  // IndexedDB — новые версии tweb
  for(const dbName of ['tweb', 'tt', 'telegram-k', 'telegram']) {
    await injectIntoIndexedDB(dbName, dcId, authKeyArr, userId);
  }
}

export async function importSessionFile(file: File): Promise<void> {
  const session = await parseSessionFile(file);
  await injectSession(session);
  window.location.reload();
}

export function createSessionImportButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn-transparent session-import-btn';
  btn.style.cssText = [
    'color: var(--color-primary, #3390ec)',
    'font-weight: 500',
    'text-transform: uppercase',
    'cursor: pointer',
    'background: none',
    'border: none',
    'padding: 12px 0',
    'font-size: 14px',
    'letter-spacing: 0.03em',
    'display: block',
    'width: 100%',
    'text-align: center'
  ].join(';');
  btn.textContent = 'ВОЙТИ ЧЕРЕЗ ФАЙЛ СЕССИИ >';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.session,.txt,.db';
  input.style.display = 'none';
  document.body.appendChild(input);

  btn.onclick = () => input.click();

  input.onchange = async () => {
    const file = input.files?.[0];
    if(!file) return;
    btn.textContent = 'ЗАГРУЗКА...';
    btn.disabled = true;
    try {
      await importSessionFile(file);
    } catch(e: any) {
      alert('Ошибка: ' + (e?.message || 'Неизвестная ошибка'));
      btn.textContent = 'ВОЙТИ ЧЕРЕЗ ФАЙЛ СЕССИИ >';
      btn.disabled = false;
      input.value = '';
    }
  };

  return btn;
}
