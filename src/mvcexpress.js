const debug = require('debug')('mvcexpress');
const actions = require('./actionresults');
var path = require('path');
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
    controllersFolder: "controllers",
    defaultControllerName: "home",
    defaultActionName: "index"
}

function defaultControllerFactory(req, res, next, actions, options, controllerName, controllerModule) {
    if (typeof controllerModule !== "function") throw new Error("controllerModule is not a function!");
    const controllerInstance = new controllerModule();
    controllerInstance.toString = () => controllerName;
    controllerInstance.req = req;
    controllerInstance.res = res;
    controllerInstance.next = next;
    controllerInstance.options = options;

    for (let key in actions) {
        if (controllerInstance[key]) continue;
        if (typeof actions[key] === "function") {
            controllerInstance[key] = actions[key];
        }
    }

    return controllerInstance;
}

function createActionNames(method, actionName) {
    const actionNames = [
        toCamelCase([method, actionName].join(' ')),
        toCamelCase(actionName),
        "catchAll"
    ];

    return actionNames;
}

function selectActionToExecute(method, actionName, controllerInstance) {
    const actionNames = createActionNames(method, actionName);
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

    if (!actionInstance) {
        return false;
    }

    return {
        selectedActionName,
        actionInstance
    };
}

class MvcHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = Object.assign({}, defaultOptions, options);
        this.controllersFolder = path.join(process.cwd(), this.options.controllersFolder);
    }

    async handler(req, res, next) {
        var self = this;
        const p = path.parse(req.path);
        if (p.ext) {
            debug("mvcexpress ignored path: " + req.path);
            return next();
        }
        const controllerName = req.params.controller ? req.params.controller.toLowerCase() : self.options.defaultControllerName;
        const actionName = req.params.action ? req.params.action.toLowerCase() : self.options.defaultActionName;
        try {
            const controllerPath = path.format({
                dir: self.controllersFolder,
                name: controllerName.toLowerCase(),
                ext: '.js'
            });

            let controllerModule = null;
            try {
                controllerModule = require(controllerPath);
            } catch (error) {
                debug(error.message || error);
            }
            finally {
                if (!controllerModule)
                    return next();
                if (typeof controllerModule !== "function")
                    return next();
            }

            const controllerInstance = defaultControllerFactory(req, res, next, actions, self.options, controllerName, controllerModule);

            self.emit('controllerCreated', controllerInstance);

            const { actionInstance, selectedActionName } = selectActionToExecute(req.method, actionName, controllerInstance);
            if (!actionInstance) return next();

            req.mvcexpress = Object.assign({}, {
                controller: controllerName,
                action: selectedActionName,
                originalAction: actionName
            });
            assert.ok(typeof actionInstance === "function", "action must be a Function: " + util.inspect(actionInstance));
            self.emit('beforeExecuteAction');
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
                return canExecute.call(controllerInstance);
            }
            else if (!canExecute) {
                debug("Cannot execute: canExecute returned a falsy result.");
                return next();
            }
            const actionResult = await actionInstance.call(controllerInstance);
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
            debug(error.message || error)
            return next();
        }
    }
}

const debugHooks = {
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

module.exports = (app, options = {}) => {
    let mountPath = options.mountPath || '/';
    if (!mountPath.startsWith('/')) mountPath = "/" + mountPath;
    if (!mountPath.endsWith('/')) mountPath = mountPath + "/";
    options.mountPath = mountPath;
    const mvchandler = new MvcHandler(options);
    app.use(`${mountPath}:controller?/:action?`, mvchandler.handler.bind(mvchandler));
    if (process.env.NODE_ENV == "development") {
        mvchandler.on('controllerCreated', debugHooks.controllerCreated);
        mvchandler.on('beforeExecuteAction', debugHooks.beforeExecuteAction);
        mvchandler.on('afterExecuteAction', debugHooks.afterExecuteAction);
        mvchandler.on('beforeExecuteResult', debugHooks.beforeExecuteResult);
        mvchandler.on('afterExecuteResult', debugHooks.afterExecuteResult);
    }
    return mvchandler;
}