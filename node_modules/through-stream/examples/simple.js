var through = require("..")
    , input = through()
    , output = through(function write(chunk) {
        console.log("chunk", chunk)
    })
    , transform = through(write, read)

input.pipe(transform)
transform.pipe(output)

input.write(1)
input.write(2)
input.write(3)

var to = require("write-stream")
    , from = require("read-stream")
    , intern = through(write)
    , list = []

intern.pipe(to(list, function () {
    console.log("list", list)
}))
from([1,2,3,4]).pipe(intern)

function write(chunk, buffer) {
    buffer.push(chunk * 2)
}

function read(bytes, buffer) {
    return buffer.shift() * 2
}