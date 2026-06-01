const PREFIX = 'ladepark:';

export function serializePark(park) {
  return JSON.stringify(park);
}

export function parsePark(text) {
  return JSON.parse(text);
}

export function createStore(adapter) {
  return {
    savePark(park) {
      const id = park.id || `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const record = { ...park, id };
      adapter.set(PREFIX + id, serializePark(record));
      return id;
    },
    loadPark(id) {
      const raw = adapter.get(PREFIX + id);
      return raw ? parsePark(raw) : null;
    },
    deletePark(id) {
      adapter.remove(PREFIX + id);
    },
    listParks() {
      return adapter.keys()
        .filter(k => k.startsWith(PREFIX))
        .map(k => parsePark(adapter.get(k)))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
  };
}

export function localStorageAdapter() {
  return {
    get: k => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: k => localStorage.removeItem(k),
    keys: () => Object.keys(localStorage)
  };
}
