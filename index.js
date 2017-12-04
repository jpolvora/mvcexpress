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

const defaultOptions = {
    useDefaultAction: true,
    enableHooks: false
}

const activeHooks = {
    controllerCreated: function (controllerInstance) {
        console.log(`Controller Created: ${controllerInstance}`)
    },
    beforeExecuteAction: function (controllerInstance, actionName) {
        console.log(`Before Execute Action: ${actionName} on controller ${controllerInstance}`)
    },
    afterExecuteAction: function (controllerInstance, actionName, actionResultType) {
        console.log(`After Execute Action: ${actionName} on controller ${controllerInstance}: ${actionResultType}`)
    },
    beforeExecuteResult: function () {
        console.log('beforeExecuteResult')
    },
    afterExecuteResult: function () {
        console.log('afterExecuteResult')
    }
}

const servicesToInject = {
    view: function (viewName, model) {
        return (req, res) => {
            if (typeof viewName !== "string") {
                model = viewName;
                const { controller, action } = req.mvcexpress;
                viewName = controller + "/" + action;
            }
            res.render(viewName, model)
        }
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

        controllerInstance.toString = function () {
            return controllerName;
        }

        if (defaultOptions.enableHooks && typeof activeHooks.controllerCreated === "function") {
            activeHooks.controllerCreated(controllerInstance)
        }

        const actionNames = [
            toCamelCase([req.method, actionName].join(' ')),
            toCamelCase(actionName),
            "catchAll"
        ]

        let selectedActionName = actionName;
        let actionInstance;
        for (let i = 0; i < actionNames.length; i++) {
            let currentActionName = actionNames[i];
            if (controllerInstance[currentActionName]) {
                actionInstance = controllerInstance[currentActionName];
                selectedActionName = currentActionName;
                break;
            }
        }

        req.mvcexpress = Object.assign({}, {
            controller: controllerName,
            action: selectedActionName,
            originalAction: actionName
        })
        //create a default action that renders a view that has the same name of the action.
        if (!actionInstance && defaultOptions.useDefaultAction) {
            actionInstance = function () {
                return ctorParams.view({});
            }
        }

        assert.ok(typeof actionInstance === "function", "action must be a Function: " + util.inspect(actionInstance));

        if (defaultOptions.enableHooks && typeof activeHooks.beforeExecuteAction === "function") {
            activeHooks.beforeExecuteAction(controllerInstance, selectedActionName);
        }

        //the idea here is avoid passing response object to actions. This prevents the consumer acidentally write output too early.
        //instead, let the well formed actionresults do the job to write to response.
        //so the action just return an actionresult and let the framework do the job. 
        const actionResult = await actionInstance.call(controllerInstance, req);

        if (defaultOptions.enableHooks && typeof activeHooks.afterExecuteAction === "function") {
            activeHooks.afterExecuteAction(controllerInstance, selectedActionName, typeof actionResult);
        }

        assert.ok(typeof actionResult === "string" || typeof actionResult === "function", "action must return String or Function")

        if (defaultOptions.enableHooks && typeof activeHooks.beforeExecuteResult === "function") {
            activeHooks.beforeExecuteResult(controllerInstance, selectedActionName);
        }

        if (typeof actionResult === "function") {
            await actionResult(req, res);
        } else if (typeof actionResult === "string") {
            res.send(actionResult);
        }

        if (defaultOptions.enableHooks && typeof activeHooks.afterExecuteResult === "function") {
            activeHooks.afterExecuteResult(controllerInstance, selectedActionName);
        }

        return console.log('end mvc.')
    } catch (error) {
        return next(error);
    }
});

module.exports = (services = {}, cfg = {}, hooks = {}) => {
    Object.assign(servicesToInject, services);
    Object.assign(defaultOptions, cfg);
    Object.assign(activeHooks, hooks);
    return router;
}