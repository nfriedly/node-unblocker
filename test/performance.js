var fs = require('fs'),
    format = require('util').format,
    concat = require('concat-stream'),
    hyperquest = require('hyperquest'),
    math = require('math-helpers')(),
    TaskGroup = require('taskgroup').TaskGroup,
    getServers = require('./test_utils.js').getServers;
    
var source = fs.readFileSync(__dirname + '/source/index.html');
var expected = fs.readFileSync(__dirname + '/expected/index.html');


// fire up the server and actually run the tests
getServers(source, function(err, servers) {
    // set up the cleanup work first
    process.on('SIGINT', servers.kill);
    process.on('SIGTERM', servers.kill);

    var iterations = 1000;
    var concurrency = 30;
    
    var baseline, proxy;

    new TaskGroup({
        concurrency: 1, // these should be run in order, not in parallel
        tasks: [
            function(next) {
                console.log("\n\n=========\nBaseline\n=========");
                runTest("http://localhost:8081/", iterations, concurrency, function(baseFailures, baseSuccesses, time) {
                    baseline = getStats(iterations, baseFailures, baseSuccesses, time);
                    printStats(baseline);
                    next(); 
                });   
            },
            function(next) {
                console.log("\n\n=========\nProxy\n=========");
                runTest("http://localhost:8080/proxy/http://localhost:8081/", iterations, concurrency, function(proxyFailures, proxySuccesses, time) {
                    proxy = getStats(iterations, proxyFailures, proxySuccesses, time);
                    printStats(proxy, baseline);
                    next();
                 });
            }
        ],
        next: function(err) {
                console.log(err || '');
                servers.kill();
                process.exit();
            }
        }).run();
});



function runTest(url, iterations, concurrency, cb) {
    var start = Date.now(),
        times = [],
        failures = []
        tasks = new TaskGroup({
            concurrency: concurrency,
            pauseOnError: false
        });
        
    tasks.once('complete', function(err) {
        if (err) failures.push(err);
        var totalTime = Date.now() - start;
        cb(failures, times, totalTime);
    });

    for (var i=0; i<iterations; i++) {
        tasks.addTask(function(step) {
            var start = Date.now();
            hyperquest(url)
                .pipe(concat(function(data) {
                    var time = Date.now() - start;
                    times.push(time);
                    process.stdout.write('.');
                    step();
                }))
                .on('error', function(err) {
                    err.file = file;
                    err.time = Date.now() - start;
                    failures.push(err);
                    process.stdout.write('x');
                    step(err);
                });
        });
    }
    
    tasks.run();
}

function getStats(iterations, failures, successes, time) {
    var sorted = successes.sort();
    return {
        iterations: iterations,
        failures: failures.length, 
        successes: successes.length, 
        ms: time,
        average: math.avg(successes),
        stdDev: math.stdDev(successes),
        _50: sorted[Math.round(sorted.length/2)],
        _75: sorted[Math.round(sorted.length/4 * 3)],
        _90: sorted[Math.round(sorted.length/10 * 9)],
        _95: sorted[Math.round(sorted.length/20 * 19)],
    }
}

function printDifference(stat, proxy, baseline) {
    if (!baseline) return "";
    var percentageDiff = (proxy[stat] * 100 / baseline[stat]) - 100;
    return format("(%s% %s than the baseline)", Math.round(Math.abs(percentageDiff)), (percentageDiff > 0) ? "slower" : "faster");
}

function printStats(stats, baseline) {
    if (stats.failures) {
        console.error(failures + ' failures');
    }
    console.log(format("\n%s/%s iterations completed successfully in %s miliseconds %s", 
        stats.successes, stats.iterations, stats.ms, printDifference("ms", stats, baseline)));
    console.log("Average response time: " + stats.average + " miliseconds", printDifference("average", stats, baseline));
    console.log("Standard Deviation: " + stats.stdDev, 
        printDifference("stdDev", stats, baseline).replace("slower", "worse").replace("faster", "better"));
    console.log(format("Percentile speeds:\n  50%: %smss %s\n  75%: %smss %s\n  90%: %smss %s\n  95%: %smss %s", 
        stats._50, printDifference("_50", stats, baseline), 
        stats._75, printDifference("_75", stats, baseline), 
        stats._90, printDifference("_90", stats, baseline), 
        stats._95, printDifference("_95", stats, baseline)));
}