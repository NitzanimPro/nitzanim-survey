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
  // Apps Script replies in 1-5s usually, but cold starts and Google's
  // redirect can take much longer (tens of seconds were observed).
  var TIMEOUT_MS = 60000;

  function failure_(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function request_(action, payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);

    return fetch(window.NZ_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload }),
      credentials: 'omit',
      redirect: 'follow',
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
  }

  return {
    getDefinition: function () {
      return request_('getDefinition');
    },
    saveCheckpoint: function (payload) {
      return request_('saveCheckpoint', payload);
    },
    submit: function (payload) {
      return request_('submit', payload);
    }
  };
})();
