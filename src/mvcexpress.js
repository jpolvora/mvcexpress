const debug = require('debug')('mvcexpress');
var express = require('express');
var path = require('path');
var fs = require('fs');
var util = require('util');
const assert = require('assert');
const EventEmitter = require('events');

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
        debug(`Controller Created: ${controllerInstance}`)
    },
    beforeExecuteAction: function (controllerInstance, actionName) {
        debug(`Before Execute Action: ${actionName} on controller ${controllerInstance}`)
    },
    afterExecuteAction: function (controllerInstance, actionName, actionResultType) {
        debug(`After Execute Action: ${actionName} on controller ${controllerInstance}: ${actionResultType}`)
    },
    beforeExecuteResult: function () {
        debug('beforeExecuteResult')
    },
    afterExecuteResult: function () {
        debug('afterExecuteResult')
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

const defaultRoute = {
    defaultControllerName: "home",
    defaultActionName: "index"
}

class MvcHandler extends EventEmitter {
    constructor(router, options = {}) {
        super();
        this.router = router;
        this.options = Object.assign({}, defaultOptions, options || {});
    }

    async handler(req, res, next) {
        var self = this;
        const p = path.parse(req.path);
        if (p.ext) {
            debug("mvcexpress ignored path: " + req.path);
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
            controllerInstance.toString = () => controllerName;

            self.emit('controllerCreated');
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
            super.emit('beforeExecuteAction');
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
                debug("Cannot execute: canExecute returned a falsy result.");
                return next();
            }
            const actionResult = await actionInstance.call(controllerInstance, req);
            self.emit('afterExecuteAction');
            assert.ok(typeof actionResult === "string" || typeof actionResult === "function", "action must return String or Function");
            self.emit('beforeExecuteResult', controllerInstance, selectedActionName);
            if (typeof actionResult === "function") {
                actionResult(req, res, next);
            }
            else if (typeof actionResult === "string") {
                res.send(actionResult);
            }
            self.emit('afterExecuteResult', controllerInstance, selectedActionName);
            return debug('end mvc.');
        }
        catch (error) {
            return next(error);
        }
    }
}


module.exports = (services = {}, cfg = {}, hooks = {}) => {
    const router = express.Router();
    const mvchandler = new MvcHandler(router);

    return {
        registerMvc: function () {
            router.all('/:controller?/:action?/*', mvchandler.handler.bind(mvchandler));
            return mvchandler;
        },

        registerMvcCustom: function (registrationPattern) {
            router.all(registrationPattern, mvchandler.handler.bind(mvchandler));
            return mvchandler;
        }
    }
}