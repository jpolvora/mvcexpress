var express = require('express');
var path = require('path');
var fs = require('fs');
var util = require('util');
const assert = require('assert');

function toCamelCase(str) {
    const [first, ...acc] = str.replace(/[^\w\d]/g, ' ').split(/\s+/);
    return first.toLowerCase() + acc.map(x => x.charAt(0).toUpperCase()
        + x.slice(1).toLowerCase()).join('');
}

const defaultOptions = {
    useDefaultAction: false,
    enableHooks: process.env.NODE_ENV == "development",
    controllersFolder: "controllers"
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
        return (req, res, next) => {
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
    status: function (statusCode = 200, objOrMsg = "") {
        return (req, res, next) => {
            res.status(statusCode);
            return next({ status: statusCode });
        }
    },
    notfound: function (msg = "") {
        return (req, res) => res.status(404);
    },
    raw: function (callback) {
        return callback;
    }
}

let defaultRoute = {
    defaultControllerName: "home",
    defaultActionName: "index"
}

class MvcHandler {
    constructor(options) {
        this.opts = Object.assign({}, defaultOptions, options || {});
    }

    async handler(req, res, next) {
        const p = path.parse(req.path);
        if (p.ext) {
            console.log("mvcexpress ignored path: " + req.path);
            return next();
        }
        const controllerName = req.params.controller ? req.params.controller.toLowerCase() : defaultRoute.defaultControllerName;
        const actionName = req.params.action ? req.params.action.toLowerCase() : defaultRoute.defaultActionName;
        try {
            const controllerPath = path.format({
                dir: path.join(process.cwd(), defaultOptions.controllersFolder),
                name: controllerName.toLowerCase(),
                ext: '.js'
            });
            var exists = fs.existsSync(controllerPath);
            if (!exists)
                return next();
            const controllerModule = require(controllerPath);
            const ctorParams = Object.assign({}, servicesToInject);
            let controllerInstance = typeof controllerModule === "function"
                ? new controllerModule(ctorParams)
                : controllerModule;
            controllerInstance.toString = function () {
                return controllerName;
            };
            if (defaultOptions.enableHooks && typeof activeHooks.controllerCreated === "function") {
                activeHooks.controllerCreated(controllerInstance);
            }
            const actionNames = [
                toCamelCase([req.method, actionName].join(' ')),
                toCamelCase(actionName),
                "catchAll"
            ];
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
            //create a default action that renders a view that has the same name of the action.
            if (!actionInstance) {
                if (defaultOptions.useDefaultAction) {
                    actionInstance = function (req) {
                        return ctorParams.view.call(controllerInstance, actionName, { req: req });
                    };
                }
                else
                    return next();
            }
            req.mvcexpress = Object.assign({}, {
                controller: controllerName,
                action: selectedActionName,
                originalAction: actionName
            });
            assert.ok(typeof actionInstance === "function", "action must be a Function: " + util.inspect(actionInstance));
            if (defaultOptions.enableHooks && typeof activeHooks.beforeExecuteAction === "function") {
                activeHooks.beforeExecuteAction(controllerInstance, selectedActionName);
            }
            //the idea here is avoid passing response object to actions. This prevents the consumer acidentally write output too early.
            //instead, let the well formed actionresults do the job to write to response.
            //so the action just return an actionresult and let the framework do the job. 
            let canExecute = true; //true by default.
            if (controllerInstance.canExecute) {
                let obj = controllerInstance.canExecute;
                if (typeof obj === "function") {
                    canExecute = await obj.call(controllerInstance, req);
                }
                else {
                    canExecute = obj; //whatever obj returns true or false
                }
            }
            //if (returned obj is a function, this will be the actual result.)
            if (typeof canExecute === "function") {
                return canExecute.call(controllerInstance, req, res);
            }
            else if (!canExecute) {
                console.log("Cannot execute: canExecute returned a falsy result.");
                return next();
            }
            const actionResult = await actionInstance.call(controllerInstance, req);
            if (defaultOptions.enableHooks && typeof activeHooks.afterExecuteAction === "function") {
                activeHooks.afterExecuteAction(controllerInstance, selectedActionName, typeof actionResult);
            }
            assert.ok(typeof actionResult === "string" || typeof actionResult === "function", "action must return String or Function");
            if (defaultOptions.enableHooks && typeof activeHooks.beforeExecuteResult === "function") {
                activeHooks.beforeExecuteResult(controllerInstance, selectedActionName);
            }
            if (typeof actionResult === "function") {
                await actionResult(req, res, next);
            }
            else if (typeof actionResult === "string") {
                res.send(actionResult);
            }
            if (defaultOptions.enableHooks && typeof activeHooks.afterExecuteResult === "function") {
                activeHooks.afterExecuteResult(controllerInstance, selectedActionName);
            }
            return console.log('end mvc.');
        }
        catch (error) {
            return next(error);
        }
    }
}



module.exports = (services = {}, cfg = {}, hooks = {}) => {

    const mvchandler = new MvcHandler(cfg);
    const router = express.Router();

    return {
        registerMvc: function () {
            router.all('/:controller?/:action?/*', mvchandler.handler);
            return router;
        },

        registerMvcCustom: function (registrationPattern) {
            router.all(registrationPattern, handler);
            return router;
        }
    }
}