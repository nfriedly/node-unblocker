var fs = require('fs'),
    http = require('http');
    child_process = require('child_process'),
    TaskGroup = require('taskgroup').TaskGroup,
    hyperquest = require('hyperquest'),
    concat = require('concat-stream');

var sitesPath = __dirname + '/remote-sites/';
var sites = {};

fs.readdirSync(sitesPath).forEach(function(site) {
  sites[site] = fs.readdirSync(sitesPath + site);
});

console.dir(sites);

var remoteExecPath = __dirname + '/../node_modules/node-static/bin/cli.js';
var remotePort = 8081;
var remoteBase = 'http://localhost:' + remotePort + '/';

Object.keys(sites).forEach(function(siteName) {
  var files = sites[siteName];
  var remoteServer = child_process.fork(remoteExecPath, ['-p', remotePort, sitesPath + siteName], {silent: true});

  function test(remoteBase, files, next) {
    var tasks = new TaskGroup({concurrency: 15, next: next});
    var iterations = 10;
    var expectedRequests = files.length * iterations;
    var times = [];
    var failures = [];
    function step(err, time) {
      if ( err ) failures.push(err);
      else if (time) times.push(time)
      if (times.length + failures.length >= expectedRequests) next(failures, times);
    }

    for (var i=0; i<iterations; i++) {
      files.forEach(function(file) {
        var start = Date.now();
        hyperquest(remoteBase + file).on('error', function(err) {
          err.file = file;
          err.time = Date.now() - start;
          step(err);
        }).pipe(concat(function(data) {
          var time = Date.now() - start;
          step(null, time);
        }));
      });
    }
  };

  test(remoteBase, files, function(failures, successes) {
    console.dir(successes);
    console.dir(failures);
    remoteServer.kill();
  });

});
