"use strict";

var PassThrough = require("stream").PassThrough;
var zlib = require("zlib");
var contentTypes = require("./content-types.js");
var debug = require("debug")("unblocker:decompress");

const SUPPORTED_ENCODINGS = [
  'deflate',
  'gzip',
  'br' // brotli
];

const REQUESTED_ENCODINGS = [
  // deflate is tricky, so we don't request it
  'gzip',
  'br'
]

module.exports = function (config) {
  function acceptableCompression(data) {
    var encodings = (data.headers["accept-encoding"] || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => REQUESTED_ENCODINGS.includes(s));
    if (encodings.length) {
      data.headers["accept-encoding"] = encodings.join(', ');
    } else {
      delete data.headers["accept-encoding"];
    }
  }

  function shouldProcess(data) {
    // no body to process on 204 No Content or 304 Not Modified
    if ([204, 304].includes(data.remoteResponse.statusCode)) {
      return false;
    }

    var headers = data.headers;

    // skip requests that declair a 0-length body
    if (parseInt(headers["content-length"], 10) === 0) {
      return false;
    }

    // decompress if it's in a supported encoding
    return SUPPORTED_ENCODINGS.includes(headers["content-encoding"]);
  }

  function decompressResponse(data) {
    if (contentTypes.shouldProcess(config, data) && shouldProcess(data)) {
      debug(
        "decompressing %s encoding and deleting content-encoding header",
        data.headers["content-encoding"]
      );

      // https://github.com/nfriedly/node-unblocker/pull/105
      // zlib streams can throw if given a source with no content
      // we try to avoid processing those, but it could happen.
      // because of that, we're using a pass through stream as a placeholder.
      // we won't create the zlib stream until we know we have data to process.
      var sourceStream = data.stream;
      var placeHolder = new PassThrough();
      data.stream = placeHolder;

      const encoding = data.headers["content-encoding"];

      // we're decoding it here, so this won't by the time it gets to the client
      delete data.headers["content-encoding"];

      var handleData = function handleData() {
        var firstChunk = sourceStream.read();

        // 'readable' is also called when a stream ends with no data
        // this is how you tell when that's the case:
        if (firstChunk === null) {
          placeHolder.end();
          return;
        }

        var decompressStream;
        if (encoding == "deflate") {
          // https://github.com/nfriedly/node-unblocker/issues/12
          // inflateRaw seems to work here wheras inflate and unzip do not.
          // todo: validate this against other sites - if some require raw and others require non-raw, then maybe just rewrite the accept-encoding header to gzip only
          decompressStream = zlib.createInflateRaw();
        } else if (encoding == 'br') {
          decompressStream = zlib.createBrotliDecompress();
        } else {
          decompressStream = zlib.createUnzip();
        }

        decompressStream.write(firstChunk);

        // continue piping through the placeholder since the next stream in the chain is listening to it, not our new decompressStream
        sourceStream.pipe(decompressStream).pipe(placeHolder);
      };

      // if we do get data, create a decompression stream and pipe through it
      sourceStream.once("readable", handleData);

    }
  }

  return {
    handleRequest: acceptableCompression,
    handleResponse: decompressResponse,
  };
};
