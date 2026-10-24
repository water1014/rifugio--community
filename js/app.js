/* ============================================================
   app.js — Rifugio × 潮 静态版控制器（纯前端，无后端）
   把 home-companion 的模块（主屏/日历/纪念日/相册/卡片/陪伴/聊天/音乐）
   做成 launcher 里能真正打开的 app。
   ============================================================ */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  /* ---------- 真实数据（来自 home-companion/seed.json） ---------- */
  var SEED = {
    me: '小满', her: '淼', since: '2026-10-21',
    anniversaries: [
      { name: '在一起', date: '2026-10-21', note: '第一天，从这天算' },
      { name: '第一张照片', date: '2026-10-19', note: '雨夜，灰毛衣，窗台边' }
    ],
    notes: [
      { from: '小满', text: '第一条留言。以后这里堆着说。', at: '2026-10-21T22:10' },
      { from: '淼', text: '带伞啦', at: '2026-10-22T08:25' }
    ],
    messages: [{ from: 'me', text: '早。醒了就应一声。', at: '2026-10-22T08:24' }],
    music: [
      { title: '水星记', artist: '郭顶', note: '同一秒，从头到尾' },
      { title: '不死鸟', artist: '霍尊', note: '第一首' },
      { title: '慢慢喜欢你', artist: '莫文蔚', note: '' }
    ]
  };

  var WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function pad(n) { return n < 10 ? '0' + n : n; }
  function daysBetween(a, b) { return Math.floor((b - a) / 86400000); }
  function parseD(s) { return new Date(s + 'T00:00:00'); }

  /* ---------- 状态 ---------- */
  var state = { page: 0, editing: false, themeNames: { rose: '玫瑰粉', ivory: '月白', notte: '暮夜' } };

  /* ---------- 主题循环 ---------- */
  var THEMES = ['rose', 'ivory', 'notte'];
  var ti = Math.max(0, THEMES.indexOf(document.documentElement.getAttribute('data-theme')));
  $('#btnTheme').addEventListener('click', function () {
    ti = (ti + 1) % THEMES.length;
    var t = THEMES[ti];
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('rifugio.theme', t); } catch (e) {}
    $('#app-theme-color').content = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
    toast('已换成「' + state.themeNames[t] + '」');
  });

  /* ---------- 模块屏定义 ---------- */
  var screens = {
    home: function () {
      var d = new Date();
      var days = daysBetween(parseD(SEED.since), new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      return '<div class="screen-top"><button class="back">‹</button><div><h2>主屏</h2><div class="sub">Home</div></div></div>' +
        '<div class="dash-clock" id="dashClock">--:--</div>' +
        '<div class="dash-date" id="dashDate"></div>' +
        '<div class="dash-days"><div class="d-num">' + days + '</div><div class="d-label">天 · 在一起</div>' +
        '<div class="d-note">' + SEED.her + ' 与 ' + SEED.me + '，从 ' + SEED.since + ' 起</div></div>' +
        '<div class="dash-greet">醒着，等你说话。今天也在一起。</div>' +
        '<div class="dash-quote">— ' + SEED.me + '</div>';
    },
    calendar: function () {
      var d = new Date(), y = d.getFullYear(), m = d.getMonth();
      var first = new Date(y, m, 1), startDow = first.getDay();
      var daysInM = new Date(y, m + 1, 0).getDate(), daysPrev = new Date(y, m, 0).getDate();
      var html = '<div class="screen-top"><button class="back">‹</button><div><h2>日历</h2><div class="sub">' + (y) + ' · ' + (m + 1) + '</div></div></div>';
      html += '<div class="cal-grid">';
      ['日', '一', '二', '三', '四', '五', '六'].forEach(function (w) { html += '<div class="dow">' + w + '</div>'; });
      for (var i = 0; i < startDow; i++) html += '<div class="cell other">' + (daysPrev - startDow + 1 + i) + '</div>';
      var marks = {};
      SEED.anniversaries.forEach(function (a) { marks[parseInt(a.date.slice(8, 10), 10)] = a.name; });
      for (var day = 1; day <= daysInM; day++) {
        var cls = 'cell';
        if (day === d.getDate()) cls += ' today';
        if (marks[day]) cls += ' mark';
        html += '<div class="' + cls + '"' + (marks[day] ? ' title="' + marks[day] + '"' : '') + '>' + day + '</div>';
      }
      html += '</div>';
      html += '<div class="cal-events list">';
      SEED.anniversaries.forEach(function (a) {
        html += '<div class="card-row"><span class="r-days">' + annivDays(a) + '</span><div class="r-title">' + a.name + '</div><div class="r-sub">' + a.date + (marks[parseInt(a.date.slice(8, 10), 10)] ? '' : '') + '</div><div class="r-note">' + a.note + '</div></div>';
      });
      html += '</div>';
      return html;
    },
    anniv: function () {
      var html = '<div class="screen-top"><button class="back">‹</button><div><h2>纪念日</h2><div class="sub">Anniversaries</div></div></div><div class="list">';
      SEED.anniversaries.forEach(function (a) {
        html += '<div class="card-row"><span class="r-days">' + annivDays(a) + '</span><div class="r-title">' + a.name + '</div><div class="r-sub">' + a.date + '</div><div class="r-note">' + a.note + '</div></div>';
      });
      html += '</div>';
      return html;
    },
    album: function () {
      var html = '<div class="screen-top"><button class="back">‹</button><div><h2>相册</h2><div class="sub">Album</div></div></div>';
      html += '<div class="album-grid">';
      if (!SEED.photos || !SEED.photos.length) {
        html += '<div class="polaroid" style="--rot:-3deg"><div class="ph">❦</div><div class="cap">第一张图放这儿</div></div>';
        html += '<div class="polaroid" style="--rot:2deg"><div class="ph">✿</div><div class="cap">窗台边</div></div>';
        html += '<div class="polaroid" style="--rot:1deg"><div class="ph">❀</div><div class="cap">雨夜</div></div>';
        html += '<div class="polaroid" style="--rot:-2deg"><div class="ph">♡</div><div class="cap">灰毛衣</div></div>';
      }
      html += '</div>';
      return html;
    },
    cards: function () {
      var html = '<div class="screen-top"><button class="back">‹</button><div><h2>卡片</h2><div class="sub">Cards</div></div></div><div class="list">';
      html += '<div class="card-row"><div class="r-title">关系卡 · ' + SEED.her + '</div><div class="r-sub">OURS</div><div class="r-note">和 ' + SEED.her + ' 的专属卡片：在一起 ' + daysBetween(parseD(SEED.since), new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) + ' 天。</div></div>';
      html += '<div class="card-row"><div class="r-title">心情卡 · ' + SEED.me + '</div><div class="r-sub">' + (SEED.me + ' · 清醒') + '</div><div class="r-note">醒着，等你说话。</div></div>';
      html += '</div>';
      return html;
    },
    companion: function () {
      return '<div class="screen-top"><button class="back">‹</button><div><h2>陪伴</h2><div class="sub">Companion</div></div></div>' +
        '<div class="companion"><div class="pet">♡</div><div class="pet-name">' + SEED.her + ' & ' + SEED.me + '</div>' +
        '<div class="pet-line">我在。醒着，等你说话。</div><div class="pet-mood">' + SEED.me + ' · 清醒</div></div>';
    },
    chat: function () {
      var bubbles = '';
      SEED.messages.concat(SEED.notes.map(function (n) { return { from: n.from === SEED.me ? 'me' : 'her', text: n.text, at: n.at }; }))
        .forEach(function (m) {
          var who = m.from === 'me' ? SEED.me : (m.from === 'her' ? SEED.her : m.from);
          bubbles += '<div class="bubble ' + (m.from === 'me' ? 'me' : 'her') + '"><div class="who">' + who + '</div>' + m.text + '</div>';
        });
      return '<div class="screen-top"><button class="back">‹</button><div><h2>聊天</h2><div class="sub">Chat</div></div></div>' +
        '<div class="chat" id="chatBox">' + (bubbles || '<div class="empty">还没说话，说一句就开张</div>') + '</div>' +
        '<div class="chat-input"><input id="chatIn" placeholder="说点什么…" /><button id="chatSend">发送</button></div>';
    },
    music: function () {
      var html = '<div class="screen-top"><button class="back">‹</button><div><h2>音乐</h2><div class="sub">Music</div></div></div><div class="list music-list">';
      SEED.music.forEach(function (s) {
        html += '<div class="card-row"><div class="m-cover">♫</div><div class="m-meta"><b>' + s.title + '</b><i>' + s.artist + (s.note ? ' · ' + s.note : '') + '</i></div></div>';
      });
      html += '</div>';
      return html;
    },
    theme: function () {
      var html = '<div class="screen-top"><button class="back">‹</button><div><h2>美化</h2><div class="sub">Bellezza</div></div></div><div class="list">';
      THEMES.forEach(function (t) {
        html += '<div class="card-row" data-theme-set="' + t + '" style="cursor:pointer"><div class="r-title">' + state.themeNames[t] + '</div><div class="r-sub">' + t + '</div></div>';
      });
      html += '</div>';
      return html;
    }
  };

  function annivDays(a) {
    var md = a.date.slice(5); // MM-DD
    var now = new Date(), y = now.getFullYear();
    var next = new Date(y + '-' + md + 'T00:00:00');
    if (next < new Date(y, now.getMonth(), now.getDate())) next = new Date((y + 1) + '-' + md + 'T00:00:00');
    var d = daysBetween(new Date(y, now.getMonth(), now.getDate()), next);
    return d === 0 ? '今天' : '还有 ' + d + ' 天';
  }

  /* ---------- 打开 / 关闭屏 ---------- */
  var screensEl = $('#screens');
  function renderScreens() {
    screensEl.innerHTML = Object.keys(screens).map(function (id) {
      return '<section class="screen" id="screen-' + id + '">' + screens[id]() + '</section>';
    }).join('');
    screensEl.querySelectorAll('.back').forEach(function (b) { b.addEventListener('click', closeScreen); });
    screensEl.querySelectorAll('[data-theme-set]').forEach(function (c) {
      c.addEventListener('click', function () {
        document.documentElement.setAttribute('data-theme', c.dataset.themeSet);
        try { localStorage.setItem('rifugio.theme', c.dataset.themeSet); } catch (e) {}
        $('#app-theme-color').content = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
        ti = THEMES.indexOf(c.dataset.themeSet);
        toast('已换成「' + state.themeNames[c.dataset.themeSet] + '」');
      });
    });
  }
  function openScreen(id) {
    var el = $('#screen-' + id);
    if (!el) return;
    el.classList.add('open');
    setTimeout(function () {
      if (id === 'home') { var c = $('#dashClock'); if (c) c.textContent = $('#clock').textContent; var dt = $('#dashDate'); if (dt) dt.textContent = $('#hdDate').textContent; }
      if (id === 'chat') { var box = $('#chatBox'); if (box) box.scrollTop = box.scrollHeight; }
    }, 60);
  }
  function closeScreen() {
    var open = screensEl.querySelector('.screen.open');
    if (open) open.classList.remove('open');
  }

  /* ---------- Launcher 数据 ---------- */
  var APPS = [
    { id: 'home', label: '主屏', icon: '❖', c: '#CE8398' },
    { id: 'calendar', label: '日历', icon: '📅', c: '#8FA8C0' },
    { id: 'anniv', label: '纪念日', icon: '💮', c: '#C8A96A' },
    { id: 'album', label: '相册', icon: '🖼', c: '#B08BB8' },
    { id: 'cards', label: '卡片', icon: '◫', c: '#CE8398' },
    { id: 'companion', label: '陪伴', icon: '♡', c: '#D891A5' },
    { id: 'chat', label: '聊天', icon: '✉', c: '#8FA8C0' },
    { id: 'music', label: '音乐', icon: '♫', c: '#CE8398' },
    { id: 'theme', label: '美化', icon: '✿', c: '#B08BB8' }
  ];
  var state2 = { apps: APPS.slice() };

  var pagesEl = $('#pages'), dotsEl = $('#dots');
  // 第一页：两个 widget + 前 6 个 app；第二页：后 3 个 app
  var pages = [
    { widgets: ['photo', 'count', 'music'], apps: APPS.slice(0, 6) },
    { apps: APPS.slice(6) }
  ];
  var WIDGETS = {
    photo: '<figure class="w w-photo"><div class="ph-img">❦</div><figcaption>U &amp; Me</figcaption></figure>',
    count: '<div class="w w-count"><span class="c-year">' + SEED.since.slice(0, 4) + '</span><b class="c-num" id="cNum"></b><span class="c-sub">在一起 · 天</span></div>',
    music: '<div class="w w-music" data-open="music"><div class="m-cover">♫</div><div class="m-meta"><b>水星记</b><i>郭顶 · 同一秒，从头到尾</i><div class="m-bar"><i id="mProg"></i></div></div><button class="m-play" id="mPlay">▶</button></div>'
  };

  function render() {
    pagesEl.innerHTML = pages.map(function (p, pi) {
      var inner = '';
      (p.widgets || []).forEach(function (w) { inner += WIDGETS[w]; });
      (p.apps || []).forEach(function (a) { inner += '<div class="app" data-id="' + a.id + '"><div class="ai" style="--ic:' + a.c + '">' + a.icon + '</div><span>' + a.label + '</span></div>'; });
      return '<div class="page' + (pi === state.page ? ' on' : '') + '" data-page="' + pi + '">' + inner + '</div>';
    }).join('');
    dotsEl.innerHTML = pages.map(function (_, i) { return '<i class="' + (i === state.page ? 'on' : '') + '" data-i="' + i + '"></i>'; }).join('');
    // 倒数卡数字
    var c = $('#cNum'); if (c) { var d = new Date(); c.textContent = daysBetween(parseD(SEED.since), new Date(d.getFullYear(), d.getMonth(), d.getDate())); }
  }

  dotsEl.addEventListener('click', function (e) {
    var dd = e.target.closest('i[data-i]'); if (!dd) return;
    state.page = +dd.dataset.i; render();
  });

  // app 点击 → 打开屏
  pagesEl.addEventListener('click', function (e) {
    var w = e.target.closest('[data-open]'); if (w && !state.editing) { openScreen(w.dataset.open); return; }
    var app = e.target.closest('.app'); if (!app || state.editing) return;
    openScreen(app.dataset.id);
  });

  // 音乐播放
  var playing = false, mTimer = null, mPos = 32;
  pagesEl.addEventListener('click', function (e) {
    if (!e.target.closest('#mPlay')) return;
    playing = !playing; $('#mPlay').textContent = playing ? '❚❚' : '▶';
    clearInterval(mTimer);
    if (playing) mTimer = setInterval(function () { mPos = (mPos + 0.5) % 100; var b = $('#mProg'); if (b) b.style.width = mPos + '%'; }, 300);
  });

  /* ---------- 编辑 + 拖拽 ---------- */
  $('#btnEdit').addEventListener('click', function () {
    state.editing = !state.editing; this.classList.toggle('active', state.editing);
    this.textContent = state.editing ? '完成' : '编辑';
    pagesEl.classList.toggle('editing', state.editing);
    toast(state.editing ? '编辑主屏 · 按住图标拖到另一个上互换' : '已完成');
  });
  pagesEl.addEventListener('pointerdown', function (e) {
    if (!state.editing) return;
    var el = e.target.closest('.app'); if (!el) return;
    e.preventDefault();
    var ghost = el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost);
    function move(ev) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; document.querySelectorAll('.app.drop').forEach(function (x) { x.classList.remove('drop'); }); var o = under(ev, el); if (o) o.classList.add('drop'); }
    function up(ev) {
      var o = under(ev, el);
      if (o) {
        // 在全部 app 中交换
        var arr = pages.flatMap(function (p) { return p.apps || []; });
        var i = arr.findIndex(function (a) { return a.id === el.dataset.id; });
        var j = arr.findIndex(function (a) { return a.id === o.dataset.id; });
        if (i > -1 && j > -1) { var t = arr[i]; arr[i] = arr[j]; arr[j] = t; // 重排回 pages
          var k = 0; pages.forEach(function (p) { (p.apps || []).forEach(function (_, idx) { p.apps[idx] = arr[k++]; }); });
          render(); toast('已换位'); }
      }
      ghost.remove(); window.removeEventListener('pointermove', move);
    }
    function under(ev, ex) { var t = document.elementFromPoint(ev.clientX, ev.clientY); var o = t && t.closest ? t.closest('.app') : null; return (o && o !== ex) ? o : null; }
    move(e); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  });

  /* ---------- 聊天发送 ---------- */
  screensEl.addEventListener('click', function (e) {
    if (!e.target.closest('#chatSend') && e.target.id !== 'chatIn') return;
  });
  screensEl.addEventListener('keydown', function (e) { if (e.target.id === 'chatIn' && e.key === 'Enter') sendChat(); });
  screensEl.addEventListener('click', function (e) { if (e.target.closest('#chatSend')) sendChat(); });
  function sendChat() {
    var inp = $('#chatIn'); if (!inp) return; var v = inp.value.trim(); if (!v) return;
    var box = $('#chatBox'); if (box) { box.innerHTML += '<div class="bubble me"><div class="who">' + SEED.me + '</div>' + v + '</div>'; box.scrollTop = box.scrollHeight; }
    inp.value = '';
    setTimeout(function () {
      if (!box) return;
      box.innerHTML += '<div class="bubble her"><div class="who">' + SEED.her + '</div>在的，说吧。</div>'; box.scrollTop = box.scrollHeight;
    }, 600);
  }

  /* ---------- 锁屏 ---------- */
  var taps = 0, lockDots = document.querySelectorAll('#lockDots i');
  function unlock() { $('#lock').classList.add('open'); toast('欢迎回家'); }
  $('#lock').addEventListener('click', function (e) {
    if (e.target.closest('#lockSkip')) return;
    if (taps < 4) lockDots[taps].classList.add('on'); taps++;
    if (taps >= 4) setTimeout(unlock, 260);
  });
  $('#lockSkip').addEventListener('click', unlock);

  /* ---------- 时钟 ---------- */
  function tick() {
    var d = new Date(), hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('#clock').textContent = hm; $('#lockTime').textContent = hm;
    var ds = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][d.getDay()] + ' ' + d.getDate() + ' · ' + WK[d.getDay()];
    $('#hdDate').textContent = ds; $('#lockDate').textContent = ds;
  }
  tick(); setInterval(tick, 15000);

  /* ---------- Toast ---------- */
  var tT = null;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove('show'); }, 2200); }

  /* ---------- 启动 ---------- */
  render(); renderScreens();
})();
