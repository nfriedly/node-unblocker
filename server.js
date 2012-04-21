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
	numCPUs = require('os').cpus().length;


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


// local dependencies
var utils = require('./lib/utils')
	,proxy = require('./lib/proxy')(redis); // todo: make it use whatever is on `request`
  

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
		utils.redirectTo(request, response, site || "");
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
			return utils.redirectTo(request, response, "");
		}
		
		// we already know it doesn't start with http, so lets fix that first
		return utils.redirectTo(request, response, 
			"/http://" + request.url.substr(7) // "/proxy/".length = 7
		);
	}
	
	// if there is no referer, then either they just got here or we can't help them
	if(!request.headers.referer){
		return utils.redirectTo(request, response, ""); // "" because we don't want a trailing slash
	}
	
	var ref = url.parse(request.headers.referer);
	
	// if we couldn't parse the referrer or they came from another site, they send them to the home page
	if(!ref || ref.host != utils.thisHost(request)){
		return utils.redirectTo(request, response, ""); // "" because we don't want a trailing slash
	}
	
	// now we know where they came from, so we can do something for them
	if(ref.pathname.indexOf('/proxy/http') == 0){
		var real_url = url.parse(utils.getRealUrl(ref.pathname));
		
		// now, take the requested pat on the previous known host and send the user on their way
		return utils.redirectTo(request, response, real_url.protocol +"//"+ real_url.host + request.url);
	}
	
	// else they were refered by something on this site that wasn't the home page and didn't come 
	// through the proxy - aka this shouldn't happen
	utils.redirectTo(request, response, "");
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
	raw_index = utils.add_ga(raw_index);
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
