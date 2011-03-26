/***************
* node-unblocker: Web Proxy for evading firewalls and content filters, 
* similar to CGIProxy or PHProxy
*
*
* This project is hosted on github:  https://github.com/nfriedly/node-unblocker
*
* Copyright Nathan Friedly - http://nfriedly.com - MIT License
*/

/*
todo:
 - stress test (apache bench?)
 - add error handeling
 - cookies
 - fix url fixer
 - look into npm
*/

// imports
var http = require('http'),
	url = require('url'),
	querystring = require('querystring'),
	path = require("path"),
	fs = require("fs");

// configuration
var host = null, // this will be automatically determined if left null, but it's faster to specify it
	includePortInRedirect = true, // false if you're running a reverse proxy (such as nginx)
	port = 8081,
	ip = null; // string ip, or null for any ip


var server = http.createServer(function(request, response){
	var url_data = url.parse(request.url);
	
	console.log("New Request: ", request.url);
	
	// if the user requested the "home" page
	// (located at /proxy so that we can more easily tell the difference 
	// between a user who is looking for the home page and a "/" link)
	if(url_data.pathname == "/proxy"){
		request.url = "/index.html";
		return readFile(request, response);
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
	re_html_url 	= /("|'|=)(http)/ig, // "http, 'http, or =http (no :// so that it matches http & https)
	re_html_auto 	= /("|'|=)(\/\/)/ig, // matches //site.com style urls where the protocol is auto-sensed
	re_html_relative = /((href|src)=['"]{0,1})(\B)/ig, // matches src="asdf/adf" // this also matches http:// :(
	re_html_rel_root = /((href|src)=['"]{0,1})(\/\B)/ig, // matches src="/asdf/asdf"
	
	re_html_partial = /("|'|=)[ht]{1,3}$/ig, // ', ", or = followed by one to three h's and t's at the end of the line
	
	re_css_url = /(\(|'|")(http)/ig, // (, ', or " followed by http
	re_css_partial = /(\(|'|")[ht]{1,3}$/ig; // above with 1-3 h's and t's followed by the end of the line

/**
* Makes the outgoing request and relays it to the client, modifying it along the way if necessary
*
* todo: get better at fixing / urls
* todo: fix urls that start with //
*/
function proxy(request, response) {

	incrementRequests();

	var uri = url.parse(getRealUrl(request.url));
	uri.port = uri.port || portmap[uri.protocol];
	uri.pathname = uri.search ? uri.pathname + uri.search : uri.pathname;
	
	headers = copy(request.headers);
	delete headers.host;
	delete headers.cookie;
	
	// todo: add any cookies appropriate to the response
	
	var options = {
		host: uri.host,
		port: uri.port,
		path: uri.pathname,
		method: request.method,
		headers: headers
	}
	
	var remote_request = http.request(options, function(remote_response){
		
		// some parsers will need to delay a chunk if it can't tell wether or not 
		// it ends on data that needs to be modified
		var last_chunk;
		
		// we need to know the "folder" so that relative urls can be rewritten as absolute ones
		var folder = "";
		if(uri.pathname.substr(-1) == "/"){
			folder = uri.pathname;
		} else {
			var bits = uri.pathname.split("/");
			if(bits.length == 1){
				folder = "/";
			} else {
				bits.pop();
				folder = bits.join("/") + "/";
			}
		}
		
		var parsers = {
			'passthrough': 	function(chunk){ response.write(chunk, 'binary'); },
			'text/html': 	function(chunk){ parseChunk(chunk, [
				{pattern: re_html_url, 		replacement: "$1" + thisSite(request) + "/$2"},
					{pattern: re_html_auto, 	replacement: "$1" + thisSite(request) + "/" + uri.protocol + "$2"}//,
					//{pattern: re_html_relative, replacement: "$1" + thisSite(request) + folder + "$2"},
					//{pattern: re_html_rel_root, replacement: "$1" + thisSite(request) + uri.protocol + uri.host + "$2"}
				
				], re_html_partial); },
			//'text/css': 	function(chunk){ parseChunk(chunk, [
			//		{pattern: re_css_url, 		replacement: "$1" + thisSite(request) + "/$2"}
			//	], re_css_partial); }
		}
		
		// parses the chunk with the given regex's, send it out unless it ends in a partial match
		function parseChunk(chunk, main_res, re_end){
			console.log("data event", request.url);
			// stringily our chunk and grab the previous chunk (if any)
			chunk = chunk.toString();
			
			if(last_chunk){
				chunk = last_chunk + chunk;
				last_chunk = undefined;
			}
		
			// first replace any complete urls
			for(var i=0; i<main_res.length; i++){
				var re = main_res[i];
				chunk = chunk.replace(re.pattern, re.replacement);
			}
			
			// second, check if any urls are partially present in the end of the chunk,
			// and buffer the chunk if so; otherwise pass it along
			if(chunk.match(re_html_partial)){
				last_chunk = chunk;
			} else {
				response.write(chunk);
			}		
		}
		
		// find the content-type so that we know which parser to use
		var ct = remote_response.headers['content-type'] || "text/html";
		ct = ct.split(";")[0];
		
		// if we have a parser for the given content-type, use it. If not, use the passthrough function
		var parser = parsers[ct] || parsers.passthrough;
		
		remote_response.addListener('data', parser);

			
		// todo: correct any redirects in the headers
		// todo: filter & store any cookies in the headers
		
		// make a copy of the headers to fiddle with
		var headers = copy(remote_response.headers);
		
		// if we might be modifying the response, nuke any content-length headers
		if(parser != parsers.passthrough){
			delete headers['content-length'];
		}
		
		// and fire off out (possibly modified) headers
		response.writeHead(remote_response.statusCode, headers);

		// clean up the connection and send out any orphaned chunk
		remote_response.addListener('end', function() {
			console.log("end event!", request.url);
			if(last_chunk){
				response.write(last_chunk);
				last_chunk = undefined;
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
	
	// if we couldn't parse the referrer or they came from another host, they send them to the home page
	if(!ref || ref.host != thisHost(request)){
		return redirectTo(request, response, ""); // "" because we don't want a trailing slash
	}
	
	// now we know where they came from, so we can do something for them
	if(ref.pathname.indexOf('/proxy/http') == 0){
		var real_url = url.parse(getRealUrl(ref));
		
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
	// "/proxy/" is 7 characters long.
	return url.parse(path).pathname.substr(7);
}

// returns the configured host if one exists, otherwise the host that the current request came in on
function thisHost(request){
	return (host) ? host : request.headers.host;
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
	if(site == "/") site = ""; // no endless redirect loops
	console.log("Redirecting to ", thisSite(request) + site);
	response.writeHead('302', {'Location': thisSite(request) + site});
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
function readFile(request, response){

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
			return error(404, "The requested file could not be found.");
		}
		
		fs.readFile(filename, "binary", function(err, data) {
			if (err) {
				return error(500, err);
			}
			
			response.writeHead(200);
			response.write(data, "binary");
			response.end();
		});
	});
}

try {
	server.listen(port, ip);
	console.log('node-unblocker proxy server running on ' + ((ip) ? ip + ":" : "port ") + port);
} catch (ex) {
	console.log("server failed, perhaps the port (" + port + ") was taken?");
	console.error(ex);
}
