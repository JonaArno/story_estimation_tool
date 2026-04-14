/* ── Fibonacci card values ─────────────────────────────────── */
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

/* ── State ─────────────────────────────────────────────────── */
let socket;
let myName = '';
let myIsSpectator = false;
let myVote = null;
let roomState = null;

/* ── DOM refs ──────────────────────────────────────────────── */
const screenJoin = document.getElementById('screen-join');
const screenRoom = document.getElementById('screen-room');
const formJoin = document.getElementById('form-join');
const inputName = document.getElementById('input-name');
const inputStory = document.getElementById('input-story');
const btnSetStory = document.getElementById('btn-set-story');
const storyDisplay = document.getElementById('story-display');
const cardsRow = document.getElementById('cards-row');
const btnReveal = document.getElementById('btn-reveal');
const btnNewRound = document.getElementById('btn-new-round');
const resultsPanel = document.getElementById('results-panel');
const resultsStats = document.getElementById('results-stats');
const participantsList = document.getElementById('participants-list');
const btnCopyLink = document.getElementById('btn-copy-link');
const roomIdLabel = document.getElementById('room-id-label');
const selfNameBadge = document.getElementById('self-name-badge');
const inputSpectator = document.getElementById('input-spectator');
const toast = document.getElementById('toast');

/* ── Room ID from URL (or generate new) ───────────────────── */
function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  let id = params.get('room');
  if (!id) {
    id = Math.random().toString(36).slice(2, 9).toUpperCase();
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.replaceState({}, '', url.toString());
  }
  return id;
}

const roomId = getRoomId();

/* ── Toast ─────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2200);
}

/* ── Build Fibonacci cards ─────────────────────────────────── */
function buildCards() {
  cardsRow.innerHTML = '';
  for (const val of FIBONACCI) {
    const btn = document.createElement('button');
    btn.className = 'card-btn';
    btn.dataset.value = val;
    btn.textContent = val;
    btn.addEventListener('click', () => castVote(val));
    cardsRow.appendChild(btn);
  }
}

/* ── Join flow ─────────────────────────────────────────────── */
formJoin.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = inputName.value.trim();
  if (!name) return;
  myName = name;
  myIsSpectator = inputSpectator.checked;
  connect();
});

function connect() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join', { roomId, name: myName, isSpectator: myIsSpectator });
    showRoom();
  });

  socket.on('room_update', (state) => {
    roomState = state;
    render(state);
  });

  socket.on('disconnect', () => {
    showToast('Disconnected. Reconnecting…');
  });
}

/* ── Show room ─────────────────────────────────────────────── */
function showRoom() {
  screenJoin.classList.remove('active');
  screenRoom.classList.add('active');
  roomIdLabel.textContent = `Room: ${roomId}`;
  selfNameBadge.textContent = myName;
  selfNameBadge.classList.toggle('is-spectator', myIsSpectator);

  const cardsPanel = document.querySelector('.cards-panel');
  if (myIsSpectator) {
    cardsPanel.classList.add('hidden');
  } else {
    cardsPanel.classList.remove('hidden');
    buildCards();
  }
}

/* ── Copy invite link ──────────────────────────────────────── */
btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast('Invite link copied!');
  });
});

/* ── Set story ─────────────────────────────────────────────── */
btnSetStory.addEventListener('click', () => {
  const story = inputStory.value.trim();
  if (!story) return;
  socket.emit('set_story', { story });
  inputStory.value = '';
});

inputStory.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSetStory.click();
});

/* ── Vote ──────────────────────────────────────────────────── */
function castVote(value) {
  if (!roomState || roomState.revealed) return;
  myVote = value;
  socket.emit('vote', { value });
  updateCardSelection(value);
}

function updateCardSelection(value) {
  for (const btn of cardsRow.querySelectorAll('.card-btn')) {
    btn.classList.toggle('selected', Number(btn.dataset.value) === value);
  }
}

/* ── Reveal ────────────────────────────────────────────────── */
btnReveal.addEventListener('click', () => {
  socket.emit('reveal');
});

