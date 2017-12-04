var express = require('express');
var router = express.Router();
var path = require('path');
var fs = require('fs');
var util = require('util');
var fExists = util.promisify(fs.exists);
const assert = require('assert');

function toCamelCase(str) {
    const [first, ...acc] = str.replace(/[^\w\d]/g, ' ').split(/\s+/);
    return first.toLowerCase() + acc.map(x => x.charAt(0).toUpperCase()
        + x.slice(1).toLowerCase()).join('');
}

const servicesToInject = {
    view: function (viewName, model) {
        return (req, res) => res.render(viewName, model);
    },
    redirect: function (url, statusCode = 302) {
        return (req, res) => res.redirect(statusCode, url);
    },
    json: function (str) {
        return (req, res) => res.json(str);
    },
    content: function (raw, contentType = "text/html") {
        return (req, res) => {
            res.header("Content-Type", contentType);
            res.send(raw);
        }
    },
    status: function (statusCode = 200) {
        return (req, res) => res.status(statusCode);
    },
    notfound: function (msg = "") {
        return (req, res) => res.status(404);
    },
    raw: function (callback) {
        return callback;
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
        const ctorParams = Object.assign({}, servicesToInject);

        let controllerInstance = typeof controllerModule === "function"
            ? new controllerModule(ctorParams)
            : controllerModule;

        const actionNames = [
            toCamelCase([req.method, actionName].join(' ')),
            toCamelCase(actionName),
            "catchAll"
        ]

        let action;
        for (let i = 0; i < actionNames.length; i++) {
            let actionName = actionNames[i];
            if (controllerInstance[actionName]) {
                action = controllerInstance[actionName];
                break;
            }
        }

        assert.ok(typeof action === "function", "action must be a Function: " + util.inspect(action));

        //the idea here is avoid passing response object to actions. This prevents the consumer acidentally write output too early.
        //instead, let the well formed actionresults do the job to write to response.
        //so the action just return an actionresult and let the framework do the job. 
        const actionResult = await action.call(controllerInstance, req);
        assert.ok(typeof actionResult === "string" || typeof actionResult === "function", "action must return String or Function")

        if (typeof actionResult === "string") {
            return res.send(actionResult);
        } else if (typeof actionResult === "function") {
            const result = await actionResult(req, res);
            return result;
        }
    } catch (error) {
        return next(error);
    }
});

module.exports = (services = {}) => {
    Object.assign(servicesToInject, services);

    return router;
}