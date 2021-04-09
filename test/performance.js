"use strict";
const path = require("path");
const { format } = require("util");
const send = require("send");
const concat = require("concat-stream");
const hyperquest = require("hyperquest");
const math = require("math-helpers")();
const async = require("async");
const { getServers } = require("./test_utils.js");

const html_path = path.join(__dirname, "source/index.html");
const js_path = path.join(
  __dirname,
  "source/desktop_polymer_inlined_html_polymer_flags.js"
);

function remoteApp(req, res) {
  if (req.url === "/js") {
    send(req, js_path).pipe(res);
  } else {
    send(req, html_path).pipe(res);
  }
}

// fire up the server and actually run the tests
getServers({ remoteApp }, function (err, servers) {
  // set up the cleanup work first
  //process.on('SIGINT', servers.kill);
  //process.on('SIGTERM', servers.kill);
  if (err) {
    throw err;
  }

  const iterations_html = 1000;
  const concurrency_html = 30;

  const iterations_js = 100;
  const concurrency_js = 4; // note: this entire test (client and server) runs on a single thread

  let baseline;
  let proxy;

  new async.series(
    [
      function (next) {
        runTest(
          "Baseline HTML",
          servers.remoteUrl,
          iterations_html,
          concurrency_html,
          function (baseFailures, baseSuccesses, time) {
            baseline = getStats(
              iterations_html,
              baseFailures,
              baseSuccesses,
              time
            );
            printStats(baseline);
            next();
          }
        );
      },
      function (next) {
        runTest(
          "Proxy HTML",
          servers.proxiedUrl,
          iterations_html,
          concurrency_html,
          function (proxyFailures, proxySuccesses, time) {
            proxy = getStats(
              iterations_html,
              proxyFailures,
              proxySuccesses,
              time
            );
            printStats(proxy, baseline);
            next();
          }
        );
      },
      function (next) {
        runTest(
          "Baseline JS",
          servers.remoteUrl + "js",
          iterations_js,
          concurrency_js,
          function (baseFailures, baseSuccesses, time) {
            baseline = getStats(
              iterations_js,
              baseFailures,
              baseSuccesses,
              time
            );
            printStats(baseline);
            next();
          }
        );
      },
      function (next) {
        runTest(
          "Proxy JS",
          servers.proxiedUrl + "js",
          iterations_js,
          concurrency_js,
          function (proxyFailures, proxySuccesses, time) {
            proxy = getStats(
              iterations_js,
              proxyFailures,
              proxySuccesses,
              time
            );
            printStats(proxy, baseline);
            next();
          }
        );
      },
    ],
    function (err) {
      console.log(err || "");
      servers.kill();
    }
  );
});

function runTest(name, url, iterations, concurrency, cb) {
  console.log("\n\n=========\n" + name + "\n=========");

  const start = Date.now();
  const times = [];
  const failures = [];
  const tasks = [];

  function addTask() {
    tasks.push(function (step) {
      const start = Date.now();
      hyperquest(url)
        .pipe(
          concat(function (data) {
            if (!data || !data.length) {
              throw new Error("No data: " + data);
            }
            const time = Date.now() - start;
            times.push(time);
            process.stdout.write(".");
            step();
          })
        )
        .on("error", function (err) {
          err.time = Date.now() - start;
          failures.push(err);
          process.stdout.write("x");
          step(err);
        });
    });
  }

  for (let i = 0; i < iterations; i++) {
    addTask();
  }

  async.parallelLimit(tasks, concurrency, function (err) {
    if (err) failures.push(err);
    const totalTime = Date.now() - start;
    cb(failures, times, totalTime);
  });
}

function getStats(iterations, failures, successes, time) {
  const sorted = successes.sort();
  return {
    iterations: iterations,
    failures: failures.length,
    successes: successes.length,
    ms: time,
    average: math.avg(successes),
    stdDev: math.stdDev(successes),
    _50: sorted[Math.round(sorted.length / 2)],
    _75: sorted[Math.round((sorted.length / 4) * 3)],
    _90: sorted[Math.round((sorted.length / 10) * 9)],
    _95: sorted[Math.round((sorted.length / 20) * 19)],
  };
}

function printDifference(stat, proxy, baseline) {
  if (!baseline) return "";
  const percentageDiff = (proxy[stat] * 100) / baseline[stat] - 100;
  return format(
    "(%s% %s than the baseline)",
    Math.round(Math.abs(percentageDiff)),
    percentageDiff > 0 ? "slower" : "faster"
  );
}

function printStats(stats, baseline) {
  if (stats.failures) {
    console.error(stats.failures + " failures");
  }
  console.log(
    format(
      "\n%s/%s iterations completed successfully in %s miliseconds %s",
      stats.successes,
      stats.iterations,
      stats.ms,
      printDifference("ms", stats, baseline)
    )
  );
  console.log(
    "Average response time: " + stats.average + " miliseconds",
    printDifference("average", stats, baseline)
  );
  if (baseline) {
    console.log(
      format(
        "Proxy adds %s ms to each request on average",
        stats.average - baseline.average
      )
    );
  }
  console.log(
    "Standard Deviation: " + stats.stdDev,
    printDifference("stdDev", stats, baseline)
      .replace("slower", "worse")
      .replace("faster", "better")
  );
  console.log(
    format(
      "Percentile speeds:\n  50%: %sms %s\n  75%: %sms %s\n  90%: %sms %s\n  95%: %sms %s",
      stats._50,
      printDifference("_50", stats, baseline),
      stats._75,
      printDifference("_75", stats, baseline),
      stats._90,
      printDifference("_90", stats, baseline),
      stats._95,
      printDifference("_95", stats, baseline)
    )
  );
}
