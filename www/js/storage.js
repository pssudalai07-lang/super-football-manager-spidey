/**
 * SUPER FOOTBALL MANAGER BY SPIDEY
 * Offline IndexedDB + LocalStorage Persistence Layer
 * Preserves user career progress across real-world DB updates.
 */

const StorageDB = (() => {
  const DB_NAME = 'SuperFootballManagerSpideyDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'game_state';
  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getItem(key) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      const raw = localStorage.getItem(`sfm_${key}`);
      return raw ? JSON.parse(raw) : null;
    }
  }

  async function setItem(key, value) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      localStorage.setItem(`sfm_${key}`, JSON.stringify(value));
    }
  }

  async function fetchJsonModule(fileName) {
    const res = await fetch(`./data/${fileName}`);
    if (!res.ok) throw new Error(`Failed to load ${fileName}`);
    return res.json();
  }

  async function loadOrInitializeGame() {
    const [
      leaguesMod,
      clubsMod,
      playersMod,
      nationsMod,
      lineupsMod,
      transfersMod,
      trophiesMod,
      customMod,
      defaultCareerMod
    ] = await Promise.all([
      fetchJsonModule('leagues.json'),
      fetchJsonModule('clubs.json'),
      fetchJsonModule('players.json'),
      fetchJsonModule('national_teams.json'),
      fetchJsonModule('lineups.json'),
      fetchJsonModule('transfers.json'),
      fetchJsonModule('trophies.json'),
      fetchJsonModule('custom_data.json'),
      fetchJsonModule('player_career.json')
    ]);

    let savedState = await getItem('active_career_state');

    if (!savedState) {
      const playersMap = {};
      playersMod.records.forEach((p) => {
        playersMap[p.player_id] = p;
      });

      savedState = {
        db_version: playersMod.db_version || '1.0.0',
        last_updated: playersMod.last_updated,
        branding: customMod.branding,
        achievements_catalog: customMod.achievements || [],
        leagues: leaguesMod.records,
        clubs: clubsMod.records,
        national_teams: nationsMod.records,
        players: playersMap,
        lineups: lineupsMod.records,
        transfers: transfersMod.records,
        trophies: trophiesMod.records,
        career: defaultCareerMod,
        fixtures: [],
        standings: {},
        match_history: []
      };

      await setItem('active_career_state', savedState);
    } else {
      savedState.leagues = leaguesMod.records;
      savedState.clubs = clubsMod.records;
      savedState.national_teams = nationsMod.records;
      savedState.trophies = trophiesMod.records;
      savedState.achievements_catalog = customMod.achievements || savedState.achievements_catalog;

      const userId = savedState.career.player_id;
      playersMod.records.forEach((incoming) => {
        if (incoming.player_id === userId && savedState.players[userId]) {
          return;
        }
        if (!savedState.players[incoming.player_id]) {
          savedState.players[incoming.player_id] = incoming;
        }
      });

      savedState.db_version = playersMod.db_version || savedState.db_version;
      savedState.last_updated = playersMod.last_updated || savedState.last_updated;
      await setItem('active_career_state', savedState);
    }

    return savedState;
  }

  async function saveState(state) {
    await setItem('active_career_state', state);
  }

  async function resetCareer() {
    try {
      const db = await openDB();
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete('active_career_state');
        tx.oncomplete = () => resolve();
      });
    } catch (_) {
      localStorage.removeItem('sfm_active_career_state');
    }
    return loadOrInitializeGame();
  }

  return {
    loadOrInitializeGame,
    saveState,
    resetCareer
  };
})();
