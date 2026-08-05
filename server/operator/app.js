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
