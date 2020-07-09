#!/usr/bin/env node

const express = require('express');
const app = express();
const fs = require('fs');
const proxy = require('http-proxy-middleware');
const program = require('commander');
require('colors');
const {version} = require('./package.json');
const zlib = require('zlib');
const path = require('path');
const mime = require('mime-types');

program
    .version(version)
    .option('-p, --port [port number]', 'port to use (default is 3000)')
    .parse(process.argv);

const PORT = parseInt(program.port) || 3000;

const cacheDir = 'mocks';
const confFileName = 'proxy-mock.conf.json';
const confLocation = './' + confFileName;
const dirCacheFile = './' + cacheDir;

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
    } catch (e) {
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


function getFileName(url, method) {
    return method + url;
}

function isDirectory(path) {
    try {
        const stat = fs.lstatSync(path);
        return stat.isDirectory();
    } catch (e) {
        // lstatSync throws an error if path doesn't exist
        return false;
    }
}

function searchFile(dir, pattern) {
    let dirCont = fs.readdirSync(dir);
    let files = dirCont.filter(function (elm) {
        return elm.match(pattern);
    });
    return files.pop();
}


function useCacheMiddleware(req, res, next) {

    if (config.skipCache) return next();

    let cacheFile = dirCacheFile + '/' + getFileName(req.url, req.method);

    if (isDirectory(cacheFile)) {
        cacheFile += +searchFile(cacheFile, /index.*/ig)
    }

    if (!fs.existsSync(cacheFile)) return next();

    let output = fs.readFileSync(cacheFile, {encoding: 'utf8'});
    const contentType = mime.contentType(path.extname(cacheFile));
    res.setHeader("Content-Type", contentType);

    if (fs.existsSync(cacheFile)) {
        console.log('Usando cache para', req.url.cyan, contentType.red);
        res.end(output);
    } else {
        next();
    }
}


function makeProxy() {
    return proxy({
        target: config.host,
        //secure: false,
        changeOrigin: true,
        onProxyReq: function (proxyReq, req, res) {
            //proxyReq.setHeader('foo', 'bar' );
        },

        onProxyRes: function (proxyRes, req, res) {
            const _write = res.write;
            const _end = res.end;
            let output;
            let body = "";
            let resArr = [];

            const isGzipped = proxyRes.headers["content-encoding"] === "gzip";

            proxyRes.on('data', function (data) {
                //data = data.toString('utf-8');
                body += data;
                resArr.push(data);
            });

            proxyRes.on('end', function () {
                output = body;
                const buffer = Buffer.concat(resArr);

                let cacheFile = dirCacheFile + '/' + getFileName(req.url, req.method);

                if (isGzipped) {
                    zlib.gunzip(buffer, function (err, dezipped) {
                        if (err) throw err;
                        let data = dezipped.toString();
                        saveResponse(data, req, res, dirCacheFile, cacheFile);
                    });
                } else {
                    let data = output.toString('utf-8');
                    saveResponse(data, req, res, dirCacheFile, cacheFile);
                }
            });
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

    // not only json but also any kind of file
    if (res.statusCode === 200) {
        console.log("caching", cacheFile);
        // crear directorio si no existe
        // handling requests ending with /
        if (path.extname(cacheFile).length <= 0) {
            cacheFile += "/index." + mime.extension(contentType);
        }

        createDirectories(cacheFile);

        fs.writeFile(cacheFile, body, 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
        });
    }
}

function createDirectories(pathname) {
    const __dirname = path.resolve();
    pathname = pathname.replace(/^\.*\/|\/?[^\/]+\.[a-z]+|\/$/g, ''); // Remove leading directory markers, and remove ending /file-name.extension
    fs.mkdirSync(path.resolve(__dirname, pathname), {recursive: true}, e => {
        if (e) {
            console.error(e);
        } else {
            console.log('Success');
        }
    });
}


/**
 *
 */
function customResponseMiddleware(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    for (let route of config.routeConfig) {
        if ((new RegExp(route.expression)).test(req.url)) {
            if (route.status && [200, 204].indexOf(route.status) < 0) {
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
    }, delay * 1000);
}

function initServer(restarted) {
    app.use(function (req, res, next) {
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
        console.log(restarted ? 'Server restarted' : `Backend proxy running on port ${PORT}`);
    });
    return server;
}

let server = initServer();

fs.watchFile(confLocation, {interval: 1000}, () => {
    config = getLocalConfig();
    server.close(() => {
        server = initServer(true);
    })
});
