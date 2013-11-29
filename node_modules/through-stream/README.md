# through-stream

Base stream class for through RW stream

## Example

```
// The buffer is shared among the stream and is an array
var through = require("through-stream")
    , stream = through(function write(chunk, buffer) {
        buffer.push(chunk)
        // Handle writing the chunk
    }, function read(bytes, buffer) {
        // Handle reading the bytes
        return buffer.shift()
    }, function end() {
        // Stream has ended
    })

// Do stuff with stream
```

The write / read / end functions are optional and default to 

```
function write(data, buffer) {
    buffer.push(data)
}

function read(bytes, buffer) {
    return buffer.shift()
}

function end() {
    this.emit('end')
}
```

If you would like to overwrite just the `end` logic then do

```
through(through.write, through.read, function customEnd() {
    ...
})
```

## Installation

`npm install through-stream`

## Contributors

 - Raynos

## MIT Licenced