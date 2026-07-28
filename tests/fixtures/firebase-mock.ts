/**
 * Mock de Firebase para tests.
 * Se inyecta con addInitScript ANTES de que la página cargue el SDK real.
 * Reemplaza firebase.firestore(), firebase.auth() y firebase.initializeApp()
 * con implementaciones fake que responden con datos controlados.
 */

export interface FirebaseMockState {
  /** Colecciones y sus docs. { colName: { docId: {...data} } } */
  collections?: Record<string, Record<string, any>>;
  /** Si true, auth.signInAnonymously() falla con este error */
  authError?: { code: string; message: string } | null;
  /** Si true, todos los writes fallan con permission-denied */
  denyWrites?: boolean;
  /** Delay artificial en ms para operaciones (default 0) */
  latency?: number;
}

/**
 * Devuelve el script que se inyecta en la página.
 * Ejecuta ANTES de que se cargue firebase-app-compat.js.
 */
export function firebaseMockScript(state: FirebaseMockState = {}): string {
  const initial = {
    collections: state.collections || {},
    authError: state.authError || null,
    denyWrites: !!state.denyWrites,
    latency: state.latency || 0
  };

  return `
    (function() {
      const __state = ${JSON.stringify(initial)};
      const __listeners = {};  // colName -> array of {query, callback}

      function delay() {
        return __state.latency > 0
          ? new Promise(r => setTimeout(r, __state.latency))
          : Promise.resolve();
      }

      function makeTimestamp(v) {
        if (v && typeof v.toDate === 'function') return v;
        const d = v instanceof Date ? v : (typeof v === 'string' ? new Date(v) : new Date());
        return { toDate: () => d, seconds: Math.floor(d.getTime() / 1000) };
      }

      // Convierte serverTimestamp() sentinel a un timestamp real
      function processData(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(processData);
        if (typeof obj === 'object') {
          if (obj.__isServerTimestamp) return makeTimestamp(new Date());
          const out = {};
          for (const k in obj) out[k] = processData(obj[k]);
          return out;
        }
        return obj;
      }

      function notifyListeners(colName) {
        const l = __listeners[colName] || [];
        l.forEach(entry => {
          try {
            const docs = getFilteredDocs(colName, entry.query);
            const changes = docs.map(d => ({
              type: 'added',
              doc: { id: d.id, data: () => d.data, exists: true }
            }));
            entry.callback({
              docs: docs.map(d => ({ id: d.id, data: () => d.data, exists: true, ref: makeDocRef(colName, d.id) })),
              docChanges: () => changes,
              empty: docs.length === 0,
              size: docs.length
            });
          } catch (e) { console.warn('mock listener error', e); }
        });
      }

      function getFilteredDocs(colName, query) {
        query = query || {};
        const col = __state.collections[colName] || {};
        let items = Object.entries(col).map(([id, data]) => ({ id, data }));
        // where filter
        if (query.whereField) {
          items = items.filter(x => x.data[query.whereField] === query.whereValue);
        }
        // orderBy (asc/desc)
        if (query.orderByField) {
          items.sort((a, b) => {
            const av = a.data[query.orderByField];
            const bv = b.data[query.orderByField];
            const cmp = (av > bv) ? 1 : (av < bv) ? -1 : 0;
            return query.orderByDir === 'desc' ? -cmp : cmp;
          });
        }
        if (query.limitTo) items = items.slice(0, query.limitTo);
        return items;
      }

      function makeDocRef(colName, docId) {
        return {
          id: docId,
          path: colName + '/' + docId,
          get: async () => {
            await delay();
            const doc = (__state.collections[colName] || {})[docId];
            return {
              id: docId,
              exists: !!doc,
              data: () => doc || null,
              ref: makeDocRef(colName, docId)
            };
          },
          set: async (data) => {
            await delay();
            if (__state.denyWrites) throw new Error('permission-denied');
            __state.collections[colName] = __state.collections[colName] || {};
            __state.collections[colName][docId] = processData(data);
            notifyListeners(colName);
            return undefined;
          },
          update: async (data) => {
            await delay();
            if (__state.denyWrites) throw new Error('permission-denied');
            __state.collections[colName] = __state.collections[colName] || {};
            const existing = __state.collections[colName][docId] || {};
            __state.collections[colName][docId] = { ...existing, ...processData(data) };
            notifyListeners(colName);
            return undefined;
          },
          delete: async () => {
            await delay();
            if (__state.denyWrites) throw new Error('permission-denied');
            if (__state.collections[colName]) delete __state.collections[colName][docId];
            notifyListeners(colName);
            return undefined;
          },
          onSnapshot: (successCb) => {
            const doc = (__state.collections[colName] || {})[docId];
            successCb({
              id: docId,
              exists: !!doc,
              data: () => doc || null
            });
            return () => {};
          }
        };
      }

      function makeCollectionRef(colName, query) {
        query = query || {};
        return {
          doc: (docId) => makeDocRef(colName, docId || 'auto-' + Math.random().toString(36).slice(2)),
          add: async (data) => {
            await delay();
            if (__state.denyWrites) throw new Error('permission-denied');
            const id = 'auto-' + Math.random().toString(36).slice(2, 12);
            __state.collections[colName] = __state.collections[colName] || {};
            __state.collections[colName][id] = processData(data);
            notifyListeners(colName);
            return makeDocRef(colName, id);
          },
          where: (field, op, value) => makeCollectionRef(colName, { ...query, whereField: field, whereValue: value }),
          orderBy: (field, dir) => makeCollectionRef(colName, { ...query, orderByField: field, orderByDir: dir || 'asc' }),
          limit: (n) => makeCollectionRef(colName, { ...query, limitTo: n }),
          get: async () => {
            await delay();
            const docs = getFilteredDocs(colName, query);
            return {
              docs: docs.map(d => ({ id: d.id, data: () => d.data, exists: true, ref: makeDocRef(colName, d.id) })),
              empty: docs.length === 0,
              size: docs.length
            };
          },
          onSnapshot: (successCb, errorCb) => {
            __listeners[colName] = __listeners[colName] || [];
            const entry = { query, callback: successCb };
            __listeners[colName].push(entry);
            // fire inicial
            const docs = getFilteredDocs(colName, query);
            successCb({
              docs: docs.map(d => ({ id: d.id, data: () => d.data, exists: true, ref: makeDocRef(colName, d.id) })),
              docChanges: () => docs.map(d => ({ type: 'added', doc: { id: d.id, data: () => d.data, exists: true } })),
              empty: docs.length === 0,
              size: docs.length
            });
            return () => {
              const idx = __listeners[colName].indexOf(entry);
              if (idx >= 0) __listeners[colName].splice(idx, 1);
            };
          }
        };
      }

      // Firestore sentinel para serverTimestamp
      const FieldValueMock = {
        serverTimestamp: () => ({ __isServerTimestamp: true })
      };

      const firestoreInstance = {
        collection: (name) => makeCollectionRef(name)
      };

      const authInstance = {
        signInAnonymously: async () => {
          if (__state.authError) {
            const err = new Error(__state.authError.message);
            err.code = __state.authError.code;
            throw err;
          }
          return { user: { uid: 'test-uid-' + Math.random().toString(36).slice(2, 8), isAnonymous: true } };
        }
      };

      // Mock del firebase namespace global
      window.firebase = {
        initializeApp: () => ({ name: '[DEFAULT]' }),
        firestore: () => firestoreInstance,
        auth: () => authInstance
      };
      // Firestore.FieldValue (para serverTimestamp)
      window.firebase.firestore.FieldValue = FieldValueMock;

      // Expone helpers para tests (setear datos, resetear estado)
      window.__firebaseMock = {
        setCollection: (name, docs) => {
          __state.collections[name] = docs;
          notifyListeners(name);
        },
        getCollection: (name) => __state.collections[name] || {},
        setDoc: (colName, docId, data) => {
          __state.collections[colName] = __state.collections[colName] || {};
          __state.collections[colName][docId] = data;
          notifyListeners(colName);
        },
        setAuthError: (err) => { __state.authError = err; },
        setDenyWrites: (v) => { __state.denyWrites = !!v; },
        clear: () => {
          Object.keys(__state.collections).forEach(k => delete __state.collections[k]);
          Object.keys(__listeners).forEach(k => __listeners[k].splice(0));
        }
      };
    })();
  `;
}
