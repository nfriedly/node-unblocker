var url = require('url')
	,http = require('http')
	,https = require('https')
	,zlib = require('zlib');

var config = require('../config')
	,cookies = require('./cookies')
	,utils = require('./utils')
	,blocklist = require('./blocklist');

var portmap 		= {"http:":80,"https:":443},
	re_abs_url 	= /("|'|=)(http)/ig, // "http, 'http, or =http (no :// so that it matches http & https)
	re_abs_no_proto 	= /("|'|=)(\/\/)/ig, // matches //site.com style urls where the protocol is auto-sensed
	re_rel_root = /((href|src)=['"]{0,1})(\/\w)/ig, // matches src="/asdf/asdf"
	// no need to match href="asdf/adf" relative links - those will work without modification
	
	
	re_css_abs = /(url\(\s*)(http)/ig, // matches url( http
	re_css_rel_root = /(url\(\s*['"]{0,1})(\/\w)/ig, // matches url( /asdf/img.jpg
	
	// partial's dont cause anything to get changed, they just cause the packet to be buffered and rechecked
	re_html_partial = /("|'|=|\(\s*)[ht]{1,3}$/ig, // ', ", or = followed by one to three h's and t's at the end of the line
	re_css_partial = /(url\(\s*)[ht]{1,3}$/ig; // above, but for url( htt

/**
* Makes the outgoing request and relays it to the client, modifying it along the way if necessary
*
* todo: get better at fixing / urls
* todo: fix urls that start with //
*/
module.exports = function (request, response) {


	var uri = url.parse(utils.getRealUrl(request.url));
	// make sure the url in't blocked
	if(!blocklist.urlAllowed(uri)){
	  return utils.redirectTo(request, response, "?error=Please use a different proxy to access this site");
	}

	// redirect urls like /proxy/http://asdf.com to /proxy/http://asdf.com/ to make relative image paths work
	if (uri.pathname == "/" && request.url.substr(-1) != "/") {
		return utils.redirectTo(request, response, request.url + "/");
	}
	
	uri.port = uri.port || portmap[uri.protocol];
	uri.pathname = uri.search ? uri.pathname + uri.search : uri.pathname;
	
	
	headers = copy(request.headers);
	
	delete headers.host;
	
	// todo: grab any new cookies in headers.cookie (set by JS) and store them in the session
	// (assume / path and same domain as request's referer)
	headers.cookie = cookies.getCookies(request, uri);
	
	console.log("sending these cookies: " + headers.cookie);
	
	// overwrite the referer with the correct referer
	if(request.headers.referer){
		headers.referer = utils.getRealUrl(request.headers.referer);
	}
	
	var options = {
		host: uri.host,
		port: uri.port,
		path: uri.pathname,
		method: request.method,
		headers: headers
	}
	
	// what protocol to use for outgoing connections.
	var proto = (uri.protocol == 'https:') ? https : http;
	
	var remote_request = proto.request(options, function(remote_response){
	
		// make a copy of the headers to fiddle with
		var headers = copy(remote_response.headers);
		
		var ct = (headers['content-type'] || "unknown").split(";")[0];
		
		var needs_parsed = ([
			'text/html', 
			'application/xml+xhtml', 
			'application/xhtml+xml',
			'text/css', 
			'text/javascript', 
			'application/javascript',
			'application/x-javascript'
		].indexOf(ct) != -1);
		
		// if we might be modifying the response, nuke any content-length headers
		if(needs_parsed){
			delete headers['content-length'];
		}
		
	
		var needs_decoded = (needs_parsed && headers['content-encoding'] == 'gzip');
		
		// we're going to de-gzip it, so nuke that header
		if(needs_decoded){
			delete headers['content-encoding'];
		}
		
		// fix absolute path redirects 
		// (relative redirects will be 302'd to the correct path, and they're disallowed by the RFC anyways
		// todo: also fix refresh and url headers
		if(headers.location && headers.location.substr(0,4) == 'http'){
			headers.location = utils.thisSite(request) + "/" + headers.location;
			console.log("fixing redirect");
		}
		
		if(headers['set-cookie']){
			cookies.storeCookies(request, uri, headers['set-cookie']);
			delete headers['set-cookie'];
		}
		
		//  fire off out (possibly modified) headers
		response.writeHead(remote_response.statusCode, headers);
		
		//console.log("content-type: " + ct);
		//console.log("needs_parsed: " + needs_parsed);
		//console.log("needs_decoded: " + needs_decoded);
		
		
		// sometimes a chunk will end in data that may need to be modified, but it is impossible to tell
		// in that case, buffer the end and prepend it to the next chunk
		var chunk_remainder;
		
		// todo : account for varying encodings
		function parse(chunk){
			//console.log("data event", request.url, chunk.toString());
			
			// stringily our chunk and grab the previous chunk (if any)
			chunk = chunk.toString();
			
			if(chunk_remainder){
				chunk = chunk_remainder + chunk;
				chunk_remainder = undefined;
			}
			
			// first replace any complete urls
			chunk = chunk.replace(re_abs_url, "$1" + utils.thisSite(request) + "/$2");
			chunk = chunk.replace(re_abs_no_proto, "$1" + utils.thisSite(request) + "/" + uri.protocol + "$2");
			// next replace urls that are relative to the root of the domain
			chunk = chunk.replace(re_rel_root, "$1" + utils.thisSite(request) + "/" + uri.protocol + "//" + uri.hostname + "$3");
			
			// if we're in a stylesheet, run a couple of extra regexs to avoid 302's
			if(ct == 'text/css'){
				console.log('running css rules');
				chunk = chunk.replace(re_css_abs, "$1" + utils.thisSite(request) + "/$2");
				chunk = chunk.replace(re_css_rel_root, "$1" + utils.thisSite(request) + "/" + uri.protocol + "//" + uri.hostname + "$2");			
			}
			
			// second, check if any urls are partially present in the end of the chunk,
			// and buffer the end of the chunk if so; otherwise pass it along
			if(chunk.match(re_html_partial)){
				chunk_remainder = chunk.substr(-4); // 4 characters is enough for "http, the longest string we should need to buffer
				chunk = chunk.substr(0, chunk.length -4);
			}
			
			chunk = chunk.replace('</head>', '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW">\r\n</head>');
			
			chunk = utils.add_ga(chunk);
			
			response.write(chunk);
		}
		
		
		// if we're dealing with gzipped input, set up a stream decompressor to handle output
		if(needs_decoded) {
			remote_response = remote_response.pipe(zlib.createUnzip());
		}

		// set up a listener for when we get data from the remote server - parse/decode as necessary
		remote_response.addListener('data', function(chunk){
			if(needs_parsed) {
				parse(chunk);		
			} else {
				response.write(chunk);
			}
		});

		// clean up the connection and send out any orphaned chunk
		remote_response.addListener('end', function() {
			// if we buffered a bit of text but we're now at the end of the data, then apparently
			// it wasn't a url - send it along
			if(chunk_remainder){
				response.write(chunk_remainder);
				chunk_remainder = undefined;
			}
			response.end();
		});
		
	});
	
	remote_request.addListener('error', function(err){
		utils.redirectTo(request, response, "?error=" + err.toString());
	});
	
	// pass along POST data
	request.addListener('data', function(chunk){
		remote_request.write(chunk);
	});
	
	// let the remote server know when we're done sending data
	request.addListener('end', function(){
		remote_request.end();
	});
}

/**
* returns a shallow copy of an object
*/
function copy(source){
	var n = {};
	for(var key in source){
		if(source.hasOwnProperty(key)){
			n[key] = source[key];
		}
	}
	return n;
}