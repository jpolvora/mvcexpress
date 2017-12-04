var express = require('express');
var router = express.Router();
var path = require('path');
var fs = require('fs');
var util = require('util');
var fExists = util.promisify(fs.exists);
const assert = require('assert');

const servicesToInject = {
    view: function (viewName, model) {
        return (res) => res.render(viewName, model);
    },
    redirect: function (url, statusCode = 302) {
        return (res) => res.redirect(statusCode, url);
    },
    json: function (str) {
        return (res) => res.json(str);
    },
    content: function (raw, contentType = "text/html") {
        return (res) => {
            res.header("Content-Type", contentType);
            res.send(raw);
        }
    },
    status: function (statusCode = 200) {
        return (res) => res.status(statusCode);
    },
    notfound: function () {
        return res => res.status(404);
    },
    raw: function (callback) {
        return (res) => callback(res);
    }
}

router.all('/:controller?/:action?', async (req, res, next) => {
    const p = path.parse(req.url);
    if (p.ext) {
        return next()
    }

    const controllerName = req.params.controller ? req.params.controller.toLowerCase() : "home";
    const actionName = req.params.action ? req.params.action.toLowerCase() : "index";
    try {
        const controllerPath = path.format({
            dir: path.join(process.cwd(), 'controllers'),
            name: controllerName.toLowerCase(),
            ext: '.js'
        });

        var exists = await fExists(controllerPath);
        if (!exists) return next();

        const controllerModule = require(controllerPath);
        let controllerInstance = typeof controllerModule === "function"
            ? new controllerModule(servicesToInject)
            : controllerModule;

        const action = controllerInstance[actionName] || controllerInstance.catchAll;
        assert.ok(typeof action === "function", "action must be a Function: " + util.inspect(action));

        const actionResult = action(req);
        assert.ok(typeof actionResult === "string" || typeof actionResult === "function", "action must return String or Function")

        if (typeof actionResult === "string") {
            return res.send(actionResult);
        } else if (typeof actionResult === "function") {
            const result = await actionResult(res);
            return result;
        }
    } catch (error) {
        return next(error);
    }
});

module.exports = (services = {}) => {
    Object.assign(servicesToInject, services);

    return router;
};