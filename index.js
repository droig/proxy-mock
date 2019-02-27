
// const connect = require('connect');
// const app = connect();
var express = require('express');
var app = express();
const fs = require('fs');
const proxy = require('http-proxy-middleware');
require('colors');

const cacheDir = 'mocks';

let proxyTarget = 'http://localhost:8080';

let config = {
	routeConfig: [
		{
			expression: /payment/i,
			delay: 8
		},
		{
			expression: /_count-orders/ig,
			status: 500,
			body: "Error genérico"
		}
	]
}


function getLocalConfig() {
    var config;
    try {
        config = process.cwd() + '/conf.json';
    } catch(e) {
        config = {};
    }
    return config;
}


function getFileName(url) {
    return url
        .replace(/^\//, "").replace(/\/$/, "")
        .replace(/\//g, ".")
        //.replace(/\/?\.[0-9]+-[0-9kK]+/, "")     // quito rut
        + '.json'
}



function useCacheMiddleware(req, res, next) {

	let dirCacheFile = __dirname + '/' + cacheDir;
	let cacheFile = dirCacheFile + '/' + getFileName(req.url);

	if (! fs.existsSync(cacheFile)) return next();

	let output = fs.readFileSync(cacheFile, {encoding: 'utf8'});

	if (fs.existsSync(cacheFile)) {
		console.log('Usando cache para', req.url.cyan);
		res.end(output);
	} else {
		next();
	}
}



let buildCacheMiddleware = proxy({
    target: proxyTarget,

    onProxyReq: function(proxyReq, req, res) {
		//proxyReq.setHeader('foo', 'bar' );
    },

    onProxyRes: function(proxyRes, req, res) {
      var _write = res.write;
      var _end = res.end;
      var output;
      var body = "";
		
      proxyRes.on('data', function(data) {
        data = data.toString('utf-8');
        body += data;
      });

      // Defer all writes
      res.write = () => {};
      res.end = function() {
			output = body;

			var dirCacheFile = __dirname + '/' + cacheDir;
			var cacheFile = dirCacheFile + '/' + getFileName(req.url);

			saveResponse(output, req, res, dirCacheFile, cacheFile)

			res.write = _write;

			if ( body.length ) {
				_end.apply( res, [output] );
			} else {
				_end.apply( res, arguments );
			}
      }
    },

    logLevel: 'debug'
  }
);









/**
* Guarda respuesta en cache de archivo
* @param {string} body 
* @param {Object} res 
*/
function saveResponse(body, req, res, cacheDir, cacheFile) {
	var contentType = res.getHeader('Content-Type');

	// guarda solo respuestas json y con status 200
	if (/json/.test(contentType) && res.statusCode === 200) {

	// crear directorio si no existe
	if (!fs.existsSync(cacheDir)){
			fs.mkdirSync(cacheDir);
	}

	fs.writeFile(cacheFile, body, 'utf8', function (err) {
		if (err) {
			return console.log(err);
		}
	});
	}
}



function customResponseMiddleware(req, res, next) {
	if (req.method === 'OPTIONS') return next();
	for (let route of config.routeConfig) {
		if (route.expression.test(req.url)) {
			if (route.status && [200,204].indexOf(route.status)<0) {
				res.status(route.status).send(route.body);
			}
		}
	}

	next();
}


function delaysMiddleware(req, res, next) {
	if (req.method === 'OPTIONS') return next();
	let delay = 0;
	for (let d of config.routeConfig) {
		if (d.expression.test(req.url)) {
			delay = d.delay || 0;
		}
	}
	
	setTimeout(() => {
		next();
	}, delay*1000);
}


app.use(function(req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', '*');
	res.setHeader('Access-Control-Allow-Headers', '*');

	next();
});
app.use(customResponseMiddleware);
app.use(delaysMiddleware);
app.use(useCacheMiddleware);
app.use(buildCacheMiddleware);


app.listen(3000, function () {
	console.log('Example app listening on port 3000!');
 });