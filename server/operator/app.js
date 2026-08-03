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

  var socket = null;
  var incidentId = null;
  var reports = new Map(); // id -> report

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
    if (r.encrypted) roomSub.push(r.encrypted + ' chiffré' + (r.encrypted > 1 ? 's' : ''));
    if (r.permanent) roomSub.push(r.permanent + ' permanent' + (r.permanent > 1 ? 's' : ''));
    setText('mRoomsSub', roomSub.join(' · '));
    setText('mMembers', String(r.members != null ? r.members : '–'));

    var rep = m.reports || {};
    setText('mReports', String(rep.total != null ? rep.total : '–'));
    setText('mPriority', String(rep.priority != null ? rep.priority : '–'));
    setText('mAuto', String(rep.auto != null ? rep.auto : '–'));
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

  // Émet une action opérateur avec accusé de réception et retour visuel.
  function emitAck(event, data, okMsg, btn, onOk) {
    if (!socket) return;
    if (btn) btn.disabled = true;
    socket.emit(event, data, function (res) {
      if (btn) btn.disabled = false;
      if (res && res.ok) {
        showToast(okMsg, true);
        if (onOk) onOk();
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
    if (r.source === 'filter') meta.appendChild(el('span', 'badge filter', 'filtre auto'));
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
  });
})();
