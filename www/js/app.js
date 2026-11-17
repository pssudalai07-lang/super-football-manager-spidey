/**
 * SUPER FOOTBALL MANAGER BY SPIDEY
 * Main Mobile UI Controller, Live 90-Min Playback & Android Back-Button Handler.
 */

(async function () {
  let state = null;
  let activeTab = 'tab-home';
  let selectedFocus = 'balanced';
  let isSimulating = false;
  let liveTimer = null;

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.display = 'none';
    }, 2600);
  }

  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

    const panel = document.getElementById(tabId);
    const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (panel) panel.classList.add('active');
    if (navBtn) navBtn.classList.add('active');
    renderAll();
  }

  function setupBackButton() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
        const modal = document.getElementById('creator-modal');
        if (modal.classList.contains('open')) {
          modal.classList.remove('open');
          return;
        }
        if (activeTab !== 'tab-home') {
          switchTab('tab-home');
          return;
        }
        if (canGoBack) {
          window.history.back();
        } else {
          window.Capacitor.Plugins.App.exitApp();
        }
      });
    }
  }

  function getEntitiesForFixture(fix) {
    if (!fix) return null;
    if (fix.is_international) {
      const homeN = state.national_teams.find((n) => n.nation_id === fix.home_club_id);
      const awayN = state.national_teams.find((n) => n.nation_id === fix.away_club_id);
      return {
        homeClub: { club_id: homeN.nation_id, name: `${homeN.name} NT`, short_name: homeN.code, rating: homeN.rating, tactical_style: 'Balanced' },
        awayClub: { club_id: awayN.nation_id, name: `${awayN.name} NT`, short_name: awayN.code, rating: awayN.rating, tactical_style: 'Balanced' }
      };
    }
    return {
      homeClub: state.clubs.find((c) => c.club_id === fix.home_club_id),
      awayClub: state.clubs.find((c) => c.club_id === fix.away_club_id)
    };
  }

  function renderAll() {
    if (!state) return;
    const career = state.career;
    const userP = state.players[career.player_id];
    const currentClub = state.clubs.find((c) => c.club_id === career.current_club_id) || state.clubs[0];

    document.getElementById('hero-ovr').textContent = userP.overall;
    document.getElementById('hero-pos').textContent = userP.position;
    document.getElementById('hero-name').textContent = userP.name;
    document.getElementById('hero-club').textContent = `${currentClub.name} • Age ${userP.age} • ${userP.nationality}`;

    const stageObj = CareerEngine.STAGES.find((s) => s.id === career.stage);
    document.getElementById('hero-stage').textContent = stageObj ? stageObj.label : career.stage;

    const cs = career.career_stats;
    document.getElementById('kpi-apps').textContent = cs.appearances;
    document.getElementById('kpi-goals').textContent = cs.goals;
    document.getElementById('kpi-assists').textContent = cs.assists;
    document.getElementById('kpi-rating').textContent = cs.avg_rating.toFixed(1);

    document.getElementById('season-week-label').textContent = `${career.current_season} • Week ${career.current_week}`;
    document.getElementById('squad-role-label').textContent = career.squad_role;
    document.getElementById('bar-fitness').style.width = `${userP.fitness}%`;
    document.getElementById('val-fitness').textContent = userP.fitness;
    document.getElementById('bar-morale').style.width = `${userP.morale}%`;
    document.getElementById('val-morale').textContent = userP.morale;
    document.getElementById('bar-trust').style.width = `${career.manager_trust}%`;
    document.getElementById('val-trust').textContent = career.manager_trust;

    const nextFix = CareerEngine.getNextUserFixture(state);
    if (nextFix) {
      const ents = getEntitiesForFixture(nextFix);
      document.getElementById('next-match-preview').innerHTML =
        `<span style="color:var(--accent-secondary);font-size:11px;">${nextFix.competition}</span><br/>${ents.homeClub.name} vs ${ents.awayClub.name}`;
      if (!isSimulating) {
        document.getElementById('match-comp-title').textContent = nextFix.competition;
        document.getElementById('sim-home-name').textContent = ents.homeClub.name;
        document.getElementById('sim-away-name').textContent = ents.awayClub.name;
      }
    }

    const recentEl = document.getElementById('recent-matches-list');
    if (state.match_history.length > 0) {
      recentEl.innerHTML = state.match_history.slice(0, 5).map((m) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span>${m.home_name} <strong>${m.home_score}-${m.away_score}</strong> ${m.away_name}</span>
          <span style="color:var(--accent-primary);">Rtg ${m.user_rating} (${m.user_goals}G ${m.user_assists}A)</span>
        </div>
      `).join('');
    }

    document.getElementById('pot-label').textContent = `Potential: ${userP.potential}`;
    const attrNames = [
      ['pace', 'Pace'],
      ['shooting', 'Shooting'],
      ['passing', 'Passing'],
      ['dribbling', 'Dribbling'],
      ['defending', 'Defending'],
      ['physical', 'Physical']
    ];
    document.getElementById('attributes-container').innerHTML = attrNames.map(([key, label]) => `
      <div class="attr-row">
        <span class="attr-label">${label}</span>
        <div class="attr-bar-wrap"><div class="attr-bar-fill" style="width:${userP.attributes[key]}%"></div></div>
        <span class="attr-num">${userP.attributes[key]}</span>
      </div>
    `).join('');

    const nationObj = state.national_teams.find((n) => n.nation_id === career.nation_id) || state.national_teams[0];
    document.getElementById('intl-status-badge').textContent = career.national_team_selected ? 'SELECTED' : `Req OVR ${nationObj.min_callup_ovr}+`;
    document.getElementById('intl-summary').textContent = career.national_team_selected
      ? `You are an active member of the ${nationObj.name} National Team squad! International break fixtures will automatically feature you.`
      : `Keep improving your Overall Rating (currently ${userP.overall}) and Form (${userP.form}) to earn your ${nationObj.name} National Team call-up.`;
    document.getElementById('intl-caps').textContent = cs.international_caps;
    document.getElementById('intl-goals').textContent = cs.international_goals;

    const offersEl = document.getElementById('transfer-offers-list');
    if (career.transfer_offers.length === 0) {
      offersEl.innerHTML = 'No active transfer offers right now. Keep performing in matches to attract scouts!';
    } else {
      offersEl.innerHTML = career.transfer_offers.map((o) => `
        <div style="background:var(--bg-card-alt);padding:10px;border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div style="font-weight:800;font-size:14px;">${o.club_name} (${o.club_rating} OVR)</div>
            <div style="font-size:11px;color:var(--text-muted);">${o.league_name} • ${o.country} • Role: ${o.promised_role}</div>
          </div>
          <button class="btn btn-primary btn-sm accept-offer-btn" data-offer="${o.offer_id}">Sign</button>
        </div>
      `).join('');

      document.querySelectorAll('.accept-offer-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ok = CareerEngine.acceptTransferOffer(state, btn.dataset.offer);
          if (ok) {
            await StorageDB.saveState(state);
            showToast('Transfer Completed! Welcome to your new club.');
            renderAll();
          }
        });
      });
    }

    const leagueObj = state.leagues.find((l) => l.league_id === currentClub.league_id);
    document.getElementById('league-table-title').textContent = leagueObj ? leagueObj.name : 'League Standings';
    document.getElementById('db-meta-label').textContent = `DB v${state.db_version}`;

    const rows = state.standings[currentClub.league_id] || [];
    document.getElementById('league-table-body').innerHTML = rows.map((r, idx) => `
      <tr class="${r.club_id === currentClub.club_id ? 'user-club-row' : ''}">
        <td>${idx + 1}</td>
        <td>${r.name}</td>
        <td>${r.played}</td>
        <td>${r.won}</td>
        <td>${r.drawn}</td>
        <td>${r.lost}</td>
        <td>${r.gf - r.ga}</td>
        <td><strong>${r.pts}</strong></td>
      </tr>
    `).join('');

    const unlockedSet = new Set(career.unlocked_achievements || []);
    const trophyHtml = career.trophies_won.map((t) =>
      `<div style="color:var(--accent-gold);font-weight:700;margin-bottom:6px;">🏆 ${t.season} - ${t.name} (${t.club})</div>`
    ).join('');

    const achHtml = (state.achievements_catalog || []).map((a) => {
      const done = unlockedSet.has(a.id);
      return `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);opacity:${done ? 1 : 0.45};">
        <strong>${done ? '✅' : '🔒'} ${a.title}</strong>: ${a.desc}
      </div>`;
    }).join('');

    document.getElementById('achievements-list').innerHTML = trophyHtml + achHtml;
  }

  async function runMatchSimulation(instant = false) {
    if (isSimulating) return;
    const fix = CareerEngine.getNextUserFixture(state);
    if (!fix) return;

    const ents = getEntitiesForFixture(fix);
    const userId = state.career.player_id;
    const isUserHome = fix.is_international
      ? fix.home_club_id === state.career.nation_id
      : fix.home_club_id === state.career.current_club_id;

    const hSquad = fix.is_international
      ? CareerEngine.buildNationalSquad(state, fix.home_club_id, isUserHome)
      : CareerEngine.buildClubMatchSquad(state, fix.home_club_id, isUserHome);

    const aSquad = fix.is_international
      ? CareerEngine.buildNationalSquad(state, fix.away_club_id, !isUserHome)
      : CareerEngine.buildClubMatchSquad(state, fix.away_club_id, !isUserHome);

    const result = MatchEngine.simulateMatch({
      homeClub: ents.homeClub,
      awayClub: ents.awayClub,
      homeStarters: hSquad.starters,
      homeSubs: hSquad.subs,
      awayStarters: aSquad.starters,
      awaySubs: aSquad.subs,
      userPlayerId: userId,
      userFocus: selectedFocus,
      competition: fix.competition
    });

    const feedEl = document.getElementById('commentary-feed');
    const clockEl = document.getElementById('match-clock');
    const scoreEl = document.getElementById('sim-score');
    const summaryEl = document.getElementById('match-stats-summary');

    feedEl.innerHTML = '';
    document.getElementById('user-match-card').style.display = 'none';

    const finalize = async () => {
      isSimulating = false;
      clockEl.textContent = 'FT';
      scoreEl.textContent = `${result.stats.home.score} - ${result.stats.away.score}`;
      summaryEl.textContent = `Possession: ${result.stats.home.possession}% - ${result.stats.away.possession}% | Shots: ${result.stats.home.shots} - ${result.stats.away.shots} | Pass Acc: ${result.stats.home.passAccuracy}% - ${result.stats.away.passAccuracy}%`;

      if (result.userStats) {
        document.getElementById('user-match-card').style.display = 'block';
        document.getElementById('u-stat-min').textContent = `${result.userStats.minutesPlayed}'`;
        document.getElementById('u-stat-ga').textContent = `${result.userStats.goals} / ${result.userStats.assists}`;
        document.getElementById('u-stat-pass').textContent = `${result.userStats.passesCompleted}/${result.userStats.passesAttempted}`;
        document.getElementById('u-stat-rtg').textContent = result.userStats.rating.toFixed(1);
        document.getElementById('user-motm-badge').textContent =
          result.motm && result.motm.player_id === userId ? '⭐ MAN OF THE MATCH' : '';
      }

      CareerEngine.processMatchResult(state, fix, result);
      await StorageDB.saveState(state);
      renderAll();
    };

    if (instant) {
      feedEl.innerHTML = result.events.map((ev) => `
        <div class="event-line ${ev.isUserEvent ? 'user-highlight' : ''}">
          <span class="event-min">${ev.minute}'</span>${ev.text}
        </div>
      `).join('');
      await finalize();
      return;
    }

    isSimulating = true;
    let idx = 0;
    let liveHome = 0;
    let liveAway = 0;

    liveTimer = setInterval(async () => {
      if (idx >= result.events.length) {
        clearInterval(liveTimer);
        await finalize();
        return;
      }

      const ev = result.events[idx];
      clockEl.textContent = `${ev.minute}'`;
      if (ev.type === 'GOAL') {
        if (ev.teamSide === 'home') liveHome += 1;
        else liveAway += 1;
        scoreEl.textContent = `${liveHome} - ${liveAway}`;
      }

      const line = document.createElement('div');
      line.className = `event-line ${ev.isUserEvent ? 'user-highlight' : ''}`;
      line.innerHTML = `<span class="event-min">${ev.minute}'</span>${ev.text}`;
      feedEl.prepend(line);
      idx += 1;
    }, 260);
  }

  state = await StorageDB.loadOrInitializeGame();
  CareerEngine.ensureSeasonFixtures(state);
  await StorageDB.saveState(state);
  setupBackButton();

  const clubSelect = document.getElementById('inp-club');
  state.clubs.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.club_id;
    opt.textContent = `${c.name} (${c.country} • ${c.rating} OVR)`;
    if (c.club_id === state.career.current_club_id) opt.selected = true;
    clubSelect.appendChild(opt);
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('btn-go-match').addEventListener('click', () => switchTab('tab-match'));

  document.querySelectorAll('.focus-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.focus-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFocus = btn.dataset.focus;
    });
  });

  document.getElementById('btn-sim-live').addEventListener('click', () => runMatchSimulation(false));
  document.getElementById('btn-sim-instant').addEventListener('click', () => runMatchSimulation(true));

  document.querySelectorAll('.drill-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = CareerEngine.applyTrainingDrill(state, btn.dataset.drill);
      await StorageDB.saveState(state);
      showToast(res.message);
      renderAll();
    });
  });

  document.getElementById('btn-open-creator').addEventListener('click', () => {
    const userP = state.players[state.career.player_id];
    document.getElementById('inp-name').value = userP.name;
    document.getElementById('inp-age').value = userP.age;
    document.getElementById('inp-pos').value = userP.position;
    document.getElementById('inp-nation').value = userP.nationality;
    document.getElementById('inp-club').value = state.career.current_club_id;
    document.getElementById('creator-modal').classList.add('open');
  });

  document.getElementById('btn-cancel-creator').addEventListener('click', () => {
    document.getElementById('creator-modal').classList.remove('open');
  });

  document.getElementById('btn-save-creator').addEventListener('click', async () => {
    CareerEngine.createCustomProtagonist(state, {
      name: document.getElementById('inp-name').value,
      age: document.getElementById('inp-age').value,
      position: document.getElementById('inp-pos').value,
      nationality: document.getElementById('inp-nation').value,
      clubId: document.getElementById('inp-club').value
    });
    await StorageDB.saveState(state);
    document.getElementById('creator-modal').classList.remove('open');
    showToast('Custom Footballer Updated!');
    renderAll();
  });

  document.getElementById('btn-reset-career').addEventListener('click', async () => {
    state = await StorageDB.resetCareer();
    CareerEngine.ensureSeasonFixtures(state);
    await StorageDB.saveState(state);
    showToast('New Career Started!');
    switchTab('tab-home');
  });

  renderAll();
})();
