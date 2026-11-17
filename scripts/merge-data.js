/**
 * SUPER FOOTBALL MANAGER BY SPIDEY
 * Unified Database Merger & Deduplication Engine
 */

const fs = require('fs');
const path = require('path');

const DB_VERSION = '1.0.0';
const LAST_UPDATED = new Date().toISOString().split('T')[0];

const PATHS = {
  rawReal: path.join(__dirname, '../data/raw_real'),
  rawCustom: path.join(__dirname, '../data/raw_custom'),
  userSave: path.join(__dirname, '../data/user_save'),
  output: path.join(__dirname, '../www/data')
};

if (!fs.existsSync(PATHS.output)) {
  fs.mkdirSync(PATHS.output, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`[WARN] Could not parse ${filePath}: ${err.message}`);
  }
  return fallback;
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(PATHS.output, fileName), JSON.stringify(data, null, 2), 'utf8');
  console.log(`[OK] Generated ${fileName}`);
}

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function clampAttr(val, fallback = 60) {
  const num = Number(val);
  if (Number.isNaN(num)) return fallback;
  return Math.max(1, Math.min(99, Math.round(num)));
}

function computeOverall(attrs, position) {
  const p = clampAttr(attrs.pace, 60);
  const s = clampAttr(attrs.shooting, 60);
  const pa = clampAttr(attrs.passing, 60);
  const d = clampAttr(attrs.dribbling, 60);
  const de = clampAttr(attrs.defending, 60);
  const ph = clampAttr(attrs.physical, 60);

  if (position === 'GK') {
    return Math.round(de * 0.45 + ph * 0.30 + pa * 0.15 + p * 0.10);
  }
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) {
    return Math.round(de * 0.40 + ph * 0.25 + pa * 0.15 + p * 0.12 + d * 0.08);
  }
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) {
    return Math.round(pa * 0.32 + d * 0.28 + ph * 0.15 + de * 0.13 + s * 0.12);
  }
  return Math.round(s * 0.35 + p * 0.22 + d * 0.23 + ph * 0.12 + pa * 0.08);
}

function generateSquadDepth(club, existingSquad, existingIds) {
  const neededPositions = [
    'GK', 'LB', 'CB', 'CB', 'RB',
    'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST',
    'GK', 'CB', 'CM', 'LW', 'ST'
  ];

  const firstNames = ['Arjun', 'Rohan', 'Vikram', 'Karthik', 'Nikhil', 'Lucas', 'Mateo', 'Liam', 'Noah', 'Hugo', 'Leo', 'Sam', 'Dev', 'Aarav', 'Kabir', 'Marco'];
  const lastNames = ['Sharma', 'Nair', 'Singh', 'Das', 'Verma', 'Silva', 'Lopez', 'Walker', 'Gomez', 'Moreau', 'Costa', 'Patel', 'Rao', 'Kaur', 'Bhatt', 'Rossi'];

  const generated = [];
  const currentPosCounts = {};
  existingSquad.forEach((p) => {
    currentPosCounts[p.position] = (currentPosCounts[p.position] || 0) + 1;
  });

  let idx = 0;
  for (const pos of neededPositions) {
    if (existingSquad.length + generated.length >= 16) break;
    if ((currentPosCounts[pos] || 0) > 0) {
      currentPosCounts[pos] -= 1;
      continue;
    }

    idx += 1;
    const base = Math.max(48, Math.min(86, (club.rating || 65) - 2 + (idx % 5)));
    const isGK = pos === 'GK';
    const isDef = ['CB', 'LB', 'RB'].includes(pos);
    const isFwd = ['ST', 'LW', 'RW'].includes(pos);

    const attrs = {
      pace: clampAttr(isGK ? base - 15 : base + (isFwd ? 4 : 0)),
      shooting: clampAttr(isGK ? 20 : isDef ? base - 14 : base + (isFwd ? 4 : -2)),
      passing: clampAttr(base + (pos === 'CM' || pos === 'CAM' ? 4 : -2)),
      dribbling: clampAttr(isGK ? 25 : base + (isFwd || pos === 'CAM' ? 3 : -3)),
      defending: clampAttr(isGK ? base + 3 : isDef ? base + 4 : base - 16),
      physical: clampAttr(base + (isDef || pos === 'ST' ? 3 : -1))
    };

    const pid = `PLR_DEPTH_${club.club_id}_${idx}`;
    if (existingIds.has(pid)) continue;
    existingIds.add(pid);

    const fn = firstNames[(idx + club.club_id.length) % firstNames.length];
    const ln = lastNames[(idx * 3 + club.name.length) % lastNames.length];

    generated.push({
      player_id: pid,
      name: `${fn} ${ln}`,
      age: 19 + (idx % 11),
      nationality: club.country || 'India',
      club_id: club.club_id,
      nation_id: club.country === 'India' ? 'NAT_IND' : null,
      position: pos,
      attributes: attrs,
      overall: computeOverall(attrs, pos),
      potential: clampAttr(base + 6),
      fitness: 100,
      morale: 75,
      form: 7.0,
      is_custom_protagonist: false,
      season: '2025-26',
      source: 'Engine Squad Depth',
      last_updated: LAST_UPDATED
    });
  }

  return generated;
}

