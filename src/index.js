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

module.exports = (app, options = {}) => {
  const opts = Object.assign(defaultOptions, options)
  const mvcexpress = new MvcExpress(opts)
  const route = `${opts.mountPath}:${opts.controllerToken}?/:${opts.actionToken}?`
  console.log(route)
  app.use(route, mvcexpress.handler.bind(mvcexpress))
  return mvcexpress
}
