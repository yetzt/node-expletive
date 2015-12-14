# expletive

Expletive is a wrapper around [express.js](https://www.npmjs.com/package/express). It takes care of listening on a port or socket, sets up sessions, locales, file uploads and mustache as a view engine.

## Install

```
npm isntall --save expletive
```

## Usage

```javascript

var expletive = require("expletive");

var app = expletive({
	root: "/path/to/root",     // root directory, optional
	secret: "cookie-secret",   // a good secret for encrypting session-cookies
	locales: {                 // avaliable locales, optional
		"de": "Deutsch", 
		"en": "English"
	},
	csrf: true,                // csrf protection, default: true
	viewcache: false,          // cache views, default: false
	socket: "/path/to.sock",   // listen on socket
	host: "localhost",         // listen on tcp
	port: 3000,                // listen on tcp
	uploads: "./tmp",          // upload directory
	limit: "100kb"             // upload size limit
});

// use `app` like you would use your express instance
app.get("/", function(req, res){
	res.status("200").render("index", {
		"hello": "world"
	});
});

```

### Root Directory

If no `root` is specified, the folder where the main scriped lives is is used. 

### Listening

You must specify at least either a `port` or a `socket`. If `port` is used, a `hostname` may be specified as well.

### Uplods

If you don't provide an `uploads` directory, uploads are disabled.

### Locales

If you don't provide `locales`, locales are disabled.

## License

[Public Domain](http://unlicense.org/UNLICENSE)

