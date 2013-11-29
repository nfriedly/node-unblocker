var through = require('through-stream'),
    _ = require('underscore');

var defaultConfig = {
    prefix: '',
    uri: {}
};

module.exports.setDefaults = function(config) {
    defaultConfig = _.defaults(config, defaultConfig);
}

var re_abs_url      = /("|'|=)(http:(\/\/|\\\/\\\/)|https:(\/\/|\\\/\\\/))/ig, // "http, 'http, or =http
	re_rel_proto = /("|'|=)(\/\/\w)/ig, // matches //site.com style urls where the protocol is auto-sensed
	re_rel_root     = /((href|src|action)=['"]{0,1})(\/\w)/ig, // matches src="/asdf/asdf"
	// no need to match href="asdf/adf" relative links - those will work without modification
	
	// note: we con't check for urls in quotes here because the previous check will have already handled them
	re_css_abs     = /(url\(\s*)(http:(\/\/|\\\/\\\/)|https:(\/\/|\\\/\\\/))/ig, // matches url( http
	re_css_rel_proto   = /(url\(\s*)(\/\/\w)/ig,
	re_css_rel_root   = /(url\(\s*['"]{0,1})(\/\w)/ig, // matches url( /asdf/img.jpg
	
	// partial's dont cause anything to get changed, they just cause the packet to be buffered and rechecked
	re_html_partial   = /("|'|=|\(\s*)[ht]{1,3}$/ig, // ', ", or = followed by one to three h's and t's at the end of the line
	re_css_partial     = /(url\(\s*['"]{0,1})[ht]{1,3}$/ig; // above, but for url( htt

function rewriteUrls(chunk, uri, thisSite) {
    // some special rules for CSS
    chunk = chunk.replace(re_css_rel_proto, "$1" + uri.protocol + "$2");
    chunk = chunk.replace(re_css_rel_root, "$1" + uri.protocol + "//" + uri.host + "$2");
    chunk = chunk.replace(re_css_abs, "$1" + thisSite + "$2");
    
    // first upgrade // links to regular http/https links because otherwise they look like root-relative (/whatever.html) links
    chunk = chunk.replace(re_rel_proto, "$1" + uri.protocol + "$2");
    // next replace urls that are relative to the root of the domain (/whatever.html) because this is how proxied urls look
    chunk = chunk.replace(re_rel_root, "$1" + uri.protocol + "//" + uri.host + "$3");
    // last replace any complete urls
    chunk = chunk.replace(re_abs_url, "$1" + thisSite + "$2");
    
    
    return chunk;
}

function createStream(config) {
    _.defaults(config, defaultConfig);

    // sometimes a chunk will end in data that may need to be modified, but it is impossible to tell
    // in that case, buffer the end and prepend it to the next chunk
    var chunk_remainder;

    function write(chunk, buffer) {
        if(chunk_remainder){
            chunk = chunk_remainder + chunk;
            chunk_remainder = undefined;
        }
    
        chunk = rewriteUrls(chunk, config.uri, config.prefix);
        
        // second, check if any urls are partially present in the end of the chunk,
        // and buffer the end of the chunk if so; otherwise pass it along
        if(chunk.match(re_html_partial)){
            chunk_remainder = chunk.substr(-4); // 4 characters is enough for "http, the longest string we should need to buffer
            chunk = chunk.substr(0, chunk.length -4);
        }
        
        buffer.push(chunk);
    }

    function end() {
        // if we buffered a bit of text but we're now at the end of the data, then apparently
        // it wasn't a url - send it along
        if(chunk_remainder){
            response.write(chunk_remainder);
            chunk_remainder = undefined;
        }
        this.emit('end')
    }

    return through(write, through.read, end);
}

module.exports.rewriteUrls = rewriteUrls;
module.exports.createStream = createStream;
			