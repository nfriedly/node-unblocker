var through = require('through-stream');

var google_analytics_id;

function createStream() {
    return through(function(data, buf) {
        buf.push(addGa(data));
    });
}

function setId(id) {
    google_analytics_id = id;
}

var ga = "";
function addGa(html) {
	if (google_analytics_id) {
		ga = ga || [
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

		html = html.replace("</body>", ga + "\n\n</body>");	
	}
	return html;
}

module.exports.setId = setId;
module.exports.addGa = addGa;
module.exports.createStream = createStream;