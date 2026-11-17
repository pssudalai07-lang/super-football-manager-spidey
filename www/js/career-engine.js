/**
 * SUPER FOOTBALL MANAGER BY SPIDEY (v3.0)
 * Unified Engine: Player Career + Team Manager + Golden Boot + Ballon d'Or + World Rankings + Knockout Cup
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

  const TRAITS_CATALOG = [
    { id: 'TRT_FINISHER', name: 'Clinical Finisher', desc: '+4 Shooting boost in decisive moments', reqGoals: 3 },
    { id: 'TRT_VISION', name: 'Playmaker Vision', desc: '+4 Passing & higher assist chance', reqAssists: 3 },
    { id: 'TRT_ENGINE', name: 'Tireless Engine', desc: '+4 Physical & slower match fatigue', reqApps: 5 },
    { id: 'TRT_DRIBBLER', name: 'Speed Dribbler', desc: '+4 Pace & Dribbling', reqRating: 7.4 }
  ];

  function computeOverall(attrs, position) {
    const { pace: p, shooting: s, passing: pa, dribbling: d, defending: de, physical: ph } = attrs;
    if (position === 'GK') return Math.round(de * 0.45 + ph * 0.30 + pa * 0.15 + p * 0.10);
    if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return Math.round(de * 0.40 + ph * 0.25 + pa * 0.15 + p * 0.12 + d * 0.08);
    if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return Math.round(pa * 0.32 + d * 0.28 + ph * 0.15 + de * 0.13 + s * 0.12);
    return Math.round(s * 0.35 + p * 0.22 + d * 0.23 + ph * 0.12 + pa * 0.08);
  }

  function calculateMarketValue(player) {
    const ovr = player.overall || 65;
    const ageFactor = player.age <= 23 ? 1.35 : player.age <= 28 ? 1.1 : 0.75;
    const base = Math.pow(Math.max(1, ovr - 45), 2.35) * 18000 * ageFactor;
    return Math.max(150000, Math.round(base / 50000) * 50000);
  }

  function formatMoney(amount) {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    return `$${Math.round(amount / 1000)}K`;
  }

  function ensureV3State(state) {
    if (!state.career.traits) state.career.traits = [];
    if (!state.season_player_stats) state.season_player_stats = {};
    if (!state.trophy_winners) {
      state.trophy_winners = [
        { season: '2024-25', competition: 'Indian Super League', winner: 'Mohun Bagan SG' },
        { season: '2024-25', competition: 'Premier League', winner: 'Manchester City' },
        { season: '2024-25', competition: 'La Liga', winner: 'Real Madrid' }
      ];
    }
    if (!state.golden_boot_history) {
      state.golden_boot_history = [
        { season: '2024-25', league: 'Premier League', player: 'Erling Haaland', club: 'Manchester City', goals: 27 },
        { season: '2024-25', league: 'Indian Super League', player: 'Sunil Chhetri', club: 'Bengaluru FC', goals: 14 }
      ];
    }
    if (!state.ballon_dor_history) {
      state.ballon_dor_history = [
        { year: '2025', winner: 'Jude Bellingham', club: 'Real Madrid', ovr: 90 },
        { year: '2024', winner: 'Erling Haaland', club: 'Manchester City', ovr: 91 }
      ];
    }
    if (!state.pending_celebration) state.pending_celebration = null;

    const userP = state.players[state.career.player_id];
    if (userP && !userP.market_value) {
      userP.market_value = calculateMarketValue(userP);
    }
  }

  function recordMatchPlayerStats(state, matchResult) {
    ensureV3State(state);
    const allPlayed = [...matchResult.homeRoster, ...matchResult.awayRoster].filter((p) => p.minutesPlayed > 0);
    allPlayed.forEach((p) => {
      const clubObj = p.teamSide === 'home' ? matchResult.homeClub : matchResult.awayClub;
      if (!state.season_player_stats[p.player_id]) {
        state.season_player_stats[p.player_id] = {
          player_id: p.player_id,
          name: p.name,
          position: p.position,
          club_id: clubObj.club_id,
          club_name: clubObj.name,
          league_id: clubObj.league_id || 'GLOBAL',
          apps: 0,
          goals: 0,
          assists: 0,
          rating_sum: 0
        };
      }
      const rec = state.season_player_stats[p.player_id];
      rec.apps += 1;
      rec.goals += p.goals;
      rec.assists += p.assists;
      rec.rating_sum = Number((rec.rating_sum + p.rating).toFixed(2));
      rec.club_name = clubObj.name;
    });
  }

  function ensureSeasonFixtures(state) {
    ensureV3State(state);
    const userClub = state.clubs.find((c) => c.club_id === state.career.current_club_id) || state.clubs[0];
    const leagueId = userClub.league_id;

    state.leagues.forEach((lg) => {
      if (!state.standings[lg.league_id]) {
        const lgClubs = state.clubs.filter((c) => c.league_id === lg.league_id);
        state.standings[lg.league_id] = lgClubs.map((c) => ({
          club_id: c.club_id,
          name: c.name,
          short_name: c.short_name,
          played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0
        }));
      }
    });

    const hasPendingFixtures = state.fixtures.some((f) => !f.played);
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
            is_international: false,
            is_cup: false
          });
        }
      }
    }

    // Add Knockout Cup Semi-Final & Final fixtures
    const cupRivals = state.clubs.filter((c) => c.club_id !== userClub.club_id).sort(() => Math.random() - 0.5);
    if (cupRivals.length >= 2) {
      fixtures.push({
        fixture_id: `FIX_CUP_SF_${state.career.current_season}`,
        week: state.career.current_week + 2,
        league_id: 'CUP_KNOCKOUT',
        competition: 'Super Knockout Cup • Semi-Final',
        home_club_id: userClub.club_id,
        away_club_id: cupRivals[0].club_id,
        played: false,
        home_score: null,
        away_score: null,
        is_international: false,
        is_cup: true,
        cup_round: 'Semi-Final'
      });
    }

    // International fixture
    const userPlayer = state.players[state.career.player_id];
    const userNation = state.national_teams.find((n) => n.nation_id === (userPlayer?.nation_id || 'NAT_IND')) || state.national_teams[0];
    const rivalNation = state.national_teams.find((n) => n.nation_id !== userNation.nation_id) || state.national_teams[1];
    if (userNation && rivalNation) {
      fixtures.push({
        fixture_id: `FIX_INT_${state.career.current_season}_W4`,
        week: state.career.current_week + 4,
        league_id: 'INTERNATIONAL',
        competition: 'International Friendly / Qualifiers',
        home_club_id: userNation.nation_id,
        away_club_id: rivalNation.nation_id,
        played: false,
        home_score: null,
        away_score: null,
        is_international: true,
        is_cup: false
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
      const isStarter = trust >= 64 && userP.fitness >= 62;

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

  function simulateOtherWeekFixtures(state, targetWeek, skipClubId) {
    const others = state.fixtures.filter((f) => !f.played && !f.is_international && !f.is_cup && f.week <= targetWeek &&
      f.home_club_id !== skipClubId && f.away_club_id !== skipClubId);

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
        competition: fix.competition
      });

      fix.played = true;
      fix.home_score = res.stats.home.score;
      fix.away_score = res.stats.away.score;
      recordMatchPlayerStats(state, res);
      updateStanding(state, fix.league_id, homeClub.club_id, awayClub.club_id, fix.home_score, fix.away_score);
    });
  }

  function processMatchResult(state, fixture, matchResult) {
    ensureV3State(state);
    const career = state.career;
    const userP = state.players[career.player_id];
    const uStats = matchResult.userStats;

    fixture.played = true;
    fixture.home_score = matchResult.stats.home.score;
    fixture.away_score = matchResult.stats.away.score;
    recordMatchPlayerStats(state, matchResult);

    // Handle Cup Progression & Cup Celebration!
    if (fixture.is_cup) {
      const isUserHome = fixture.home_club_id === career.current_club_id;
      const userClubWon = isUserHome ? matchResult.homeWon : matchResult.awayWon;
      if (userClubWon && fixture.cup_round === 'Semi-Final') {
        const finalist = state.clubs.find((c) => c.club_id !== career.current_club_id && c.rating >= 75) || state.clubs[1];
        state.fixtures.push({
          fixture_id: `FIX_CUP_FINAL_${career.current_season}`,
          week: fixture.week + 2,
          league_id: 'CUP_KNOCKOUT',
          competition: 'Super Knockout Cup • FINAL 🏆',
          home_club_id: career.current_club_id,
          away_club_id: finalist.club_id,
          played: false,
          home_score: null,
          away_score: null,
          is_international: false,
          is_cup: true,
          cup_round: 'Final'
        });
        state.fixtures.sort((a, b) => a.week - b.week);
      } else if (userClubWon && fixture.cup_round === 'Final') {
        const clubObj = state.clubs.find((c) => c.club_id === career.current_club_id);
        career.trophies_won.push({ season: career.current_season, name: 'Super Knockout Cup', club: clubObj.name });
        state.trophy_winners.unshift({ season: career.current_season, competition: 'Super Knockout Cup', winner: clubObj.name });
        state.pending_celebration = {
          icon: '🏆',
          title: 'CUP CHAMPIONS!',
          subtitle: `${clubObj.name} lift the Super Knockout Cup!`,
          detail: `Captain & Star: ${userP.name} • Season ${career.current_season}`
        };
      }
    } else if (!fixture.is_international) {
      updateStanding(state, fixture.league_id, fixture.home_club_id, fixture.away_club_id, fixture.home_score, fixture.away_score);
      simulateOtherWeekFixtures(state, fixture.week, career.current_club_id);
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
      if (matchResult.motm && matchResult.motm.player_id === userP.player_id) cs.motm_awards += 1;

      if (fixture.is_international) {
        cs.international_caps += 1;
        cs.international_goals += uStats.goals;
      }

      userP.fitness = Math.max(45, Math.round(uStats.fitness));
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
        career.manager_trust = Math.max(20, career.manager_trust - 3);
      }
      userP.market_value = calculateMarketValue(userP);
    } else if (userP) {
      userP.fitness = Math.min(100, userP.fitness + 15);
    }

    if (career.manager_trust >= 85) career.squad_role = 'Key Star Player';
    else if (career.manager_trust >= 64) career.squad_role = 'First-Team Starter';
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
    generateTransferOffers(state, false);
    evaluateAchievements(state);

    if (!getNextUserFixture(state)) {
      advanceToNextSeason(state);
    }
  }

  function computeBallonDorStandings(state) {
    ensureV3State(state);
    const list = Object.values(state.players)
      .filter((p) => !p.player_id.startsWith('PLR_DEPTH_'))
      .map((p) => {
        const s = state.season_player_stats[p.player_id] || { apps: 0, goals: 0, assists: 0, rating_sum: 0 };
        const avgRtg = s.apps > 0 ? Number((s.rating_sum / s.apps).toFixed(2)) : p.form || 7.0;
        const club = state.clubs.find((c) => c.club_id === p.club_id) || { name: 'Free Agent' };
        const score = Math.round((p.overall * 1.4) + (s.goals * 4.5) + (s.assists * 3.0) + (avgRtg * 8));
        return {
          player_id: p.player_id,
          name: p.name,
          club_name: club.name,
          overall: p.overall,
          goals: s.goals,
          assists: s.assists,
          avgRtg,
          score
        };
      })
      .sort((a, b) => b.score - a.score);
    return list;
  }

  function advanceToNextSeason(state) {
    ensureV3State(state);
    const career = state.career;
    const userP = state.players[career.player_id];
    const userClub = state.clubs.find((c) => c.club_id === career.current_club_id);
    const leagueObj = userClub ? state.leagues.find((l) => l.league_id === userClub.league_id) : null;

    // 1. Crown League Champion
    if (userClub && state.standings[userClub.league_id]) {
      const table = state.standings[userClub.league_id];
      const champRow = table[0];
      if (champRow) {
        state.trophy_winners.unshift({
          season: career.current_season,
          competition: leagueObj ? leagueObj.name : 'League',
          winner: champRow.name
        });
        if (champRow.club_id === userClub.club_id) {
          career.trophies_won.push({
            season: career.current_season,
            name: `${leagueObj ? leagueObj.name : 'League'} Champions`,
            club: userClub.name
          });
          state.pending_celebration = {
            icon: '🏆',
            title: 'LEAGUE CHAMPIONS!',
            subtitle: `${userClub.name} win the ${leagueObj ? leagueObj.name : 'League'}!`,
            detail: `${userP.name} • ${career.current_season} Trophy Celebration`
          };
        }
      }
    }

    // 2. Crown Golden Boot Winner
    const scorers = Object.values(state.season_player_stats)
      .filter((s) => !userClub || s.league_id === userClub.league_id)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists);
    if (scorers[0]) {
      state.golden_boot_history.unshift({
        season: career.current_season,
        league: leagueObj ? leagueObj.name : 'League',
        player: scorers[0].name,
        club: scorers[0].club_name,
        goals: scorers[0].goals
      });
      if (scorers[0].player_id === userP.player_id) {
        state.pending_celebration = {
          icon: '👟',
          title: 'GOLDEN BOOT WINNER!',
          subtitle: `${userP.name} finishes as Top Scorer (${scorers[0].goals} Goals)!`,
          detail: `${leagueObj ? leagueObj.name : 'League'} • ${career.current_season}`
        };
      }
    }

    // 3. Crown Annual Ballon d'Or Winner
    const bdoTop = computeBallonDorStandings(state);
    const startYear = parseInt(career.current_season.split('-')[0], 10) || 2025;
    if (bdoTop[0]) {
      state.ballon_dor_history.unshift({
        year: String(startYear + 1),
        winner: bdoTop[0].name,
        club: bdoTop[0].club_name,
        ovr: bdoTop[0].overall
      });
      if (bdoTop[0].player_id === userP.player_id) {
        state.pending_celebration = {
          icon: '🟡',
          title: "BALLON D'OR WINNER!",
          subtitle: `${userP.name} is crowned the Best Footballer in the World!`,
          detail: `${bdoTop[0].goals} Goals • ${bdoTop[0].assists} Assists • ${startYear + 1} Gala`
        };
      }
    }

    // Reset for next season
    career.current_season = `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
    career.current_week = 1;
    if (userP) {
      userP.age += 1;
      userP.fitness = 100;
    }

    state.season_player_stats = {};
    state.standings = {};
    state.fixtures = [];
    ensureSeasonFixtures(state);
  }

  function growRandomAttribute(player, points = 1) {
    if (player.overall >= player.potential) return;
    const keys = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
    for (let i = 0; i < points; i++) {
      const chosen = keys[Math.floor(Math.random() * keys.length)];
      if (player.attributes[chosen] < 99) player.attributes[chosen] += 1;
    }
    player.overall = computeOverall(player.attributes, player.position);
  }

  function applyTrainingDrill(state, drillType) {
    const userP = state.players[state.career.player_id];
    if (!userP) return { message: 'Player not found.' };

    if (drillType === 'rest') {
      userP.fitness = Math.min(100, userP.fitness + 25);
      userP.morale = Math.min(100, userP.morale + 5);
      return { message: `${userP.name} rested well! Fitness is now ${userP.fitness}%.` };
    }

    if (userP.fitness < 55) return { message: `Fitness too low (${userP.fitness}%). Rest first!` };

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
      userP.market_value = calculateMarketValue(userP);
      return { message: `Drill Complete! +1 ${attr.toUpperCase()} (OVR ${userP.overall}).` };
    }

    userP.form = Math.min(9.9, Number((userP.form + 0.2).toFixed(1)));
    return { message: `Sharp session! Form boosted to ${userP.form}.` };
  }

  function unlockTrait(state, traitId) {
    ensureV3State(state);
    const userP = state.players[state.career.player_id];
    if (state.career.traits.includes(traitId)) return false;
    state.career.traits.push(traitId);

    if (traitId === 'TRT_FINISHER') userP.attributes.shooting = Math.min(99, userP.attributes.shooting + 4);
    if (traitId === 'TRT_VISION') userP.attributes.passing = Math.min(99, userP.attributes.passing + 4);
    if (traitId === 'TRT_ENGINE') userP.attributes.physical = Math.min(99, userP.attributes.physical + 4);
    if (traitId === 'TRT_DRIBBLER') {
      userP.attributes.pace = Math.min(99, userP.attributes.pace + 3);
      userP.attributes.dribbling = Math.min(99, userP.attributes.dribbling + 3);
    }
    userP.overall = computeOverall(userP.attributes, userP.position);
    userP.market_value = calculateMarketValue(userP);
    return true;
  }

  function applyInterviewChoice(state, choice) {
    const userP = state.players[state.career.player_id];
    if (choice === 'team') {
      state.career.manager_trust = Math.min(100, state.career.manager_trust + 5);
      return 'Coach loved your team-first attitude! (+5 Coach Trust)';
    }
    userP.morale = Math.min(100, userP.morale + 6);
    userP.form = Math.min(9.9, Number((userP.form + 0.2).toFixed(1)));
    return 'Fans went wild over your confidence! (+6 Morale & Form)';
  }

  function generateTransferOffers(state, force = false) {
    const career = state.career;
    const userP = state.players[career.player_id];
    if (!userP) return;
    if (!force && career.career_stats.appearances < 2) return;

    const eligibleClubs = state.clubs.filter((c) => {
      if (c.club_id === career.current_club_id) return false;
      const diff = c.rating - userP.overall;
      return diff >= -6 && diff <= 8;
    });

    const shuffled = eligibleClubs.sort(() => Math.random() - 0.5).slice(0, 3);
    career.transfer_offers = shuffled.map((club) => {
      const league = state.leagues.find((l) => l.league_id === club.league_id);
      const role = userP.overall >= club.rating ? 'Key Star Player' : 'First-Team Contender';
      return {
        offer_id: `OFR_${club.club_id}_${Date.now()}_${Math.floor(Math.random() * 99)}`,
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
    career.manager_trust = offer.promised_role === 'Key Star Player' ? 76 : 64;
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

  function evaluateAchievements(state) {
    const career = state.career;
    const userP = state.players[career.player_id];
    const cs = career.career_stats;
    const userClub = state.clubs.find((c) => c.club_id === career.current_club_id);
    const unlocked = new Set(career.unlocked_achievements || []);

    if (cs.appearances >= 1) unlocked.add('ACH_DEBUT');
    if (cs.goals >= 1) unlocked.add('ACH_FIRST_GOAL');
    if (career.national_team_selected) unlocked.add('ACH_BLUE_TIGER');
    if (userClub && ['England', 'Spain', 'Italy', 'Germany', 'France'].includes(userClub.country)) unlocked.add('ACH_EURO_MOVE');
    if (userP && userP.overall >= 90 && career.trophies_won.length >= 1) unlocked.add('ACH_LEGEND');

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
    state.players[userId].market_value = calculateMarketValue(state.players[userId]);

    state.career.current_club_id = club.club_id;
    state.career.nation_id = nationObj ? nationObj.nation_id : 'NAT_IND';
    state.career.manager_trust = 62;
    state.career.squad_role = 'Rotation Prospect';
    state.fixtures = [];
    ensureSeasonFixtures(state);
  }

  return {
    STAGES,
    TRAITS_CATALOG,
    computeOverall,
    calculateMarketValue,
    formatMoney,
    ensureV3State,
    recordMatchPlayerStats,
    ensureSeasonFixtures,
    updateStanding,
    getNextUserFixture,
    buildClubMatchSquad,
    buildNationalSquad,
    processMatchResult,
    computeBallonDorStandings,
    applyTrainingDrill,
    unlockTrait,
    applyInterviewChoice,
    generateTransferOffers,
    acceptTransferOffer,
    createCustomProtagonist
  };
})();

/**
 * TEAM MANAGER MODE ENGINE
 */
