/***************
* node-unblocker: Web Proxy for evading firewalls and content filters, 
* similar to CGIProxy or PHProxy
*
*
* This project is hosted on github:  https://github.com/nfriedly/node-unblocker
*
* By Nathan Friedly - http://nfriedly.com 
* Released under the terms of the GPL v3
*/

/*
todo:
 - stress test (apache bench?)
 - add error handeling
 - look into npm
 - mini-form, no cookies,  and no script options
 - figure out why the google png has extra data at the beginning and end
 - clean things up a bit
 - turn simple-session into a standalone library
*/

// native imports
var http = require('http'),
	https = require('https'),
	url = require('url'),
	querystring = require('querystring'),
	path = require("path"),
	fs = require("fs"),
	zlib = require('zlib'),
	cluster = require('cluster'),
	Iconv = require('iconv').Iconv,
	numCPUs = require('os').cpus().length;


// local dependencies
var blocklist = require('./blocklist');
  
// the configuration file
var config = require('./config');

// third-party dependencies
var connect = require('connect'), // todo: call by version once 2.x is listed in npm
	RedisStore = require('connect-redis')(connect),
	redis;
// the redis client differs depending on if you're using redistogo (heroku) or not
if(config.redistogo_url) {
	redis = require('redis-url').connect(config.redistogo_url);
} else {
	redis = require('redis').createClient(config.redis_port, config.redis_host, config.redis_options);
}

	

var server = connect()
	.use(connect.cookieParser(config.secret))
  	.use(connect.session({
  		store: new RedisStore({client: redis}),
  		cookie: { path: '/', httpOnly: false, maxAge: null }
  	}))
	.use(function(request, response){
	var url_data = url.parse(request.url);
	
	console.log("(" + process.pid + ") New Request: ", request.url);
	
	
    incrementRequests();
	request.on('end', decrementRequests);
	
	// if the user requested the "home" page
	// (located at /proxy so that we can more easily tell the difference 
	// between a user who is looking for the home page and a "/" link)
	if(url_data.pathname == "/proxy"){
		request.url = "/index.html"; 
		// todo: refactor this to make more sense
		return sendIndex(request, response);
	}
	
	// this is for users who's form actually submitted due to JS being disabled
	if(url_data.pathname == "/proxy/no-js"){
		// grab the "url" parameter from the querystring
		var site = querystring.parse( url.parse(request.url).query ).url;
		// and redirect the user to /proxy/url
		redirectTo(request, response, site || "");
	}
	
	// only requests that start with this get proxied - the rest get 
	// redirected to either a url that matches this or the home page
	if(url_data.pathname.indexOf("/proxy/http") == 0){
		return proxy(request, response);
	}
	
	// the status page
	if(url_data.pathname == "/proxy/status"){
		return status(request, response);
	}
	
	// disallow almost everything via robots.txt
	if(url_data.pathname == "robots.txt"){
		response.writeHead("200", {"Content-Type": "text/plain"});
		response.write("User-agent: *\n" + 
			"Disallow: /proxy/http\n" +
			"Disallow: /proxy/http:\n" + 
			"Disallow: /proxy/http:/\n\n" + 
			"Disallow: /proxy/https\n" +
			"Disallow: /proxy/https:\n" + 
			"Disallow: /proxy/https:/\n\n"
		);
		response.end(); 
	}
	
	// any other url gets redirected to the correct proxied url if we can
	// determine it based on their referrer, or the home page otherwise
	return handleUnknown(request, response);

}); // we'll start the server at the bottom of the file


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

// charset aliases which charset supported by native node.js
var charset_aliases = {
	'ascii':           'ascii',
	'us':              'ascii',
	'us-ascii':        'ascii',
	'utf8':            'utf8',
	'utf-8':           'utf8',
	'ucs-2':           'ucs2',
	'ucs2':            'ucs2',
	'csunicode':       'ucs2',
	'iso-10646-ucs-2': 'ucs2'
};

// charset aliases which iconv doesn't support
// this is popular jp-charset only, I think there are more...
var charset_aliases_iconv = {
	'windows-31j':  'cp932',
	'cswindows31j': 'cp932',
	'ms932':        'cp932'
};

