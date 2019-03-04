#!/usr/bin/env node

const express = require('express');
const app = express();
const fs = require('fs');
const proxy = require('http-proxy-middleware');
const program = require('commander');
require('colors');
const { version } = require('./package.json');
const cacheDir = 'mocks';
const confFileName = 'proxy-mock.conf.json';
const confLocation = process.cwd() + '/' + confFileName;
const dirCacheFile = process.cwd() + '/' + cacheDir;


program
  .version(version)
  .option('-p, --port [port number]', 'port to use (default is 3000)')
	.parse(process.argv);

const PORT = parseInt(program.port) || 3000;


const baseConfig = {
	host: "http://localhost:8080",
	routeConfig: [
		{
			expression: "delayed/endpoint",
			delay: 5,
			status: 500,
			body: "This is a custom response body!"
		}
	]
}


function getLocalConfig() {
    let localConfig;
    try {
			//localConfig = require(confLocation);
			let rawdata = fs.readFileSync(confLocation);  
			localConfig = JSON.parse(rawdata); 
    } catch(e) {
			localConfig = baseConfig;

			let jsonConfig = JSON.stringify(localConfig, null, '\t');
      fs.writeFileSync(confLocation, jsonConfig, 'utf8', function (err) {
        if (err) {
					return console.log(`Couldn't create initial config file.`);
        }
      });
    }
    return localConfig;
}

let config = getLocalConfig();


function getFileName(url) {
	return url
			.replace(/^\//, "").replace(/\/$/, "")
			.replace(/\//g, ".")
			//.replace(/\/?\.[0-9]+-[0-9kK]+/, "")     // quito rut
			+ '.json';
}


function useCacheMiddleware(req, res, next) {

	if (config.skipCache) return next();
	
	let cacheFile = dirCacheFile + '/' + getFileName(req.url);

	if (!fs.existsSync(cacheFile)) return next();

	let output = fs.readFileSync(cacheFile, {encoding: 'utf8'});

	if (fs.existsSync(cacheFile)) {
		console.log('Usando cache para', req.url.cyan);
		res.end(output);
	} else {
		next();
	}
}



function makeProxy() {
	return proxy({
    target: config.host,

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

				let cacheFile = dirCacheFile + '/' + getFileName(req.url);

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
  });
}



/**
* Save response to JSON file
* @param {string} body 
* @param {Object} res 
*/
function saveResponse(body, req, res, cacheDir, cacheFile) {
	let contentType = res.getHeader('Content-Type');

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


/**
 * 
 */
function customResponseMiddleware(req, res, next) {
	if (req.method === 'OPTIONS') return next();
	for (let route of config.routeConfig) {
		if ((new RegExp(route.expression)).test(req.url)) {
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
	for (let route of config.routeConfig) {
		if ((new RegExp(route.expression)).test(req.url)) {
			delay = route.delay || 0;
		}
	}
	
	setTimeout(() => {
		next();
	}, delay*1000);
}

function initServer(restarted) {
	app.use(function(req, res, next) {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', '*');
		res.setHeader('Access-Control-Allow-Headers', '*');
	
		next();
	})
	.use(delaysMiddleware)
	.use(customResponseMiddleware)
	.use(useCacheMiddleware)
	.use(makeProxy());
	
	const server = app.listen(PORT, function () {
		console.log( restarted ? 'Server restarted' : `Backend proxy running on port ${PORT}`);
	});
	return server;
}

let server = initServer();

fs.watchFile(confLocation, { interval: 1000 }, () => {
	config = getLocalConfig();
	server.close(() => {
		server = initServer(true);
	})
});