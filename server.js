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

// imports
var http = require('http'),
	https = require('https'),
	url = require('url'),
	querystring = require('querystring'),
	path = require("path"),
	fs = require("fs"),
	zlib = require('zlib'),
	session = require('./simple-session'),
	blocklist = require('./blocklist');
  
// the configuration file
var config = require('./config');

console.log("config: ", config);

var server = http.createServer(function(request, response){
	var url_data = url.parse(request.url);
	
	console.log("New Request: ", request.url);
	
	// if the user requested the "home" page
	// (located at /proxy so that we can more easily tell the difference 
	// between a user who is looking for the home page and a "/" link)
	if(url_data.pathname == "/proxy"){
		request.url = "/index.html"; 
		// todo: refactor this to make more sense
		return readFile(request, response, config.google_analytics_id);
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
		session.sessionify(request, response);
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

/**
* Makes the outgoing request and relays it to the client, modifying it along the way if necessary
*
* todo: get better at fixing / urls
* todo: fix urls that start with //
*/
function proxy(request, response) {


	var uri = url.parse(getRealUrl(request.url));

	// redirect urls like /proxy/http://asdf.com to /proxy/http://asdf.com/ to make relative image paths work
	if (uri.pathname == "/" && request.url.substr(-1) != "/") {
		return redirectTo(request, response, request.url + "/");
	}
	
	// make sure the url in't blocked
	if(!blocklist.urlAllowed(uri)){
      return redirectTo(request, response, "?error=Please use a different proxy to access this site");
    }
    
    incrementRequests();
	
	uri.port = uri.port || portmap[uri.protocol];
	uri.pathname = uri.search ? uri.pathname + uri.search : uri.pathname;
	
	
	headers = copy(request.headers);
	
	delete headers.host;
	
	// todo: grab any new cookies in headers.cookie (set by JS) and store them in the session
	// (assume / path and same domain)
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
	
	//console.log('requesting: ', options);
	
	// what protocol to use for outgoing connections.
	var proto = (uri.protocol == 'https:') ? https : http;
	
	var remote_request = proto.request(options, function(remote_response){
	
		// make a copy of the headers to fiddle with
		var headers = copy(remote_response.headers);
		
		//console.log('headers: ', headers);
		
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
			headers.location = thisSite(request) + "/" + headers.location;
			console.log("fixing redirect");
		}
		
		if(headers['set-cookie']){
			storeCookies(request, uri, headers['set-cookie']);
			delete headers['set-cookie'];
		} //else { console.log("no set-cookie header: ", headers); }
		
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
			console.log("end event!", request.url);
			// if we buffered a bit of text but we're now at the end of the data, then apparently
			// it wasn't a url - send it along
			if(chunk_remainder){
				response.write(chunk_remainder);
				chunk_remainder = undefined;
			}
			response.end();
		  	decrementRequests();
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

// counters to get a rough picture of how busy the server is and how busy it's been (and also if it was restarted any time recently)
var counter = 0,
	openRequests = 0,
	maxRequests = 0,
	serverStart = new Date();

function incrementRequests(){
	openRequests++;
	if(openRequests > maxRequests){
		maxRequests = openRequests;
	}
	counter++;
}

function decrementRequests(){
	openRequests--;
}

// simple way to get the curent status of the server
function status(request, response){
	response.writeHead("200", {"Content-Type": "text/plain", "Expires": 0});
	response.write("Open Requests: " + openRequests + "\n" + 
		"Max Open Requests: " + maxRequests + "\n" +
		"Total Requests: " + counter + "\n" + 
		"Online Since: " + serverStart
	);
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

// a super-basic file server
function readFile(request, response, google_analytics_id){

  //process.cwd() - doesn't always point to the directory this script is in.

	var pathname = url.parse(request.url).pathname,
   		filename = path.join(__dirname, pathname);
 
 	function error(status, text){
		response.writeHead(status, {"Content-Type": "text/plain"});
		response.write("Error " + status + ": " + text + "\n");
		response.end(); 	
 	}
  
  console.log(filename, " - ", pathname);
 
 	// send the file out if it exists and it's readable, error otherwise
	path.exists(filename, function(exists) {
	
		if (!exists) {
			console.log(filename + ' does not exist');
			return error(404, "The requested file could not be found.");
		}
		
		fs.readFile(filename, "binary", function(err, data) {
			if (err) {
				return error(500, err);
			}
      
      		data = mixinGA(data, google_analytics_id);
			
			// some reverse proxies (apache) add a default text/plain content-type header if none is specified			
			var headers = {};
			if(filename.substr(-5) == ".html" || filename.substr(-4) == ".htm"){
				headers['content-type'] = "text/html";
			}

			response.writeHead(200, headers);
			response.write(data, "binary");
			response.end();
		});
	});
}

function mixinGA(data, google_analytics_id){
  if(google_analytics_id){

    var ga = [
      "<script type=\"text/javascript\">"
      ,"var _gaq = []; // overwrite the existing one, if any"
      ,"_gaq.push(['_setAccount', '" + google_analytics_id + "']);"
      ,"_gaq.push(['_trackPageview']);"
      ,"(function() {"
      ,"  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;"
      ,"  ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';"
      ,"  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);"
      ,"})();"
      ,"</script>"
    ].join("\n");

    data = data.replace("</body>", ga + "\n\n</body>");

  } 
  return data;
}

try {
	server.listen(config.port, config.ip);
	console.log('node-unblocker proxy server running on ' + ((config.ip) ? config.ip + ":" : "port ") + config.port);
} catch (ex) {
	console.log("server failed, perhaps the port (" + config.port + ") was taken?");
	console.error(ex);
}
