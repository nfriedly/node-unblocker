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
	zlib = require('zlib');

// for great performance!
// kind of hard to see much difference in local testing, but I think this should make an appreciable improvement in production
// https://github.com/substack/hyperquest#rant
http.globalAgent.maxSockets = 64;
https.globalAgent.maxSockets = 64;

// local dependencies
var encoding = require('./lib/encodingstream'),
    urlPrefix = require('./lib/urlprefixstream'),
    metaRobots = require('./lib/metarobotsstream'),
    googleAnalytics = require('./lib/googleanalyticsstream'),
    blocklist = require('./lib/blocklist')
    serveStatic = require('./lib/static');
  
// the configuration file
var config = require('./config');

urlPrefix.setDefaults({prefix: '/proxy/'});
googleAnalytics.setId(config.google_analytics_id);
serveStatic.setGa(googleAnalytics);

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
	
	//console.log("(" + process.pid + ") New Request: ", request.url);
	
	
    incrementRequests();
	request.on('end', decrementRequests);
	
	// if the user requested the "home" page
	// (located at /proxy so that we can more easily tell the difference 
	// between a user who is looking for the home page and a "/" link)
	if(url_data.pathname == "/proxy"){
		request.url = "/index.html";
		return serveStatic(request, response);
	}
	// disallow almost everything via robots.txt
	if(url_data.pathname == "/robots.txt"){
        return serveStatic(request, response);
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
	
	// any other url gets redirected to the correct proxied url if we can
	// determine it based on their referrer, or the home page otherwise
	return handleUnknown(request, response);

}); // we'll start the server at the bottom of the file


var portmap = {"http:":80,"https:":443};

/**
* Makes the outgoing request and relays it to the client, modifying it along the way if necessary
*/
function proxy(request, response) {
    request.session = request.session || {};

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
	
	//console.log("sending these cookies: " + headers.cookie);
	
	// overwrite the referer with the correct referer
	if(request.headers.referer){
		headers.referer = getRealUrl(request.headers.referer);
	}
	
	var options = {
		host: uri.hostname,
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
			//console.log("fixing redirect");
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

		// if we're dealing with gzipped input, set up a stream decompressor to handle output
		if(needs_decoded) {
			remote_response = remote_response.pipe(zlib.createUnzip());
		}

        if(needs_parsed) {
            var encodingStreams = encoding.createStreams(content_type);
            var urlPrefixStream = urlPrefix.createStream({uri: uri});
            var metaRobotsStream = metaRobots.createStream();
            var gAStream = googleAnalytics.createStream();
            remote_response = remote_response.pipe(encodingStreams.decode)
                .pipe(urlPrefixStream)
                .pipe(metaRobotsStream)
                .pipe(gAStream)
                .pipe(encodingStreams.recode);
        }
        
        remote_response.pipe(response);
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
	//console.log('storing these cookies: ', cookies);

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
			//console.log('deleting cookie', thisCookie.expires);
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
	if (config.host) {
	    return config.host;
	} 
	if (request.headers.host == 'localhost') {
	    request.headers.host + config.port; // special case to make testing & development easier
	} else  {
	    return request.headers.host; // normal case: include the hostname but assume we're either on a standard port or behind a reverse proxy
	}
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
		response.writeHead(307, {'Location': thisSite(request) + site});
		//console.log("recirecting to " + thisSite(request) + site);
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

function incrementRequests(){
	process.send({type: "request.start"});
}

function decrementRequests(){
	process.send({type: "request.end"});
}

var waitingStatusResponses = [];

// simple way to get the curent status of the server
function status(request, response){
	//console.log("status request recieved on pid " + process.pid);
	response.writeHead("200", {"Content-Type": "text/plain", "Expires": 0});
	
	// only send out a new status request if we don't already have one in the pipe
	if(waitingStatusResponses.length == 0) {
		//console.log("sending status request message");
		process.send({type: "status.request", from: process.pid});
	}
	
	// 1 second timeout in case the master doesn't respond quickly enough
	response.timeout = setTimeout(function(){
		//console.log("Error: status responses timeout reached");
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
 * Set up the server (assumes it's a child in a cluster)
 */
http.Server(server).listen(config.port, config.ip, function() {
    // this is to let the integration tests know when it's safe to run
    process.send({type: 'ready'});
    console.log('node-unblocker proxy server with pid ' + process.pid + ' running on ' + 
        ((config.ip) ? config.ip + ":" : "port ") + config.port
    );
});

process.on('message', function (message) {
    if (!message.type) {
        return;
    }
    //console.log("messge recieved by child (" + process.pid + ") ", message);
    if (message.type == "status.response") {
        sendStatus(message);
    }
});

