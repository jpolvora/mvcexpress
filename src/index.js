const MvcExpress = require('./mvcexpress')

const defaultOptions = {
  useDefaultAction: true,
  enableHooks: true,
  controllersFolder: 'controllers',
  controllerName: 'home',
  actionName: 'index',
  mountPath: '/',
  controllerToken: 'controller',
  actionToken: 'action'
}

module.exports = (options = {}) => {
  const opts = Object.assign(defaultOptions, options)
  const mvcexpress = new MvcExpress(opts)
  return mvcexpress
}