function runMerge() {
  console.log('=== SUPER FOOTBALL MANAGER BY SPIDEY: DATABASE MERGER ===');

  const realLeagues = readJsonSafe(path.join(PATHS.rawReal, 'leagues.json'), []);
  const realClubs = readJsonSafe(path.join(PATHS.rawReal, 'clubs.json'), []);
  const realPlayers = readJsonSafe(path.join(PATHS.rawReal, 'players.json'), []);
  const realNations = readJsonSafe(path.join(PATHS.rawReal, 'national_teams.json'), []);
  const realTransfers = readJsonSafe(path.join(PATHS.rawReal, 'transfers.json'), []);

  const customData = readJsonSafe(path.join(PATHS.rawCustom, 'custom_data.json'), {
    branding: {
      game_title: 'SUPER FOOTBALL MANAGER BY SPIDEY',
      creator: 'Spidey',
      mode: 'PLAYER_CAREER_ONLY'
    },
    custom_leagues: [],
    custom_clubs: [],
    custom_players: [],
    custom_tournaments: [],
    achievements: []
  });

  const existingCareer = readJsonSafe(path.join(PATHS.userSave, 'player_career.json'), null);

  // 1. Merge Leagues
  const leagueMap = new Map();
  [...realLeagues, ...(customData.custom_leagues || [])].forEach((lg) => {
    if (!lg.league_id) return;
    leagueMap.set(lg.league_id, {
      league_id: lg.league_id,
      name: lg.name,
      country: lg.country || 'International',
      tier: lg.tier || 1,
      reputation: lg.reputation || 60,
      season: lg.season || '2025-26',
      source: lg.source || 'Open/Custom Dataset',
      last_updated: lg.last_updated || LAST_UPDATED
    });
  });
  const mergedLeagues = Array.from(leagueMap.values());

  // 2. Merge Clubs
  const clubMap = new Map();
  [...realClubs, ...(customData.custom_clubs || [])].forEach((cl) => {
    if (!cl.club_id) return;
    clubMap.set(cl.club_id, {
      club_id: cl.club_id,
      name: cl.name,
      short_name: cl.short_name || cl.name.slice(0, 3).toUpperCase(),
      league_id: cl.league_id,
      country: cl.country || 'India',
      stadium: cl.stadium || `${cl.name} Stadium`,
      rating: clampAttr(cl.rating, 65),
      formation: cl.formation || '4-3-3',
      tactical_style: cl.tactical_style || 'Balanced',
      source: cl.source || 'Open/Custom Dataset',
      last_updated: cl.last_updated || LAST_UPDATED
    });
  });
  const mergedClubs = Array.from(clubMap.values());

  // 3. Merge National Teams
  const nationMap = new Map();
  realNations.forEach((nt) => {
    if (!nt.nation_id) return;
    nationMap.set(nt.nation_id, {
      nation_id: nt.nation_id,
      name: nt.name,
      code: nt.code || nt.name.slice(0, 3).toUpperCase(),
      confederation: nt.confederation || 'AFC',
      rating: clampAttr(nt.rating, 65),
      formation: nt.formation || '4-2-3-1',
      min_callup_ovr: nt.min_callup_ovr || 65,
      source: nt.source || 'Open Dataset',
      last_updated: nt.last_updated || LAST_UPDATED
    });
  });
  const mergedNations = Array.from(nationMap.values());

  // 4. Merge & Deduplicate Players
  const playerById = new Map();
  const dedupeLookup = new Map();

  [...realPlayers, ...(customData.custom_players || [])].forEach((pl) => {
    const normKey = `${normalizeKey(pl.name)}_${normalizeKey(pl.nationality)}`;
    const matchedId = pl.player_id && playerById.has(pl.player_id)
      ? pl.player_id
      : dedupeLookup.get(normKey);

    const finalId = matchedId || pl.player_id || `PLR_${normalizeKey(pl.name).toUpperCase()}`;
    const existing = playerById.get(finalId) || {};

    const attrs = {
      pace: clampAttr(pl.attributes?.pace ?? existing.attributes?.pace, 62),
      shooting: clampAttr(pl.attributes?.shooting ?? existing.attributes?.shooting, 60),
      passing: clampAttr(pl.attributes?.passing ?? existing.attributes?.passing, 62),
      dribbling: clampAttr(pl.attributes?.dribbling ?? existing.attributes?.dribbling, 62),
      defending: clampAttr(pl.attributes?.defending ?? existing.attributes?.defending, 55),
      physical: clampAttr(pl.attributes?.physical ?? existing.attributes?.physical, 63)
    };

    const position = pl.position || existing.position || 'CM';
    const overall = pl.overall ? clampAttr(pl.overall) : computeOverall(attrs, position);

    const unifiedPlayer = {
      player_id: finalId,
      name: pl.name || existing.name,
      age: Number(pl.age || existing.age || 21),
      nationality: pl.nationality || existing.nationality || 'India',
      club_id: pl.club_id || existing.club_id || null,
      nation_id: pl.nation_id || existing.nation_id || null,
      position,
      attributes: attrs,
      overall,
      potential: clampAttr(pl.potential ?? existing.potential, Math.min(99, overall + 8)),
      fitness: clampAttr(pl.fitness ?? existing.fitness, 100),
      morale: clampAttr(pl.morale ?? existing.morale, 75),
      form: Number(pl.form ?? existing.form ?? 7.0),
      is_custom_protagonist: Boolean(pl.is_custom_protagonist || existing.is_custom_protagonist),
      season: pl.season || existing.season || '2025-26',
      source: pl.source || existing.source || 'Open/Custom Dataset',
      last_updated: pl.last_updated || LAST_UPDATED
    };

    playerById.set(finalId, unifiedPlayer);
    dedupeLookup.set(normKey, finalId);
  });

  // 5. Ensure every club has a playable 16-player squad
  const allIds = new Set(playerById.keys());
  mergedClubs.forEach((club) => {
    const squad = Array.from(playerById.values()).filter((p) => p.club_id === club.club_id);
    if (squad.length < 16) {
      const fillers = generateSquadDepth(club, squad, allIds);
      fillers.forEach((fp) => playerById.set(fp.player_id, fp));
    }
  });

  const mergedPlayers = Array.from(playerById.values());

  // 6. Build Positional Starting Lineups per Club
  const lineups = {};
  mergedClubs.forEach((club) => {
    const squad = mergedPlayers
      .filter((p) => p.club_id === club.club_id)
      .sort((a, b) => b.overall - a.overall);

    const gk = squad.filter((p) => p.position === 'GK');
    const defs = squad.filter((p) => ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.position));
    const mids = squad.filter((p) => ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p.position));
    const fwds = squad.filter((p) => ['ST', 'CF', 'LW', 'RW'].includes(p.position));

    const xi = [];
    if (gk[0]) xi.push(gk[0]);
    xi.push(...defs.slice(0, 4), ...mids.slice(0, 3), ...fwds.slice(0, 3));

    const xiIds = new Set(xi.map((p) => p.player_id));
    for (const p of squad) {
      if (xi.length >= 11) break;
      if (!xiIds.has(p.player_id)) {
        xi.push(p);
        xiIds.add(p.player_id);
      }
    }

    const subs = squad.filter((p) => !xiIds.has(p.player_id)).slice(0, 5);

    lineups[club.club_id] = {
      club_id: club.club_id,
      formation: club.formation,
      starting_xi: xi.map((p) => p.player_id),
      substitutes: subs.map((p) => p.player_id),
      last_updated: LAST_UPDATED
    };
  });

  // 7. Preserve or Initialize Player Career
  const protagonist = mergedPlayers.find((p) => p.is_custom_protagonist) || mergedPlayers[0];
  const playerCareer = existingCareer || {
    db_version: DB_VERSION,
    career_id: 'CAREER_SPIDEY_001',
    player_id: protagonist ? protagonist.player_id : 'PLR_SPIDEY_PRO',
    stage: 'YOUTH_PROSPECT',
    current_season: '2025-26',
    current_week: 1,
    current_club_id: protagonist ? protagonist.club_id : 'CLB_IND_CHENNAI',
    national_team_selected: false,
    nation_id: 'NAT_IND',
    manager_trust: 58,
    squad_role: 'Rotation Prospect',
    career_stats: {
      appearances: 0,
      starts: 0,
      goals: 0,
      assists: 0,
      yellow_cards: 0,
      red_cards: 0,
      avg_rating: 0.0,
      motm_awards: 0,
      international_caps: 0,
      international_goals: 0
    },
    trophies_won: [],
    unlocked_achievements: [],
    transfer_offers: []
  };

  const metaHeader = {
    db_version: DB_VERSION,
    last_updated: LAST_UPDATED,
    game_title: customData.branding?.game_title || 'SUPER FOOTBALL MANAGER BY SPIDEY'
  };

  writeJson('leagues.json', { ...metaHeader, count: mergedLeagues.length, records: mergedLeagues });
  writeJson('clubs.json', { ...metaHeader, count: mergedClubs.length, records: mergedClubs });
  writeJson('players.json', { ...metaHeader, count: mergedPlayers.length, records: mergedPlayers });
  writeJson('national_teams.json', { ...metaHeader, count: mergedNations.length, records: mergedNations });
  writeJson('lineups.json', { ...metaHeader, records: lineups });
  writeJson('transfers.json', { ...metaHeader, records: realTransfers });
  writeJson('fixtures.json', { ...metaHeader, records: [] });
  writeJson('match_history.json', { ...metaHeader, records: [] });
  writeJson('trophies.json', { ...metaHeader, records: customData.custom_tournaments || [] });
  writeJson('custom_data.json', { ...metaHeader, ...customData });
  writeJson('player_career.json', playerCareer);

  console.log('=== MERGE COMPLETE: ALL 11 DATABASE MODULES READY ===');
}

runMerge();
