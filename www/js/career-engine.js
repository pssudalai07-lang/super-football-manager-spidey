/**
 * SUPER FOOTBALL MANAGER BY SPIDEY
 * Player Career Engine: Progression, Season Schedule, Training, Transfers & International Career.
 */

const CareerEngine = (() => {
  const STAGES = [
    { id: 'YOUTH_PROSPECT', label: 'Youth Prospect', minOvr: 0 },
    { id: 'FIRST_TEAM_REGULAR', label: 'First-Team Regular', minOvr: 64 },
    { id: 'DOMESTIC_STAR', label: 'Domestic League Star', minOvr: 69 },
    { id: 'INTERNATIONAL_PLAYER', label: 'National Team Player', minOvr: 72 },
    { id: 'EUROPEAN_CONTENDER', label: 'European League Pro', minOvr: 77 },
    { id: 'WORLD_CLASS_ICON', label: 'World-Class Icon', minOvr: 84 },
    { id: 'FOOTBALL_LEGEND', label: 'Spidey Football Legend', minOvr: 90 }
  ];

  function computeOverall(attrs, position) {
    const { pace: p, shooting: s, passing: pa, dribbling: d, defending: de, physical: ph } = attrs;
    if (position === 'GK') return Math.round(de * 0.45 + ph * 0.30 + pa * 0.15 + p * 0.10);
    if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return Math.round(de * 0.40 + ph * 0.25 + pa * 0.15 + p * 0.12 + d * 0.08);
    if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return Math.round(pa * 0.32 + d * 0.28 + ph * 0.15 + de * 0.13 + s * 0.12);
    return Math.round(s * 0.35 + p * 0.22 + d * 0.23 + ph * 0.12 + pa * 0.08);
  }

  function ensureSeasonFixtures(state) {
    const userClub = state.clubs.find((c) => c.club_id === state.career.current_club_id) || state.clubs[0];
    const leagueId = userClub.league_id;

    state.leagues.forEach((lg) => {
      if (!state.standings[lg.league_id]) {
        const lgClubs = state.clubs.filter((c) => c.league_id === lg.league_id);
        state.standings[lg.league_id] = lgClubs.map((c) => ({
          club_id: c.club_id,
          name: c.name,
          short_name: c.short_name,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          pts: 0
        }));
      }
    });

    const hasPendingFixtures = state.fixtures.some((f) => !f.played && f.league_id === leagueId);
    if (hasPendingFixtures) return;

    const leagueClubs = state.clubs.filter((c) => c.league_id === leagueId);
    const leagueObj = state.leagues.find((l) => l.league_id === leagueId);
    const compName = leagueObj ? leagueObj.name : 'League Championship';

    let week = state.career.current_week;
    const fixtures = [];

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < leagueClubs.length; i++) {
        for (let j = i + 1; j < leagueClubs.length; j++) {
          const home = round === 0 ? leagueClubs[i] : leagueClubs[j];
          const away = round === 0 ? leagueClubs[j] : leagueClubs[i];
          const involvesUser = home.club_id === userClub.club_id || away.club_id === userClub.club_id;
          fixtures.push({
            fixture_id: `FIX_${state.career.current_season}_${leagueId}_${round}_${i}_${j}`,
            week: involvesUser ? week++ : Math.max(state.career.current_week, week - 1),
            league_id: leagueId,
            competition: compName,
            home_club_id: home.club_id,
            away_club_id: away.club_id,
            played: false,
            home_score: null,
            away_score: null,
            is_international: false
          });
        }
      }
    }

    const userPlayer = state.players[state.career.player_id];
    const userNation = state.national_teams.find((n) => n.nation_id === (userPlayer?.nation_id || 'NAT_IND')) || state.national_teams[0];
    const rivalNation = state.national_teams.find((n) => n.nation_id !== userNation.nation_id) || state.national_teams[1];

    if (userNation && rivalNation) {
      fixtures.push({
        fixture_id: `FIX_INT_${state.career.current_season}_W6`,
        week: state.career.current_week + 5,
        league_id: 'INTERNATIONAL',
        competition: 'International Friendly / Qualifiers',
        home_club_id: userNation.nation_id,
        away_club_id: rivalNation.nation_id,
        played: false,
        home_score: null,
        away_score: null,
        is_international: true
      });
    }

    fixtures.sort((a, b) => a.week - b.week);
    state.fixtures = fixtures;
  }

  function updateStanding(state, leagueId, homeId, awayId, homeScore, awayScore) {
    const table = state.standings[leagueId];
    if (!table) return;
    const homeRow = table.find((r) => r.club_id === homeId);
    const awayRow = table.find((r) => r.club_id === awayId);
    if (!homeRow || !awayRow) return;

    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.gf += homeScore;
    homeRow.ga += awayScore;
    awayRow.gf += awayScore;
    awayRow.ga += homeScore;

    if (homeScore > awayScore) {
      homeRow.won += 1;
      homeRow.pts += 3;
      awayRow.lost += 1;
    } else if (awayScore > homeScore) {
      awayRow.won += 1;
      awayRow.pts += 3;
      homeRow.lost += 1;
    } else {
      homeRow.drawn += 1;
      awayRow.drawn += 1;
      homeRow.pts += 1;
      awayRow.pts += 1;
    }

    table.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }

  function getNextUserFixture(state) {
    ensureSeasonFixtures(state);
    const userClubId = state.career.current_club_id;
    const userNationId = state.career.nation_id;

    return state.fixtures.find((f) => {
      if (f.played) return false;
      if (f.is_international) {
        return state.career.national_team_selected && (f.home_club_id === userNationId || f.away_club_id === userNationId);
      }
      return f.home_club_id === userClubId || f.away_club_id === userClubId;
    }) || null;
  }

  function buildClubMatchSquad(state, clubId, includeUser = false) {
    const userId = state.career.player_id;
    const clubPlayers = Object.values(state.players)
      .filter((p) => p.club_id === clubId)
      .sort((a, b) => b.overall - a.overall);

    const lineup = state.lineups[clubId];
    let starters = [];
    let subs = [];

    if (lineup) {
      starters = lineup.starting_xi.map((id) => state.players[id]).filter(Boolean);
      subs = lineup.substitutes.map((id) => state.players[id]).filter(Boolean);
    }

    if (starters.length < 11) {
      starters = clubPlayers.slice(0, 11);
      subs = clubPlayers.slice(11, 16);
    }

    if (includeUser && state.players[userId]) {
      const userP = state.players[userId];
      const trust = state.career.manager_trust;
      const isStarter = trust >= 65 && userP.fitness >= 65;

      starters = starters.filter((p) => p.player_id !== userId);
      subs = subs.filter((p) => p.player_id !== userId);

      if (isStarter) {
        starters.pop();
        starters.unshift(userP);
      } else {
        if (subs.length >= 5) subs.pop();
        subs.unshift(userP);
      }
    }

    return { starters, subs };
  }

  function buildNationalSquad(state, nationId, includeUser = false) {
    const userId = state.career.player_id;
    const pool = Object.values(state.players)
      .filter((p) => p.nation_id === nationId || (nationId === 'NAT_IND' && p.nationality === 'India'))
      .sort((a, b) => b.overall - a.overall);

    const fallbackPool = Object.values(state.players).sort((a, b) => b.overall - a.overall);
    const fullPool = [...pool];
    for (const p of fallbackPool) {
      if (fullPool.length >= 16) break;
      if (!fullPool.some((x) => x.player_id === p.player_id)) fullPool.push(p);
    }

    let starters = fullPool.slice(0, 11);
    let subs = fullPool.slice(11, 16);

    if (includeUser && state.players[userId]) {
      const userP = state.players[userId];
      starters = starters.filter((p) => p.player_id !== userId);
      subs = subs.filter((p) => p.player_id !== userId);
      starters.pop();
      starters.unshift(userP);
    }

    return { starters, subs };
  }

  function simulateOtherWeekFixtures(state, targetWeek) {
    const others = state.fixtures.filter((f) => !f.played && !f.is_international && f.week <= targetWeek &&
      f.home_club_id !== state.career.current_club_id && f.away_club_id !== state.career.current_club_id);

    others.forEach((fix) => {
      const homeClub = state.clubs.find((c) => c.club_id === fix.home_club_id);
      const awayClub = state.clubs.find((c) => c.club_id === fix.away_club_id);
      if (!homeClub || !awayClub) return;

      const hSquad = buildClubMatchSquad(state, homeClub.club_id, false);
      const aSquad = buildClubMatchSquad(state, awayClub.club_id, false);
      const res = MatchEngine.simulateMatch({
        homeClub,
        awayClub,
        homeStarters: hSquad.starters,
        homeSubs: hSquad.subs,
        awayStarters: aSquad.starters,
        awaySubs: aSquad.subs,
        userPlayerId: null,
        competition: fix.competition
      });

      fix.played = true;
      fix.home_score = res.stats.home.score;
      fix.away_score = res.stats.away.score;
      updateStanding(state, fix.league_id, homeClub.club_id, awayClub.club_id, fix.home_score, fix.away_score);
    });
  }

  function processMatchResult(state, fixture, matchResult) {
    const career = state.career;
    const userP = state.players[career.player_id];
    const uStats = matchResult.userStats;

    fixture.played = true;
    fixture.home_score = matchResult.stats.home.score;
    fixture.away_score = matchResult.stats.away.score;

    if (!fixture.is_international) {
      updateStanding(state, fixture.league_id, fixture.home_club_id, fixture.away_club_id, fixture.home_score, fixture.away_score);
      simulateOtherWeekFixtures(state, fixture.week);
    }

    if (uStats && uStats.minutesPlayed > 0) {
      const cs = career.career_stats;
      const prevTotalRating = cs.avg_rating * cs.appearances;

      cs.appearances += 1;
      if (uStats.subbedInAt === 0) cs.starts += 1;
      cs.goals += uStats.goals;
      cs.assists += uStats.assists;
      cs.yellow_cards += uStats.yellowCard ? 1 : 0;
      cs.red_cards += uStats.redCard ? 1 : 0;
      cs.avg_rating = Number(((prevTotalRating + uStats.rating) / cs.appearances).toFixed(2));
      if (matchResult.motm && matchResult.motm.player_id === userP.player_id) {
        cs.motm_awards += 1;
      }

      if (fixture.is_international) {
        cs.international_caps += 1;
        cs.international_goals += uStats.goals;
      }

      userP.fitness = Math.max(42, Math.round(uStats.fitness));
      userP.form = Number(((userP.form * 0.6) + (uStats.rating * 0.4)).toFixed(1));

      if (uStats.rating >= 7.5) {
        career.manager_trust = Math.min(100, career.manager_trust + 6);
        userP.morale = Math.min(100, userP.morale + 5);
        growRandomAttribute(userP, 2);
      } else if (uStats.rating >= 6.6) {
        career.manager_trust = Math.min(100, career.manager_trust + 2);
        userP.morale = Math.min(100, userP.morale + 2);
        growRandomAttribute(userP, 1);
      } else {
        career.manager_trust = Math.max(20, career.manager_trust - 4);
        userP.morale = Math.max(35, userP.morale - 3);
      }
    } else if (userP) {
      userP.fitness = Math.min(100, userP.fitness + 15);
    }

    if (career.manager_trust >= 85) career.squad_role = 'Key Star Player';
    else if (career.manager_trust >= 65) career.squad_role = 'First-Team Starter';
    else career.squad_role = 'Rotation Prospect';

    const nation = state.national_teams.find((n) => n.nation_id === career.nation_id) || state.national_teams[0];
    if (nation && userP && userP.overall >= nation.min_callup_ovr && userP.form >= 6.8) {
      career.national_team_selected = true;
    }

    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (userP.overall >= STAGES[i].minOvr) {
        career.stage = STAGES[i].id;
        break;
      }
    }

    state.match_history.unshift({
      match_id: `MCH_${Date.now()}`,
      week: career.current_week,
      season: career.current_season,
      competition: matchResult.competition,
      home_name: matchResult.homeClub.name,
      away_name: matchResult.awayClub.name,
      home_score: matchResult.stats.home.score,
      away_score: matchResult.stats.away.score,
      user_minutes: uStats ? uStats.minutesPlayed : 0,
      user_goals: uStats ? uStats.goals : 0,
      user_assists: uStats ? uStats.assists : 0,
      user_rating: uStats ? uStats.rating : 0
    });
    if (state.match_history.length > 30) state.match_history.pop();

    career.current_week += 1;
    generateTransferOffers(state);
    evaluateAchievements(state);

    const nextFix = getNextUserFixture(state);
    if (!nextFix) {
      advanceToNextSeason(state);
    }
  }

  function growRandomAttribute(player, points = 1) {
    if (player.overall >= player.potential) return null;
    const keys = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
    const posBias = {
      ST: ['shooting', 'pace', 'dribbling', 'physical'],
      CF: ['shooting', 'dribbling', 'passing', 'pace'],
      LW: ['pace', 'dribbling', 'shooting', 'passing'],
      RW: ['pace', 'dribbling', 'shooting', 'passing'],
      CAM: ['passing', 'dribbling', 'shooting', 'pace'],
      CM: ['passing', 'dribbling', 'physical', 'defending'],
      CDM: ['defending', 'passing', 'physical', 'dribbling'],
      CB: ['defending', 'physical', 'passing', 'pace'],
      LB: ['pace', 'defending', 'passing', 'physical'],
      RB: ['pace', 'defending', 'passing', 'physical'],
      GK: ['defending', 'physical', 'passing', 'pace']
    };
    const pool = posBias[player.position] || keys;
    let upgradedAttr = null;

    for (let i = 0; i < points; i++) {
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      if (player.attributes[chosen] < 99) {
        player.attributes[chosen] += 1;
        upgradedAttr = chosen;
      }
    }
    player.overall = computeOverall(player.attributes, player.position);
    return upgradedAttr;
  }

  function applyTrainingDrill(state, drillType) {
    const userP = state.players[state.career.player_id];
    if (!userP) return { message: 'Player not found.' };

    if (drillType === 'rest') {
      userP.fitness = Math.min(100, userP.fitness + 25);
      userP.morale = Math.min(100, userP.morale + 5);
      return { message: `${userP.name} rested well! Fitness restored to ${userP.fitness}%.` };
    }

    if (userP.fitness < 55) {
      return { message: `Fitness too low (${userP.fitness}%). Rest before intense training!` };
    }

    userP.fitness = Math.max(40, userP.fitness - 8);
    const drillMap = {
      finishing: ['shooting', 'dribbling'],
      playmaking: ['passing', 'dribbling'],
      speed: ['pace', 'dribbling'],
      defending: ['defending', 'physical']
    };

    const targets = drillMap[drillType] || ['passing', 'pace'];
    const attr = targets[Math.floor(Math.random() * targets.length)];

    if (userP.overall < userP.potential && userP.attributes[attr] < 99) {
      userP.attributes[attr] += 1;
      userP.overall = computeOverall(userP.attributes, userP.position);
      return { message: `Drill Complete! +1 ${attr.toUpperCase()} (OVR is now ${userP.overall}).` };
    }

    userP.form = Math.min(9.9, Number((userP.form + 0.2).toFixed(1)));
    return { message: `Sharp session! Match Form boosted to ${userP.form}.` };
  }

  function generateTransferOffers(state) {
    const career = state.career;
    const userP = state.players[career.player_id];
    if (!userP || career.career_stats.appearances < 3) return;

    if (career.current_week % 4 !== 0 && career.transfer_offers.length > 0) return;

    const currentClub = state.clubs.find((c) => c.club_id === career.current_club_id);
    const currentRating = currentClub ? currentClub.rating : 60;

    const eligibleClubs = state.clubs.filter((c) => {
      if (c.club_id === career.current_club_id) return false;
      const diff = c.rating - userP.overall;
      return diff >= -4 && diff <= 6 && c.rating >= currentRating - 2;
    });

    const shuffled = eligibleClubs.sort(() => Math.random() - 0.5).slice(0, 3);
    career.transfer_offers = shuffled.map((club) => {
      const league = state.leagues.find((l) => l.league_id === club.league_id);
      const role = userP.overall >= club.rating ? 'Key Star Player' : 'First-Team Contender';
      return {
        offer_id: `OFR_${club.club_id}_${career.current_week}`,
        club_id: club.club_id,
        club_name: club.name,
        league_name: league ? league.name : 'League',
        country: club.country,
        club_rating: club.rating,
        promised_role: role
      };
    });
  }

  function acceptTransferOffer(state, offerId) {
    const career = state.career;
    const offer = career.transfer_offers.find((o) => o.offer_id === offerId);
    if (!offer) return false;

    const userP = state.players[career.player_id];
    const oldClubId = career.current_club_id;

    career.current_club_id = offer.club_id;
    userP.club_id = offer.club_id;
    career.manager_trust = offer.promised_role === 'Key Star Player' ? 75 : 62;
    career.squad_role = offer.promised_role;
    career.transfer_offers = [];

    state.transfers.unshift({
      transfer_id: `TRF_USER_${Date.now()}`,
      player_id: userP.player_id,
      from_club_id: oldClubId,
      to_club_id: offer.club_id,
      season: career.current_season,
      type: 'Career Transfer',
      source: 'Player Career Mode'
    });

    state.fixtures = [];
    ensureSeasonFixtures(state);
    evaluateAchievements(state);
    return true;
  }

  function advanceToNextSeason(state) {
    const career = state.career;
    const userP = state.players[career.player_id];
    const userClub = state.clubs.find((c) => c.club_id === career.current_club_id);

    if (userClub && state.standings[userClub.league_id]) {
      const table = state.standings[userClub.league_id];
      if (table[0] && table[0].club_id === userClub.club_id) {
        const leagueObj = state.leagues.find((l) => l.league_id === userClub.league_id);
        career.trophies_won.push({
          season: career.current_season,
          name: `${leagueObj ? leagueObj.name : 'League'} Champions`,
          club: userClub.name
        });
      }
    }

    const startYear = parseInt(career.current_season.split('-')[0], 10) || 2025;
    career.current_season = `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
    career.current_week = 1;
    if (userP) {
      userP.age += 1;
      userP.fitness = 100;
    }

    state.standings = {};
    state.fixtures = [];
    ensureSeasonFixtures(state);
  }

  function evaluateAchievements(state) {
    const career = state.career;
    const userP = state.players[career.player_id];
    const cs = career.career_stats;
    const userClub = state.clubs.find((c) => c.club_id === career.current_club_id);
    const unlocked = new Set(career.unlocked_achievements || []);

    if (cs.appearances >= 1) unlocked.add('ACH_DEBUT');
    if (cs.goals >= 1) unlocked.add('ACH_FIRST_GOAL');
    if (career.national_team_selected) unlocked.add('ACH_BLUE_TIGER');
    if (userClub && ['England', 'Spain', 'Italy', 'Germany', 'France'].includes(userClub.country)) {
      unlocked.add('ACH_EURO_MOVE');
    }
    if (userP && userP.overall >= 90 && career.trophies_won.length >= 1) {
      unlocked.add('ACH_LEGEND');
    }

    career.unlocked_achievements = Array.from(unlocked);
  }

  function createCustomProtagonist(state, { name, age, position, nationality, clubId }) {
    const userId = state.career.player_id;
    const club = state.clubs.find((c) => c.club_id === clubId) || state.clubs[0];

    const baseAttrs = {
      ST: { pace: 72, shooting: 71, passing: 61, dribbling: 69, defending: 34, physical: 68 },
      LW: { pace: 76, shooting: 67, passing: 65, dribbling: 74, defending: 36, physical: 60 },
      RW: { pace: 76, shooting: 67, passing: 65, dribbling: 74, defending: 36, physical: 60 },
      CAM: { pace: 71, shooting: 67, passing: 72, dribbling: 74, defending: 44, physical: 61 },
      CM: { pace: 68, shooting: 63, passing: 72, dribbling: 70, defending: 63, physical: 66 },
      CDM: { pace: 65, shooting: 56, passing: 69, dribbling: 64, defending: 71, physical: 71 },
      CB: { pace: 64, shooting: 42, passing: 58, dribbling: 54, defending: 72, physical: 74 },
      LB: { pace: 73, shooting: 50, passing: 64, dribbling: 65, defending: 68, physical: 66 },
      RB: { pace: 73, shooting: 50, passing: 64, dribbling: 65, defending: 68, physical: 66 },
      GK: { pace: 50, shooting: 22, passing: 60, dribbling: 38, defending: 71, physical: 72 }
    }[position] || { pace: 70, shooting: 66, passing: 68, dribbling: 70, defending: 50, physical: 65 };

    const nationObj = state.national_teams.find((n) => n.name.toLowerCase() === nationality.toLowerCase()) || state.national_teams[0];

    state.players[userId] = {
      ...state.players[userId],
      player_id: userId,
      name: name.trim() || 'Spidey',
      age: Number(age) || 18,
      nationality: nationality || 'India',
      club_id: club.club_id,
      nation_id: nationObj ? nationObj.nation_id : 'NAT_IND',
      position: position || 'CAM',
      attributes: baseAttrs,
      overall: computeOverall(baseAttrs, position || 'CAM'),
      potential: 95,
      fitness: 100,
      morale: 80,
      form: 7.2,
      is_custom_protagonist: true
    };

    state.career.current_club_id = club.club_id;
    state.career.nation_id = nationObj ? nationObj.nation_id : 'NAT_IND';
    state.career.manager_trust = 62;
    state.career.squad_role = 'Rotation Prospect';
    state.fixtures = [];
    ensureSeasonFixtures(state);
  }

  return {
    STAGES,
    computeOverall,
    ensureSeasonFixtures,
    getNextUserFixture,
    buildClubMatchSquad,
    buildNationalSquad,
    processMatchResult,
    applyTrainingDrill,
    acceptTransferOffer,
    createCustomProtagonist
  };
})();
