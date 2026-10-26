/**
 * Mock de Firebase (compat) para tests.
 * Se inyecta con addInitScript ANTES de que la página cargue el SDK real.
 * Reemplaza firebase.firestore(), firebase.auth() y firebase.initializeApp()
 * con implementaciones fake en memoria.
 *
 * Soporta: colecciones anidadas (stock/1/movimientos), get/set/update/delete,
 * add, where('==' / 'in'), orderBy, limit, onSnapshot (colección y doc),
 * runTransaction (atómico: si la función tira, no se aplica nada), batch(),
 * FieldValue.serverTimestamp/increment/delete, auth anónima y
 * email/contraseña (signInWithEmailAndPassword, onAuthStateChanged).
 *
 * Además registra cada operación en window.__firebaseMock.log para que los
 * tests de seguridad puedan afirmar QUÉ intentó leer/escribir la página
 * (p.ej. "pedidos.html no hizo ningún list de pedidos sin login real").
 */

export interface FirebaseMockState {
  /** Colecciones y sus docs: { 'pedidos': { docId: {...} }, 'stock/1/movimientos': {...} } */
  collections?: Record<string, Record<string, any>>;
  /** Si viene, auth.signInAnonymously() falla con este error */
  authError?: { code: string; message: string } | null;
  /** Si true, TODOS los writes fallan con permission-denied */
  denyWrites?: boolean;
  /** Writes a estas colecciones (path exacto, p.ej. 'pedidos') fallan con permission-denied */
  denyWritesTo?: string[];
  /** Lecturas (get/list/listen) de estas colecciones fallan con permission-denied */
  failReadsFrom?: string[];
  /** Delay artificial en ms para operaciones (default 0) */
  latency?: number;
  /** Usuarios email/contraseña válidos: { email: password } */
  authUsers?: Record<string, string>;
}