/**
* Makes the outgoing request and relays it to the client, modifying it along the way if necessary
*
* todo: get better at fixing / urls
* todo: fix urls that start with //
*/
function proxy(request, response) {


	var uri = url.parse(getRealUrl(request.url));
	// make sure the url in't blocked
	if(!blocklist.urlAllowed(uri)){
      return redirectTo(request, response, "?error=Please use a different proxy to access this site");
    }

	// redirect urls like /proxy/http://asdf.com to /proxy/http://asdf.com/ to make relative image paths work
	if (uri.pathname == "/" && request.url.substr(-1) != "/") {
		return redirectTo(request, response, request.url + "/");
	}
	
	uri.port = uri.port || portmap[uri.protocol];
	uri.pathname = uri.search ? uri.pathname + uri.search : uri.pathname;
	
	
	headers = copy(request.headers);
	
	delete headers.host;
	
	// todo: grab any new cookies in headers.cookie (set by JS) and store them in the session
	// (assume / path and same domain as request's referer)
	headers.cookie = getCookies(request, uri);
	
	console.log("sending these cookies: " + headers.cookie);
	
	// overwrite the referer with the correct referer
	if(request.headers.referer){
		headers.referer = getRealUrl(request.headers.referer);
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
		
		var content_type = headers['content-type'] || "unknown",
			ct = content_type.split(";")[0];
		
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
		
		// detect charset from content-type headers
		var charset = content_type.match(/\bcharset=([\w\-]+)\b/i);
		charset = charset ? normalizeIconvCharset(charset[1].toLowerCase()) : undefined;

		var needs_decoded = (needs_parsed && headers['content-encoding'] == 'gzip');
		
		// we're going to de-gzip it, so nuke that header
		if(needs_decoded){
			delete headers['content-encoding'];
		}
		
		// fix absolute path redirects 
		// (relative redirects will be 302'd to the correct path, and they're disallowed by the RFC anyways
		// todo: also fix refresh and url headers
		if(headers.location && headers.location.substr(0,4) == 'http'){
			headers.location = thisSite(request) + "/" + headers.location;
			console.log("fixing redirect");
		}
		
		if(headers['set-cookie']){
			storeCookies(request, uri, headers['set-cookie']);
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
		
		// if charset is utf8, chunk may be cut in the middle of 3byte character,
		// we need to buffer the cut data and prepend it to the next chunk
		var chunk_remainder_bin;
		
		// todo : account for varying encodings
		function parse(chunk){
			//console.log("data event", request.url, chunk.toString());
			
			if( chunk_remainder_bin ){
				var buf = new Buffer(chunk_remainder_bin.length + chunk.length);
				chunk_remainder_bin.copy(buf);
				chunk.copy(buf, chunk_remainder_bin.length);
				chunk_remainder_bin = undefined;
				chunk = buf;
			}
			if( charset_aliases[charset] === 'utf8' ){
				var cut_size = utf8_cutDataSizeOfTail(chunk);
				//console.log('cut_size = ' + cut_size);
				if( cut_size > 0 ){
					chunk_remainder_bin = new Buffer(cut_size);
					chunk.copy(chunk_remainder_bin, 0, chunk.length - cut_size);
					chunk = chunk.slice(0, chunk.length - cut_size);
				}
			}
			
			// stringily our chunk and grab the previous chunk (if any)
			chunk = decodeChunk(chunk);
			
			if(chunk_remainder){
				chunk = chunk_remainder + chunk;
				chunk_remainder = undefined;
			}
			
			// first replace any complete urls
			chunk = chunk.replace(re_abs_url, "$1" + thisSite(request) + "/$2");
			chunk = chunk.replace(re_abs_no_proto, "$1" + thisSite(request) + "/" + uri.protocol + "$2");
			// next replace urls that are relative to the root of the domain
			chunk = chunk.replace(re_rel_root, "$1" + thisSite(request) + "/" + uri.protocol + "//" + uri.hostname + "$3");
			
			// if we're in a stylesheet, run a couple of extra regexs to avoid 302's
			if(ct == 'text/css'){
				console.log('running css rules');
				chunk = chunk.replace(re_css_abs, "$1" + thisSite(request) + "/$2");
				chunk = chunk.replace(re_css_rel_root, "$1" + thisSite(request) + "/" + uri.protocol + "//" + uri.hostname + "$2");			
			}
			
			// second, check if any urls are partially present in the end of the chunk,
			// and buffer the end of the chunk if so; otherwise pass it along
			if(chunk.match(re_html_partial)){
				chunk_remainder = chunk.substr(-4); // 4 characters is enough for "http, the longest string we should need to buffer
				chunk = chunk.substr(0, chunk.length -4);
			}
			
			chunk = chunk.replace('</head>', '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW">\r\n</head>');
			
			chunk = add_ga(chunk);
			
			response.write(encodeChunk(chunk));
		}

		// Iconv instance for decode and encode
		var decodeIconv, encodeIconv;

		// decode chunk binary to string using charset
		function decodeChunk(chunk){
			// if charset is undefined, detect from meta headers
			if( !charset ){
				var re = chunk.toString().match(/<meta\b[^>]*charset=([\w\-]+)/i);
				// if we can't detect charset, use utf-8 as default
				// CAUTION: this will become a bug if charset meta headers are not contained in the first chunk, but probability is low
				charset = re ? normalizeIconvCharset(re[1].toLowerCase()) : 'utf-8';
			}
			//console.log("charset: " + charset);

			if( charset in charset_aliases ){
				return chunk.toString(charset_aliases[charset]);
			} else {
				if( !decodeIconv ) decodeIconv = new Iconv(charset, 'UTF-8//TRANSLIT//IGNORE');
				return decodeIconv.convert(chunk).toString();
			}
		}

		// normalize charset which iconv doesn't support
		function normalizeIconvCharset(charset){
			return charset in charset_aliases_iconv ? charset_aliases_iconv[charset] : charset;
		}

		// encode chunk string to binary using charset
		function encodeChunk(chunk){
			if( charset in charset_aliases ){
				return new Buffer(chunk, charset_aliases[charset]);
			} else {
				if( !encodeIconv ) encodeIconv = new Iconv('UTF-8', charset + '//TRANSLIT//IGNORE');
				return encodeIconv.convert(chunk);
			}
		}

		// check tail of the utf8 binary and return the size of cut data
		// if the data is invalid, return 0
		function utf8_cutDataSizeOfTail(bin){
			var len = bin.length;
			if( len < 4 ) return 0; // don't think about the data of less than 4byte

			// count bytes from tail to last character boundary
			var skipped = 0;
			for( var i=len; i>len-4; i-- ){
				var b = bin[i-1];
				if( (b & 0x7f) === b ){ // 0xxxxxxx (1byte character boundary)
					if( i === len ){
						return 0;
					} else {
						break; // invalid data
					}
				} else if( (b & 0xbf) === b ){ //10xxxxxx (is not a character boundary)
					skipped++;
				} else if( (b & 0xdf) === b ){ //110xxxxx (2byte character boundary)
					if( skipped === 0 ){
						return 1;
					} else if( skipped === 1 ){
						return 0;
					} else {
						break; // invalid data
					}
				} else if( (b & 0xef) === b ){ //1110xxxx (3byte character boundary)
					if( skipped <= 1 ){
						return 1 + skipped;
					} else if( skipped === 2 ){
						return 0;
					} else {
						break; // invalid data
					}
				} else if( (b & 0xf7) === b ){ //11110xxx (4byte character boundary)
					if( skipped <= 2 ){
						return 1 + skipped;
					} else if( skipped === 3 ) {
						return 0;
					} else {
						break; // invalid data
					}
				}
			}
			// invalid data, return 0
			return 0;
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
		redirectTo(request, response, "?error=" + err.toString());
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
* Checks the user's session and the requesting host and adds any cookies that the requesting 
* host has previously set.
*
* Honors domain, path, and expires directives. 
*
* Does not currently honor http / https only directives.
*/
function getCookies(request, uri){
  if( uri.hostname ) {
    var hostname_parts = uri.hostname.split(".");
  }
	var cookies = "",
		i = (hostname_parts[hostname_parts.length-2] == "co") ? 3 : 2, // ignore domains like co.uk
		cur_domain,
		path_parts = uri.pathname.split("/"),	
		cookies = {}, // key-value store of cookies.
		output = [], // array of cookie strings to be joined later
		session = request.session;
		
	// We start at the least specific domain/path and loop towards most specific so that a more 
	// overwrite specific cookie will a less specific one of the same name.
	// forst we loop through all possible sub domains that start with a dot,
	// then the current domain preceded by a dot
	for(; i<= hostname_parts.length; i++){
		cur_domain = "." + hostname_parts.slice(-1*i).join('.'); // first .site.com, then .www.site.com, etc.
		readCookiesForDomain(cur_domain);
	}
	
	// now, finally, we check for cookies that were set on the exact current domain without the dot
	readCookiesForDomain(uri.hostname);
	
	function readCookiesForDomain(cur_domain){
		
		if(!session[cur_domain]) return;
		
		var j, cur_path;
		
		for(j=1; j < path_parts.length; j++){
		
			cur_path = path_parts.slice(0,j).join("/");
			if(cur_path == "") cur_path = "/";
			
			if(session[cur_domain][cur_path]){
				for(var cookie_name in session[cur_domain][cur_path]){
					
					// check the expiration date - delete old cookies
					if(isExpired(session[cur_domain][cur_path][cookie_name])){
						delete session[cur_domain][cur_path][cookie.name];
					} else {
						cookies[cookie_name] = session[cur_domain][cur_path][cookie_name].value;
					}
				}
			}
		}
	}
	
	// convert cookies from key/value pairs to single strings for each cookie
	for(var name in cookies){
		output.push(name + "=" + cookies[name]);
	};
	
	// join the cookie strings and return the final output
	return output.join("; ");
}

/**
* Parses the set-cookie header from the remote server and stores the cookies in the user's session
*/
function storeCookies(request, uri, cookies){
	console.log('storing these cookies: ', cookies);

	if(!cookies) return;
	
	var parts, name_part, thisCookie, domain;
	
	cookies.forEach(function(cookie){
		domain = uri.hostname;
		parts = cookie.split(';');
		name_part = parts.shift().split("=");
		thisCookie = {
			name: name_part.shift(), // grab everything before the first =
			value: name_part.join("=") // everything after the first =, joined by a "=" if there was more than one part
		}
		parts.forEach(function(part){
			part = part.split("=");
			thisCookie[part.shift().trimLeft()] = part.join("=");
		});
		if(!thisCookie.path){
			thisCookie.path = uri.pathname;
		}
		// todo: enforce domain restrictions here so that servers can't set cookies for ".com"
		domain = thisCookie.domain || domain;
		
		request.session[domain] = request.session[domain] || {};
		
		// store it in the session object - make sure the namespace exists first
		request.session[domain][thisCookie.path] = request.session[domain][thisCookie.path] || {};
		request.session[domain][thisCookie.path][thisCookie.name] = thisCookie;

		// now that the cookie is set (deleting any older cookie of the same name), 
		// check the expiration date and delete it if it is outdated
		if(isExpired(thisCookie)){
			console.log('deleting cookie', thisCookie.expires);
			delete request.session[domain][thisCookie.path][thisCookie.name];
		}

	});
}

/**
* Accepts a cookie object and returns true if it is expired
* (technically all cookies expire at the end of the session because we don't persist them on
*  the client side, but some cookies need to expire sooner than that.)
*/
function isExpired(cookie){
	if(cookie.expires){
		var now = new Date(),
			expires = new Date(cookie.expires);
		return (now.getTime() >= expires.getTime());
	}
	return false; // no date set, therefore it expires at the end of the session 
}

/**
* This is what makes this server magic: if we get an unrecognized request that wasn't corrected by
* proxy's filter, this checks the referrer to determine what the path should be, and then issues a
* 302 redirect to a proxied url at that path
*
* todo: handle querystring and post data
*/
function handleUnknown(request, response){

	if(request.url.indexOf('/proxy/') == 0){
		// no trailing slashes
		if(request.url == "/proxy/"){
			return redirectTo(request, response, "");
		}
		
		// we already know it doesn't start with http, so lets fix that first
		return redirectTo(request, response, 
			"/http://" + request.url.substr(7) // "/proxy/".length = 7
		);
	}
	
	// if there is no referer, then either they just got here or we can't help them
	if(!request.headers.referer){
		return redirectTo(request, response, ""); // "" because we don't want a trailing slash
	}
	
	var ref = url.parse(request.headers.referer);
	
	// if we couldn't parse the referrer or they came from another site, they send them to the home page
	if(!ref || ref.host != thisHost(request)){
		return redirectTo(request, response, ""); // "" because we don't want a trailing slash
	}
	
	// now we know where they came from, so we can do something for them
	if(ref.pathname.indexOf('/proxy/http') == 0){
		var real_url = url.parse(getRealUrl(ref.pathname));
		
		// now, take the requested pat on the previous known host and send the user on their way
		return redirectTo(request, response, real_url.protocol +"//"+ real_url.host + request.url);
	}
	
	// else they were refered by something on this site that wasn't the home page and didn't come 
	// through the proxy - aka this shouldn't happen
	redirectTo(request, response, "");
}

/**
* Takes a /proxy/http://site.com url from a request or a referer and returns the http://site.com/ part
*/
function getRealUrl(path){
	var uri = url.parse(path),
		real_url = uri.pathname.substr(7); // "/proxy/" is 7 characters long.
	// we also need to include any querystring data in the real_url
	return uri.search ? real_url + uri.search : real_url;
}

// returns the configured host if one exists, otherwise the host that the current request came in on
function thisHost(request){
	return (config.host) ? config.host : request.headers.host;
}

// returns the http://site.com/proxy
function thisSite(request){
	return 'http://' + thisHost(request) + '/proxy';
}

function redirectTo(request, response, site){
	site = site || "";
	if(site.length && site.substr(0,1) != "/" && site.substr(0,1) != "?"){
		site = "/" + site;
	}
	if(site.substr(0, 6) == "/proxy") { // no /proxy/proxy redirects
		site = site.substr(6);
	}
	if(site == "/") site = ""; // no endless redirect loops
	try {
		response.writeHead('302', {'Location': thisSite(request) + site});
		console.log("recirecting to " + thisSite(request) + site);
	} catch(ex) {
		// the headers were already sent - we can't redirect them
		console.error("Failed to send redirect", ex);
	}
	response.end();
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

var ga = "";
function add_ga(html) {
	if(config.google_analytics_id) {
		ga = ga || [
		  "<script type=\"text/javascript\">"
		  ,"var _gaq = []; // overwrite the existing one, if any"
		  ,"_gaq.push(['_setAccount', '" + config.google_analytics_id + "']);"
		  ,"_gaq.push(['_trackPageview']);"
		  ,"(function() {"
		  ,"  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;"
		  ,"  ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';"
		  ,"  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);"
		  ,"})();"
		  ,"</script>"
		].join("\n");

		html = html.replace("</body>", ga + "\n\n</body>");	
	}
	return html;
}


/**
 * placeholder for compressed & uncompressed versions of index.html
 */
var index = {};

/**
 * Reads the index.html file into memory and compresses it so that it can be more quickly served
 */
function setupIndex(){
	var raw_index = fs.readFileSync(path.join(__dirname,'index.html')).toString();
	var package_info = JSON.parse(fs.readFileSync(path.join(__dirname,'package.json')));
	raw_index = raw_index.replace('{version}', package_info.version)
	raw_index = add_ga(raw_index);
	index.raw = raw_index;
	zlib.deflate(raw_index, function(data){index.deflate = data;});
	zlib.gzip(raw_index,  function(data){index.gzip = data;})
}

/**
 * Sends out the index.html, using compression if the client supports it
 */
function sendIndex(request, response, google_analytics_id){
	var headers = {"content-type": "text/html"};
	
	var acceptEncoding = request.headers['accept-encoding'];
	if (!acceptEncoding) {
		acceptEncoding = '';
	}
	
	var data;
	
	// check that the compressed version exists in case we get a request 
	// that comes in before the compression finishes (serve those raw)
	if (acceptEncoding.match(/\bdeflate\b/) && index.deflate) {
		headers['content-encoding'] = 'deflate';
		data = index.deflate
	} else if (acceptEncoding.match(/\bgzip\b/) && index.gzip) {
		headers['content-encoding'] = 'gzip';
		data = index.gzip;
	} else {
		data = index.raw;
	}

	response.writeHead(200, headers);
	response.end(data);
}



function incrementRequests(){
	process.send({type: "request.start"});
}

function decrementRequests(){
	process.send({type: "request.end"});
}

var waitingStatusResponses = [];

// simple way to get the curent status of the server
function status(request, response){
	console.log("status request recieved on pid " + process.pid);
	response.writeHead("200", {"Content-Type": "text/plain", "Expires": 0});
	
	// only send out a new status request if we don't already have one in the pipe
	if(waitingStatusResponses.length == 0) {
		console.log("sending status request message");
		process.send({type: "status.request", from: process.pid});
	}
	
	// 1 second timeout in case the master doesn't respond quickly enough
	response.timeout = setTimeout(function(){
		console.log("Error: status responses timeout reached");
		sendStatus({error: "No response from the cluster master after 1 second"});
	}, 1000);
	
	waitingStatusResponses.push(response);
}

function sendStatus(status){
	var big_break	= "====================";
	var small_break	= "--------------------";
	var lines = [
		"Server Status",
		big_break,
		(new Date()).toString(),
		"",
		"Cluster Status",
		small_break
	];
	
	for(key in status) {
		if(status.hasOwnProperty(key)) {
			if(key == "type" || key == "to") {
				continue;
			}
			var val = status[key];
			lines.push(key + ": " + val);
		}
	}
	
	var body = lines.join("\n");
	
	waitingStatusResponses.forEach(function (response) {
		response.end(body);
		clearTimeout(response.timeout);
	});
	
	waitingStatusResponses.length = 0;
};

/**
 * Set up clustering
 */
if (cluster.isMaster) {

	// the master will track a few statics and keep the workers up and running
	
	
	var child_count = 0,
		startTime = new Date(),
		total_requests = 0,
		total_open_requests = 0,
		max_open_requests = 0;
		
	var MINUTE = 60,
		HOUR = 60 * 60,
		DAY = HOUR * 24;
		
	function prettyTime(date) {
		var diff = ((new Date()).getTime() - date.getTime())/1000;
		if (diff > DAY) {
			return Math.floor(diff/DAY) + " days";
		} else if (diff > HOUR) {
			return Math.floor(diff/HOUR) + " hours";
		} else if (diff > MINUTE) {
			return Math.floor(diff/MINUTE) + " minutes";
		} else {
			return Math.round(diff*10)/10 + " seconds";
		}
	}
	
	function workersExcept(pid) {
		return workers.filter( function(w) {
			return w.pid != pid;
		});
	}
	
	var workers = [];
	
	function createWorker() {
		var worker = cluster.fork();
		child_count++;
		workers.push(worker);
		
		worker.open_requests = 0;
		worker.start_time = new Date();
		
		worker.on('message', function (message) {
			// if there's no type, then we don't care about it here
			if(!message.type) {
				return;
			}
			
			console.log('message recieved by master ', message);
			
			// if it's a status request sent to everyone, respond with the master's status before passing it along
			if (message.type == "status.request") {
				var data = {
					type: "status.response",
					"Master PID": process.pid, 
					"Online Since": startTime.toString() + "(about " + prettyTime(startTime) + ")", 
					"Workers Started": child_count, 
					"Total Requests Served": total_requests,
					"Current Open Requests": total_open_requests,
					"Max Open Requests": max_open_requests
				};
				
				var uptime = ((new Date).getTime() - startTime.getTime())/1000;
				if (total_requests > uptime) {
					data["Requests Per Second (average)"] = total_requests / uptime;
				} else if (total_requests > uptime/MINUTE) {
					data["Requests Per Minute (average)"] = total_requests / (uptime/MINUTE);
				} else if (total_requests > uptime/HOUR) {
					data["Requests Per Hour (average)"] = total_requests / (uptime/HOUR);
				} else {
					data["Requests Per Day (average)"] = total_requests / (uptime/DAY);
				}
				
				data.Workers = "";
				workers.forEach(function(w) {
					data.Workers += "\n - " + w.pid + " online for " + prettyTime(w.start_time);
				});
				
				worker.send(data);
			}
			
			if (message.type == "request.start") {
				worker.open_requests++;
				total_open_requests++;
				if (max_open_requests < total_open_requests) {
					max_open_requests = total_open_requests;
				}
				total_requests++;
			}
			
			if (message.type == "request.end") {
				worker.open_requests--;
				total_open_requests--;
			}
		});
	}

	// if we're in the master process, create one worker for each cpu core
	for (var i = 0; i < numCPUs; i++) {
		createWorker();
	}
	
	// when the worker dies, note the exit code, remove it from the workers array, and create a new one 
	cluster.on('death', function(worker) {
		total_open_requests = total_open_requests - worker.open_requests;
		workers = workersExcept(worker.pid)
		createWorker();
	});

} else {
	// if we're a worker, read the index file and then fire up the server
	setupIndex();
	http.Server(server).listen(config.port, config.ip);
	console.log('node-unblocker proxy server with pid ' + process.pid + ' running on ' + 
		((config.ip) ? config.ip + ":" : "port ") + config.port
	);
	
	process.on('message', function (message) {
		if (!message.type) {
			return;
		}
		console.log("messge recieved by child (" + process.pid + ") ", message);
		if (message.type == "status.response") {
			sendStatus(message);
		}
	});
}
