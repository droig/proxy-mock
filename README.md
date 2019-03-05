# proxy-mock
HTTP Proxy that caches responses in files for later use.

## Install
```
$ npm install -g proxy2mock
```

## Running
Usage: pmock [options]
```
Options:
  -V, --version             output the version number
  -p, --port [port number]  port to use (default is 3000)
  -h, --help                output usage information
```

This will create a JSON configuration file named `proxy-mock.conf.json` in the directory in which proxy-mock is being executed.

## Config File
As described before, the first time you run this tool will create a configuration file with the below initial configuration:
```json
{
  "host": "http://localhost:8080",
  "routeConfig": [
    {
      "expression": "delayed/endpoint",
      "delay": 5,
      "status": 500,
      "body": "This is a custom response body!"
    }
  ]
}
```

* **host**: is the real backend you want to mock
* **routeConfig**: holds a list of route configurations, and every configuration support the following options:
    * **expression**: can be the entire URL (without the domain and port) or part of the route you want to match. Supports regular expression.
    * **delay** *(optional)*: a delay in seconds you what this route to respond.
    * **status** *(optional)*: the HTTP status you want this route to respond.
    * **body** *(optional)*: a custom body to respond for the route. It will overwrite the original response by the real backend or the cache saved by this tool.

Every change in configuration file will restart the server.

## Roadmap
- Tidy code
- Make tests
- Use TypeScript