/* ── New round ─────────────────────────────────────────────── */
btnNewRound.addEventListener('click', () => {
  myVote = null;
  socket.emit('new_round');
});

/* ── Render ────────────────────────────────────────────────── */
function render(state) {
  // Story display
  if (state.story) {
    storyDisplay.textContent = state.story;
    storyDisplay.classList.remove('hidden');
  } else {
    storyDisplay.classList.add('hidden');
  }

  // Cards: disable when revealed (only relevant for non-spectators)
  if (!myIsSpectator) {
    for (const btn of cardsRow.querySelectorAll('.card-btn')) {
      btn.disabled = state.revealed;
    }
    if (state.revealed) {
      // Keep card selection visible but disabled
      if (myVote !== null) updateCardSelection(myVote);
    }
  }

  // Actions
  btnReveal.classList.toggle('hidden', state.revealed);
  btnNewRound.classList.toggle('hidden', !state.revealed);

  // Results
  if (state.revealed) {
    renderResults(state.participants);
    resultsPanel.classList.remove('hidden');
  } else {
    resultsPanel.classList.add('hidden');
    // Restore own vote selection after new round resets (non-spectators only)
    if (!myIsSpectator && !state.revealed) updateCardSelection(myVote);
  }

  // Participants
  renderParticipants(state.participants, state.revealed);
}

/* ── Render results ────────────────────────────────────────── */
function renderResults(participants) {
  const votes = participants
    .filter(p => !p.isSpectator)
    .map(p => p.vote)
    .filter(v => v !== null)
    .map(Number);

  if (votes.length === 0) {
    resultsStats.innerHTML = '<p style="color:var(--text-muted)">No votes cast.</p>';
    return;
  }

  const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
  const sorted = [...votes].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // Count per card value
  const counts = {};
  for (const v of FIBONACCI) counts[v] = 0;
  for (const v of votes) counts[v] = (counts[v] || 0) + 1;
  const maxCount = Math.max(...Object.values(counts));

  resultsStats.innerHTML = `
    <div class="stat-box">
      <div class="stat-value">${avg % 1 === 0 ? avg : avg.toFixed(1)}</div>
      <div class="stat-label">Average</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${median % 1 === 0 ? median : median.toFixed(1)}</div>
      <div class="stat-label">Median</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${votes.length}</div>
      <div class="stat-label">Votes</div>
    </div>
    <div class="vote-distribution">
      <div class="dist-label">Distribution</div>
      ${FIBONACCI.map(v => counts[v] > 0 ? `
        <div class="dist-row">
          <span class="dist-card">${v}</span>
          <div class="dist-bar-wrap">
            <div class="dist-bar" style="width:${(counts[v] / maxCount) * 100}%"></div>
          </div>
          <span class="dist-count">${counts[v]}</span>
        </div>` : '').join('')}
    </div>
  `;
}

/* ── Render participants ───────────────────────────────────── */
function renderParticipants(participants, revealed) {
  participantsList.innerHTML = '';
  for (const p of participants) {
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const hasVoted = p.hasVoted || p.vote !== null;
    const li = document.createElement('li');
    li.className = `participant-item${p.isSpectator ? ' is-spectator' : ''}`;

    let statusEl;
    if (p.isSpectator) {
      statusEl = `<span class="spectator-badge">Spectator</span>`;
    } else if (revealed && p.vote !== null) {
      statusEl = `<span class="participant-vote-value">${p.vote}</span>`;
    } else {
      statusEl = `<span class="participant-status ${hasVoted ? 'status-voted' : 'status-waiting'}">
                    ${hasVoted ? 'Voted' : 'Waiting…'}
                  </span>`;
    }

    li.innerHTML = `
      <div class="participant-avatar${p.isSpectator ? ' spectator-avatar' : ''}">${initials}</div>
      <span class="participant-name">${escapeHtml(p.name)}</span>
      ${statusEl}
    `;
    participantsList.appendChild(li);
  }
}

/* ── Utility ───────────────────────────────────────────────── */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
