/**
 * SUPER FOOTBALL MANAGER BY SPIDEY (v3.0)
 * 90-Minute Match Engine + Knockout Cup Tiebreakers + All-Players Individual Match Ratings
 */

const MatchEngine = (() => {
  const TACTIC_MODIFIERS = {
    'Attacking': { atk: 1.15, def: 0.89, poss: 2 },
    'Possession': { atk: 1.05, def: 1.04, poss: 7 },
    'Counter-Attack': { atk: 1.09, def: 1.06, poss: -6 },
    'Balanced': { atk: 1.00, def: 1.00, poss: 0 }
  };

  const FOCUS_MODIFIERS = {
    balanced: { shotMult: 1.0, passMult: 1.0, defMult: 1.0, staminaDrain: 0.14 },
    attack: { shotMult: 1.40, passMult: 0.92, defMult: 0.82, staminaDrain: 0.17 },
    playmaker: { shotMult: 0.95, passMult: 1.38, defMult: 0.95, staminaDrain: 0.15 },
    workrate: { shotMult: 0.90, passMult: 1.05, defMult: 1.42, staminaDrain: 0.20 }
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

  function clampRating(val) {
    return Math.max(4.0, Math.min(10.0, Number(val.toFixed(1))));
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

  function simulateMatch({
    homeClub,
    awayClub,
    homeStarters,
    homeSubs,
    awayStarters,
    awaySubs,
    userPlayerId = null,
    userFocus = 'balanced',
    managedSide = null,
    isKnockout = false,
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
      home: { score: 0, shots: 0, shotsOnTarget: 0, passesAttempted: 0, passesCompleted: 0, yellowCards: 0, redCards: 0, possTicks: 0 },
      away: { score: 0, shots: 0, shotsOnTarget: 0, passesAttempted: 0, passesCompleted: 0, yellowCards: 0, redCards: 0, possTicks: 0 },
      penalties: null
    };

    const events = [];
    let homeSubsUsed = 0;
    let awaySubsUsed = 0;
    const keyMomentMinutes = [28, 63, 81];

    const stoppageTime = randInt(2, 4);
    const totalMinutes = 90 + stoppageTime;

    function performSubstitution(roster, side, minute, forcedOutPlayer = null) {
      const bench = roster.filter((p) => !p.onPitch && p.subbedInAt === null && !p.injured);
      const active = roster.filter((p) => p.onPitch && p.position !== 'GK');
      if (bench.length === 0 || active.length === 0) return false;

      let outPlayer = forcedOutPlayer;
      if (!outPlayer) {
        const userOnBench = bench.find((p) => p.isUser);
        if (userOnBench && minute >= 58 && Math.random() < 0.82) {
          outPlayer = active.find((p) => p.position === userOnBench.position) || active.sort((a, b) => a.fitness - b.fitness)[0];
          outPlayer.onPitch = false;
          outPlayer.subbedOutAt = minute;
          userOnBench.onPitch = true;
          userOnBench.subbedInAt = minute;
          events.push({
            minute,
            type: 'SUB',
            teamSide: side,
            ballX: 50,
            ballY: 94,
            zoneLabel: 'Touchline Sub',
            text: `SUB (${side === 'home' ? homeClub.short_name : awayClub.short_name}): ${userOnBench.name} replaces ${outPlayer.name}.`,
            isUserEvent: true
          });
          return true;
        }

        const candidates = active.filter((p) => !p.isUser || (minute >= 76 && p.fitness < 62));
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
        ballX: 50,
        ballY: 94,
        zoneLabel: 'Touchline Sub',
        text: `SUB (${side === 'home' ? homeClub.short_name : awayClub.short_name}): ${inPlayer.name} comes on for ${outPlayer.name}.`,
        isUserEvent: inPlayer.isUser || outPlayer.isUser
      });
      return true;
    }

    events.push({
      minute: 1,
      type: 'KICKOFF',
      teamSide: 'home',
      ballX: 50,
      ballY: 50,
      zoneLabel: 'Center Circle',
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

      if (keyMomentMinutes.includes(min) && (userPlayerId || managedSide)) {
        const userOnPitch = [...homeActive, ...awayActive].find((p) => p.isUser);
        if (userOnPitch) {
          const uSide = userOnPitch.teamSide;
          events.push({
            minute: min,
            type: 'KEY_MOMENT',
            mode: 'player',
            teamSide: uSide,
            ballX: uSide === 'home' ? 84 : 16,
            ballY: randInt(32, 68),
            zoneLabel: 'Penalty Area!',
            title: `${min}' KEY MOMENT — ${userOnPitch.name}!`,
            desc: `You control the ball inside the penalty box! Choose your action:`,
            options: [
              { id: 'finesse', label: 'Finesse Shot' },
              { id: 'power', label: 'Power Strike' },
              { id: 'pass', label: 'Square Pass' }
            ],
            isUserEvent: true
          });
        } else if (managedSide) {
          const mClub = managedSide === 'home' ? homeClub : awayClub;
          events.push({
            minute: min,
            type: 'KEY_MOMENT',
            mode: 'manager',
            teamSide: managedSide,
            ballX: managedSide === 'home' ? 72 : 28,
            ballY: 50,
            zoneLabel: 'Tactical Call',
            title: `${min}' TOUCHLINE CALL — ${mClub.name}`,
            desc: `Score is ${stats.home.score}-${stats.away.score}. Issue a tactical instruction:`,
            options: [
              { id: 'overload', label: 'Overload Box' },
              { id: 'counter', label: 'Fast Counter' },
              { id: 'press', label: 'High Press' }
            ],
            isUserEvent: true
          });
        }
      }

      const passesThisMin = randInt(4, 8);
      for (let i = 0; i < passesThisMin; i++) {
        const passer = pickWeighted(atkTeam, (p) => {
          const base = p.position === 'GK' ? 0.3 : ['CM', 'CDM', 'CAM'].includes(p.position) ? 1.8 : 1.0;
          return base * (p.isUser ? focusMod.passMult : 1.0);
        });
        passer.passesAttempted += 1;
        stats[side].passesAttempted += 1;

        if (Math.random() < Math.min(0.95, 0.68 + (passer.attributes.passing / 400))) {
          passer.passesCompleted += 1;
          stats[side].passesCompleted += 1;
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
              ballX: side === 'home' ? 95 : 5,
              ballY: 50,
              zoneLabel: 'GOAL!',
              playerId: shooter.player_id,
              playerName: shooter.name,
              assistName: assister.name,
              text: `GOAL! ${shooter.name} scores for ${atkClub.name}! (Assist: ${assister.name}) [${stats.home.score}-${stats.away.score}]`,
              isUserEvent: shooter.isUser || assister.isUser || side === managedSide
            });
          } else if (oppGk) {
            oppGk.saves += 1;
            oppGk.rating = clampRating(oppGk.rating + 0.22);
            if (min % 3 === 0 || shooter.isUser || assister.isUser) {
              events.push({
                minute: min,
                type: 'CHANCE',
                teamSide: side,
                ballX: side === 'home' ? 88 : 12,
                ballY: randInt(28, 72),
                zoneLabel: 'Shot Saved',
                text: `${shooter.name} (${atkClub.short_name}) tests ${oppGk.name} with a sharp shot!`,
                isUserEvent: shooter.isUser || assister.isUser
              });
            }
          }
        }
      } else if (min % 6 === 0) {
        events.push({
          minute: min,
          type: 'BUILDUP',
          teamSide: side,
          ballX: side === 'home' ? randInt(48, 76) : randInt(24, 52),
          ballY: randInt(20, 80),
          zoneLabel: `${atkClub.short_name} Attack`,
          text: `${atkClub.name} move the ball smoothly through midfield.`,
          isUserEvent: false
        });
      }

      if (Math.random() < 0.14) {
        const tackler = pickWeighted(defTeam, (p) => {
          let w = ['CB', 'LB', 'RB', 'CDM'].includes(p.position) ? 2.5 : 1.0;
          if (p.isUser) w *= focusMod.defMult;
          return w * (p.attributes.defending / 65);
        });

        if (Math.random() < 0.75) {
          tackler.tackles += 1;
          tackler.rating = clampRating(tackler.rating + 0.08);
        } else if (Math.random() < 0.16 && !tackler.redCard) {
          const defSide = side === 'home' ? 'away' : 'home';
          const defClub = side === 'home' ? awayClub : homeClub;
          if (!tackler.yellowCard) {
            tackler.yellowCard = true;
            tackler.rating = clampRating(tackler.rating - 0.30);
            stats[defSide].yellowCards += 1;
            events.push({
              minute: min,
              type: 'YELLOW',
              teamSide: defSide,
              ballX: 50,
              ballY: randInt(25, 75),
              zoneLabel: 'Booking',
              text: `Yellow Card: ${tackler.name} (${defClub.short_name}) booked for a late tackle.`,
              isUserEvent: tackler.isUser
            });
          }
        }
      }

      if (min >= 58 && min <= 84) {
        if (homeSubsUsed < 3 && Math.random() < 0.13) {
          if (performSubstitution(homeRoster, 'home', min)) homeSubsUsed += 1;
        }
        if (awaySubsUsed < 3 && Math.random() < 0.13) {
          if (performSubstitution(awayRoster, 'away', min)) awaySubsUsed += 1;
        }
      }
    }

    // Knockout Cup Penalty Shootout if tied after 90'
    if (isKnockout && stats.home.score === stats.away.score) {
      let homePens = randInt(3, 5);
      let awayPens = randInt(3, 5);
      if (homePens === awayPens) {
        if (Math.random() < 0.52) homePens += 1;
        else awayPens += 1;
      }
      stats.penalties = { home: homePens, away: awayPens };
      const penWinner = homePens > awayPens ? homeClub.name : awayClub.name;
      events.push({
        minute: totalMinutes,
        type: 'GOAL',
        teamSide: homePens > awayPens ? 'home' : 'away',
        ballX: 50,
        ballY: 50,
        zoneLabel: 'Penalties!',
        text: `PENALTY SHOOTOUT! ${penWinner} win ${homePens}-${awayPens} on penalties!`,
        isUserEvent: true
      });
    }

    const totalTicks = Math.max(1, stats.home.possTicks + stats.away.possTicks);
    stats.home.possession = Math.round((stats.home.possTicks / totalTicks) * 100);
    stats.away.possession = 100 - stats.home.possession;
    stats.home.passAccuracy = stats.home.passesAttempted ? Math.round((stats.home.passesCompleted / stats.home.passesAttempted) * 100) : 78;
    stats.away.passAccuracy = stats.away.passesAttempted ? Math.round((stats.away.passesCompleted / stats.away.passesAttempted) * 100) : 78;

    const homeWon = stats.home.score > stats.away.score || (stats.penalties && stats.penalties.home > stats.penalties.away);
    const awayWon = stats.away.score > stats.home.score || (stats.penalties && stats.penalties.away > stats.penalties.home);

    [...homeRoster, ...awayRoster].forEach((p) => {
      if (p.minutesPlayed > 0) {
        // Add subtle realistic variance so every player's rating is distinct
        p.rating = clampRating(p.rating + rand(-0.18, 0.22));
        if ((p.teamSide === 'home' && homeWon) || (p.teamSide === 'away' && awayWon)) p.rating = clampRating(p.rating + 0.35);
        else if ((p.teamSide === 'home' && awayWon) || (p.teamSide === 'away' && homeWon)) p.rating = clampRating(p.rating - 0.25);
      }
    });

    const allPlayed = [...homeRoster, ...awayRoster].filter((p) => p.minutesPlayed > 0).sort((a, b) => b.rating - a.rating);
    const motm = allPlayed[0] || null;
    const userStats = allPlayed.find((p) => p.isUser) || [...homeRoster, ...awayRoster].find((p) => p.isUser) || null;

    events.push({
      minute: totalMinutes,
      type: 'FULLTIME',
      teamSide: 'home',
      ballX: 50,
      ballY: 50,
      zoneLabel: 'Full Time',
      text: `Full Time! ${homeClub.name} ${stats.home.score} - ${stats.away.score} ${awayClub.name}. MOTM: ${motm ? `${motm.name} (${motm.rating})` : 'N/A'}`,
      isUserEvent: motm?.isUser || false
    });

    return { competition, homeClub, awayClub, stats, events, homeRoster, awayRoster, motm, userStats, homeWon, awayWon };
  }

  function resolveKeyMoment(result, momentEvent, choiceId) {
    const side = momentEvent.teamSide;
    const club = side === 'home' ? result.homeClub : result.awayClub;
    const roster = side === 'home' ? result.homeRoster : result.awayRoster;

    if (momentEvent.mode === 'player' && result.userStats) {
      const u = result.userStats;
      const skill = choiceId === 'pass' ? u.attributes.passing : u.attributes.shooting;
      const success = Math.random() * 100 < (skill * 0.72);

      if (success) {
        result.stats[side].score += 1;
        result.stats[side].shots += 1;
        result.stats[side].shotsOnTarget += 1;
        if (choiceId === 'pass') {
          u.assists += 1;
          u.rating = clampRating(u.rating + 0.65);
          return {
            scoredSide: side,
            text: `BRILLIANT ASSIST! ${u.name} squares the ball across goal for a tap-in! [${result.stats.home.score}-${result.stats.away.score}]`
          };
        } else {
          u.goals += 1;
          u.shots += 1;
          u.shotsOnTarget += 1;
          u.rating = clampRating(u.rating + 0.95);
          return {
            scoredSide: side,
            text: `WHAT A FINISH! ${u.name} buries the ${choiceId === 'finesse' ? 'curled finesse shot' : 'thunderous strike'}! [${result.stats.home.score}-${result.stats.away.score}]`
          };
        }
      } else {
        u.shots += 1;
        return {
          scoredSide: null,
          text: `Saved! The keeper denies ${u.name}'s ${choiceId} attempt!`
        };
      }
    }

    const attackers = roster.filter((p) => p.onPitch && ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(p.position));
    const star = attackers[0] || roster[0];
    if (Math.random() < 0.56 && star) {
      result.stats[side].score += 1;
      result.stats[side].shots += 1;
      star.goals += 1;
      star.rating = clampRating(star.rating + 0.8);
      return {
        scoredSide: side,
        text: `TACTICAL MASTERSTROKE! Your ${choiceId.toUpperCase()} call unlocks the defense and ${star.name} scores! [${result.stats.home.score}-${result.stats.away.score}]`
      };
    }
    return {
      scoredSide: null,
      text: `${club.name} push forward with your ${choiceId} call, winning a corner.`
    };
  }

  return { simulateMatch, resolveKeyMoment };
})();
