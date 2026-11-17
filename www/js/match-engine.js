/**
 * SUPER FOOTBALL MANAGER BY SPIDEY
 * 90-Minute Football Match Simulation Engine
 */

const MatchEngine = (() => {
  const TACTIC_MODIFIERS = {
    'Attacking': { atk: 1.14, def: 0.90, poss: 2 },
    'Possession': { atk: 1.05, def: 1.04, poss: 7 },
    'Counter-Attack': { atk: 1.08, def: 1.06, poss: -6 },
    'Balanced': { atk: 1.00, def: 1.00, poss: 0 }
  };

  const FOCUS_MODIFIERS = {
    balanced: { shotMult: 1.0, passMult: 1.0, defMult: 1.0, staminaDrain: 0.14 },
    attack: { shotMult: 1.38, passMult: 0.92, defMult: 0.82, staminaDrain: 0.17 },
    playmaker: { shotMult: 0.95, passMult: 1.35, defMult: 0.95, staminaDrain: 0.15 },
    workrate: { shotMult: 0.90, passMult: 1.05, defMult: 1.40, staminaDrain: 0.20 }
  };

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function pickWeighted(items, weightFn) {
    const weights = items.map((item) => Math.max(0.05, weightFn(item)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function createPlayerMatchState(player, isStarter, teamSide, isUser) {
    return {
      player_id: player.player_id,
      name: player.name,
      position: player.position,
      overall: player.overall,
      attributes: { ...player.attributes },
      teamSide,
      isUser,
      onPitch: isStarter,
      subbedInAt: isStarter ? 0 : null,
      subbedOutAt: null,
      minutesPlayed: 0,
      fitness: player.fitness ?? 100,
      goals: 0,
      assists: 0,
      shots: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      tackles: 0,
      saves: 0,
      yellowCard: false,
      redCard: false,
      injured: false,
      rating: 6.4
    };
  }

  function clampRating(val) {
    return Math.max(3.5, Math.min(10.0, Number(val.toFixed(1))));
  }

  function simulateMatch({
    homeClub,
    awayClub,
    homeStarters,
    homeSubs,
    awayStarters,
    awaySubs,
    userPlayerId,
    userFocus = 'balanced',
    competition = 'League Match'
  }) {
    const focusMod = FOCUS_MODIFIERS[userFocus] || FOCUS_MODIFIERS.balanced;
    const homeTac = TACTIC_MODIFIERS[homeClub.tactical_style] || TACTIC_MODIFIERS.Balanced;
    const awayTac = TACTIC_MODIFIERS[awayClub.tactical_style] || TACTIC_MODIFIERS.Balanced;

    const homeRoster = [
      ...homeStarters.map((p) => createPlayerMatchState(p, true, 'home', p.player_id === userPlayerId)),
      ...homeSubs.map((p) => createPlayerMatchState(p, false, 'home', p.player_id === userPlayerId))
    ];

    const awayRoster = [
      ...awayStarters.map((p) => createPlayerMatchState(p, true, 'away', p.player_id === userPlayerId)),
      ...awaySubs.map((p) => createPlayerMatchState(p, false, 'away', p.player_id === userPlayerId))
    ];

    const stats = {
      home: { score: 0, shots: 0, shotsOnTarget: 0, passesAttempted: 0, passesCompleted: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0, possTicks: 0 },
      away: { score: 0, shots: 0, shotsOnTarget: 0, passesAttempted: 0, passesCompleted: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, xg: 0, possTicks: 0 }
    };

    const events = [];
    let homeSubsUsed = 0;
    let awaySubsUsed = 0;

    const stoppageTime = randInt(2, 4);
    const totalMinutes = 90 + stoppageTime;

    function performSubstitution(roster, side, minute, forcedOutPlayer = null) {
      const bench = roster.filter((p) => !p.onPitch && p.subbedInAt === null && !p.injured);
      const active = roster.filter((p) => p.onPitch && p.position !== 'GK');
      if (bench.length === 0 || active.length === 0) return false;

      let outPlayer = forcedOutPlayer;
      if (!outPlayer) {
        const userOnBench = bench.find((p) => p.isUser);
        if (userOnBench && minute >= 58 && Math.random() < 0.78) {
          const samePos = active.find((p) => p.position === userOnBench.position) || active.sort((a, b) => a.fitness - b.fitness)[0];
          outPlayer = samePos;
          const inPlayer = userOnBench;
          outPlayer.onPitch = false;
          outPlayer.subbedOutAt = minute;
          inPlayer.onPitch = true;
          inPlayer.subbedInAt = minute;
          events.push({
            minute,
            type: 'SUB',
            teamSide: side,
            playerId: inPlayer.player_id,
            playerName: inPlayer.name,
            text: `SUB (${side === 'home' ? homeClub.short_name : awayClub.short_name}): ${inPlayer.name} replaces ${outPlayer.name}.`,
            isUserEvent: true
          });
          return true;
        }

        const candidates = active.filter((p) => !p.isUser || (minute >= 75 && p.fitness < 64));
        if (candidates.length === 0) return false;
        outPlayer = candidates.sort((a, b) => (a.fitness + a.rating * 5) - (b.fitness + b.rating * 5))[0];
      }

      const inPlayer = bench.find((b) => b.position === outPlayer.position) || bench[0];
      outPlayer.onPitch = false;
      outPlayer.subbedOutAt = minute;
      inPlayer.onPitch = true;
      inPlayer.subbedInAt = minute;

      events.push({
        minute,
        type: 'SUB',
        teamSide: side,
        playerId: inPlayer.player_id,
        playerName: inPlayer.name,
        text: `SUB (${side === 'home' ? homeClub.short_name : awayClub.short_name}): ${inPlayer.name} comes on for ${outPlayer.name}.`,
        isUserEvent: inPlayer.isUser || outPlayer.isUser
      });
      return true;
    }

    events.push({
      minute: 1,
      type: 'KICKOFF',
      teamSide: 'home',
      text: `Kick-off! ${homeClub.name} vs ${awayClub.name} (${competition}).`,
      isUserEvent: false
    });

    for (let min = 1; min <= totalMinutes; min++) {
      const homeActive = homeRoster.filter((p) => p.onPitch);
      const awayActive = awayRoster.filter((p) => p.onPitch);

      [...homeActive, ...awayActive].forEach((p) => {
        p.minutesPlayed += 1;
        const drain = p.isUser ? focusMod.staminaDrain : 0.14;
        p.fitness = Math.max(30, p.fitness - drain);
      });

      const homeMid = homeActive.reduce((s, p) => s + (p.attributes.passing + p.attributes.dribbling) / 2, 0) / Math.max(1, homeActive.length);
      const awayMid = awayActive.reduce((s, p) => s + (p.attributes.passing + p.attributes.dribbling) / 2, 0) / Math.max(1, awayActive.length);

      const homePossWeight = Math.max(25, 52 + (homeMid - awayMid) * 0.9 + homeTac.poss - awayTac.poss);
      const isHomeAttack = Math.random() * 100 < homePossWeight;
      const side = isHomeAttack ? 'home' : 'away';
      const atkTeam = isHomeAttack ? homeActive : awayActive;
      const defTeam = isHomeAttack ? awayActive : homeActive;
      const atkClub = isHomeAttack ? homeClub : awayClub;
      const atkTac = isHomeAttack ? homeTac : awayTac;
      const defTac = isHomeAttack ? awayTac : homeTac;

      stats[side].possTicks += 1;

      const passesThisMin = randInt(4, 8);
      for (let i = 0; i < passesThisMin; i++) {
        const passer = pickWeighted(atkTeam, (p) => {
          const base = p.position === 'GK' ? 0.3 : ['CM', 'CDM', 'CAM'].includes(p.position) ? 1.8 : 1.0;
          return base * (p.isUser ? focusMod.passMult : 1.0);
        });
        passer.passesAttempted += 1;
        stats[side].passesAttempted += 1;

        const passSuccessChance = Math.min(0.95, 0.68 + (passer.attributes.passing / 400));
        if (Math.random() < passSuccessChance) {
          passer.passesCompleted += 1;
          stats[side].passesCompleted += 1;
          if (passer.isUser && i === 0) passer.rating = clampRating(passer.rating + 0.01);
        }
      }

      const atkPower = (atkTeam.reduce((s, p) => s + p.overall, 0) / atkTeam.length) * atkTac.atk;
      const defPower = (defTeam.reduce((s, p) => s + p.overall, 0) / defTeam.length) * defTac.def;
      const chanceProb = Math.min(0.38, Math.max(0.14, 0.24 + (atkPower - defPower) * 0.004));

      if (Math.random() < chanceProb) {
        const shooter = pickWeighted(atkTeam, (p) => {
          if (p.position === 'GK') return 0.01;
          let posWeight = ['ST', 'CF'].includes(p.position) ? 3.2 : ['LW', 'RW', 'CAM'].includes(p.position) ? 2.3 : ['CM', 'LM', 'RM'].includes(p.position) ? 1.1 : 0.4;
          if (p.isUser) posWeight *= focusMod.shotMult;
          return posWeight * (p.attributes.shooting / 65);
        });

        const assisterPool = atkTeam.filter((p) => p.player_id !== shooter.player_id && p.position !== 'GK');
        const assister = pickWeighted(assisterPool, (p) => {
          let w = ['CAM', 'CM', 'LW', 'RW'].includes(p.position) ? 2.4 : 1.0;
          if (p.isUser) w *= focusMod.passMult;
          return w * (p.attributes.passing / 65);
        });

        assister.keyPasses += 1;
        assister.rating = clampRating(assister.rating + 0.08);

        shooter.shots += 1;
        stats[side].shots += 1;
        const shotXg = rand(0.05, 0.28) * (shooter.attributes.shooting / 75);
        stats[side].xg = Number((stats[side].xg + shotXg).toFixed(2));

        const onTargetProb = Math.min(0.75, 0.34 + (shooter.attributes.shooting / 240));
        if (Math.random() < onTargetProb) {
          shooter.shotsOnTarget += 1;
          stats[side].shotsOnTarget += 1;
          shooter.rating = clampRating(shooter.rating + 0.12);

          const oppGk = defTeam.find((p) => p.position === 'GK') || defTeam[0];
          const goalProb = Math.min(0.55, Math.max(0.16, 0.31 + (shooter.attributes.shooting - (oppGk?.overall || 65)) * 0.005));

          if (Math.random() < goalProb) {
            stats[side].score += 1;
            shooter.goals += 1;
            shooter.rating = clampRating(shooter.rating + 0.85);
            assister.assists += 1;
            assister.rating = clampRating(assister.rating + 0.55);

            events.push({
              minute: min,
              type: 'GOAL',
              teamSide: side,
              playerId: shooter.player_id,
              playerName: shooter.name,
              assistName: assister.name,
              text: `GOAL! ${shooter.name} scores for ${atkClub.name}! (Assist: ${assister.name}) [${stats.home.score}-${stats.away.score}]`,
              isUserEvent: shooter.isUser || assister.isUser
            });
          } else if (oppGk) {
            oppGk.saves += 1;
            oppGk.rating = clampRating(oppGk.rating + 0.22);
            if (Math.random() < 0.45) stats[side].corners += 1;
            if (shooter.isUser || assister.isUser) {
              events.push({
                minute: min,
                type: 'CHANCE',
                teamSide: side,
                playerId: shooter.player_id,
                playerName: shooter.name,
                text: `Close! ${shooter.name} fires on target after a pass from ${assister.name}, saved by ${oppGk.name}.`,
                isUserEvent: true
              });
            }
          }
        }
      }

      if (Math.random() < 0.16) {
        const tackler = pickWeighted(defTeam, (p) => {
          let w = ['CB', 'LB', 'RB', 'CDM'].includes(p.position) ? 2.5 : 1.0;
          if (p.isUser) w *= focusMod.defMult;
          return w * (p.attributes.defending / 65);
        });

        if (Math.random() < 0.72) {
          tackler.tackles += 1;
          tackler.rating = clampRating(tackler.rating + 0.08);
        } else {
          const defSide = side === 'home' ? 'away' : 'home';
          const defClub = side === 'home' ? awayClub : homeClub;
          stats[defSide].fouls += 1;

          if (Math.random() < 0.16 && !tackler.redCard) {
            if (!tackler.yellowCard) {
              tackler.yellowCard = true;
              tackler.rating = clampRating(tackler.rating - 0.30);
              stats[defSide].yellowCards += 1;
              events.push({
                minute: min,
                type: 'YELLOW',
                teamSide: defSide,
                playerId: tackler.player_id,
                playerName: tackler.name,
                text: `Yellow Card: ${tackler.name} (${defClub.short_name}) booked for a late tackle.`,
                isUserEvent: tackler.isUser
              });
            } else {
              tackler.redCard = true;
              tackler.onPitch = false;
              tackler.subbedOutAt = min;
              tackler.rating = clampRating(tackler.rating - 1.4);
              stats[defSide].redCards += 1;
              events.push({
                minute: min,
                type: 'RED',
                teamSide: defSide,
                playerId: tackler.player_id,
                playerName: tackler.name,
                text: `RED CARD! ${tackler.name} (${defClub.short_name}) is sent off!`,
                isUserEvent: tackler.isUser
              });
            }
          }
        }
      }

      if (Math.random() < 0.003) {
        const victim = pickWeighted([...homeActive, ...awayActive], (p) => (105 - p.fitness));
        if (victim && !victim.injured) {
          victim.injured = true;
          const vRoster = victim.teamSide === 'home' ? homeRoster : awayRoster;
          const vClub = victim.teamSide === 'home' ? homeClub : awayClub;
          events.push({
            minute: min,
            type: 'INJURY',
            teamSide: victim.teamSide,
            playerId: victim.player_id,
            playerName: victim.name,
            text: `Injury: ${victim.name} (${vClub.short_name}) picks up a knock and has to come off.`,
            isUserEvent: victim.isUser
          });
          performSubstitution(vRoster, victim.teamSide, min, victim);
        }
      }

      if (min >= 58 && min <= 84) {
        if (homeSubsUsed < 4 && Math.random() < 0.14) {
          if (performSubstitution(homeRoster, 'home', min)) homeSubsUsed += 1;
        }
        if (awaySubsUsed < 4 && Math.random() < 0.14) {
          if (performSubstitution(awayRoster, 'away', min)) awaySubsUsed += 1;
        }
      }
    }

    const totalTicks = Math.max(1, stats.home.possTicks + stats.away.possTicks);
    stats.home.possession = Math.round((stats.home.possTicks / totalTicks) * 100);
    stats.away.possession = 100 - stats.home.possession;

    stats.home.passAccuracy = stats.home.passesAttempted
      ? Math.round((stats.home.passesCompleted / stats.home.passesAttempted) * 100)
      : 78;
    stats.away.passAccuracy = stats.away.passesAttempted
      ? Math.round((stats.away.passesCompleted / stats.away.passesAttempted) * 100)
      : 78;

    const homeWon = stats.home.score > stats.away.score;
    const awayWon = stats.away.score > stats.home.score;

    [...homeRoster, ...awayRoster].forEach((p) => {
      if (p.minutesPlayed > 0) {
        if ((p.teamSide === 'home' && homeWon) || (p.teamSide === 'away' && awayWon)) {
          p.rating = clampRating(p.rating + 0.35);
        } else if ((p.teamSide === 'home' && awayWon) || (p.teamSide === 'away' && homeWon)) {
          p.rating = clampRating(p.rating - 0.25);
        }
      }
    });

    const allPlayed = [...homeRoster, ...awayRoster].filter((p) => p.minutesPlayed > 0);
    allPlayed.sort((a, b) => b.rating - a.rating);
    const motm = allPlayed[0] || null;

    const userStats = allPlayed.find((p) => p.isUser) ||
      [...homeRoster, ...awayRoster].find((p) => p.isUser) ||
      null;

    events.push({
      minute: totalMinutes,
      type: 'FULLTIME',
      teamSide: 'home',
      text: `Full Time! ${homeClub.name} ${stats.home.score} - ${stats.away.score} ${awayClub.name}. MOTM: ${motm ? `${motm.name} (${motm.rating})` : 'N/A'}`,
      isUserEvent: motm?.isUser || false
    });

    return {
      competition,
      homeClub,
      awayClub,
      stats,
      events,
      homeRoster,
      awayRoster,
      motm,
      userStats
    };
  }

  return { simulateMatch };
})();