const ManagerEngine = (() => {
  function ensureManagerState(state) {
    CareerEngine.ensureV3State(state);
    if (!state.manager) {
      const defaultClub = state.clubs.find((c) => c.club_id === 'CLB_IND_CHENNAI') || state.clubs[0];
      state.manager = {
        club_id: defaultClub.club_id,
        budget: defaultClub.rating >= 85 ? 85000000 : defaultClub.rating >= 75 ? 25000000 : 4500000,
        board_confidence: 75,
        season: '2025-26',
        week: 1,
        wins: 0,
        draws: 0,
        losses: 0,
        trophies: [],
        fixtures: []
      };
      buildManagerFixtures(state);
    }
  }

  function selectClub(state, clubId) {
    const club = state.clubs.find((c) => c.club_id === clubId);
    if (!club) return;
    state.manager = {
      club_id: club.club_id,
      budget: club.rating >= 85 ? 85000000 : club.rating >= 75 ? 25000000 : 4500000,
      board_confidence: 75,
      season: '2025-26',
      week: 1,
      wins: 0,
      draws: 0,
      losses: 0,
      trophies: state.manager?.trophies || [],
      fixtures: []
    };
    buildManagerFixtures(state);
  }

  function buildManagerFixtures(state) {
    const mgr = state.manager;
    const club = state.clubs.find((c) => c.club_id === mgr.club_id) || state.clubs[0];
    const leagueId = club.league_id;
    const lgClubs = state.clubs.filter((c) => c.league_id === leagueId);
    const lgObj = state.leagues.find((l) => l.league_id === leagueId);

    if (!state.standings[leagueId]) {
      state.standings[leagueId] = lgClubs.map((c) => ({
        club_id: c.club_id,
        name: c.name,
        short_name: c.short_name,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0
      }));
    }

    let week = mgr.week;
    const list = [];
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < lgClubs.length; i++) {
        for (let j = i + 1; j < lgClubs.length; j++) {
          const home = round === 0 ? lgClubs[i] : lgClubs[j];
          const away = round === 0 ? lgClubs[j] : lgClubs[i];
          const isMine = home.club_id === club.club_id || away.club_id === club.club_id;
          list.push({
            fixture_id: `MGR_FIX_${mgr.season}_${leagueId}_${round}_${i}_${j}`,
            week: isMine ? week++ : Math.max(mgr.week, week - 1),
            league_id: leagueId,
            competition: lgObj ? lgObj.name : 'League',
            home_club_id: home.club_id,
            away_club_id: away.club_id,
            played: false,
            home_score: null,
            away_score: null,
            is_cup: false
          });
        }
      }
    }

    // Knockout Cup Semi-Final for Manager Mode
    const cupRival = state.clubs.find((c) => c.club_id !== club.club_id);
    if (cupRival) {
      list.push({
        fixture_id: `MGR_CUP_SF_${mgr.season}`,
        week: mgr.week + 2,
        league_id: 'CUP_KNOCKOUT',
        competition: 'Super Knockout Cup • Semi-Final',
        home_club_id: club.club_id,
        away_club_id: cupRival.club_id,
        played: false,
        home_score: null,
        away_score: null,
        is_cup: true,
        cup_round: 'Semi-Final'
      });
    }

    list.sort((a, b) => a.week - b.week);
    mgr.fixtures = list;
  }

  function getNextManagerFixture(state) {
    ensureManagerState(state);
    const mgr = state.manager;
    let next = mgr.fixtures.find((f) => !f.played && (f.home_club_id === mgr.club_id || f.away_club_id === mgr.club_id));
    if (!next) {
      buildManagerFixtures(state);
      next = mgr.fixtures.find((f) => !f.played && (f.home_club_id === mgr.club_id || f.away_club_id === mgr.club_id));
    }
    return next;
  }

  function setTactics(state, formation, tacticalStyle) {
    const club = state.clubs.find((c) => c.club_id === state.manager.club_id);
    if (!club) return;
    club.formation = formation;
    club.tactical_style = tacticalStyle;
    if (state.lineups[club.club_id]) {
      state.lineups[club.club_id].formation = formation;
    }
  }

  function swapPlayers(state, idA, idB) {
    const clubId = state.manager.club_id;
    const lineup = state.lineups[clubId];
    if (!lineup || idA === idB) return false;

    const xiIdxA = lineup.starting_xi.indexOf(idA);
    const xiIdxB = lineup.starting_xi.indexOf(idB);
    const subIdxA = lineup.substitutes.indexOf(idA);
    const subIdxB = lineup.substitutes.indexOf(idB);

    if (xiIdxA !== -1 && subIdxB !== -1) {
      lineup.starting_xi[xiIdxA] = idB;
      lineup.substitutes[subIdxB] = idA;
      return true;
    }
    if (subIdxA !== -1 && xiIdxB !== -1) {
      lineup.substitutes[subIdxA] = idB;
      lineup.starting_xi[xiIdxB] = idA;
      return true;
    }
    return false;
  }

  function processManagerMatch(state, fixture, result) {
    const mgr = state.manager;
    const club = state.clubs.find((c) => c.club_id === mgr.club_id);
    fixture.played = true;
    fixture.home_score = result.stats.home.score;
    fixture.away_score = result.stats.away.score;
    CareerEngine.recordMatchPlayerStats(state, result);

    if (fixture.is_cup) {
      const isHome = fixture.home_club_id === mgr.club_id;
      const wonCupMatch = isHome ? result.homeWon : result.awayWon;
      if (wonCupMatch && fixture.cup_round === 'Semi-Final') {
        const finalist = state.clubs.find((c) => c.club_id !== mgr.club_id && c.rating >= 75) || state.clubs[1];
        mgr.fixtures.push({
          fixture_id: `MGR_CUP_FINAL_${mgr.season}`,
          week: fixture.week + 2,
          league_id: 'CUP_KNOCKOUT',
          competition: 'Super Knockout Cup • FINAL 🏆',
          home_club_id: mgr.club_id,
          away_club_id: finalist.club_id,
          played: false,
          home_score: null,
          away_score: null,
          is_cup: true,
          cup_round: 'Final'
        });
        mgr.fixtures.sort((a, b) => a.week - b.week);
      } else if (wonCupMatch && fixture.cup_round === 'Final') {
        mgr.trophies.push({ season: mgr.season, name: 'Super Knockout Cup', club: club.name });
        mgr.budget += 2000000;
        state.trophy_winners.unshift({ season: mgr.season, competition: 'Super Knockout Cup', winner: club.name });
        state.pending_celebration = {
          icon: '🏆',
          title: 'CUP CHAMPIONS!',
          subtitle: `${club.name} lift the Super Knockout Cup!`,
          detail: `Manager: Spidey • Prize Bonus: +$2.0M`
        };
      }
    } else {
      CareerEngine.updateStanding(state, fixture.league_id, fixture.home_club_id, fixture.away_club_id, fixture.home_score, fixture.away_score);
      const others = mgr.fixtures.filter((f) => !f.played && !f.is_cup && f.week <= fixture.week && f.home_club_id !== mgr.club_id && f.away_club_id !== mgr.club_id);
      others.forEach((ofix) => {
        const hc = state.clubs.find((c) => c.club_id === ofix.home_club_id);
        const ac = state.clubs.find((c) => c.club_id === ofix.away_club_id);
        if (!hc || !ac) return;
        const hs = CareerEngine.buildClubMatchSquad(state, hc.club_id, false);
        const as = CareerEngine.buildClubMatchSquad(state, ac.club_id, false);
        const r = MatchEngine.simulateMatch({ homeClub: hc, awayClub: ac, homeStarters: hs.starters, homeSubs: hs.subs, awayStarters: as.starters, awaySubs: as.subs });
        ofix.played = true;
        ofix.home_score = r.stats.home.score;
        ofix.away_score = r.stats.away.score;
        CareerEngine.recordMatchPlayerStats(state, r);
        CareerEngine.updateStanding(state, ofix.league_id, hc.club_id, ac.club_id, ofix.home_score, ofix.away_score);
      });
    }

    const isHome = fixture.home_club_id === mgr.club_id;
    const won = isHome ? result.homeWon : result.awayWon;
    const drew = !result.homeWon && !result.awayWon;

    if (won) {
      mgr.wins += 1;
      mgr.board_confidence = Math.min(100, mgr.board_confidence + 4);
      mgr.budget += 250000;
    } else if (drew) {
      mgr.draws += 1;
      mgr.budget += 100000;
    } else {
      mgr.losses += 1;
      mgr.board_confidence = Math.max(20, mgr.board_confidence - 4);
    }

    Object.values(state.players).filter((p) => p.club_id === mgr.club_id).forEach((p) => {
      const played = [...result.homeRoster, ...result.awayRoster].find((r) => r.player_id === p.player_id && r.minutesPlayed > 0);
      p.fitness = played ? Math.max(55, Math.round(played.fitness)) : Math.min(100, (p.fitness || 85) + 14);
    });

    mgr.week += 1;

    const remaining = mgr.fixtures.some((f) => !f.played && (f.home_club_id === mgr.club_id || f.away_club_id === mgr.club_id));
    if (!remaining && club) {
      const table = state.standings[club.league_id] || [];
      const lg = state.leagues.find((l) => l.league_id === club.league_id);
      if (table[0]) {
        state.trophy_winners.unshift({ season: mgr.season, competition: lg ? lg.name : 'League', winner: table[0].name });
        if (table[0].club_id === club.club_id) {
          mgr.trophies.push({ season: mgr.season, name: `${lg ? lg.name : 'League'} Title`, club: club.name });
          mgr.budget += 3000000;
          state.pending_celebration = {
            icon: '🏆',
            title: 'LEAGUE CHAMPIONS!',
            subtitle: `${club.name} win the ${lg ? lg.name : 'League'} Title!`,
            detail: `Manager: Spidey • Season ${mgr.season}`
          };
        }
      }
      const yr = parseInt(mgr.season.split('-')[0], 10) || 2025;
      mgr.season = `${yr + 1}-${String(yr + 2).slice(-2)}`;
      mgr.week = 1;
      state.standings[club.league_id] = null;
      buildManagerFixtures(state);
    }
  }

  function runTeamTraining(state, type) {
    const squad = Object.values(state.players).filter((p) => p.club_id === state.manager.club_id);
    if (type === 'recovery') {
      squad.forEach((p) => {
        p.fitness = Math.min(100, (p.fitness || 80) + 22);
        p.morale = Math.min(100, (p.morale || 75) + 4);
      });
      return 'Full Squad Recovery complete! (+22% Fitness)';
    }
    squad.forEach((p) => {
      p.fitness = Math.max(50, (p.fitness || 90) - 6);
      p.form = Math.min(9.9, Number(((p.form || 7.0) + 0.2).toFixed(1)));
    });
    return 'Intense Tactical Drill complete! Squad Form boosted.';
  }

  function getTransferMarket(state, posFilter = 'ALL') {
    const myClubId = state.manager.club_id;
    return Object.values(state.players)
      .filter((p) => p.club_id !== myClubId && !p.player_id.startsWith('PLR_DEPTH_'))
      .filter((p) => posFilter === 'ALL' || p.position === posFilter)
      .map((p) => ({
        ...p,
        price: CareerEngine.calculateMarketValue(p),
        club_name: (state.clubs.find((c) => c.club_id === p.club_id) || { name: 'Free Agent' }).name
      }))
      .sort((a, b) => b.overall - a.overall);
  }

  function buyPlayer(state, playerId) {
    const mgr = state.manager;
    const player = state.players[playerId];
    if (!player) return { ok: false, msg: 'Player not found.' };
    const price = CareerEngine.calculateMarketValue(player);
    if (mgr.budget < price) return { ok: false, msg: `Insufficient funds! Need ${CareerEngine.formatMoney(price)}.` };

    const oldClubId = player.club_id;
    mgr.budget -= price;
    player.club_id = mgr.club_id;

    if (oldClubId && state.lineups[oldClubId]) {
      state.lineups[oldClubId].starting_xi = state.lineups[oldClubId].starting_xi.filter((id) => id !== playerId);
      state.lineups[oldClubId].substitutes = state.lineups[oldClubId].substitutes.filter((id) => id !== playerId);
    }
    if (state.lineups[mgr.club_id]) {
      state.lineups[mgr.club_id].substitutes.unshift(playerId);
    }

    return { ok: true, msg: `SIGNED! ${player.name} joined your squad for ${CareerEngine.formatMoney(price)}!` };
  }

  function sellPlayer(state, playerId) {
    const mgr = state.manager;
    const squad = Object.values(state.players).filter((p) => p.club_id === mgr.club_id);
    if (squad.length <= 13) return { ok: false, msg: 'Squad too small! Need at least 13 players.' };

    const player = state.players[playerId];
    if (!player) return { ok: false, msg: 'Player not found.' };
    const fee = Math.round(CareerEngine.calculateMarketValue(player) * 0.85);
    const otherClub = state.clubs.find((c) => c.club_id !== mgr.club_id);

    mgr.budget += fee;
    player.club_id = otherClub ? otherClub.club_id : null;

    if (state.lineups[mgr.club_id]) {
      state.lineups[mgr.club_id].starting_xi = state.lineups[mgr.club_id].starting_xi.filter((id) => id !== playerId);
      state.lineups[mgr.club_id].substitutes = state.lineups[mgr.club_id].substitutes.filter((id) => id !== playerId);
    }

    return { ok: true, msg: `SOLD! ${player.name} sold for ${CareerEngine.formatMoney(fee)}.` };
  }

  return {
    ensureManagerState,
    selectClub,
    getNextManagerFixture,
    setTactics,
    swapPlayers,
    processManagerMatch,
    runTeamTraining,
    getTransferMarket,
    buyPlayer,
    sellPlayer
  };
})();
