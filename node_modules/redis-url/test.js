var redis = require('./index').createClient();
redis.set('foo', 'bar');
redis.get('foo', function(err, res) {
  console.log('got1: ' + res);
});
redis.keys('*', function(err, res) {
  console.log('keys1: ' + res.length);
});

var redis = require('./index').createClient(process.env.REDISTOGO_URL);
redis.set('foo', 'bar');
redis.get('foo', function(err, res) {
  console.log('got2: ' + res);
});
redis.keys('*', function(err, res) {
  console.log('keys2: ' + res.length);
});

