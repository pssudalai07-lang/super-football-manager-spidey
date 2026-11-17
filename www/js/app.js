/**
 * SUPER FOOTBALL MANAGER BY SPIDEY (v4.0)
 * Broadcast UI Controller + Web Audio Stadium SFX + Visual Tactics Pitch + Full Custom Editor Studio
 */

(async function () {
  let state = null;
  let activeMode = 'manager';
  let activeTabIdx = 0;
  let selectedFocus = 'balanced';
  let selectedSwapId = null;
  let sfxEnabled = true;

  let isSimulating = false;
  let isPausedForDecision = false;
  let liveTimer = null;
  let currentMatchContext = null;
  let lastFinishedMatch = null;
  let ratingViewSide = 'home';
  let uploadedClubLogoDataUrl = null;

  // ==================== WEB AUDIO STADIUM SFX ENGINE ====================
  const SoundFX = (() => {
    let ctx = null;
    function getCtx() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) ctx = new AudioCtx();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function playWhistle() {
      if (!sfxEnabled) return;
      const c = getCtx();
      if (!c) return;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2850, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.3);
    }

    function playGoalRoar() {
      if (!sfxEnabled) return;
      const c = getCtx();
      if (!c) return;
      const bufferSize = c.sampleRate * 0.9;
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const noise = c.createBufferSource();
      noise.buffer = buffer;

      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 650;

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.28, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.9);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      noise.start();
    }

    function playFanfare() {
      if (!sfxEnabled) return;
      const c = getCtx();
      if (!c) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, c.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.08, c.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(c.currentTime + i * 0.12);
        osc.stop(c.currentTime + i * 0.12 + 0.36);
      });
    }

    return { playWhistle, playGoalRoar, playFanfare };
  })();

  const NAV_CONFIG = {
    manager: [
      { tabId: 'mgr-tab-hub', label: 'Club Hub', icon: '🏟️' },
      { tabId: 'mgr-tab-squad', label: 'Tactics', icon: '📋' },
      { tabId: 'mgr-tab-market', label: 'Market', icon: '💰' },
      { tabId: 'mgr-tab-table', label: 'Awards', icon: '🏆' },
      { tabId: 'shared-tab-editor', label: 'Editor', icon: '🛠️' }
    ],
    player: [
      { tabId: 'plr-tab-home', label: 'My Pro', icon: '⚽' },
      { tabId: 'plr-tab-training', label: 'Train', icon: '📈' },
      { tabId: 'plr-tab-transfers', label: 'Offers', icon: '✈️' },
      { tabId: 'plr-tab-league', label: 'Awards', icon: '🏆' },
      { tabId: 'shared-tab-editor', label: 'Editor', icon: '🛠️' }
    ]
  };

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
  }

  function checkAndShowCelebration() {
    if (!state.pending_celebration) return;
    const cel = state.pending_celebration;
    state.pending_celebration = null;
    SoundFX.playFanfare();
    document.getElementById('cel-icon').textContent = cel.icon || '🏆';
    document.getElementById('cel-title').textContent = cel.title;
    document.getElementById('cel-subtitle').textContent = cel.subtitle;
    document.getElementById('cel-detail').textContent = cel.detail || '';
    document.getElementById('celebration-modal').classList.add('open');
  }

  function setMode(mode) {
    activeMode = mode;
    document.getElementById('mode-btn-manager').classList.toggle('active', mode === 'manager');
    document.getElementById('mode-btn-player').classList.toggle('active', mode === 'player');
    document.getElementById('manager-view').classList.toggle('active', mode === 'manager');
    document.getElementById('player-view').classList.toggle('active', mode === 'player');

    NAV_CONFIG[mode].forEach((item, idx) => {
      const btn = document.querySelector(`.nav-item[data-idx="${idx}"]`);
      btn.querySelector('.nav-icon').textContent = item.icon;
      document.getElementById(`nav-lbl-${idx}`).textContent = item.label;
    });

    switchTab(0);
  }

  function switchTab(idx) {
    activeTabIdx = idx;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', Number(n.dataset.idx) === idx));

    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    const targetTabId = NAV_CONFIG[activeMode][idx].tabId;
    const panel = document.getElementById(targetTabId);
    if (panel) panel.classList.add('active');

    if (targetTabId === 'shared-tab-editor') {
      populateEditorDropdowns();
    } else {
      renderAll();
    }
  }

  function setupBackButton() {
    if (window.Capacitor?.Plugins?.App) {
      window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
        if (document.getElementById('celebration-modal').classList.contains('open')) {
          document.getElementById('celebration-modal').classList.remove('open');
          return;
        }
        if (document.getElementById('match-modal').classList.contains('open') && !isSimulating) {
          document.getElementById('match-modal').classList.remove('open');
          return;
        }
        if (document.getElementById('creator-modal').classList.contains('open')) {
          document.getElementById('creator-modal').classList.remove('open');
          return;
        }
        if (document.getElementById('club-picker-modal').classList.contains('open')) {
          document.getElementById('club-picker-modal').classList.remove('open');
          return;
        }
        if (activeTabIdx !== 0) {
          switchTab(0);
          return;
        }
        if (canGoBack) window.history.back();
        else window.Capacitor.Plugins.App.exitApp();
      });
    }
  }

  function renderSharedAwardsAndRankings(prefix, activeLeagueId) {
    CareerEngine.ensureV4State(state);

    const scorers = Object.values(state.season_player_stats)
      .filter((s) => s.league_id === activeLeagueId || s.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, 10);

    const bootEl = document.getElementById(`${prefix}-boot-list`);
    if (scorers.length === 0) {
      bootEl.innerHTML = '<div style="color:var(--text-muted);">Play matches to start the Golden Boot race!</div>';
    } else {
      bootEl.innerHTML = scorers.map((s, i) => `
        <div class="list-row">
          <div>
            <strong>#${i + 1} ${s.name}</strong> <span style="color:var(--text-muted);font-size:10px;">(${s.club_name})</span>
            <div style="font-size:10px;color:var(--text-muted);">${s.apps} Apps • ${s.assists} Assists</div>
          </div>
          <div style="font-size:14px;font-weight:900;color:var(--accent-gold);">⚽ ${s.goals}</div>
        </div>
      `).join('');
    }

    document.getElementById(`${prefix}-boot-history`).innerHTML = state.golden_boot_history.map((g) => `
      <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        👟 <strong>${g.season}</strong> (${g.league}): <span style="color:var(--accent-primary);">${g.player}</span> (${g.club}) — <strong>${g.goals} Goals</strong>
      </div>
    `).join('');

    const rankedClubs = [...state.clubs]
      .map((c) => {
        const lgTable = state.standings[c.league_id] || [];
        const row = lgTable.find((r) => r.club_id === c.club_id);
        const ptsBonus = row ? row.pts * 2 : 0;
        return { ...c, worldPoints: Math.round(c.rating * 18 + ptsBonus) };
      })
      .sort((a, b) => b.worldPoints - a.worldPoints)
      .slice(0, 12);

    document.getElementById(`${prefix}-world-clubs`).innerHTML = rankedClubs.map((c, idx) => `
      <div class="list-row">
        <div style="display:flex;align-items:center;gap:8px;">
          ${CareerEngine.renderClubCrestHTML(c, 26)}
          <div><strong>#${idx + 1} ${c.name}</strong> <span style="font-size:10px;color:var(--text-muted);">(${c.country})</span></div>
        </div>
        <span style="color:var(--accent-secondary);font-weight:800;">${c.worldPoints} pts</span>
      </div>
    `).join('');

    const rankedNations = [...state.national_teams]
      .sort((a, b) => b.rating - a.rating)
      .map((n, idx) => `
        <div class="list-row">
          <div><strong>#${idx + 1} ${n.name}</strong> <span style="font-size:10px;color:var(--text-muted);">(${n.confederation})</span></div>
          <span style="color:var(--accent-primary);font-weight:800;">${n.rating * 20} pts</span>
        </div>
      `).join('');
    document.getElementById(`${prefix}-world-nations`).innerHTML = rankedNations;

    const bdoList = CareerEngine.computeBallonDorStandings(state).slice(0, 8);
    document.getElementById(`${prefix}-bdo-race`).innerHTML = bdoList.map((b, idx) => `
      <div class="list-row">
        <div>
          <strong>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`} ${b.name}</strong>
          <div style="font-size:10px;color:var(--text-muted);">${b.club_name} • ${b.goals}G ${b.assists}A • Rtg ${b.avgRtg}</div>
        </div>
        <span style="color:var(--accent-gold);font-weight:900;">${b.score} pts</span>
      </div>
    `).join('');

    document.getElementById(`${prefix}-bdo-history`).innerHTML = state.ballon_dor_history.map((w) => `
      <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        🟡 <strong>${w.year}</strong>: <span style="color:var(--accent-gold);font-weight:800;">${w.winner}</span> (${w.club} • ${w.ovr} OVR)
      </div>
    `).join('');
  }

  function renderManagerMode() {
    ManagerEngine.ensureManagerState(state);
    const mgr = state.manager;
    const club = state.clubs.find((c) => c.club_id === mgr.club_id) || state.clubs[0];
    const league = state.leagues.find((l) => l.league_id === club.league_id);

    document.getElementById('mgr-club-ovr').textContent = club.rating;
    document.getElementById('mgr-club-crest').innerHTML = CareerEngine.renderClubCrestHTML(club, 48);
    document.getElementById('mgr-club-name').textContent = club.name;
    document.getElementById('mgr-league-name').textContent = `${league ? league.name : 'League'} • ${club.country}`;
    document.getElementById('mgr-stadium-name').textContent = `🏟️ ${club.stadium || 'Home Stadium'}`;
    document.getElementById('mgr-record').textContent = `W${mgr.wins} • D${mgr.draws} • L${mgr.losses}`;
    document.getElementById('mgr-budget').textContent = CareerEngine.formatMoney(mgr.budget);
    document.getElementById('mgr-board').textContent = `${mgr.board_confidence}%`;
    document.getElementById('mgr-season-wk').textContent = `Wk ${mgr.week}`;

    const nextFix = ManagerEngine.getNextManagerFixture(state);
    if (nextFix) {
      const hc = state.clubs.find((c) => c.club_id === nextFix.home_club_id);
      const ac = state.clubs.find((c) => c.club_id === nextFix.away_club_id);
      document.getElementById('mgr-next-fixture').innerHTML =
        `<span style="color:var(--accent-secondary);font-size:11px;">${nextFix.competition}</span><br/>${hc.name} vs ${ac.name}`;
    }

    // Tactics Inputs
    const formation = club.formation || '4-3-3';
    const tac = club.tactics || { buildUp: 'Balanced', pressing: 'Mid-Block', defLine: 'Normal', tempo: 'Normal' };
    document.getElementById('mgr-formation').value = formation;
    document.getElementById('mgr-buildup').value = tac.buildUp;
    document.getElementById('mgr-pressing').value = tac.pressing;
    document.getElementById('mgr-defline').value = tac.defLine;
    document.getElementById('mgr-tempo').value = tac.tempo;

    // Render Interactive Visual Pitch Nodes
    const squadData = CareerEngine.buildClubMatchSquad(state, club.club_id, false);
    const coords = CareerEngine.FORMATION_COORDS[formation] || CareerEngine.FORMATION_COORDS['4-3-3'];
    const p1 = club.primary_color || '#004C99';
    const p2 = club.secondary_color || '#FFD100';

    document.getElementById('pitch-nodes-layer').innerHTML = squadData.starters.slice(0, 11).map((p, idx) => {
      const slot = coords[idx] || { pos: p.position, x: 50, y: 50 };
      const lastName = p.name.split(' ').slice(-1)[0];
      const isSelected = selectedSwapId === p.player_id;
      return `
        <div class="pitch-node ${isSelected ? 'selected-node' : ''}" data-pid="${p.player_id}" style="left:${slot.x}%;top:${slot.y}%;">
          <div class="node-jersey" style="background:${p1};color:${p2};">${p.overall}</div>
          <div class="node-label">${slot.pos} • ${lastName}</div>
        </div>
      `;
    }).join('');

    // Render Substitutes Bench
    document.getElementById('mgr-bench-list').innerHTML = squadData.subs.map((p) => `
      <div class="list-row ${selectedSwapId === p.player_id ? 'selected-swap' : ''}" data-pid="${p.player_id}">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="pos-tag">${p.position}</span>
          <div>
            <div style="font-size:12px;font-weight:800;">${p.name}</div>
            <div style="font-size:10px;color:var(--text-muted);">Age ${p.age} • Fit ${p.fitness}%</div>
          </div>
        </div>
        <div style="font-size:14px;font-weight:900;color:var(--accent-primary);">${p.overall}</div>
      </div>
    `).join('');

    // Handle Tapping Any Player on Pitch or Bench to Swap
    const handleSwapTap = async (pid) => {
      if (!selectedSwapId) {
        selectedSwapId = pid;
        showToast('Now tap another player on Pitch or Bench to swap!');
        renderManagerMode();
      } else if (selectedSwapId === pid) {
        selectedSwapId = null;
        renderManagerMode();
      } else {
        const swapped = ManagerEngine.swapAnySquadPlayers(state, selectedSwapId, pid);
        selectedSwapId = null;
        if (swapped) {
          await StorageDB.saveState(state);
          showToast('Tactical Lineup Swapped!');
        }
        renderManagerMode();
      }
    };

    document.querySelectorAll('#pitch-nodes-layer .pitch-node, #mgr-bench-list .list-row').forEach((el) => {
      el.addEventListener('click', () => handleSwapTap(el.dataset.pid));
    });

    // Transfer Market
    const filter = document.getElementById('mgr-market-filter').value;
    const market = ManagerEngine.getTransferMarket(state, filter);
    document.getElementById('mgr-market-list').innerHTML = market.slice(0, 15).map((p) => `
      <div class="list-row">
        <div>
          <div style="font-size:13px;font-weight:800;"><span class="pos-tag">${p.position}</span> ${p.name} (${p.overall})</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${p.club_name} • Fee: <strong style="color:var(--accent-primary);">${CareerEngine.formatMoney(p.price)}</strong></div>
        </div>
        <button class="btn btn-primary btn-sm buy-plr-btn" data-pid="${p.player_id}">Buy</button>
      </div>
    `).join('');

    document.querySelectorAll('.buy-plr-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = ManagerEngine.buyPlayer(state, btn.dataset.pid);
        showToast(res.msg);
        if (res.ok) {
          await StorageDB.saveState(state);
          renderManagerMode();
        }
      });
    });

    const mySquad = Object.values(state.players).filter((p) => p.club_id === club.club_id).sort((a, b) => b.overall - a.overall);
    document.getElementById('mgr-sell-list').innerHTML = mySquad.map((p) => {
      const fee = Math.round(CareerEngine.calculateMarketValue(p) * 0.85);
      return `
        <div class="list-row">
          <div>
            <div style="font-size:12px;font-weight:800;"><span class="pos-tag">${p.position}</span> ${p.name} (${p.overall})</div>
            <div style="font-size:10px;color:var(--text-muted);">Sell Value: ${CareerEngine.formatMoney(fee)}</div>
          </div>
          <button class="btn btn-danger btn-sm sell-plr-btn" data-pid="${p.player_id}">Sell</button>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.sell-plr-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = ManagerEngine.sellPlayer(state, btn.dataset.pid);
        showToast(res.msg);
        if (res.ok) {
          await StorageDB.saveState(state);
          renderManagerMode();
        }
      });
    });

    // Table & Awards
    document.getElementById('mgr-table-title').textContent = league ? league.name : 'Standings';
    const rows = state.standings[club.league_id] || [];
    document.getElementById('mgr-table-body').innerHTML = rows.map((r, idx) => `
      <tr class="${r.club_id === club.club_id ? 'user-club-row' : ''}">
        <td>${idx + 1}</td><td>${r.name}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td>
      </tr>
    `).join('');

    document.getElementById('mgr-trophies-list').innerHTML = state.trophy_winners.map((t) =>
      `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">🏆 <strong>${t.season}</strong> ${t.competition}: <span style="color:var(--accent-gold);">${t.winner}</span></div>`
    ).join('');

    renderSharedAwardsAndRankings('mgr', club.league_id);
  }

  function renderPlayerMode() {
    CareerEngine.ensureV4State(state);
    const career = state.career;
    const userP = state.players[career.player_id];
    const currentClub = state.clubs.find((c) => c.club_id === career.current_club_id) || state.clubs[0];

    document.getElementById('plr-ovr').textContent = userP.overall;
    document.getElementById('plr-pos').textContent = userP.position;
    document.getElementById('plr-club-crest').innerHTML = CareerEngine.renderClubCrestHTML(currentClub, 48);
    document.getElementById('plr-name').textContent = userP.name;
    document.getElementById('plr-club').textContent = `${currentClub.name} • Age ${userP.age} • ${userP.nationality}`;
    document.getElementById('plr-value').textContent = `Val: ${CareerEngine.formatMoney(userP.market_value || 1000000)}`;

    // FUT 6-Stat Strip
    document.getElementById('fut-pac').textContent = userP.attributes.pace;
    document.getElementById('fut-sho').textContent = userP.attributes.shooting;
    document.getElementById('fut-pas').textContent = userP.attributes.passing;
    document.getElementById('fut-dri').textContent = userP.attributes.dribbling;
    document.getElementById('fut-def').textContent = userP.attributes.defending;
    document.getElementById('fut-phy').textContent = userP.attributes.physical;

    const stageObj = CareerEngine.STAGES.find((s) => s.id === career.stage);
    document.getElementById('plr-stage').textContent = stageObj ? stageObj.label : career.stage;

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
      const hc = nextFix.is_international
        ? state.national_teams.find((n) => n.nation_id === nextFix.home_club_id)
        : state.clubs.find((c) => c.club_id === nextFix.home_club_id);
      const ac = nextFix.is_international
        ? state.national_teams.find((n) => n.nation_id === nextFix.away_club_id)
        : state.clubs.find((c) => c.club_id === nextFix.away_club_id);
      document.getElementById('next-match-preview').innerHTML =
        `<span style="color:var(--accent-secondary);font-size:11px;">${nextFix.competition}</span><br/>${hc.name} vs ${ac.name}`;
    }

    const recentEl = document.getElementById('recent-matches-list');
    if (state.match_history.length > 0) {
      recentEl.innerHTML = state.match_history.slice(0, 5).map((m) => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span>${m.home_name} <strong>${m.home_score}-${m.away_score}</strong> ${m.away_name}</span>
          <span style="color:var(--accent-primary);">Rtg ${m.user_rating} (${m.user_goals}G ${m.user_assists}A)</span>
        </div>
      `).join('');
    }

    document.getElementById('pot-label').textContent = `Potential: ${userP.potential}`;
    const attrNames = [['pace', 'Pace'], ['shooting', 'Shooting'], ['passing', 'Passing'], ['dribbling', 'Dribbling'], ['defending', 'Defending'], ['physical', 'Physical']];
    document.getElementById('attributes-container').innerHTML = attrNames.map(([key, label]) => `
      <div class="attr-row">
        <span class="attr-label">${label}</span>
        <div class="attr-bar-wrap"><div class="attr-bar-fill" style="width:${userP.attributes[key]}%"></div></div>
        <span class="attr-num">${userP.attributes[key]}</span>
      </div>
    `).join('');

    document.getElementById('traits-container').innerHTML = CareerEngine.TRAITS_CATALOG.map((tr) => {
      const owned = (career.traits || []).includes(tr.id);
      const eligible =
        (tr.reqGoals && cs.goals >= tr.reqGoals) ||
        (tr.reqAssists && cs.assists >= tr.reqAssists) ||
        (tr.reqApps && cs.appearances >= tr.reqApps) ||
        (tr.reqRating && cs.appearances >= 2 && cs.avg_rating >= tr.reqRating);

      return `
        <div class="list-row">
          <div>
            <div style="font-size:12px;font-weight:800;">${owned ? '⭐' : '🔒'} ${tr.name}</div>
            <div style="font-size:10px;color:var(--text-muted);">${tr.desc}</div>
          </div>
          ${owned ? '<span style="font-size:10px;color:var(--accent-primary);font-weight:800;">ACTIVE</span>' :
            eligible ? `<button class="btn btn-primary btn-sm unlock-trait-btn" data-trait="${tr.id}">Unlock</button>` :
            '<span style="font-size:10px;color:var(--text-muted);">Locked</span>'}
        </div>
      `;
    }).join('');

    document.querySelectorAll('.unlock-trait-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (CareerEngine.unlockTrait(state, btn.dataset.trait)) {
          await StorageDB.saveState(state);
          showToast('Pro Trait Unlocked!');
          renderPlayerMode();
        }
      });
    });

    const nationObj = state.national_teams.find((n) => n.nation_id === career.nation_id) || state.national_teams[0];
    document.getElementById('intl-status-badge').textContent = career.national_team_selected ? 'SELECTED' : `Req OVR ${nationObj.min_callup_ovr}+`;
    document.getElementById('intl-summary').textContent = career.national_team_selected
      ? `Active member of ${nationObj.name} National Team!`
      : `Reach ${nationObj.min_callup_ovr}+ OVR & 6.8+ Form for ${nationObj.name} call-up.`;
    document.getElementById('intl-caps').textContent = cs.international_caps;
    document.getElementById('intl-goals').textContent = cs.international_goals;

    const offersEl = document.getElementById('transfer-offers-list');
    if (career.transfer_offers.length === 0) {
      offersEl.innerHTML = 'Tap "Request Offers" or perform well in matches to attract clubs!';
    } else {
      offersEl.innerHTML = career.transfer_offers.map((o) => `
        <div class="list-row">
          <div>
            <div style="font-weight:800;font-size:13px;">${o.club_name} (${o.club_rating} OVR)</div>
            <div style="font-size:10px;color:var(--text-muted);">${o.league_name} • ${o.country} • ${o.promised_role}</div>
          </div>
          <button class="btn btn-primary btn-sm accept-offer-btn" data-offer="${o.offer_id}">Sign</button>
        </div>
      `).join('');

      document.querySelectorAll('.accept-offer-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (CareerEngine.acceptTransferOffer(state, btn.dataset.offer)) {
            await StorageDB.saveState(state);
            showToast('Contract Signed! Welcome to your new club.');
            renderPlayerMode();
          }
        });
      });
    }

    const leagueObj = state.leagues.find((l) => l.league_id === currentClub.league_id);
    document.getElementById('league-table-title').textContent = leagueObj ? leagueObj.name : 'Standings';
    const rows = state.standings[currentClub.league_id] || [];
    document.getElementById('league-table-body').innerHTML = rows.map((r, idx) => `
      <tr class="${r.club_id === currentClub.club_id ? 'user-club-row' : ''}">
        <td>${idx + 1}</td><td>${r.name}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td>
      </tr>
    `).join('');

    const unlockedSet = new Set(career.unlocked_achievements || []);
    const trophyHtml = career.trophies_won.map((t) => `<div style="color:var(--accent-gold);font-weight:700;margin-bottom:4px;">🏆 ${t.season} - ${t.name}</div>`).join('');
    const achHtml = (state.achievements_catalog || []).map((a) => {
      const done = unlockedSet.has(a.id);
      return `<div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);opacity:${done ? 1 : 0.45};">
        <strong>${done ? '✅' : '🔒'} ${a.title}</strong>: ${a.desc}
      </div>`;
    }).join('');
    document.getElementById('achievements-list').innerHTML = trophyHtml + achHtml;

    renderSharedAwardsAndRankings('plr', currentClub.league_id);
  }

  function renderAll() {
    if (!state) return;
    if (activeMode === 'manager') renderManagerMode();
    else renderPlayerMode();
  }

  // ==================== CUSTOM EDITOR STUDIO LOGIC ====================
  function populateEditorDropdowns() {
    // 1. Players Dropdown
    const plrSel = document.getElementById('ed-plr-select');
    const allPlayers = Object.values(state.players).sort((a, b) => b.overall - a.overall);
    plrSel.innerHTML = `<option value="">➕ CREATE NEW PLAYER</option>` +
      allPlayers.map((p) => `<option value="${p.player_id}">${p.name} (${p.position} • ${p.overall} OVR)</option>`).join('');

    const plrClubSel = document.getElementById('ed-plr-club');
    plrClubSel.innerHTML = state.clubs.map((c) => `<option value="${c.club_id}">${c.name}</option>`).join('');

    // 2. Clubs Dropdown
    const clbSel = document.getElementById('ed-clb-select');
    clbSel.innerHTML = `<option value="">➕ CREATE NEW CLUB</option>` +
      state.clubs.map((c) => `<option value="${c.club_id}">${c.name} (${c.country} • ${c.rating} OVR)</option>`).join('');

    const clbLgeSel = document.getElementById('ed-clb-league');
    clbLgeSel.innerHTML = state.leagues.map((l) => `<option value="${l.league_id}">${l.name}</option>`).join('');

    // 3. Leagues & Cups Dropdown
    const lgeSel = document.getElementById('ed-lge-select');
    lgeSel.innerHTML = `<option value="">➕ CREATE NEW LEAGUE / TOURNAMENT</option>` +
      state.leagues.map((l) => `<option value="league:${l.league_id}">[League] ${l.name}</option>`).join('') +
      state.trophies.map((t) => `<option value="cup:${t.trophy_id}">[Cup] ${t.name}</option>`).join('');

    loadSelectedPlayerIntoEditor();
    loadSelectedClubIntoEditor();
    loadSelectedLeagueIntoEditor();
  }

  function loadSelectedPlayerIntoEditor() {
    const pid = document.getElementById('ed-plr-select').value;
    const p = state.players[pid];
    document.getElementById('ed-plr-name').value = p ? p.name : 'New Star';
    document.getElementById('ed-plr-club').value = p ? p.club_id : state.clubs[0].club_id;
    document.getElementById('ed-plr-pos').value = p ? p.position : 'ST';
    document.getElementById('ed-plr-age').value = p ? p.age : 20;
    document.getElementById('ed-plr-pot').value = p ? p.potential : 88;
    document.getElementById('ed-plr-pac').value = p ? p.attributes.pace : 78;
    document.getElementById('ed-plr-sho').value = p ? p.attributes.shooting : 78;
    document.getElementById('ed-plr-pas').value = p ? p.attributes.passing : 75;
    document.getElementById('ed-plr-dri').value = p ? p.attributes.dribbling : 78;
    document.getElementById('ed-plr-def').value = p ? p.attributes.defending : 50;
    document.getElementById('ed-plr-phy').value = p ? p.attributes.physical : 74;
  }

  function loadSelectedClubIntoEditor() {
    const cid = document.getElementById('ed-clb-select').value;
    const c = state.clubs.find((x) => x.club_id === cid);
    uploadedClubLogoDataUrl = null;
    document.getElementById('ed-clb-name').value = c ? c.name : 'Thamizhagam FC';
    document.getElementById('ed-clb-short').value = c ? c.short_name : 'TFC';
    document.getElementById('ed-clb-stadium').value = c ? (c.stadium || '') : 'Coimbatore Jawaharlal Nehru Stadium';
    document.getElementById('ed-clb-league').value = c ? c.league_id : state.leagues[0].league_id;
    document.getElementById('ed-clb-rating').value = c ? c.rating : 72;
    document.getElementById('ed-clb-c1').value = c ? (c.primary_color || '#004C99') : '#7A0026';
    document.getElementById('ed-clb-c2').value = c ? (c.secondary_color || '#FFD100') : '#FFD100';
    document.getElementById('ed-clb-pattern').value = c ? (c.crest_pattern || 'stripes') : 'stripes';
  }

  function loadSelectedLeagueIntoEditor() {
    const val = document.getElementById('ed-lge-select').value;
    if (!val) {
      document.getElementById('ed-lge-type').value = 'cup';
      document.getElementById('ed-lge-name').value = 'Spidey Champions Trophy';
      document.getElementById('ed-lge-country').value = 'India';
      document.getElementById('ed-lge-rep').value = 88;
      return;
    }
    const [kind, id] = val.split(':');
    document.getElementById('ed-lge-type').value = kind;
    if (kind === 'league') {
      const l = state.leagues.find((x) => x.league_id === id);
      if (l) {
        document.getElementById('ed-lge-name').value = l.name;
        document.getElementById('ed-lge-country').value = l.country;
        document.getElementById('ed-lge-rep').value = l.reputation || 80;
      }
    } else {
      const t = state.trophies.find((x) => x.trophy_id === id);
      if (t) {
        document.getElementById('ed-lge-name').value = t.name;
        document.getElementById('ed-lge-country').value = t.region || 'World';
        document.getElementById('ed-lge-rep').value = t.prestige || 85;
      }
    }
  }

  // ==================== ALL-PLAYER MATCH RATINGS RENDERER ====================
  function renderAllPlayersRatings() {
    if (!lastFinishedMatch) return;
    const roster = ratingViewSide === 'home' ? lastFinishedMatch.homeRoster : lastFinishedMatch.awayRoster;
    const sorted = [...roster].sort((a, b) => (b.minutesPlayed > 0 ? 1 : 0) - (a.minutesPlayed > 0 ? 1 : 0) || b.rating - a.rating);

    document.getElementById('btn-rtg-home').className = `btn btn-sm ${ratingViewSide === 'home' ? 'btn-primary' : 'btn-secondary'}`;
    document.getElementById('btn-rtg-away').className = `btn btn-sm ${ratingViewSide === 'away' ? 'btn-primary' : 'btn-secondary'}`;

    document.getElementById('all-players-ratings-list').innerHTML = sorted.map((p) => {
      const played = p.minutesPlayed > 0;
      const rtgClass = p.rating >= 7.8 ? 'rtg-high' : p.rating >= 6.6 ? 'rtg-mid' : 'rtg-low';
      const badges = [
        p.goals > 0 ? `⚽${p.goals}` : '',
        p.assists > 0 ? `🅰️${p.assists}` : '',
        p.saves > 0 ? `🧤${p.saves}` : '',
        p.yellowCard ? '🟨' : '',
        p.redCard ? '🟥' : ''
      ].filter(Boolean).join(' ');

      return `
        <div class="list-row" style="padding:6px 8px;margin-bottom:4px;opacity:${played ? 1 : 0.5};">
          <div>
            <span class="pos-tag">${p.position}</span>
            <strong style="font-size:12px;margin-left:4px;">${p.name}${p.isUser ? ' (YOU)' : ''}</strong>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
              ${played ? `${p.minutesPlayed}' • Passes ${p.passesCompleted}/${p.passesAttempted} ${badges}` : 'Unused Substitute'}
            </div>
          </div>
          <span class="rtg-pill ${played ? rtgClass : ''}">${played ? p.rating.toFixed(1) : '-'}</span>
        </div>
      `;
    }).join('');
  }

  // ==================== 2D MATCHDAY ARENA & PLAYBACK ====================
  function openMatchArena() {
    const isMgr = activeMode === 'manager';
    const fix = isMgr ? ManagerEngine.getNextManagerFixture(state) : CareerEngine.getNextUserFixture(state);
    if (!fix) return;

    const hc = fix.is_international
      ? state.national_teams.find((n) => n.nation_id === fix.home_club_id)
      : state.clubs.find((c) => c.club_id === fix.home_club_id);
    const ac = fix.is_international
      ? state.national_teams.find((n) => n.nation_id === fix.away_club_id)
      : state.clubs.find((c) => c.club_id === fix.away_club_id);

    document.getElementById('match-comp-title').textContent = fix.competition;
    document.getElementById('sim-home-crest').innerHTML = fix.is_international ? '🏳️' : CareerEngine.renderClubCrestHTML(hc, 34);
    document.getElementById('sim-away-crest').innerHTML = fix.is_international ? '🏳️' : CareerEngine.renderClubCrestHTML(ac, 34);
    document.getElementById('sim-home-name').textContent = hc.name;
    document.getElementById('sim-away-name').textContent = ac.name;
    document.getElementById('sim-score').textContent = '0 - 0';
    document.getElementById('match-clock').textContent = "0'";
    document.getElementById('pitch-ball').style.left = '50%';
    document.getElementById('pitch-ball').style.top = '50%';
    document.getElementById('pitch-zone-label').textContent = 'Kick-Off Ready';
    document.getElementById('commentary-feed').innerHTML = 'Choose your setup and tap Live 2D Sim or Instant Sim!';
    document.getElementById('match-stats-summary').textContent = '';
    document.getElementById('user-match-card').style.display = 'none';
    document.getElementById('interview-box').style.display = 'none';
    document.getElementById('all-ratings-section').style.display = 'none';
    document.getElementById('key-moment-box').classList.remove('active');

    document.getElementById('player-focus-bar').style.display = isMgr ? 'none' : 'block';
    document.getElementById('manager-touchline-bar').style.display = isMgr ? 'block' : 'none';

    document.getElementById('match-modal').classList.add('open');
  }

  function prepareMatchSimulation() {
    const isMgr = activeMode === 'manager';
    const fix = isMgr ? ManagerEngine.getNextManagerFixture(state) : CareerEngine.getNextUserFixture(state);
    if (!fix) return null;

    if (isMgr) {
      const homeClub = state.clubs.find((c) => c.club_id === fix.home_club_id);
      const awayClub = state.clubs.find((c) => c.club_id === fix.away_club_id);
      const managedSide = fix.home_club_id === state.manager.club_id ? 'home' : 'away';
      const hSquad = CareerEngine.buildClubMatchSquad(state, homeClub.club_id, false);
      const aSquad = CareerEngine.buildClubMatchSquad(state, awayClub.club_id, false);

      const result = MatchEngine.simulateMatch({
        homeClub,
        awayClub,
        homeStarters: hSquad.starters,
        homeSubs: hSquad.subs,
        awayStarters: aSquad.starters,
        awaySubs: aSquad.subs,
        managedSide,
        isKnockout: Boolean(fix.is_cup),
        competition: fix.competition
      });
      return { fix, result, isMgr: true, managedSide };
    } else {
      const isUserHome = fix.is_international
        ? fix.home_club_id === state.career.nation_id
        : fix.home_club_id === state.career.current_club_id;

      const homeClub = fix.is_international
        ? (() => { const n = state.national_teams.find((x) => x.nation_id === fix.home_club_id); return { club_id: n.nation_id, name: `${n.name} NT`, short_name: n.code, rating: n.rating, tactical_style: 'Balanced' }; })()
        : state.clubs.find((c) => c.club_id === fix.home_club_id);

      const awayClub = fix.is_international
        ? (() => { const n = state.national_teams.find((x) => x.nation_id === fix.away_club_id); return { club_id: n.nation_id, name: `${n.name} NT`, short_name: n.code, rating: n.rating, tactical_style: 'Balanced' }; })()
        : state.clubs.find((c) => c.club_id === fix.away_club_id);

      const hSquad = fix.is_international
        ? CareerEngine.buildNationalSquad(state, fix.home_club_id, isUserHome)
        : CareerEngine.buildClubMatchSquad(state, fix.home_club_id, isUserHome);

      const aSquad = fix.is_international
        ? CareerEngine.buildNationalSquad(state, fix.away_club_id, !isUserHome)
        : CareerEngine.buildClubMatchSquad(state, fix.away_club_id, !isUserHome);

      const result = MatchEngine.simulateMatch({
        homeClub,
        awayClub,
        homeStarters: hSquad.starters,
        homeSubs: hSquad.subs,
        awayStarters: aSquad.starters,
        awaySubs: aSquad.subs,
        userPlayerId: state.career.player_id,
        userFocus: selectedFocus,
        isKnockout: Boolean(fix.is_cup),
        competition: fix.competition
      });
      return { fix, result, isMgr: false };
    }
  }

  async function finalizeMatch(ctx) {
    isSimulating = false;
    isPausedForDecision = false;
    SoundFX.playWhistle();
    const { fix, result, isMgr } = ctx;
    lastFinishedMatch = result;

    document.getElementById('match-clock').textContent = 'FT';
    const penText = result.stats.penalties ? ` (Pen ${result.stats.penalties.home}-${result.stats.penalties.away})` : '';
    document.getElementById('sim-score').textContent = `${result.stats.home.score} - ${result.stats.away.score}${penText}`;
    document.getElementById('pitch-ball').style.left = '50%';
    document.getElementById('pitch-ball').style.top = '50%';
    document.getElementById('pitch-zone-label').textContent = 'Full Time';
    document.getElementById('match-stats-summary').textContent =
      `Poss: ${result.stats.home.possession}%-${result.stats.away.possession}% | Shots: ${result.stats.home.shots}-${result.stats.away.shots} | Pass: ${result.stats.home.passAccuracy}%-${result.stats.away.passAccuracy}%`;

    document.getElementById('all-ratings-section').style.display = 'block';
    document.getElementById('btn-rtg-home').textContent = `${result.homeClub.short_name} Ratings`;
    document.getElementById('btn-rtg-away').textContent = `${result.awayClub.short_name} Ratings`;
    ratingViewSide = 'home';
    renderAllPlayersRatings();

    if (isMgr) {
      ManagerEngine.processManagerMatch(state, fix, result);
    } else {
      if (result.userStats) {
        document.getElementById('user-match-card').style.display = 'block';
        document.getElementById('u-stat-min').textContent = `${result.userStats.minutesPlayed}'`;
        document.getElementById('u-stat-ga').textContent = `${result.userStats.goals}/${result.userStats.assists}`;
        document.getElementById('u-stat-pass').textContent = `${result.userStats.passesCompleted}/${result.userStats.passesAttempted}`;
        document.getElementById('u-stat-rtg').textContent = result.userStats.rating.toFixed(1);
        document.getElementById('user-motm-badge').textContent =
          result.motm && result.motm.player_id === state.career.player_id ? '⭐ MOTM' : '';
        document.getElementById('interview-box').style.display = 'block';
      }
      CareerEngine.processMatchResult(state, fix, result);
    }

    await StorageDB.saveState(state);
    renderAll();
    checkAndShowCelebration();
  }

  async function startMatchPlayback(instant = false) {
    if (isSimulating) return;
    const ctx = prepareMatchSimulation();
    if (!ctx) return;

    SoundFX.playWhistle();
    currentMatchContext = ctx;
    const feedEl = document.getElementById('commentary-feed');
    feedEl.innerHTML = '';
    document.getElementById('key-moment-box').classList.remove('active');
    document.getElementById('all-ratings-section').style.display = 'none';

    if (instant) {
      const nonInteractive = ctx.result.events.filter((e) => e.type !== 'KEY_MOMENT');
      feedEl.innerHTML = nonInteractive.map((ev) => `
        <div class="event-line ${ev.isUserEvent ? 'user-highlight' : ''}">
          <span class="event-min">${ev.minute}'</span>${ev.text}
        </div>
      `).join('');
      await finalizeMatch(ctx);
      return;
    }

    isSimulating = true;
    let idx = 0;

    function stepPlayback() {
      if (isPausedForDecision) return;
      if (idx >= ctx.result.events.length) {
        clearInterval(liveTimer);
        finalizeMatch(ctx);
        return;
      }

      const ev = ctx.result.events[idx];
      idx += 1;

      if (ev.type === 'GOAL') SoundFX.playGoalRoar();

      document.getElementById('match-clock').textContent = `${ev.minute}'`;
      document.getElementById('pitch-ball').style.left = `${ev.ballX || 50}%`;
      document.getElementById('pitch-ball').style.top = `${ev.ballY || 50}%`;
      document.getElementById('pitch-zone-label').textContent = ev.zoneLabel || 'In Play';
      document.getElementById('sim-score').textContent = `${ctx.result.stats.home.score} - ${ctx.result.stats.away.score}`;

      if (ev.type === 'KEY_MOMENT') {
        isPausedForDecision = true;
        const kmBox = document.getElementById('key-moment-box');
        document.getElementById('km-title').textContent = ev.title;
        document.getElementById('km-desc').textContent = ev.desc;
        const optWrap = document.getElementById('km-options');
        optWrap.innerHTML = ev.options.map((o) =>
          `<button class="btn btn-gold btn-sm km-choice-btn" data-choice="${o.id}">${o.label}</button>`
        ).join('');
        kmBox.classList.add('active');

        optWrap.querySelectorAll('.km-choice-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            kmBox.classList.remove('active');
            const outcome = MatchEngine.resolveKeyMoment(ctx.result, ev, btn.dataset.choice);
            if (outcome.scoredSide) {
              SoundFX.playGoalRoar();
              document.getElementById('pitch-ball').style.left = outcome.scoredSide === 'home' ? '96%' : '4%';
              document.getElementById('pitch-zone-label').textContent = 'GOOOAL!';
            }
            document.getElementById('sim-score').textContent = `${ctx.result.stats.home.score} - ${ctx.result.stats.away.score}`;

            const line = document.createElement('div');
            line.className = 'event-line user-highlight';
            line.innerHTML = `<span class="event-min">${ev.minute}'</span>${outcome.text}`;
            feedEl.prepend(line);

            isPausedForDecision = false;
          });
        });
        return;
      }

      const line = document.createElement('div');
      line.className = `event-line ${ev.isUserEvent ? 'user-highlight' : ''}`;
      line.innerHTML = `<span class="event-min">${ev.minute}'</span>${ev.text}`;
      feedEl.prepend(line);
    }

    liveTimer = setInterval(stepPlayback, 260);
  }

  // ==================== INITIALIZE APP ====================
  state = await StorageDB.loadOrInitializeGame();
  CareerEngine.ensureSeasonFixtures(state);
  ManagerEngine.ensureManagerState(state);
  await StorageDB.saveState(state);
  setupBackButton();

  document.getElementById('btn-toggle-sfx').addEventListener('click', (e) => {
    sfxEnabled = !sfxEnabled;
    e.target.textContent = sfxEnabled ? '🔊 SFX ON' : '🔇 SFX OFF';
  });

  const populateClubDropdown = (selectEl, selectedId) => {
    selectEl.innerHTML = '';
    state.clubs.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.club_id;
      opt.textContent = `${c.name} (${c.country} • ${c.rating} OVR)`;
      if (c.club_id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  };
  populateClubDropdown(document.getElementById('inp-club'), state.career.current_club_id);
  populateClubDropdown(document.getElementById('mgr-club-select'), state.manager.club_id);

  document.getElementById('mode-btn-manager').addEventListener('click', () => setMode('manager'));
  document.getElementById('mode-btn-player').addEventListener('click', () => setMode('player'));

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(Number(btn.dataset.idx)));
  });

  document.querySelectorAll('.subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bar = btn.parentElement;
      const container = bar.parentElement;
      bar.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
      container.querySelectorAll('.subtab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.pane).classList.add('active');
    });
  });

  document.getElementById('btn-rtg-home').addEventListener('click', () => {
    ratingViewSide = 'home';
    renderAllPlayersRatings();
  });
  document.getElementById('btn-rtg-away').addEventListener('click', () => {
    ratingViewSide = 'away';
    renderAllPlayersRatings();
  });

  document.getElementById('btn-close-celebration').addEventListener('click', () => {
    document.getElementById('celebration-modal').classList.remove('open');
  });

  // Manager Mode Listeners
  document.getElementById('btn-mgr-play').addEventListener('click', openMatchArena);
  document.getElementById('btn-mgr-change-club').addEventListener('click', () => {
    populateClubDropdown(document.getElementById('mgr-club-select'), state.manager.club_id);
    document.getElementById('club-picker-modal').classList.add('open');
  });
  document.getElementById('btn-cancel-club-pick').addEventListener('click', () => {
    document.getElementById('club-picker-modal').classList.remove('open');
  });
  document.getElementById('btn-confirm-club-pick').addEventListener('click', async () => {
    ManagerEngine.selectClub(state, document.getElementById('mgr-club-select').value);
    await StorageDB.saveState(state);
    document.getElementById('club-picker-modal').classList.remove('open');
    showToast('You are now the new Manager!');
    renderManagerMode();
  });

  document.getElementById('btn-save-tactics').addEventListener('click', async () => {
    ManagerEngine.setFullTactics(state, {
      formation: document.getElementById('mgr-formation').value,
      buildUp: document.getElementById('mgr-buildup').value,
      pressing: document.getElementById('mgr-pressing').value,
      defLine: document.getElementById('mgr-defline').value,
      tempo: document.getElementById('mgr-tempo').value
    });
    await StorageDB.saveState(state);
    showToast('Tactical Blueprint Applied!');
    renderManagerMode();
  });

  document.getElementById('mgr-market-filter').addEventListener('change', renderManagerMode);

  document.getElementById('btn-mgr-train-tactics').addEventListener('click', async () => {
    const msg = ManagerEngine.runTeamTraining(state, 'tactics');
    await StorageDB.saveState(state);
    showToast(msg);
    renderManagerMode();
  });
  document.getElementById('btn-mgr-train-rest').addEventListener('click', async () => {
    const msg = ManagerEngine.runTeamTraining(state, 'recovery');
    await StorageDB.saveState(state);
    showToast(msg);
    renderManagerMode();
  });

  // Player Mode Listeners
  document.getElementById('btn-go-match').addEventListener('click', openMatchArena);
  document.querySelectorAll('.focus-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.focus-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFocus = btn.dataset.focus;
    });
  });

  document.querySelectorAll('.drill-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = CareerEngine.applyTrainingDrill(state, btn.dataset.drill);
      await StorageDB.saveState(state);
      showToast(res.message);
      renderPlayerMode();
    });
  });

  document.getElementById('btn-req-transfer').addEventListener('click', async () => {
    CareerEngine.generateTransferOffers(state, true);
    await StorageDB.saveState(state);
    showToast('Agent contacted clubs for offers!');
    renderPlayerMode();
  });

  document.getElementById('btn-open-creator').addEventListener('click', () => {
    const userP = state.players[state.career.player_id];
    document.getElementById('inp-name').value = userP.name;
    document.getElementById('inp-age').value = userP.age;
    document.getElementById('inp-pos').value = userP.position;
    document.getElementById('inp-nation').value = userP.nationality;
    populateClubDropdown(document.getElementById('inp-club'), state.career.current_club_id);
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
    showToast('Pro Footballer Updated!');
    renderPlayerMode();
  });

  // Custom Editor Studio Listeners
  document.getElementById('ed-plr-select').addEventListener('change', loadSelectedPlayerIntoEditor);
  document.getElementById('btn-ed-save-player').addEventListener('click', async () => {
    const saved = CareerEngine.upsertCustomPlayer(state, {
      player_id: document.getElementById('ed-plr-select').value,
      name: document.getElementById('ed-plr-name').value,
      club_id: document.getElementById('ed-plr-club').value,
      position: document.getElementById('ed-plr-pos').value,
      age: document.getElementById('ed-plr-age').value,
      potential: document.getElementById('ed-plr-pot').value,
      pace: document.getElementById('ed-plr-pac').value,
      shooting: document.getElementById('ed-plr-sho').value,
      passing: document.getElementById('ed-plr-pas').value,
      dribbling: document.getElementById('ed-plr-dri').value,
      defending: document.getElementById('ed-plr-def').value,
      physical: document.getElementById('ed-plr-phy').value
    });
    await StorageDB.saveState(state);
    populateEditorDropdowns();
    showToast(`Saved ${saved.name} (${saved.overall} OVR)!`);
  });

  document.getElementById('ed-clb-select').addEventListener('change', loadSelectedClubIntoEditor);
  document.getElementById('ed-clb-logo-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uploadedClubLogoDataUrl = reader.result;
      showToast('Custom Logo Selected! Tap Save Club.');
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('btn-ed-save-club').addEventListener('click', async () => {
    const saved = CareerEngine.upsertCustomClub(state, {
      club_id: document.getElementById('ed-clb-select').value,
      name: document.getElementById('ed-clb-name').value,
      short_name: document.getElementById('ed-clb-short').value,
      stadium: document.getElementById('ed-clb-stadium').value,
      league_id: document.getElementById('ed-clb-league').value,
      rating: document.getElementById('ed-clb-rating').value,
      primary_color: document.getElementById('ed-clb-c1').value,
      secondary_color: document.getElementById('ed-clb-c2').value,
      crest_pattern: document.getElementById('ed-clb-pattern').value,
      custom_logo: uploadedClubLogoDataUrl
    });
    await StorageDB.saveState(state);
    populateEditorDropdowns();
    showToast(`Saved Club: ${saved.name}!`);
  });

  document.getElementById('ed-lge-select').addEventListener('change', loadSelectedLeagueIntoEditor);
  document.getElementById('btn-ed-save-league').addEventListener('click', async () => {
    const val = document.getElementById('ed-lge-select').value;
    const id = val ? val.split(':')[1] : null;
    CareerEngine.upsertCustomLeagueOrCup(state, {
      id,
      type: document.getElementById('ed-lge-type').value,
      name: document.getElementById('ed-lge-name').value,
      country: document.getElementById('ed-lge-country').value,
      reputation: document.getElementById('ed-lge-rep').value
    });
    await StorageDB.saveState(state);
    populateEditorDropdowns();
    showToast('Competition Saved!');
  });

  // Match Arena Listeners
  document.getElementById('btn-sim-live').addEventListener('click', () => startMatchPlayback(false));
  document.getElementById('btn-sim-instant').addEventListener('click', () => startMatchPlayback(true));
  document.getElementById('btn-close-match').addEventListener('click', () => {
    if (isSimulating) {
      showToast('Wait for Full Time or tap Instant Sim!');
      return;
    }
    document.getElementById('match-modal').classList.remove('open');
  });

  document.getElementById('mgr-live-mentality').addEventListener('change', (e) => {
    const club = state.clubs.find((c) => c.club_id === state.manager.club_id);
    if (club) {
      club.tactical_style = e.target.value;
      if (club.tactics) club.tactics.buildUp = e.target.value;
    }
    showToast(`Touchline Style: ${e.target.value}`);
  });

  document.getElementById('btn-mgr-quick-sub').addEventListener('click', () => {
    if (!isSimulating || !currentMatchContext) {
      showToast('Start Live 2D Sim first to send a Super-Sub!');
      return;
    }
    const line = document.createElement('div');
    line.className = 'event-line user-highlight';
    line.innerHTML = `<span class="event-min">SUB</span>Manager sends on fresh legs from the bench!`;
    document.getElementById('commentary-feed').prepend(line);
    showToast('Fresh Sub Sent On!');
  });

  document.querySelectorAll('.interview-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const msg = CareerEngine.applyInterviewChoice(state, btn.dataset.choice);
      document.getElementById('interview-box').style.display = 'none';
      await StorageDB.saveState(state);
      showToast(msg);
      renderPlayerMode();
    });
  });

  document.getElementById('btn-reset-career').addEventListener('click', async () => {
    state = await StorageDB.resetCareer();
    CareerEngine.ensureSeasonFixtures(state);
    ManagerEngine.ensureManagerState(state);
    await StorageDB.saveState(state);
    showToast('All Saves Reset!');
    setMode('manager');
  });

  setMode('manager');
})();
