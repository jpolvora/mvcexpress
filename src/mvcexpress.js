const debug = require('debug')('mvcexpress');
const path = require('path');
const EventEmitter = require('events');

/* custom files */
const actions = require('./actionresults');
const { renameFunction, toCamelCase } = require('./utils');

function defaultControllerFactory (req, res, next, actions, options, controllerName, ControllerModule) {
  var self = this; // this is the mvcexpress
  if (typeof ControllerModule !== 'function') throw new Error('controllerModule is not a function!');
  const controllerInstance = new ControllerModule();
  controllerInstance.toString = () => controllerName;
  controllerInstance.req = req;
  controllerInstance.res = res;
  controllerInstance.next = next;
  controllerInstance.options = options;
  controllerInstance.on = self.on;
  controllerInstance.off = self.off;

  for (let key in actions) {
    if (controllerInstance[key]) continue;
    if (typeof actions[key] === 'function') {
      controllerInstance[key] = actions[key];
    }
  }

  return controllerInstance;
}

function createActionNames (method, actionName) {
  const actionNames = [
    toCamelCase([method, actionName].join(' ')),
    toCamelCase(actionName),
    'catchAll'
  ];

  return actionNames;
}

function selectActionToExecute (method, actionName, controllerInstance) {
  var mvcexpress = this;
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
    if (mvcexpress.options.useDefaultAction) {
      // if there's no catchAll method on controller
      // action instance will be the default action (index) if exists. otherwise, false
      if (typeof controllerInstance[mvcexpress.options.defaultActionName] !== 'function') { return false; }

      actionInstance = controllerInstance[mvcexpress.options.defaultActionName];
    } else { return false; }
  }

  return renameFunction(actionInstance, selectedActionName);
}

class MvcExpress extends EventEmitter {
  constructor (options = {}) {
    super();
    this.options = Object.assign({}, defaultOptions, options);

    // executes once per instantiation
    this.controllersFolder = path.join(process.cwd(), this.options.controllersFolder);
  }

  /* this is the function that will be bound to the router */
  async handler (req, res, next) {
    var self = this;
    const p = path.parse(req.path);
    if (p.ext) {
      debug('mvcexpress ignored path: ' + req.path);
      return next();
    }
    const controllerName = req.params[self.options.controllerToken] ? req.params[self.options.controllerToken].toLowerCase() : self.options.defaultControllerName;
    const actionName = req.params[self.options.actionToken] ? req.params[self.options.actionToken].toLowerCase() : self.options.defaultActionName;

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
    } finally {
    }
    if (controllerModule == null) return next();

    const controllerInstance = defaultControllerFactory.call(self, req, res, next, actions, self.options, controllerName, controllerModule);

    self.emit('controllerCreated', controllerInstance);

    const actionInstance = selectActionToExecute.call(this, req.method, actionName, controllerInstance);
    if (!actionInstance) return next();
    const selectedActionName = actionInstance.name;

    self.mvcexpress = Object.assign({}, {
      controller: controllerName,
      action: selectedActionName,
      originalAction: actionName
    });

    self.emit('beforeExecuteAction', actionName, selectedActionName);

    let canExecute = true; // true by default.
    if (controllerInstance.canExecute && typeof controllerInstance.canExecute === 'function') {
      debug('entering canExecute evaluation');
      canExecute = await controllerInstance.canExecute(selectedActionName, actionName);
      debug(canExecute);
    }

    if (!canExecute) {
      debug('Cannot execute: canExecute returned a falsy result.');
      return next();
    }
    const actionResult = await actionInstance.call(controllerInstance);
    self.emit('afterExecuteAction');

    self.emit('beforeExecuteResult', controllerInstance, selectedActionName);
    if (typeof actionResult === 'function') {
      actionResult(req, res, next);
    } else if (typeof actionResult === 'string') {
      res.send(actionResult);
    }
    self.emit('afterExecuteResult', controllerInstance, selectedActionName);
  }
}

const debugHooks = {
  controllerCreated: function (controllerInstance) {
    debug(`Controller Created: ${controllerInstance}`);
  },
  beforeExecuteAction: function (controllerInstance, actionName) {
    debug(`Before Execute Action: ${actionName} on controller ${controllerInstance}`);
  },
  afterExecuteAction: function (controllerInstance, actionName, actionResultType) {
    debug(`After Execute Action: ${actionName} on controller ${controllerInstance}: ${actionResultType}`);
  },
  beforeExecuteResult: function () {
    debug('beforeExecuteResult');
  },
  afterExecuteResult: function () {
    debug('afterExecuteResult');
  }
};

const defaultOptions = {
  useDefaultAction: false,
  enableHooks: process.env.NODE_ENV === 'development',
  controllersFolder: 'controllers',
  defaultControllerName: 'home',
  defaultActionName: 'index',
  defaultMountPath: '/mvc/',
  defaultControllerToken: 'controller',
  defaultActionToken: 'action'
};

module.exports = (app, options = {}) => {
  let mountPath = options.mountPath || defaultOptions.defaultMountPath;
  if (!mountPath.startsWith('/')) mountPath = '/' + mountPath;
  if (!mountPath.endsWith('/')) mountPath = mountPath + '/';
  options.mountPath = mountPath;

  let controllerToken = options.controllerToken || defaultOptions.defaultControllerToken;
  options.controllerToken = controllerToken;
  let actionToken = options.actionToken || defaultOptions.defaultActionToken;
  options.actionToken = actionToken;

  const mvcexpress = new MvcExpress(options);

  const dev = process.env.NODE_ENV === 'development';

  app.use(`${mountPath}:${controllerToken}?/:${actionToken}?`, mvcexpress.handler.bind(mvcexpress));
  if (dev) {
    mvcexpress.on('controllerCreated', debugHooks.controllerCreated);
    mvcexpress.on('beforeExecuteAction', debugHooks.beforeExecuteAction);
    mvcexpress.on('afterExecuteAction', debugHooks.afterExecuteAction);
    mvcexpress.on('beforeExecuteResult', debugHooks.beforeExecuteResult);
    mvcexpress.on('afterExecuteResult', debugHooks.afterExecuteResult);
  }
  return mvcexpress;
};
