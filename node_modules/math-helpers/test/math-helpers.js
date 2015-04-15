/*global describe: true, it: true, beforeEach: true */
var assert = require('assert'),
    math = require('../math-helpers')

describe('math-helpers', function() {
  var arr = [1, 2.3, 3, 4.7, 5, 6]
  beforeEach(function() {
    this.helpers = math()
  })

  describe('precision', function() {
    it('the module should default to a precision of 3', function() {
      assert.equal(this.helpers.precision, 3)
    })
  })

	describe('#roundTo()', function() {
    it('should return a number rounded with given precision', function() {
      assert.equal(this.helpers.round(1.234567, 2), 1.23)
    })

    it('should properly round negative numbers', function() {
      assert.equal(this.helpers.round(-1.234567, 2), -1.23)
      assert.equal(this.helpers.round(-3.5, 0), -4)
    })

    it('if no precision is passed, use precision set in module', function() {
      // default precision
      assert.equal(this.helpers.round(1.234567), 1.235)
      // optional precision
      assert.equal(this.helpers.round(1.234567, 2), 1.23)
    })
  })

  describe('#sum()', function() {
    it('should return the sum of an array of numbers', function() {
      assert.equal(this.helpers.sum(arr), 22)
    })

    it('should not crap out if there are non-numbers in the array', function() {
      assert.equal(this.helpers.sum(['nv', 1, '2.3', 3, null, 4.7, 5, 6, 'nv']), 22)
    })
  })

  describe('#avg()', function() {
    it('should return the average of an array of numbers', function() {
      assert.equal(this.helpers.avg(arr), 3.667)
      // optional precision
      assert.equal(this.helpers.avg(arr, 2), 3.67)
    })

    it('should not crap out if there are non-numbers in the array', function() {
      assert.equal(this.helpers.avg(['nv', 1, '2.3', 3, null, 4.7, 5, 6, 'nv']), 3.667)
    })
  })

  describe('#stdDev()', function() {
    it('should approximate the stdDev of an array of numbers using the n-1 method', function() {
      assert.equal(this.helpers.stdDev(arr), 1.882)
      // optional precision
      assert.equal(this.helpers.stdDev(arr, 2), 1.88)
    })

    it('should not crap out if there are non-numbers in the array', function() {
      assert.equal(this.helpers.stdDev(['nv', 1, '2.3', 3, null, 4.7, 5, 6, 'nv']), 1.882)
    })
  })

  describe('#tolAus()', function() {
    it('should calculate the "relative tolerance score" of a given value and its tolerance', function() {
      assert.equal(this.helpers.tolAus(3, 7), 0.429)
      assert.equal(this.helpers.tolAus(-3, 7), 0.429) // should be absolute value
    })
  })

  describe('#linReg()', function() {
    it('should return slope, intercept, fn and r2', function () {
      var x = arr,
          y = [ 175, 178, 172, 167, 172, 165 ],
          lr = this.helpers.linReg(x, y)

      assert.equal(lr.slope, -2.128340233345852)
      assert.equal(lr.intercept, 179.30391418893478)
      assert.equal(lr.fn(1), -2.128340233345852 * 1 + 179.30391418893478)
      assert(typeof lr.r2 === 'number')
    })

    it('should ignore null entries', function () {
      var x = [1, 2.3, null, 3, 4.7, 5, 6 ],
          y = [ 175, 178, null, 172, 167, 172, 165 ],
          lr = this.helpers.linReg(x, y)

      assert.equal(lr.slope, -2.128340233345852)
      assert.equal(lr.intercept, 179.30391418893478)
    })

    it('should throw an error if x and y are of different size', function () {
      var x = arr,
          y = [ 175, 178, 172, 167, 172]

      assert.throws(function() {
        this.helpers.linReg(x, y)
      })
    })
  })
})