math-helpers
===
Tiny statistics helper lib. Robust and fast.

## Installation

```
npm install math-helpers
```

## Usage

```javascript
var math = require('math-helpers')(/* optional options */)

var avg = math.avg([1, 2, 3])

```


### Options

You can pass some options to the module.

```javascript
{
  precision: 3 // results will be rounded to this number of decimals
}
```