#!/usr/bin/env node

// require node modules
var path = require("path");
var fs = require("fs");

// require npm modules
var cookieparser = require("cookie-parser");
var compression = require("compression");
var bodyparser = require("body-parser");
var stringhash = require("string-hash");
var mustache = require("mustache-express");
var express = require("express");
var session = require("express-session");
var locale = require("locale");
var multer = require("multer");
var helmet = require("helmet");
var mkdirp = require("mkdirp");
var debug = require("debug")("expletive");
var prink = require("prink");
var i18n = require("i18n-2");
var csrf = require("csurf");

function expletive(config){
	
	// ensure this is an instance of expletive
	if (!(this instanceof expletive)) return new expletive(config);
	var self = this;
	
	// try to find config file if no config was provided
	if (!config) {
		if (!fs.existsSync(path.resolve(path.dirname(require.main.filename), "config.js"))) {
			return console.error("no config provided", config.socket) || process.exit();
		};
		var config = require(path.resolve(path.dirname(require.main.filename), "config.js"));
	};
	
	// keep config
	self.config = config;
	
	// determine root dir
	if (!self.config.hasOwnProperty("root")) self.config.root = ".";
	self.config.root = path.resolve(path.dirname(require.main.filename), self.config.root);
		
	// create assets dirs if not existing
	if (!fs.existsSync(path.resolve(self.config.root, 'assets'))) {
		mkdirp.sync(path.resolve(self.config.root, 'assets/views'));
		mkdirp.sync(path.resolve(self.config.root, 'assets/locales'));
	};
	
	// check view cache
	if (!self.config.hasOwnProperty("viewcache") || self.config.viewcache !== false) self.config.viewcache = true;

	// check upload limit
	if (self.config.hasOwnProperty("limit") && (typeof self.config.limit === "string")) self.config.limit = prink.filesize.parse(self.config.limit);
		
	// new instance of express
	var app = new express();
	
	// disable x-powered-by header 
	app.disable('x-powered-by');
	
	// trust the proxy
	app.enable('trust proxy');
	
	// enable compression
	app.use(compression());

	// parse json and urlencoded post data
	app.use(bodyparser.json());
	app.use(bodyparser.json({ type: 'application/vnd.api+json' }));
	app.use(bodyparser.urlencoded({extended: true}));
	
	// receive multipart/form-data
	if (self.config.hasOwnProperty("uploads") && (typeof self.config.uploads === "string") && (self.config.uploads !== "")) {
		app.use(multer({
			dest: path.resolve(self.config.root, self.config.uploads),
			limit: {
				fileSize: (self.config.limit || Infinity)
			},
			rename: function (fieldname, filename) {
				// simple non-collison-string
				return Date.now().toString("36")+"-"+stringhash(fieldname+filename).toString("36")+path.extname(filename);
			}
		}));
	};
	
	// parse cookies
	app.use(cookieparser(config.secret || null));
	
	// use session
	app.use(session({
		resave: true,
		saveUninitialized: true,
		secret: config.secret
	}));
	
	// hard hat area
	helmet(app);
	
	// use csrf tokens
	app.use(csrf({ cookie: { signed: true } }));
	app.use(function(req, res, next) {
		res.cookie('_csrfToken', req.csrfToken());
		next();
	});
	
	// serve static assets
	app.use('/assets', express.static(path.resolve(self.config.root, 'assets')));

	// set up i18n
	if (self.config.hasOwnProperty("locales") && (self.config.locales instanceof Object)) {
		var _locales = Object.keys(self.config.locales);
		app.use(locale(_locales));
		i18n.expressBind(app, {
			locales: _locales,
			defaultLocale: _locales[0],
			directory: path.resolve(self.config.root, "assets/locales"),
			extension: '.json'
		});
	};

	// use mustache as view engine
	app.engine("mustache", mustache());
	app.set("views", path.resolve(self.config.root, "assets/views"));
	app.set("view engine", "mustache");
	app.set("view cache", self.config.viewcache);
	
	// internationalization request handler
	app.use(function(req, res, next) {
		// set locale by accept-language-header, override on lang query and cookie
		if (req && req.query && req.query.lang && config.locales.hasOwnProperty(req.query.lang)) {
			req.i18n.setLocaleFromQuery(req);
			res.cookie("lang", req.query.lang, { maxAge: 900000, signed: false });
		} else if (req && req.cookies && req.cookies.lang  && config.locales.hasOwnProperty(req.cookies.lang)) {
			req.i18n.setLocaleFromCookie(req);
		} else {
			req.i18n.setLocale(req.locale);
		}
		// expose translate method
		res.locals.__ = function(){
			return function(text, render) {
				return req.i18n.__.apply(req.i18n, arguments);
			};
		};
		next();
	});

	// render injection
	app.use(function(req, res, next){
		// move render method and replace
		req.__render = req.render;
		req.render = function(name, data){

			// current locale
			data.locale = req.locale;

			// provide locales (very useful for language switching)
			data.locales = [];
			Object.keys(config.locales).forEach(function(locale){
				if (config.locales.hasOwnProperty(locale)) data.locales.push({
					locale: locale,
					name: config.locales[locale]
				});
			});

			// add user data if available
			if (req.hasOwnProperty("userdata")) data.user = req.userdata;
			
			// pass through
			return req.__render(name, data);
		};
		next();
	});
	
	// listen on socket or port
	(function(app, config){
		// try for socket
		if (config.hasOwnProperty("socket")) {
			var mask = process.umask(0);
			(function(fn){
				fs.exists(config.socket, function(ex){
					if (!ex) return fn();
					debug("unlinking old socket %s", config.socket);
					fs.unlink(config.socket, function(err){
						if (err) return console.error("could not unlink old socket", config.socket) || process.exit();
						fn();
					});
				});
			})(function(){
				app.__server = app.listen(config.socket, function(err){
					if (err) return console.error("could not create socket", config.socket) || process.exit();
					if (mask) process.umask(mask);
					debug("server listening on socket %s", config.socket);
				});
			});
		// try for hostname and port
		} else if (config.hasOwnProperty("host") && (typeof config.host === "string") && (config.host !== "") && (config.host !== "*")) {
			app.__server = app.listen(config.port, config.host, function(err) {
				if (err) return console.error("could not bind to %s", [config.host, config.port].join(":")) || process.exit();
				debug("server listening on %s", [config.host, config.port].join(":"));
			});
		// try for port
		} else if (config.hasOwnProperty("port") && Number.isInteger(config.port)) {
			app.__server = app.listen(config.port, function(err) {
				if (err) return console.error("could not bind to *:%s", config.port) || process.exit();
				debug("server listening on *:%s", config.port);
			});
		// die 
		} else {
			return console.error("neither socket nor hostname/port provided") || process.exit();
		};
	})(app, self.config);

	return app;
};

if (module.parent === null) {
	// execute in standalone mode
	debug("running expletive in standalone mode");
	var app = new expletive({
		root: (process.env.EXP_ROOT||process.cwd()),
		secret: (process.env.EXP_SECRET||"secret"),
		locales: {"en": "English"},
		viewcache: false,
		host: (process.env.EXP_HOST||"localhost"),
		port: (process.env.EXP_PORT||3000)
	});

	app.all("/", function(req, res){
		res.status(200).send("Hello [expletive] World.");
	});

} else {
	// export in required mode
	module.exports = expletive;
};
