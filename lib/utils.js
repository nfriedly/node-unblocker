var url = require('url');

var config = require('../config');

module.exports =  {
	/**
	* Takes a /proxy/http://site.com url from a request or a referer and returns the http://site.com/ part
	*/
	getRealUrl: function (path){
		var uri = url.parse(path),
			real_url = uri.pathname.substr(7); // "/proxy/" is 7 characters long.
		// we also need to include any querystring data in the real_url
		return uri.search ? real_url + uri.search : real_url;
	}
	
	// returns the configured host if one exists, otherwise the host that the current request came in on
	,thisHost: function (request){
		return (config.host) ? config.host : request.headers.host;
	}
	
	// returns the http://site.com/proxy
	,thisSite: function (request){
		return 'http://' + this.thisHost(request) + '/proxy';
	}
	
	,redirectTo: function (request, response, site){
		site = site || "";
		if(site.length && site.substr(0,1) != "/" && site.substr(0,1) != "?"){
			site = "/" + site;
		}
		if(site.substr(0, 6) == "/proxy") { // no /proxy/proxy redirects
			site = site.substr(6);
		}
		if(site == "/") site = ""; // no endless redirect loops
		try {
			response.writeHead('302', {'Location': this.thisSite(request) + site});
			console.log("recirecting to " + this.thisSite(request) + site);
		} catch(ex) {
			// the headers were already sent - we can't redirect them
			console.error("Failed to send redirect", ex);
		}
		response.end();
	}
	
	,ga: ""
	
	,add_ga: function (html) {
		if(config.google_analytics_id) {
			this.ga = this.ga || [
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
	
			html = html.replace("</body>", this.ga + "\n\n</body>");	
		}
		return html;
	}
};