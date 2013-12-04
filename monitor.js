// load newrelic for monitoring, but only if there's a license key
if (process.env.NEW_RELIC_LICENSE_KEY) {
    require('newrelic');
}

var util = require('util');

// also set up memwatch to look for memory leaks
var memwatch = require('memwatch');

memwatch.once('leak', function(info) {

    console.warn('Leak Detected, starting heap diffing', info);

    var hd = new memwatch.HeapDiff();

    memwatch.on('stats', function(stats) {

        var diff = hd.end();
        console.warn('Memory leak detected, stats:\n', util.inspect(stats), '\nHeap diff since last GC:\n', util.inspect(diff));

        hd = new memwatch.HeapDiff();
    });


});
