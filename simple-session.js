/**
* Simple session library for node.js
*
* by Nathan Friedly - http://nfriedly.com
*
* Released under the GPL v3
*/

var uuid = require('node-uuid'); // https://github.com/broofa/node-uuid or "npm install node-uuid"

var options = {
	path:		"/",
	name:		"session_id",
	expires:	30, // minutes after last visit - this is tracked internally, not on the cookie
	domain: 	null
};

// create getters and setters for all options
for(var name in options){
	(function(){
		var capName = name.substr(0,1).toUpperCase() + name.substr(1);
		exports["get" + capName] = function(){ return options[name]; };
		exports["set" + capName] = function(val){ return options[name] = val; }
	})();
}

var sessions = {};

exports.sessionify = function(request, response){
	var id;
	
	if(request.headers.cookie && request.headers.cookie.indexOf(options.name) != -1){
		var cookies = request.headers.cookie,
			start = cookies.indexOf(options.name) + options.name.length + 1,
			stop = cookies.indexOf(";", start);
		if(stop == -1) stop = null;
		id = cookies.substring(start, stop);

		// ensure that sessions older than the expires time are deleted - even if the collector hasn't run yet		
		if(sessions[id] && !expired(sessions[id])){
			sessions[id].__last_seen = new Date();
		} else {
			sessions[id] = newSession(id);
		}
			
	} else {
		id = uuid();
		var cookies = response.getHeader('set-cookie') || "";
		
		sessions[id] = newSession(id);
		
		if(cookies){
			 cookies += "\n";
		}
		cookies += options.name + "=" + id;
		if(options.path) cookies += "; path=" + options.path;
		if(options.domain) cookies += "; domain=" + options.domain;
		response.setHeader('set-cookie', cookies);
	}
	
	request.session = sessions[id];
}

// initialize a new empty session
function newSession(id){
	return {
		__last_seen: new Date(),
		__session_id: id
	}; 
}

function expired(session){
	var now = new Date();
	return (session.__last_seen.getTime() + (options.expires * 60 * 1000)) < now.getTime();
}

// garbage collector - cleans out old sessions
// runs as often as options.expires
setInterval(function(){
	for(var id in sessions){
		if(expired(sessions[id])) delete sessions[id];
	}
}, options.expires*60*1000);