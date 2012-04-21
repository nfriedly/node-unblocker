/**
* Checks the user's session and the requesting host and adds any cookies that the requesting 
* host has previously set.
*
* Honors domain, path, and expires directives. 
*
* Does not currently honor http / https only directives.
*/
exports.getCookies = function (request, uri){
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
		this.readCookiesForDomain(cur_domain, session, path_parts, cookies);
	}
	
	// now, finally, we check for cookies that were set on the exact current domain without the dot
	this.readCookiesForDomain(uri.hostname, session, path_parts, cookies);

	// convert cookies from key/value pairs to single strings for each cookie
	for(var name in cookies){
		output.push(name + "=" + cookies[name]);
	};
	
	// join the cookie strings and return the final output
	return output.join("; ");
}

exports.readCookiesForDomain = function (cur_domain, session, path_parts, cookies){
		
		if(!session[cur_domain]) return;
		
		var j, cur_path;
		
		for(j=1; j < path_parts.length; j++){
		
			cur_path = path_parts.slice(0,j).join("/");
			if(cur_path == "") cur_path = "/";
			
			if(session[cur_domain][cur_path]){
				for(var cookie_name in session[cur_domain][cur_path]){
					
					// check the expiration date - delete old cookies
					if(this.isExpired(session[cur_domain][cur_path][cookie_name])){
						delete session[cur_domain][cur_path][cookie.name];
					} else {
						cookies[cookie_name] = session[cur_domain][cur_path][cookie_name].value;
					}
				}
			}
		}
	}

/**
* Parses the set-cookie header from the remote server and stores the cookies in the user's session
*/
exports.storeCookies = function(request, uri, cookies){
	console.log('storing these cookies: ', cookies);

	if(!cookies) return;
	
	var parts, name_part, thisCookie, domain, self = this;
	
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
		if(self.isExpired(thisCookie)){
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
exports.isExpired = function(cookie){
	if(cookie.expires){
		var now = new Date(),
			expires = new Date(cookie.expires);
		return (now.getTime() >= expires.getTime());
	}
	return false; // no date set, therefore it expires at the end of the session 
}