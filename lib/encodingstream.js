"use strict";
var Transform = require("stream").Transform;
var PassThrough = require('stream').PassThrough;
var iconv = require('iconv-lite');
var contentType = require('content-type');


// content-types that might possibly have the charset in a meta tag
function mayContainMeta(type) {
    var types = [
        'text/html',
        'application/xml+xhtml',
        'application/xhtml+xml'
    ];

    return types.indexOf(type) != -1;
}


function getEncodingPair(charset) {
    return {
        decode: iconv.decodeStream(charset),
        recode: iconv.encodeStream(charset)
    };
}

// still needs to stringify the binary chunks for other streams down the chain
function getStringifyPair() {
    return {
        decode: new PassThrough({encoding: 'utf8'}),
        recode: new PassThrough()
    };
}

function getDelayedPair() {
    // in this case, we need to inspect the beginning of the content to find a charset tag.
    // first, we buffer the content until we find a charset tag (or the end of the </head> section
    // after finding the charset or determining that there isn't one, we then create the proper decoder/recoder and start streaming data through

    var decode = new HTMLDecodeStream();
    var recode = new HTMLRecodeStream();

    // connect the two so that end clients receive content in the same charset that our server received it
    decode.on('charset', function(charset) {
        console.log('charset', charset);
        // note: while the recode stream will accept content before this and just output utf-8, it shouldn't actually receive any data because the decode stream buffers until *after* this event
        recode.startStreaming(charset);
    });

    return {
        decode: decode,
        recode: recode
    };
}


function createStreams(content_type_header) {
    var ct;
    try {
        ct = contentType.parse(content_type_header);
    } catch (unknownContentType) {
        ct = {type: '', parameters: {}};
    }
    var charset = ct.parameters.charset;

    if (iconv.encodingExists(charset) ) {
        // happy case, we know the encoding right away, so we can just return decode/recode streams
        return getEncodingPair(charset);
    } else if (mayContainMeta(ct.type)){
        // there might be a charset lurking in the <head>... better buffer things just to be safe
        return getDelayedPair();
    } else {
        // semi-happy case. we know the content needs parsed but have no way of knowing it's charset. Hopefully .toString() will be good enough. No recoding
        return getStringifyPair();
    }
}





module.exports.createStreams = createStreams;


// based on https://github.com/ashtuchkin/iconv-lite/blob/master/lib/streams.js

// == Encoder stream =======================================================
function HTMLRecodeStream(options) {
    this.startStreaming('utf8'); // gotta default to something...
    options = options || {};
    options.decodeStrings = false; // We accept only strings, so we don't need to decode them.
    Transform.call(this, options);
}

HTMLRecodeStream.prototype = Object.create(Transform.prototype, {
    constructor: { value: HTMLRecodeStream }
});

HTMLRecodeStream.prototype.startStreaming = function(charset) {
    if (iconv.encodingExists(charset) ) {
        if (this.conv) {
            // this shouldn't matter, but it won't hurt either
            var ref = this.conv.end();
            if (ref) {
                this.push(ref);
            }
        }
        this.conv = iconv.getEncoder(charset);
    }
};

HTMLRecodeStream.prototype._transform = function(chunk, encoding, done) {
    if (typeof chunk != 'string')
        return done(new Error("Iconv encoding stream needs strings as its input."));
    try {
        var res = this.conv.write(chunk);
        if (res && res.length) this.push(res);
        done();
    }
    catch (e) {
        done(e);
    }
};

HTMLRecodeStream.prototype._flush = function(done) {
    try {
        var res = this.conv.end();
        if (res && res.length) this.push(res);
        done();
    }
    catch (e) {
        done(e);
    }
};


// == Decoder stream =======================================================
function HTMLDecodeStream(options) {
    this.buff = new Buffer([]);
    this.isBuffering = true;
    this.conv = null;
    options = options || {};
    this.inputEncoding = 'utf8';
    this.encoding = options.encoding = 'utf8'; // this is the *output* encoding
    this.conv = iconv.getEncoder(this.inputEncoding);
    Transform.call(this, options);
}

HTMLDecodeStream.prototype = Object.create(Transform.prototype, {
    constructor: { value: HTMLDecodeStream }
});

HTMLDecodeStream.prototype._transform = function(chunk, encoding, done) {
    if (!Buffer.isBuffer(chunk))
        return done(new Error("delayed decoding stream needs buffers as its input."));

    if (this.isBuffering) {
        this.bufferAndTest(chunk, encoding, done);
    } else {
        this.stream(chunk,encoding,done);
    }
};

HTMLDecodeStream.prototype.stream = function(chunk, encoding, done) {
    try {
        var res = this.conv.write(chunk);
        if (res && res.length) this.push(res, this.encoding);
        done();
    }
    catch (e) {
        done(e);
    }
};

HTMLDecodeStream.prototype.bufferAndTest = function(chunk, encoding, done) {
    console.log(chunk.toString());
    this.buff = Buffer.concat([this.buff, chunk]);
    var str = this.buff.toString();
    var charsetMatch = str.match(/<meta [^>]*charset=['"]?([^ '">]+)/) || str.match(/<\?xml[^>]+encoding="([^">]+)"/); // extract the charset from a meta tag or the opening <?xml tag
    var endOfHead = str.match(/<\/head>/);
    if (charsetMatch) {
        this.startStreaming(charsetMatch[1], encoding, done);
    } else if (endOfHead) {
        // go with the safest guess for the charset
        this.startStreaming('utf8', encoding, done);
    }
};

HTMLDecodeStream.prototype.startStreaming = function(charset, encoding, done) {
    // setup the decoder
    if (iconv.encodingExists(charset) ) {
        this.inputEncoding = charset;
        this.conv = iconv.getDecoder(this.inputEncoding);
    } else {
        console.error("unrecognized charset %s, decoding as utf8", this.inputEncoding);
    }
    this.emit('charset', this.inputEncoding);
    this.isBuffering = false;
    // decode and forward our existing buffer
    this.stream(this.buff, encoding, done);
    // cleanup to ensure _flush doesn't accidentally send data twice
    this.buff = null;
};

HTMLDecodeStream.prototype._flush = function(done) {
    var res;
    try {
        if (this.buff) {
            res = this.conv.write(this.buff);
            if (res && res.length) this.push(res, this.encoding);
            this.buff = null;
        }
        res = this.conv.end();
        if (res && res.length) this.push(res, this.encoding);
        done();
    }
    catch (e) {
        done(e);
    }
};
