# redis-url

## Usage

    // use $REDIS_URL or redis://localhost:6379
    var redis = require('redis-url').connect();

    // specify a url
    var redis = require('redis-url').connect(process.env.SOMEREDIS_URL);

## License

MIT
