const EventEmitter = require('events').EventEmitter
const MvcExpress = require('../src/mvcexpress')
const factory = require('../src/index')
const express = require('express')

test('should return an instance of mvcexpress', () => {
  const app = express()
  const instance = factory(app, {})
  expect(instance instanceof MvcExpress)
  expect(instance instanceof EventEmitter)
})
