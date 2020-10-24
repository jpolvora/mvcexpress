const MvcExpress = require('./mvcexpress')
const factory = require('./index')
const express = require('express')

test('should return an instance of mvcexpress', () => {
  const app = express()
  const instance = factory(app, {})
  expect(instance instanceof MvcExpress)
})