export function firebaseMockScript(state: FirebaseMockState = {}): string {
  const initial = {
    collections: state.collections || {},
    authError: state.authError || null,
    denyWrites: !!state.denyWrites,
    denyWritesTo: state.denyWritesTo || [],
    failReadsFrom: state.failReadsFrom || [],
    latency: state.latency || 0,
    authUsers: state.authUsers || {}
  };

  return `
    (function() {
      const __state = ${JSON.stringify(initial)};
      const __colListeners = {};   // colPath -> [{query, cb}]
      const __docListeners = {};   // docPath -> [cb]
      const __log = [];
      let __currentUser = null;
      const __authListeners = [];

      function delay() {
        return __state.latency > 0
          ? new Promise(r => setTimeout(r, __state.latency))
          : Promise.resolve();
      }

      function makeTimestamp(v) {
        if (v && typeof v.toDate === 'function') return v;
        const d = v instanceof Date ? v : (typeof v === 'string' ? new Date(v) : new Date());
        return { toDate: () => d, seconds: Math.floor(d.getTime() / 1000), toMillis: () => d.getTime() };
      }

      /* Clon profundo que preserva timestamps (objetos con toDate) */
      function clone(v) {
        if (v === null || v === undefined || typeof v !== 'object') return v;
        if (typeof v.toDate === 'function') return v;
        if (Array.isArray(v)) return v.map(clone);
        const out = {};
        for (const k in v) out[k] = clone(v[k]);
        return out;
      }

      /* Convierte sentinels (serverTimestamp/increment/delete) a valores reales */
      function processData(obj, existing) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(x => processData(x));
        if (typeof obj === 'object') {
          if (typeof obj.toDate === 'function') return obj;
          if (obj instanceof Date) return makeTimestamp(obj);
          if (obj.__isServerTimestamp) return makeTimestamp(new Date());
          if (obj.__increment !== undefined) return (typeof existing === 'number' ? existing : 0) + obj.__increment;
          const out = {};
          for (const k in obj) {
            if (obj[k] && obj[k].__delete) continue;
            out[k] = processData(obj[k], existing && typeof existing === 'object' ? existing[k] : undefined);
          }
          return out;
        }
        return obj;
      }

      function col(path) {
        __state.collections[path] = __state.collections[path] || {};
        return __state.collections[path];
      }
      function parentCol(docPath) { return docPath.split('/').slice(0, -1).join('/'); }
      function lastId(docPath) { return docPath.split('/').slice(-1)[0]; }

      function checkWrite(docPath) {
        if (__state.denyWrites || __state.denyWritesTo.includes(parentCol(docPath))) {
          const e = new Error('Missing or insufficient permissions.');
          e.code = 'permission-denied';
          throw e;
        }
      }

      function checkRead(colPath) {
        if (__state.failReadsFrom.includes(colPath)) {
          const e = new Error('Missing or insufficient permissions.');
          e.code = 'permission-denied';
          throw e;
        }
      }

      function docSnap(docPath) {
        const raw = (__state.collections[parentCol(docPath)] || {})[lastId(docPath)];
        const data = raw === undefined ? undefined : clone(raw);
        return {
          id: lastId(docPath),
          exists: raw !== undefined,
          data: () => (data === undefined ? undefined : clone(data)),
          get: (f) => (data ? data[f] : undefined),
          ref: makeDocRef(docPath)
        };
      }

      function querySnap(colPath, query) {
        const docs = getFilteredDocs(colPath, query).map(d => docSnap(colPath + '/' + d.id));
        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
          forEach: (fn) => docs.forEach(fn),
          docChanges: () => docs.map(d => ({ type: 'added', doc: d }))
        };
      }

      function notify(docPath) {
        const colPath = parentCol(docPath);
        (__colListeners[colPath] || []).forEach(entry => {
          try { entry.cb(querySnap(colPath, entry.query)); } catch (e) { console.warn('mock listener error', e); }
        });
        (__docListeners[docPath] || []).forEach(cb => {
          try { cb(docSnap(docPath)); } catch (e) { console.warn('mock doc listener error', e); }
        });
      }

      function getFilteredDocs(colPath, query) {
        query = query || {};
        const c = __state.collections[colPath] || {};
        let items = Object.entries(c).map(([id, data]) => ({ id, data }));
        (query.wheres || []).forEach(w => {
          items = items.filter(x => {
            const v = x.data[w.field];
            if (w.op === 'in') return (w.value || []).includes(v);
            if (w.op === '!=') return v !== w.value;
            return v === w.value;
          });
        });
        if (query.orderByField) {
          items.sort((a, b) => {
            let av = a.data[query.orderByField];
            let bv = b.data[query.orderByField];
            if (av && av.toDate) av = av.toDate().getTime();
            if (bv && bv.toDate) bv = bv.toDate().getTime();
            const cmp = (av > bv) ? 1 : (av < bv) ? -1 : 0;
            return query.orderByDir === 'desc' ? -cmp : cmp;
          });
        }
        if (query.limitTo) items = items.slice(0, query.limitTo);
        return items;
      }

      function applySet(docPath, data) {
        col(parentCol(docPath))[lastId(docPath)] = processData(data);
      }
      function applyUpdate(docPath, data) {
        const c = col(parentCol(docPath));
        const existing = c[lastId(docPath)];
        if (existing === undefined) {
          const e = new Error('No document to update: ' + docPath);
          e.code = 'not-found';
          throw e;
        }
        const next = { ...existing };
        for (const k in data) {
          if (data[k] && data[k].__delete) { delete next[k]; continue; }
          next[k] = processData(data[k], existing[k]);
        }
        c[lastId(docPath)] = next;
      }
      function applyDelete(docPath) {
        const c = __state.collections[parentCol(docPath)];
        if (c) delete c[lastId(docPath)];
      }

      function makeDocRef(docPath) {
        return {
          id: lastId(docPath),
          path: docPath,
          parent: { path: parentCol(docPath) },
          collection: (sub) => makeCollectionRef(docPath + '/' + sub),
          get: async () => {
            __log.push({ op: 'get', path: docPath });
            await delay();
            checkRead(parentCol(docPath));
            return docSnap(docPath);
          },
          set: async (data, opts) => {
            __log.push({ op: 'set', path: docPath });
            await delay();
            checkWrite(docPath);
            if (opts && opts.merge) {
              const c = col(parentCol(docPath));
              c[lastId(docPath)] = { ...(c[lastId(docPath)] || {}), ...processData(data) };
            } else {
              applySet(docPath, data);
            }
            notify(docPath);
          },
          update: async (data) => {
            __log.push({ op: 'update', path: docPath });
            await delay();
            checkWrite(docPath);
            applyUpdate(docPath, data);
            notify(docPath);
          },
          delete: async () => {
            __log.push({ op: 'delete', path: docPath });
            await delay();
            checkWrite(docPath);
            applyDelete(docPath);
            notify(docPath);
          },
          onSnapshot: (cb, errCb) => {
            __log.push({ op: 'listen-doc', path: docPath });
            __docListeners[docPath] = __docListeners[docPath] || [];
            __docListeners[docPath].push(cb);
            setTimeout(() => { try { cb(docSnap(docPath)); } catch (e) { console.warn(e); } }, 0);
            return () => {
              const arr = __docListeners[docPath] || [];
              const i = arr.indexOf(cb);
              if (i >= 0) arr.splice(i, 1);
            };
          }
        };
      }

      function makeCollectionRef(colPath, query) {
        query = query || {};
        return {
          id: colPath.split('/').slice(-1)[0],
          path: colPath,
          doc: (docId) => makeDocRef(colPath + '/' + (docId || ('auto' + Math.random().toString(36).slice(2, 14)))),
          add: async (data) => {
            const id = 'auto' + Math.random().toString(36).slice(2, 14);
            const docPath = colPath + '/' + id;
            __log.push({ op: 'add', path: docPath });
            await delay();
            checkWrite(docPath);
            applySet(docPath, data);
            notify(docPath);
            return makeDocRef(docPath);
          },
          where: (field, op, value) => makeCollectionRef(colPath, { ...query, wheres: [...(query.wheres || []), { field, op, value }] }),
          orderBy: (field, dir) => makeCollectionRef(colPath, { ...query, orderByField: field, orderByDir: dir || 'asc' }),
          limit: (n) => makeCollectionRef(colPath, { ...query, limitTo: n }),
          get: async () => {
            __log.push({ op: 'list', path: colPath, query: JSON.parse(JSON.stringify(query)) });
            await delay();
            checkRead(colPath);
            return querySnap(colPath, query);
          },
          onSnapshot: (cb, errCb) => {
            __log.push({ op: 'listen-list', path: colPath, query: JSON.parse(JSON.stringify(query)) });
            __colListeners[colPath] = __colListeners[colPath] || [];
            const entry = { query, cb };
            __colListeners[colPath].push(entry);
            try { cb(querySnap(colPath, query)); } catch (e) { console.warn('mock listener error', e); }
            return () => {
              const arr = __colListeners[colPath] || [];
              const idx = arr.indexOf(entry);
              if (idx >= 0) arr.splice(idx, 1);
            };
          }
        };
      }

      /* Escritura atómica: valida todo y recién después aplica */
      function commitOps(ops) {
        ops.forEach(o => checkWrite(o.path));
        const snapshot = JSON.stringify(Object.keys(__state.collections));
        const backup = {};
        ops.forEach(o => {
          const c = parentCol(o.path);
          if (!(c in backup)) backup[c] = clone(__state.collections[c] || {});
        });
        try {
          ops.forEach(o => {
            if (o.type === 'set') applySet(o.path, o.data);
            else if (o.type === 'update') applyUpdate(o.path, o.data);
            else if (o.type === 'delete') applyDelete(o.path);
          });
        } catch (e) {
          for (const c in backup) __state.collections[c] = backup[c];
          throw e;
        }
        ops.forEach(o => notify(o.path));
      }

      function makeBatch(kind) {
        const ops = [];
        const api = {
          set: (ref, data) => { ops.push({ type: 'set', path: ref.path, data }); return api; },
          update: (ref, data) => { ops.push({ type: 'update', path: ref.path, data }); return api; },
          delete: (ref) => { ops.push({ type: 'delete', path: ref.path }); return api; },
          commit: async () => {
            __log.push({ op: kind + '-commit', paths: ops.map(o => o.type + ':' + o.path) });
            await delay();
            commitOps(ops);
          },
          _ops: ops
        };
        return api;
      }

      const FieldValueMock = {
        serverTimestamp: () => ({ __isServerTimestamp: true }),
        increment: (n) => ({ __increment: n }),
        delete: () => ({ __delete: true })
      };

      const firestoreInstance = {
        collection: (name) => makeCollectionRef(name),
        doc: (path) => makeDocRef(path),
        batch: () => makeBatch('batch'),
        runTransaction: async (fn) => {
          __log.push({ op: 'tx-start' });
          const b = makeBatch('tx');
          const tx = {
            get: async (ref) => { __log.push({ op: 'tx-get', path: ref.path }); await delay(); return docSnap(ref.path); },
            set: (ref, data) => { b.set(ref, data); return tx; },
            update: (ref, data) => { b.update(ref, data); return tx; },
            delete: (ref) => { b.delete(ref); return tx; }
          };
          const result = await fn(tx);
          await b.commit();
          return result;
        },
        settings: () => {},
        enablePersistence: async () => {}
      };

      function setUser(u) {
        __currentUser = u;
        authInstance.currentUser = u;
        __authListeners.forEach(cb => { try { cb(u); } catch (e) { console.warn(e); } });
      }

      const authInstance = {
        currentUser: null,
        signInAnonymously: async () => {
          __log.push({ op: 'auth-anonymous' });
          if (__state.authError) {
            const err = new Error(__state.authError.message);
            err.code = __state.authError.code;
            throw err;
          }
          const user = { uid: 'test-anon-' + Math.random().toString(36).slice(2, 8), isAnonymous: true, email: null,
                         providerData: [], getIdTokenResult: async () => ({ claims: { firebase: { sign_in_provider: 'anonymous' } } }) };
          setUser(user);
          return { user };
        },
        signInWithEmailAndPassword: async (email, password) => {
          __log.push({ op: 'auth-password', email });
          await delay();
          if (__state.authUsers[email] === undefined || __state.authUsers[email] !== password) {
            const err = new Error('auth/invalid-credential');
            err.code = 'auth/invalid-credential';
            throw err;
          }
          const user = { uid: 'test-staff-' + email, isAnonymous: false, email,
                         providerData: [{ providerId: 'password', email }],
                         getIdTokenResult: async () => ({ claims: { email, firebase: { sign_in_provider: 'password' } } }) };
          setUser(user);
          return { user };
        },
        signOut: async () => { __log.push({ op: 'auth-signout' }); setUser(null); },
        onAuthStateChanged: (cb) => {
          __authListeners.push(cb);
          setTimeout(() => { try { cb(__currentUser); } catch (e) { console.warn(e); } }, 0);
          return () => { const i = __authListeners.indexOf(cb); if (i >= 0) __authListeners.splice(i, 1); };
        },
        setPersistence: async () => {}
      };

      window.firebase = {
        apps: [],
        initializeApp: () => { window.firebase.apps.push({ name: '[DEFAULT]' }); return { name: '[DEFAULT]' }; },
        app: () => ({ name: '[DEFAULT]' }),
        firestore: () => firestoreInstance,
        auth: () => authInstance
      };
      window.firebase.firestore.FieldValue = FieldValueMock;
      window.firebase.firestore.Timestamp = { now: () => makeTimestamp(new Date()), fromDate: (d) => makeTimestamp(d) };
      window.firebase.auth.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };

      window.__firebaseMock = {
        setCollection: (name, docs) => {
          __state.collections[name] = docs;
          Object.keys(docs).forEach(id => notify(name + '/' + id));
          (__colListeners[name] || []).forEach(entry => entry.cb(querySnap(name, entry.query)));
        },
        getCollection: (name) => clone(__state.collections[name] || {}),
        getAllCollections: () => clone(__state.collections),
        setDoc: (colName, docId, data) => {
          col(colName)[docId] = data;
          notify(colName + '/' + docId);
        },
        setAuthError: (err) => { __state.authError = err; },
        setDenyWrites: (v) => { __state.denyWrites = !!v; },
        setDenyWritesTo: (arr) => { __state.denyWritesTo = arr || []; },
        setLatency: (ms) => { __state.latency = ms; },
        log: __log,
        clear: () => {
          Object.keys(__state.collections).forEach(k => delete __state.collections[k]);
          Object.keys(__colListeners).forEach(k => __colListeners[k].splice(0));
        }
      };
    })();
  `;
}
