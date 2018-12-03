function view(viewName, model) {
  return (req, res, next) => {
    if (typeof viewName !== 'string') {
      model = viewName;
      const { controller, action } = req.mvcexpress;
      viewName = controller + '/' + action;
    }
    res.render(viewName, model);
  }
}

function redirect(url, statusCode = 302) {
  return (req, res) => res.redirect(statusCode, url);
}

function json(str) {
  return (req, res) => res.json(str);
}

function content(raw, contentType = 'text/html') {
  return (req, res) => {
    res.header('Content-Type', contentType);
    res.send(raw);
  };
}

function status(statusCode = 200, objOrMsg = '') {
  return (req, res, next) => {
    res.status(statusCode);
    return next({ status: statusCode });
  };
}

function notfound(msg = '') {
  return (req, res) => res.status(404);
}

function raw(callback) {
  return callback;
}

module.exports = {
  raw,
  notfound,
  status,
  content,
  json,
  redirect,
  view
}