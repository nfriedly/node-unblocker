var Stream = require("readable-stream")

through.read = defaultRead
through.write = defaultWrite
through.end = defaultEnd

module.exports = through

function through(write, read, end) {
    write = write || defaultWrite
    read = read || defaultRead
    end = end || defaultEnd

    var ended = false
        , stream = new Stream()
        , buffer = []

    stream.readable = stream.writable = true

    stream.write = handleWrite
    stream.read = handleRead
    stream.end = handleEnd

    return stream

    function handleWrite(chunk) {
        var result = write.call(stream, chunk, buffer)
        if (buffer.length === 1) {
            stream.emit("readable")
        }
        return result === false ? false : true
    }

    function handleRead(bytes) {
        var result = read.call(stream, bytes, buffer)
        return result === undefined ? null : result
    }

    function handleEnd(data) {
        if (ended) {
            return
        }
        ended = true
        if (arguments.length) {
            stream.write(data)
        }
        stream.writable = false
        end.call(stream)
        stream.readable = false
    }
}

function defaultWrite(data, buffer) {
    buffer.push(data)
}

function defaultEnd() {
    this.emit('end')
}

function defaultRead(bytes, buffer) {
    return buffer.shift()
}