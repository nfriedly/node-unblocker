var fs = require('fs'),
	path = require("path"),
	Url = require('url');
  
function Watchlist(filename){
  this.filename = filename;
  this.data = [];
  this.readData();
  
  var that = this;

  fs.watch(filename, function(cur, prev){
    that.readData();
  });

}

Watchlist.prototype.readData = function(){
   	// send the file out if it exists and it's readable, error otherwise
  var that = this;
  
	fs.exists(that.filename, function(exists) {
	
		if (!exists) {
      throw "Blocklist file " + that.filename + " does not exist";
    }
		
		fs.readFile(that.filename, "binary", function(err, data) {
			if (err) {
				throw err;
			}
      
      that.data = data.split("\n")
        .map(function(val){return val.trim();})
        .filter(function(val){return val != "";});
    });
	});
}

var domains = new Watchlist( __dirname + "/../domain-blocklist.txt"),
  keywords =  new Watchlist( __dirname + "/../keyword-blocklist.txt");

exports.urlAllowed = function(url){
  if(typeof url == "string"){
    url = Url.parse(url);
  }
  
  // short-circut: if the exact domain is in the list, then return early
  if(domains.data.indexOf(url.hostname) != -1){
  	console.log("url blocked due to domain name: ", url.hostname, domains.data);
    return false;
  }
  
  if(url.hostname) {
		// next check each sub-domain, skipping the final one since we just checked it above
		var hostname_parts = url.hostname.split("."),
			i = (hostname_parts[hostname_parts.length-2] == "co") ? 3 : 2, // ignore domains like co.uk
			cur_domain;
			
		for(; i<= hostname_parts.length-1; i++){
				cur_domain = hostname_parts.slice(-1*i).join('.'); // first site.com, then www.site.com, etc.
			if(domains.data.indexOf(cur_domain) != -1){
				console.log("url blocked on subdomain ", cur_domain, domains.data);
						return false;
				}
		}
	}
  // lastly, go through each keyword in the list and check if it's in the url anywhere
  if(keywords.data.some(function(keyword){ 
  	if( url.href.indexOf(keyword) != -1 ){ 
  	console.log("url blocked on keyword", keyword, keywords.data)} 
    return url.href.indexOf(keyword) != -1;
  })){
    return false;
  }
  
  // if it's passed the above tests, than the url looks safe
  return true;
}
