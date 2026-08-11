/* Console de modération — client du namespace /admin.
 * JS séparé (la CSP du serveur interdit le script inline). Le contenu signalé
 * est inséré via textContent (jamais innerHTML) pour écarter toute injection. */
'use strict';

(function () {
  var REASON_LABEL = {
    illegal: 'Contenu illégal',
    minor: 'Mineur en danger',
    harassment: 'Harcèlement',
    spam: 'Spam',
    other: 'Autre',
  };

  /** Doit correspondre à `admin.RESET_PHRASE` — le serveur la revérifie de son côté. */
  var RESET_PHRASE = 'REINITIALISER';

  var socket = null;
  var incidentId = null;
  var reports = new Map(); // id -> report
  var roomList = []; // dernier admin:rooms reçu
  var members = new Map(); // roomId -> { owner, members } pour les salons dépliés
  var expanded = new Set(); // salons dépliés (l'état de l'écran survit aux rafraîchissements)
  var renaming = null; // salon dont le nom est en cours d'édition

  var $ = function (id) { return document.getElementById(id); };

  function setStatus(text) { $('status').textContent = text; }

  function connect() {
    var token = $('token').value;
    if (!token) return;
    $('loginError').hidden = true;
    setStatus('connexion…');

    socket = io('/admin', { auth: { token: token }, transports: ['websocket', 'polling'] });

    socket.on('connect', function () {
      setStatus('connecté');
      $('login').hidden = true;
      $('console').hidden = false;
    });

    socket.on('connect_error', function (err) {
      setStatus('déconnecté');
      $('loginError').hidden = false;
      $('loginError').textContent =
        (err && err.message === 'unauthorized') ? 'Jeton invalide.' : 'Connexion impossible.';
      socket = null;
    });

    socket.on('disconnect', function () { setStatus('déconnecté'); });

    socket.on('admin:snapshot', function (payload) {
      reports.clear();
      (payload && payload.reports ? payload.reports : []).forEach(function (r) { reports.set(r.id, r); });
      render();
    });

    socket.on('report:new', function (payload) {
      if (payload && payload.report) { reports.set(payload.report.id, payload.report); render(); }
    });

    socket.on('admin:metrics', function (m) { renderMetrics(m); });

    socket.on('admin:rooms', function (payload) {
      setRooms(payload && payload.rooms ? payload.rooms : []);
    });

    // Envoyée une fois à l'ouverture. Ensuite elle ne vient que sur demande : la
    // synthèse balaye toute la fenêtre côté serveur pour un chiffre qui ne bouge
    // qu'à l'échelle de la journée.
    socket.on('admin:analytics', function (payload) { renderAnalytics(payload); });
  }

  // --- Tableau de bord (métriques agrégées) ----------------------------------
  function setText(id, value) { var n = $(id); if (n) n.textContent = value; }

  function fmtUptime(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + ' j ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    return m + ' min';
  }

  function setDot(id, state) { var n = $(id); if (n) n.className = 'dot ' + state; }

  function renderMetrics(m) {
    if (!m) return;
    setText('mSessions', String(m.sessions != null ? m.sessions : '–'));

    var r = m.rooms || {};
    setText('mRooms', String(r.total != null ? r.total : '–'));
    var roomSub = [];
    // Tous les salons sont chiffrés : on n'affiche donc que ce qui distingue encore,
    // le régime à mot de passe (illisible ET fermé).
    if (r.password) roomSub.push(r.password + ' à mot de passe');
    if (r.permanent) roomSub.push(r.permanent + ' permanent' + (r.permanent > 1 ? 's' : ''));
    setText('mRoomsSub', roomSub.join(' · '));
    setText('mMembers', String(r.members != null ? r.members : '–'));

    var rep = m.reports || {};
    setText('mReports', String(rep.total != null ? rep.total : '–'));
    setText('mPriority', String(rep.priority != null ? rep.priority : '–'));
    var byReason = rep.byReason || {};
    var reasonSub = Object.keys(byReason).map(function (k) {
      return (REASON_LABEL[k] || k) + ' : ' + byReason[k];
    });
    setText('mReportsSub', reasonSub.join(' · '));

    setDot('dRedis', m.redisOk ? 'ok' : 'err');
    setText('mRedis', 'Redis : ' + (m.redisOk ? 'connecté' : 'indisponible'));
    setDot('dSalt', m.saltFrozen ? 'warn' : 'ok');
    setText('mSalt', 'Sel IP : ' + (m.saltFrozen ? 'gelé (préservation)' : 'rotation normale'));
    setText('mUptime', 'Uptime : ' + fmtUptime(m.uptimeSec));

    setText('metricsTs', 'mis à jour à ' + fmtTs(m.ts));
  }

  // --- Audience ---------------------------------------------------------------
  //
  // Le panneau tient sur un seul objet : la BANDE DES JOURS, visites vers le haut
  // et messages vers le bas, sur un axe partagé. Tout le reste (classements,
  // affluence) est en appui. Les chiffres ne sont écrits qu'à un endroit — la
  // ligne de lecture — qui bascule du total de la fenêtre au jour survolé.
  //
  // Deux échelles, et c'est assumé : au-dessus de l'axe, visites et chargements
  // partagent la leur (un chargement contient toujours au moins une visite, les
  // comparer a un sens) ; en dessous, les messages ont la leur, parce qu'ils ne se
  // comptent pas dans la même unité. La légende le dit.

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Repère de la bande, en unités de viewBox. La hauteur en pixels est figée par
  // la CSS : `preserveAspectRatio="none"` étire le dessin en largeur seulement.
  var TAPE = { w: 1000, up: 118, axis: 2, down: 44 };
  var CURVE = { w: 1000, h: 100 };

  var analytics = null; // dernière synthèse reçue
  var analyticsDays = 7; // fenêtre affichée

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, String(attrs[k])); });
    }
    return node;
  }

  var NUM = new Intl.NumberFormat('fr-FR');
  function fmtNum(n) { return NUM.format(Number(n) || 0); }

  /**
   * `2026-08-11` -> Date. Le fuseau UTC est imposé à la LECTURE comme à
   * l'écriture : `new Date('2026-08-11')` place la journée à minuit UTC, et la
   * reformater en heure locale la ferait basculer d'un jour à l'ouest de Greenwich.
   */
  function dayDate(day) { return new Date(day + 'T00:00:00Z'); }

  var DAY_SHORT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short' });
  var DAY_NUM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric' });
  // Le mois vient avec le jour sur les fenêtres longues : une fenêtre de trente
  // jours enjambe un changement de mois, et « 2 » après « 28 » ne se situe plus.
  var DAY_DATE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
  var DAY_LONG = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

  function maxOf(list, pick) {
    return list.reduce(function (max, item) { return Math.max(max, pick(item) || 0); }, 0);
  }

  /** Une ligne de la ligne de lecture : pastille de couleur, nombre, libellé. */
  function readoutStat(kind, value, label) {
    var stat = el('span', 'readout__stat readout__stat--' + kind);
    stat.appendChild(el('b', null, fmtNum(value)));
    stat.appendChild(document.createTextNode(label));
    return stat;
  }

  /**
   * Écrit la ligne de lecture. `day` absent = le total de la fenêtre, qui est
   * l'état de repos : on revient toujours à lui quand le curseur quitte la bande.
   */
  function setReadout(day) {
    var box = $('readout');
    if (!box || !analytics) return;
    box.textContent = '';

    var when;
    var stats;
    if (day) {
      when = DAY_LONG.format(dayDate(day.day));
      stats = day;
    } else {
      when = analytics.window + ' derniers jours';
      stats = analytics.totals;
    }

    box.appendChild(el('span', 'readout__when', when));
    box.appendChild(readoutStat('visits', stats.visits, 'visites'));
    box.appendChild(readoutStat('views', stats.views, 'chargements'));
    box.appendChild(readoutStat('messages', stats.messages, 'messages'));
  }

  /**
   * La bande des jours. Une colonne par jour : au-dessus de l'axe le chargement en
   * fond et la visite par-dessus (imbriquées, même échelle), en dessous le message.
   *
   * Une valeur non nulle ne descend jamais sous deux unités de haut : sinon un jour
   * à une visite se dessine à zéro pixel, et l'écran dit « rien » là où il s'est
   * passé quelque chose.
   */
  function renderTape() {
    var svg = $('tape');
    if (!svg) return;
    svg.textContent = '';

    var days = analytics.daily;
    var h = TAPE.up + TAPE.axis + TAPE.down;
    svg.setAttribute('viewBox', '0 0 ' + TAPE.w + ' ' + h);

    var maxUp = Math.max(1, maxOf(days, function (d) { return d.views; }));
    var maxDown = Math.max(1, maxOf(days, function (d) { return d.messages; }));
    var colW = TAPE.w / days.length;
    // Le plafond n'existe que pour les fenêtres courtes : à sept jours, une barre
    // proportionnelle à la colonne ferait des pavés de 90 px où la hauteur ne se
    // compare plus. Il ne mord jamais à trente jours, où la colonne est étroite.
    var barW = Math.max(2, Math.min(colW * 0.62, 68));

    var scale = function (value, max, band) {
      if (!value) return 0;
      return Math.max(2, (value / max) * band);
    };

    days.forEach(function (d, i) {
      var cx = i * colW + colW / 2;
      var x = cx - barW / 2;
      var group = svgEl('g', {
        class: 'tape__col',
        tabindex: '0',
        role: 'img',
        'aria-label':
          DAY_LONG.format(dayDate(d.day)) + ' : ' + fmtNum(d.visits) + ' visites, ' +
          fmtNum(d.views) + ' chargements, ' + fmtNum(d.messages) + ' messages',
      });

      var hViews = scale(d.views, maxUp, TAPE.up);
      if (hViews) {
        group.appendChild(svgEl('rect', {
          x: x, y: TAPE.up - hViews, width: barW, height: hViews, rx: 2, fill: '#3f587c',
        }));
      }
      var hVisits = scale(d.visits, maxUp, TAPE.up);
      if (hVisits) {
        group.appendChild(svgEl('rect', {
          x: x, y: TAPE.up - hVisits, width: barW, height: hVisits, rx: 2, fill: '#8ab4f8',
        }));
      }
      var hMsg = scale(d.messages, maxDown, TAPE.down);
      if (hMsg) {
        group.appendChild(svgEl('rect', {
          x: x, y: TAPE.up + TAPE.axis, width: barW, height: hMsg, rx: 2, fill: '#6ee7a8',
        }));
      }

      // Cible de survol sur toute la hauteur : viser une barre de deux pixels
      // relèverait de l'adresse, pas de la lecture.
      group.appendChild(svgEl('rect', { class: 'tape__hit', x: i * colW, y: 0, width: colW, height: h }));

      var show = function () { setReadout(d); };
      var clear = function () { setReadout(null); };
      group.addEventListener('mouseenter', show);
      group.addEventListener('mouseleave', clear);
      group.addEventListener('focus', show);
      group.addEventListener('blur', clear);

      svg.appendChild(group);
    });

    // L'axe passe en dernier : il doit rester visible par-dessus les barres.
    svg.appendChild(svgEl('rect', { x: 0, y: TAPE.up, width: TAPE.w, height: TAPE.axis, fill: '#2c3440' }));

    renderTapeAxis(days);
  }

  /**
   * Étiquettes des jours. À sept jours on nomme chaque jour ; à trente, une
   * étiquette sur cinq — au-delà, elles se chevauchent et plus rien ne se lit.
   */
  function renderTapeAxis(days) {
    var axis = $('tapeAxis');
    if (!axis) return;
    axis.textContent = '';
    axis.style.gridTemplateColumns = 'repeat(' + days.length + ', 1fr)';

    var step = days.length > 10 ? Math.ceil(days.length / 6) : 1;
    days.forEach(function (d, i) {
      var isLast = i === days.length - 1;
      var show = isLast || i % step === 0;
      var date = dayDate(d.day);
      var label = '';
      if (show) label = days.length > 10 ? DAY_DATE.format(date) : DAY_SHORT.format(date);
      axis.appendChild(el('span', null, label));
    });
  }

  /** Un classement : le fond de la ligne porte la proportion, pas une barre à part. */
  function renderRanking(containerId, entries, emptyText, mono) {
    var box = $(containerId);
    if (!box) return;
    box.textContent = '';

    if (!entries.length) {
      box.appendChild(el('div', 'muted', emptyText));
      return;
    }

    var max = maxOf(entries, function (e) { return e.value; }) || 1;
    entries.forEach(function (entry) {
      var row = el('div', 'rank');
      var fill = el('div', 'rank__fill');
      fill.style.width = Math.max(2, (entry.value / max) * 100) + '%';
      row.appendChild(fill);

      var label = el('div', 'rank__label');
      if (mono) label.appendChild(el('code', null, entry.key));
      else label.textContent = entry.key;
      label.title = entry.key; // le nom tronqué reste lisible au survol
      row.appendChild(label);

      row.appendChild(el('div', 'rank__value', fmtNum(entry.value)));
      box.appendChild(row);
    });
  }

  /**
   * Courbe d'affluence des dernières journées. Un TROU dans la série (serveur
   * arrêté, échantillon manqué) coupe le tracé au lieu de le faire plonger à
   * zéro : une interruption de mesure n'est pas une absence de monde.
   */
  function renderCurve() {
    var svg = $('curve');
    if (!svg) return;
    svg.textContent = '';
    svg.setAttribute('viewBox', '0 0 ' + CURVE.w + ' ' + CURVE.h);

    var series = analytics.series || [];
    var perDay = analytics.slotsPerDay || 288;
    var total = Math.max(1, series.length * perDay);

    var peak = 0;
    series.forEach(function (d) {
      d.points.forEach(function (p) { peak = Math.max(peak, p.sessions); });
    });
    var scaleY = Math.max(1, peak);

    setText('peakLabel', peak ? 'pic ' + fmtNum(peak) + (peak > 1 ? ' sessions' : ' session') : 'aucun relevé');

    // Repères des six heures : ils donnent l'échelle du temps sans étiquette.
    for (var d = 0; d < series.length; d += 1) {
      for (var q = 0; q < 4; q += 1) {
        var tickX = ((d * perDay + (q * perDay) / 4) / total) * CURVE.w;
        svg.appendChild(svgEl('line', {
          x1: tickX, y1: 0, x2: tickX, y2: CURVE.h,
          stroke: q === 0 ? '#2c3440' : '#1c222c', 'stroke-width': 1,
        }));
      }
    }

    var xOf = function (dayIndex, slot) { return ((dayIndex * perDay + slot) / total) * CURVE.w; };
    var yOf = function (sessions) { return CURVE.h - (sessions / scaleY) * (CURVE.h - 6); };

    // Segments continus : on coupe dès qu'un créneau manque.
    var segments = [];
    var current = null;
    series.forEach(function (day, dayIndex) {
      var previousSlot = null;
      day.points.forEach(function (point) {
        var broken = previousSlot === null || point.slot !== previousSlot + 1;
        if (broken && current) segments.push(current);
        if (broken) current = [];
        current.push({ x: xOf(dayIndex, point.slot), y: yOf(point.sessions) });
        previousSlot = point.slot;
      });
      // Une journée s'achève : la suivante ne prolonge pas son dernier créneau.
      if (current) segments.push(current);
      current = null;
    });

    // Un relevé ISOLÉ n'a pas de tracé — un point n'est pas une ligne. Il compte
    // pourtant : c'est ce qu'on voit le lendemain d'une mise en ligne, et une
    // courbe vide au-dessus d'un « pic : 1 session » se lirait comme une panne.
    segments.filter(function (points) { return points.length === 1; }).forEach(function (points) {
      svg.appendChild(svgEl('circle', { cx: points[0].x.toFixed(1), cy: points[0].y.toFixed(1), r: 2, fill: '#c4b5fd' }));
    });

    segments.filter(function (points) { return points.length > 1; }).forEach(function (points) {
      var line = points.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
      }).join(' ');

      var area = line + ' L' + points[points.length - 1].x.toFixed(1) + ' ' + CURVE.h + ' L' + points[0].x.toFixed(1) + ' ' + CURVE.h + ' Z';
      svg.appendChild(svgEl('path', { d: area, fill: 'rgba(196, 181, 253, 0.16)' }));
      svg.appendChild(svgEl('path', {
        d: line, fill: 'none', stroke: '#c4b5fd', 'stroke-width': 1.5,
        'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke',
      }));
    });

    var axis = $('curveAxis');
    if (axis) {
      axis.textContent = '';
      axis.style.gridTemplateColumns = 'repeat(' + Math.max(1, series.length) + ', 1fr)';
      series.forEach(function (day) {
        var date = dayDate(day.day);
        axis.appendChild(el('span', null, DAY_SHORT.format(date) + ' ' + DAY_NUM.format(date)));
      });
    }
  }

  function renderAnalytics(payload) {
    if (!payload) return;
    analytics = payload;

    // Rien de mesuré sur la fenêtre : le dire, plutôt que dessiner des axes vides
    // qu'on prendrait pour une audience nulle.
    var hasData = payload.totals.views > 0 || payload.totals.messages > 0 || payload.totals.peakSessions > 0;
    $('audienceEmpty').hidden = hasData;
    $('audienceBody').hidden = !hasData;
    if (!hasData) return;

    setReadout(null);
    renderTape();
    renderRanking('topPages', payload.pages, 'Aucune page chargée sur la fenêtre.', true);
    renderRanking('topReferrers', payload.referrers, 'Aucune arrivée enregistrée.', false);
    renderCurve();

    var foot = payload.retentionDays + ' jours conservés, puis effacés' +
      (payload.totals.notFound ? ' · ' + fmtNum(payload.totals.notFound) + ' requêtes tombées sur une 404' : '');
    setText('audienceFoot', foot);
  }

  function loadAnalytics(days) {
    if (!socket) return;
    analyticsDays = days || analyticsDays;
    $('range7').classList.toggle('is-on', analyticsDays === 7);
    $('range30').classList.toggle('is-on', analyticsDays === 30);
    socket.emit('admin:analytics', { days: analyticsDays }, function (res) {
      if (res && res.ok) renderAnalytics(res.analytics);
      else showToast(res && res.error ? res.error : 'Statistiques indisponibles.', false);
    });
  }

  function emit(event, data) { if (socket) socket.emit(event, data); }

  var toastTimer = null;
  function showToast(text, ok) {
    var t = $('toast');
    if (!t) return;
    t.textContent = text;
    t.className = 'toast ' + (ok ? 'ok' : 'err');
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }

  // Émet une action opérateur avec accusé de réception et retour visuel. `onOk` reçoit
  // l'accusé : certaines actions rendent des décomptes à afficher (cf. `admin:reset`).
  function emitAck(event, data, okMsg, btn, onOk) {
    if (!socket) return;
    if (btn) btn.disabled = true;
    socket.emit(event, data, function (res) {
      if (btn) btn.disabled = false;
      if (res && res.ok) {
        showToast(okMsg, true);
        if (onOk) onOk(res);
      } else {
        showToast(res && res.error ? res.error : 'Action impossible.', false);
      }
    });
  }

  function resolve(id) {
    emit('admin:resolve', { reportId: id });
    reports.delete(id);
    render();
    showToast('Signalement résolu.', true);
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtTs(ts) {
    try { return new Date(ts).toLocaleString('fr-FR'); } catch (e) { return String(ts); }
  }

  function renderReport(r) {
    var card = el('div', 'report');

    var meta = el('div', 'meta');
    var reason = el('span', 'badge ' + (r.reason === 'minor' || r.reason === 'illegal' ? 'prio' : 'reason'),
      REASON_LABEL[r.reason] || r.reason);
    meta.appendChild(reason);
    meta.appendChild(el('span', 'tag', r.scope === 'pm' ? 'message privé' : 'salon'));
    if (r.unverified) meta.appendChild(el('span', 'badge unverified', 'non vérifié'));
    meta.appendChild(el('span', 'tag', fmtTs(r.ts)));
    card.appendChild(meta);

    var who = el('div', 'muted');
    who.textContent = 'Auteur présumé : ' + (r.authorPseudo || '—') +
      '  ·  Signalé par : ' + (r.reporterPseudo || '—');
    card.appendChild(who);

    card.appendChild(el('div', 'content', r.content || '(aucun contenu)'));

    if (r.unverified) {
      card.appendChild(el('div', 'muted',
        '⚠ Contenu fourni par le signaleur : ni le texte ni l’auteur ne sont vérifiables côté serveur.'));
    }

    var markActed = function () { card.classList.add('acted'); };

    var actions = el('div', 'row');
    if (r.scope === 'room' && r.roomId && r.messageId) {
      var retract = el('button', 'danger', 'Retirer le message');
      retract.onclick = function () {
        emitAck('admin:retract', { roomId: r.roomId, messageId: r.messageId }, 'Message retiré du salon.', retract, markActed);
      };
      actions.appendChild(retract);

      var kick = el('button', 'ghost', 'Exclure du salon');
      kick.onclick = function () {
        if (r.authorId) emitAck('admin:kick', { roomId: r.roomId, targetId: r.authorId }, 'Participant exclu du salon.', kick, markActed);
      };
      actions.appendChild(kick);
    }
    if (r.authorId) {
      var ban = el('button', 'danger', 'Bannir l’auteur');
      ban.onclick = function () {
        emitAck('admin:ban', { sessionId: r.authorId }, 'Auteur banni et déconnecté.', ban, markActed);
      };
      actions.appendChild(ban);
    }
    var done = el('button', 'ghost', 'Résoudre');
    done.onclick = function () { resolve(r.id); };
    actions.appendChild(done);

    card.appendChild(actions);
    return card;
  }

  function render() {
    var list = $('reports');
    list.textContent = '';
    var arr = Array.from(reports.values()).sort(function (a, b) { return b.ts - a.ts; });
    $('count').textContent = String(arr.length);
    $('empty').hidden = arr.length > 0;
    arr.forEach(function (r) { list.appendChild(renderReport(r)); });
  }

  // --- Salons ----------------------------------------------------------------

  /**
   * Le serveur pousse la liste à chaque tick et après chaque action : le rendu doit donc
   * repartir de zéro sans emporter l'état de l'écran (salons dépliés, renommage en cours),
   * sinon un panneau ouvert se refermerait tout seul toutes les cinq secondes.
   */
  function setRooms(list) {
    roomList = list;
    var live = {};
    list.forEach(function (r) { live[r.id] = true; });
    // Un salon fermé entre deux ticks ne doit pas laisser d'état derrière lui.
    expanded.forEach(function (id) { if (!live[id]) expanded.delete(id); });
    members.forEach(function (_v, id) { if (!live[id]) members.delete(id); });
    if (renaming && !live[renaming]) renaming = null;
    renderRooms();
  }

  /** Demande la composition d'un salon, puis redessine (la liste ne la transporte jamais). */
  function loadMembers(roomId) {
    if (!socket) return;
    socket.emit('admin:room:members', { roomId: roomId }, function (res) {
      if (res && res.ok) {
        members.set(roomId, { owner: res.owner, members: res.members || [] });
      } else {
        members.set(roomId, { owner: null, members: [] });
      }
      renderRooms();
    });
  }

  /**
   * Ce que la fermeture veut dire, salon par salon. Un permanent et un salon de région
   * reviennent, par deux chemins différents : le dire à l'avance évite de croire qu'un
   * salon réapparu est un bug.
   */
  function closureNotice(room) {
    if (room.region) {
      return 'Fermer « ' + room.name + ' » ? Ce salon de région reparaîtra dès le prochain arrivant de la région.';
    }
    if (room.persistent) {
      return 'Fermer « ' + room.name + ' » ? Un salon permanent inscrit dans la liste de référence ' +
        'reparaîtra au prochain redémarrage. Pour un retrait durable, ôtez son entrée du fichier.';
    }
    return 'Fermer « ' + room.name + ' » et en sortir tous les participants ?';
  }

  function renderMembers(room) {
    var box = el('div', 'members');
    var loaded = members.get(room.id);

    if (!loaded) {
      box.appendChild(el('div', 'muted', 'Chargement des présents.'));
      return box;
    }
    if (loaded.members.length === 0) {
      box.appendChild(el('div', 'muted', 'Personne dans ce salon.'));
      return box;
    }

    loaded.members.forEach(function (m) {
      var line = el('div', 'member');
      var who = el('div', 'who');
      who.appendChild(el('span', null, m.pseudo));
      who.appendChild(el('span', 'rowid', m.id));
      if (m.id === loaded.owner) who.appendChild(el('span', 'badge perm', 'propriétaire'));
      line.appendChild(who);

      var kick = el('button', 'ghost', 'Exclure');
      kick.onclick = function () {
        emitAck('admin:kick', { roomId: room.id, targetId: m.id }, 'Participant exclu du salon.', kick, function () {
          loadMembers(room.id);
        });
      };
      line.appendChild(kick);
      box.appendChild(line);
    });
    return box;
  }

  function renderRoom(room) {
    var item = el('div', 'rowitem');

    var head = el('div', 'rowhead');
    head.appendChild(el('span', 'rowname', room.name));
    head.appendChild(el('span', 'rowid', room.id));
    if (room.type === 'private') head.appendChild(el('span', 'badge type', 'privé'));
    // Le cadenas dit « fermé », pas « chiffré » : tous les salons le sont.
    if (room.keyMode === 'password') head.appendChild(el('span', 'badge locked', 'mot de passe'));
    else if (room.hasPassword) head.appendChild(el('span', 'badge locked', 'porte'));
    if (room.region) head.appendChild(el('span', 'badge region', 'région'));
    else if (room.persistent) head.appendChild(el('span', 'badge perm', 'permanent'));
    head.appendChild(el('span', 'rowcount', room.count + (room.count > 1 ? ' présents' : ' présent')));
    item.appendChild(head);

    var actions = el('div', 'rowactions');

    var isOpen = expanded.has(room.id);
    var toggle = el('button', 'ghost', isOpen ? 'Replier' : 'Voir les présents');
    toggle.onclick = function () {
      if (isOpen) {
        expanded.delete(room.id);
        members.delete(room.id);
        renderRooms();
      } else {
        expanded.add(room.id);
        renderRooms();
        loadMembers(room.id);
      }
    };
    actions.appendChild(toggle);

    // Le renommage n'existe que pour les permanents : ailleurs, le nom appartient au
    // propriétaire du salon (le serveur refuserait, cf. `admin:room:rename`).
    if (room.persistent && renaming !== room.id) {
      var renameBtn = el('button', 'ghost', 'Renommer');
      renameBtn.onclick = function () {
        renaming = room.id;
        renderRooms();
      };
      actions.appendChild(renameBtn);
    }

    var close = el('button', 'danger', 'Fermer');
    close.onclick = function () {
      if (!window.confirm(closureNotice(room))) return;
      var event = room.persistent ? 'admin:room:remove' : 'admin:close';
      var payload = room.persistent ? { slug: room.id } : { roomId: room.id };
      emitAck(event, payload, 'Salon fermé.', close);
    };
    actions.appendChild(close);
    item.appendChild(actions);

    if (renaming === room.id) {
      var form = el('div', 'rename');
      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 32;
      input.value = room.name;
      input.setAttribute('aria-label', 'Nouveau nom du salon');
      var save = el('button', null, 'Enregistrer');
      var cancel = el('button', 'ghost', 'Annuler');
      var submit = function () {
        emitAck('admin:room:rename', { slug: room.id, name: input.value }, 'Salon renommé.', save, function () {
          renaming = null;
          renderRooms();
        });
      };
      save.onclick = submit;
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { renaming = null; renderRooms(); }
      });
      cancel.onclick = function () { renaming = null; renderRooms(); };
      form.appendChild(input);
      form.appendChild(save);
      form.appendChild(cancel);
      item.appendChild(form);
      // Le focus suit le geste : cliquer « Renommer » doit suffire pour taper.
      setTimeout(function () { input.focus(); input.select(); }, 0);
    }

    if (isOpen) item.appendChild(renderMembers(room));
    return item;
  }

  function renderRooms() {
    var box = $('roomRows');
    if (!box) return;
    box.textContent = '';
    $('roomsPending').hidden = true;
    $('roomsCount').textContent = String(roomList.length);
    $('roomsEmpty').hidden = roomList.length > 0;
    roomList.forEach(function (room) { box.appendChild(renderRoom(room)); });
  }

  // --- Remise à zéro ---------------------------------------------------------
  function renderResetCounts(res) {
    var box = $('resetCounts');
    box.textContent = '';
    var lines = [
      ['sessions effacées', res.sessions],
      ['présences retirées', res.presence],
      ['salons fermés', res.rooms],
      ['invitations détruites', res.invites],
      ['salons permanents relevés', res.permanentRooms],
    ];
    lines.forEach(function (pair) {
      var line = el('div');
      var num = el('b', null, String(pair[1]));
      line.appendChild(num);
      line.appendChild(document.createTextNode(' ' + pair[0]));
      box.appendChild(line);
    });
    box.hidden = false;
  }

  function setFrozen(frozen) {
    $('freezeState').textContent = frozen ? 'sel IP : GELÉ (préservation prospective)' : 'sel IP : rotation normale';
    $('freeze').hidden = frozen;
    $('unfreeze').hidden = !frozen;
  }

  // --- Câblage des contrôles -------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    $('connect').onclick = connect;
    $('token').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });

    $('freeze').onclick = function () {
      var reason = window.prompt('Référence de la réquisition (motif) :', '');
      if (reason === null || !socket) return;
      socket.emit('admin:freeze', { reason: reason }, function (res) {
        if (res && res.ok) { incidentId = res.incidentId; setFrozen(true); }
      });
    };

    $('unfreeze').onclick = function () {
      socket.emit('admin:unfreeze', { incidentId: incidentId }, function (res) {
        if (res && res.ok) { incidentId = null; setFrozen(false); }
      });
    };

    $('range7').onclick = function () { loadAnalytics(7); };
    $('range30').onclick = function () { loadAnalytics(30); };
    $('audienceRefresh').onclick = function () { loadAnalytics(); };

    var createBtn = $('createRoom');
    createBtn.onclick = function () {
      emitAck(
        'admin:room:create',
        { slug: $('newSlug').value, name: $('newName').value },
        'Salon permanent créé.',
        createBtn,
        function () {
          $('newSlug').value = '';
          $('newName').value = '';
        },
      );
    };

    // Le bouton ne s'arme qu'une fois la phrase tapée : le garde-fou est dans la saisie,
    // pas dans une boîte de dialogue qu'on renvoie par réflexe.
    var resetBtn = $('reset');
    var resetInput = $('resetConfirm');
    resetInput.addEventListener('input', function () {
      resetBtn.disabled = resetInput.value.trim() !== RESET_PHRASE;
    });
    resetBtn.onclick = function () {
      emitAck('admin:reset', { confirm: resetInput.value.trim() }, 'État remis à zéro.', resetBtn, function (res) {
        resetInput.value = '';
        resetBtn.disabled = true;
        renderResetCounts(res);
      });
    };
  });
})();
