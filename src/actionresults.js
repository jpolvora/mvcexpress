module.exports = {
  view: function view (viewName, model) {
    return (req, res, next) => {
      if (typeof viewName !== 'string') {
        model = viewName;
        const { controller, action } = req.mvcexpress;
        viewName = controller + '/' + action;
      }
      res.render(viewName, model);
    };
  },
  redirect: function redirect (url, statusCode = 302) {
    return (req, res) => res.redirect(statusCode, url);
  },
  json: function (str) {
    return (req, res) => res.json(str);
  },
  content: function (raw, contentType = 'text/html') {
    return (req, res) => {
      res.header('Content-Type', contentType);
      res.send(raw);
    };
  },
  status: function (statusCode = 200, objOrMsg = '') {
    return (req, res, next) => {
      res.status(statusCode);
      return next({ status: statusCode });
    };
  },
  notfound: function (msg = '') {
    return (req, res) => res.status(404);
  },
  raw: function (callback) {
    return callback;
  }
};
