
module.exports = function (opts) { return new Helpers(opts) }

/**
 * Constructor
 *
 * @return {object} module The helpers module with its various methods
 */

function Helpers (opts) {
  opts = opts || {}
  this.precision = opts.precision || 3
}

/**
 * returns the number rounded to a given precision
 * uses "correct" rounding: 3.5 -> 4; -3.5 -> -4;
 * since: Math.round(-3.5) === -3 :-/
 * also Math.round() get's deoptimized for neg. numbers
 *
 * @param {number} num The number to round
 * @param {number} decimals Precision
 * @return {number} rounded number
 */

Helpers.prototype.round = function (num, decimals) {
  decimals = decimals || decimals === 0 ? decimals : this.precision
  var rounded = Math.round( Math.abs(num) * Math.pow(10, decimals) ) / Math.pow(10, decimals)
  return (num < 0) ? -1 * rounded : rounded
}

/**
 * calculates the sum
 *
 * @param {array} values An array of numbers
 * @return {number} sum of values
 */

Helpers.prototype.sum = function (values) {
  var sum = 0
  for (var i = 0, len = values.length; i < len; i++) {
    if (values[i] !== null && !isNaN(values[i]))
      sum += +values[i] // cast to number, just in case it's something like '2'
  }
  return sum
}

/**
 * calculates the mean
 *
 * @param {array} values An array of numbers
 * @param {number} precision Optional precision value
 * @return {number} mean of values
 */

Helpers.prototype.avg = function (values, precision) {
  var invalid = 0,
      cache = 0
  for (var i = 0; i < values.length; i++) {
    if (values[i] === null || isNaN(values[i])) {
      invalid += 1 // keep track of non-number entries
    } else {
      cache += +values[i] // cast to number, just in case it's something like '2'
    }
  }

  return this.round(cache / (values.length - invalid), precision)
}

/**
 * appoximates the standard deviation using the n-1 method
 *
 * @param {array} values An array of numbers
 * @param {number} precision Optional precision value
 * @return {number} rounded standard deviation
 */

Helpers.prototype.stdDev = function (values, precision) {
  var sum = 0,
      invalid = 0,
      val = 0,
      mean = this.avg(values)

  for (var i = 0; i < values.length; i++) {
    val = values[i]
    if (val === null || isNaN(val)) {
      invalid += 1 // keep track of non-number entries
    } else {
      sum += (val - mean) * (val - mean)
    }
  }

  return this.round(Math.sqrt(sum / (values.length - invalid - 1)), precision)
}

/**
 * calculates the "relative tolerance score", a value
 * indicating how much of an allowed tolerance has been exhausted
 *
 * @param {number} value the measured or calculated value
 * @param {number} precision Optional precision value
 * @param {number} tolerance The allowed tolerance for the given value
 * @return {number} rounded result
 */

Helpers.prototype.tolAus = function (value, tolerance, precision) {
  return this.round(Math.abs(value / tolerance), precision)
}

/**
 * does a linear regression on x and y values
 *
 * @param {array} x An array of the x values
 * @param {array} y An array of the y values
 * @return {object} Object containing slope, intercept, linear fn and r2
 */

Helpers.prototype.linReg = function (x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || !x.length || !y.length)
    throw new Error('x or y is not an array or empty.')

  if (y.length !== x.length)
    throw new Error('x and y need to be of the same size!')

  var lr = {},
      n = y.length,
      sum_x = 0,
      sum_y = 0,
      sum_xy = 0,
      sum_xx = 0,
      sum_yy = 0,
      xi = 0,
      yi = 0

  for (var i = 0; i < y.length; i++) {
    xi = x[i]
    yi = y[i]

    // ignore null values
    if (xi === null || yi === null) {
      n--;
      continue;
    }

    sum_x += xi
    sum_y += yi
    sum_xy += (xi * yi)
    sum_xx += (xi * xi)
    sum_yy += (yi * yi)
  }

  lr.slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
  lr.intercept = (sum_y - lr.slope * sum_x) / n

  lr.r2 = Math.pow((n * sum_xy - sum_x * sum_y) / Math.sqrt( (n * sum_xx - sum_x * sum_x) * (n * sum_yy - sum_y * sum_y) ), 2)
  lr.fn = function (x) { return this.slope * x + this.intercept }

  return lr
}