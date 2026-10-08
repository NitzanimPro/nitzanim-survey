// The only module that talks to the server. Every call is a POST with
// Content-Type text/plain (a "simple" request: no CORS preflight, which
// Apps Script cannot answer) whose body is JSON: {action, payload}.
// Each function returns a Promise that resolves with the server's `data`, or
// rejects with an Error whose `.message` is a short code and whose `.code`
// is the same code:
//   timeout / network / bad_response  - transport problems (safe to retry)
//   anything else                     - an error code returned by the server
//                                       (e.g. invalid_id_number, closed)
var Api = (function () {
  // Apps Script usually replies in 1-3s, but about one request in ten is
  // held up for 15-60s by Google (measured, even for an empty ping). All
  // requests are idempotent (the server upserts by session_id), so a slow
  // request is "hedged": after HEDGE_AFTER_MS without an answer an identical
  // second request is sent in parallel, and the first success wins. This cut
  // the slowest 1% of requests from ~47s to ~20s in testing.
  var ATTEMPT_TIMEOUT_MS = 30000;
  var HEDGE_AFTER_MS = 8000;
  var MAX_PARALLEL_ATTEMPTS = 3;

  function failure_(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function isTransportError_(error) {
    return error && (error.code === 'timeout' || error.code === 'network' || error.code === 'bad_response');
  }

  // One HTTP exchange. Returns { promise, abort }.
  function attempt_(action, payload, keepalive) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, ATTEMPT_TIMEOUT_MS);

    var promise = fetch(window.NZ_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload }),
      credentials: 'omit',
      redirect: 'follow',
      // keepalive lets the request outlive a closing page (body must stay < 64KB).
      keepalive: keepalive === true,
      signal: controller.signal
    }).then(function (response) {
      return response.text();
    }).then(function (text) {
      clearTimeout(timer);
      var body;
      try {
        body = JSON.parse(text);
      } catch (e) {
        throw failure_('bad_response');
      }
      if (!body || body.ok !== true) {
        throw failure_((body && body.error) || 'bad_response');
      }
      return body.data;
    }, function (error) {
      clearTimeout(timer);
      throw failure_(error && error.name === 'AbortError' ? 'timeout' : 'network');
    });

    return {
      promise: promise,
      abort: function () {
        clearTimeout(timer);
        controller.abort();
      }
    };
  }

  // Resolves with the first success. Rejects at once with an error returned
  // by the server (it answered; asking again changes nothing), and with a
  // transport error only when every attempt that was started has failed.
  function request_(action, payload, options) {
    options = options || {};
    if (options.keepalive) {
      // The page is going away: a single fire-and-forget request.
      return attempt_(action, payload, true).promise;
    }

    return new Promise(function (resolve, reject) {
      var attempts = [];
      var pending = 0;
      var settled = false;
      var hedgeTimer = null;
      var lastError = null;

      function finish(settle, value) {
        if (settled) return;
        settled = true;
        clearTimeout(hedgeTimer);
        attempts.forEach(function (a) {
          a.abort();
        });
        settle(value);
      }

      function scheduleHedge() {
        if (attempts.length >= MAX_PARALLEL_ATTEMPTS) return;
        hedgeTimer = setTimeout(function () {
          if (!settled) start();
        }, HEDGE_AFTER_MS);
      }

      function start() {
        var a = attempt_(action, payload, false);
        attempts.push(a);
        pending++;
        a.promise.then(function (data) {
          pending--;
          finish(resolve, data);
        }, function (error) {
          pending--;
          if (settled) return;
          if (!isTransportError_(error)) {
            finish(reject, error);
            return;
          }
          lastError = error;
          if (pending === 0) finish(reject, lastError);
        });
        scheduleHedge();
      }

      start();
    });
  }

  return {
    getDefinition: function () {
      return request_('getDefinition');
    },
    saveCheckpoint: function (payload) {
      return request_('saveCheckpoint', payload);
    },
    // Best-effort save when the page is being hidden or closed. Same action
    // as a normal checkpoint; the caller ignores the result if the page is gone.
    saveCheckpointOnExit: function (payload) {
      return request_('saveCheckpoint', payload, { keepalive: true });
    },
    submit: function (payload) {
      return request_('submit', payload);
    }
  };
})();
