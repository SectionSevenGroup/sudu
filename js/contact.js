// The contact page's own behaviour, in plain script.
//
// Three things the page's Component used to carry: the interest map (the
// chips, the category nodes, their branches and the links between them, and
// the two hidden fields the selection reaches Netlify through), the FAQ
// accordion, and the form's submit. The markup is emitted at rest by the
// build; this only toggles classes, copies the geometry the build put on the
// branches' data attributes into place, and talks to the form handler.
//
// One singleton, reachable as window.suduContact. The script is loaded once
// and every later visit to the contact page re-enters through bind(); what a
// visit adds is torn down on turbo:before-render, so nothing leaks into the
// next one.
(function () {
  if (window.suduContact) { window.suduContact.bind(); return; }

  // The inline status line. Kept short on purpose: it sits under the button
  // in the same 10.5px grey as the fallback address and is the only thing
  // this form says back to the visitor. The strings are in i18n.js's table
  // and are translated there once they land in the page.
  var MSG = {
    blank: 'Please fill in your name, your email, and a note about the project.',
    badEmail: 'That email address does not look complete.',
    sent: 'Inquiry sent. We’ll reply by email.',
    failed: 'That did not send. Please try again, or email us directly.'
  };

  var live = null;

  function on(v, el, type, fn) {
    el.addEventListener(type, fn);
    v.offs.push(function () { el.removeEventListener(type, fn); });
  }

  function has(list, x) { return list.indexOf(x) !== -1; }
  function without(list, x) { return list.filter(function (y) { return y !== x; }); }

  // a) The interest map ------------------------------------------------------
  // The selection is two ordered lists, as it was: the categories in the order
  // they were chosen, and the branches likewise. paint() writes the whole map
  // from them, so a click never has to know what it is undoing.
  function wireMap(v, form) {
    var map = document.querySelector('[data-mind-map]');
    var chips = form.querySelectorAll('[data-chip]');
    var summary = form.querySelector('[data-sub-summary]');
    var interests = form.querySelector('input[name="interests"]');
    var subInterests = form.querySelector('input[name="sub-interests"]');
    v.sel = [];
    v.sub = [];
    var each = function (list, fn) { for (var i = 0; i < list.length; i++) fn(list[i]); };
    var subsOf = function (cat) {
      var out = [];
      if (map) each(map.querySelectorAll('[data-node="sub"][data-category="' + CSS.escape(cat) + '"]'), function (n) { out.push(n.getAttribute('data-sub')); });
      return out;
    };
    var paint = function () {
      each(chips, function (c) {
        var active = has(v.sel, c.getAttribute('data-chip'));
        c.classList.toggle('is-active', active);
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (map) {
        each(map.querySelectorAll('[data-node="cat"], line[data-link="cat"]'), function (n) {
          n.classList.toggle('is-active', has(v.sel, n.getAttribute('data-category')));
        });
        each(map.querySelectorAll('line[data-link="sub"]'), function (l) {
          l.classList.toggle('is-active', has(v.sel, l.getAttribute('data-category')));
          l.classList.toggle('is-on', has(v.sub, l.getAttribute('data-sub')));
        });
        each(map.querySelectorAll('[data-node="sub"]'), function (n) {
          var active = has(v.sel, n.getAttribute('data-category'));
          n.classList.toggle('is-active', active);
          n.classList.toggle('is-on', has(v.sub, n.getAttribute('data-sub')));
          // Unfolds to its own position with its stagger; folds back onto its
          // category at once.
          n.style.left = n.getAttribute(active ? 'data-x' : 'data-cx') + '%';
          n.style.top = n.getAttribute(active ? 'data-y' : 'data-cy') + '%';
          n.style.opacity = active ? '1' : '0';
          n.style.pointerEvents = active ? 'auto' : 'none';
          n.style.transform = 'translate(-50%,-50%) scale(' + (active ? 1 : 0.4) + ')';
          n.style.transitionDelay = (active ? n.getAttribute('data-delay') : 0) + 'ms';
        });
      }
      // The chips are buttons, so their selections reach Netlify through the
      // two hidden fields declared in the form.
      if (interests) interests.value = v.sel.join(', ');
      if (subInterests) subInterests.value = v.sub.join(', ');
      if (summary) {
        summary.textContent = v.sub.length ? 'Including: ' + v.sub.join(', ') : '';
        summary.hidden = !v.sub.length;
      }
    };
    var toggleCat = function (label) {
      if (has(v.sel, label)) {
        v.sel = without(v.sel, label);
        var subs = subsOf(label);
        v.sub = v.sub.filter(function (s) { return !has(subs, s); });
      } else v.sel = v.sel.concat([label]);
      paint();
    };
    var toggleSub = function (label) {
      v.sub = has(v.sub, label) ? without(v.sub, label) : v.sub.concat([label]);
      paint();
    };
    each(chips, function (c) { on(v, c, 'click', function () { toggleCat(c.getAttribute('data-chip')); }); });
    if (map) {
      each(map.querySelectorAll('[data-node="cat"]'), function (n) { on(v, n, 'click', function () { toggleCat(n.getAttribute('data-category')); }); });
      each(map.querySelectorAll('[data-node="sub"]'), function (n) { on(v, n, 'click', function () { toggleSub(n.getAttribute('data-sub')); }); });
    }
  }

  // b) The FAQ ---------------------------------------------------------------
  // One open at a time, and a second press on the open one closes it.
  function wireFaq(v) {
    var btns = document.querySelectorAll('section[data-screen-label="FAQ"] button[aria-expanded]');
    var set = function (b, open) {
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      var chevron = b.querySelector('.sudu-chevron--faq');
      if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
      var answer = b.nextElementSibling;
      if (answer) answer.style.display = open ? 'block' : 'none';
    };
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        on(v, b, 'click', function () {
          var wasOpen = b.getAttribute('aria-expanded') === 'true';
          for (var j = 0; j < btns.length; j++) set(btns[j], btns[j] === b && !wasOpen);
        });
      })(btns[i]);
    }
  }

  // c) The submit ------------------------------------------------------------
  // Posted to Netlify's form handler in the background, so the visitor never
  // leaves the page. This used to hand the enquiry to mailto:, which needed a
  // configured mail client, dropped the enquiry outright when there wasn't
  // one, and left nothing behind on the site either way.
  function wireSubmit(v, form) {
    var button = form.querySelector('button[type="submit"]');
    var glyph = button && button.querySelector('.sudu-chevron--send');
    var status = form.querySelector('[role="status"] > span:first-child');
    // Send inquiry > / Sending... / Inquiry sent (check). The button is the
    // thing the visitor is looking at when they press it, so completion is
    // said there rather than only in the line underneath. The label is a
    // fresh text node each time, which is what lets i18n.js see it change.
    var say = function (label, mark) {
      if (button) {
        button.replaceChild(document.createTextNode(label + ' '), button.firstChild);
        button.disabled = v.sending || v.sent;
      }
      if (glyph) glyph.textContent = mark;
    };
    var tell = function (text) {
      if (!status) return;
      status.textContent = text;
      status.style.display = text ? 'block' : 'none';
    };
    v.sending = false;
    v.sent = false;
    on(v, form, 'submit', function (e) {
      e.preventDefault();
      // A double click can fire twice before the first has been answered.
      if (v.sending || v.sent) return;
      var data = new FormData(form);
      var val = function (k) { return String(data.get(k) || '').trim(); };
      // required and type=email are enforced by the browser before submit
      // fires. What survives that is a field holding only spaces, and an
      // address the email type accepts but no mail server would ('a@gmail').
      var blank = ['name', 'email', 'body'].filter(function (k) { return !val(k); })[0];
      var bad = !blank && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(val('email')) ? 'email' : null;
      if (blank || bad) {
        var el = form.querySelector('[name="' + (blank || bad) + '"]');
        if (el) el.focus();
        tell(blank ? MSG.blank : MSG.badEmail);
        return;
      }
      if (window.suduHaptics) window.suduHaptics.tick(14);
      v.sending = true;
      say('Sending…', '');
      tell('');
      var body = new URLSearchParams();
      data.forEach(function (value, k) { body.append(k, String(value)); });
      // Netlify accepts a urlencoded POST carrying form-name at any path on
      // the site. '/' is used rather than this page's own URL because
      // pretty_urls 301s /contact.html, and a redirected POST becomes a GET.
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        if (v !== live) return;
        v.sending = false; v.sent = true;
        say('Inquiry sent', '✓');
        tell(MSG.sent);
      }).catch(function () {
        if (v !== live) return;
        v.sending = false;
        say('Send inquiry', '›');
        tell(MSG.failed);
      });
    });
  }

  // ------------------------------------------------------------- lifecycle
  function bind() {
    var form = document.querySelector('form[name="contact"]');
    if (!form) return;                                           // not the contact page
    if (live && live.body === document.body) return;             // this body is bound
    unbind();
    var v = live = { body: document.body, offs: [] };
    wireMap(v, form);
    wireFaq(v);
    wireSubmit(v, form);
  }

  function unbind() {
    if (!live) return;
    var v = live;
    live = null;
    for (var i = 0; i < v.offs.length; i++) v.offs[i]();
  }

  window.suduContact = { bind: bind, unbind: unbind };
  document.addEventListener('turbo:before-render', unbind);
  document.addEventListener('turbo:render', bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
