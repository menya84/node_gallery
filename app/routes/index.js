var tools = require('../lib/tools.js');
var fs = require('fs');
//var userDAO = require('../model/userDAO.js');

var redisConfig = {
    host: process.env.DOTCLOUD_REDIS_REDIS_HOST || '127.0.0.1',
    port: process.env.DOTCLOUD_REDIS_REDIS_PORT || 6379,
    pass: process.env.DOTCLOUD_REDIS_REDIS_PASSWORD || null
};

// Never trust your users, this modules is great for protecting yourself
//var check = require('validator').check;
//var sanitize = require('validator').sanitize;
//var check = require('express-express-validator').Validator;
//use it like validator.check('email', "Email is not valid").len(6, 64).isEmail();
//var sanitize = require('express-express-validator').Filter;
// use it like this sanitize.trim();

// Let's add some fun into this
var gravatar = require('../lib/gravatar.js').avatar;

// Redis client use for the admin page
var red = require('redis').createClient(redisConfig.port, redisConfig.host);

redisConfig.pass && 
    red.auth(redisConfig.pass, function(err) {
        if (err)
            throw err;
    });

// Root route :D
exports.index = function(req, res){
  res.render('index', {title: "Home page"});
};

// Home page
exports.welcome = function(req, res){
  res.render('welcome', { title: 'Welcome', session: req.session });
};

//My registration Form
exports.registration = function (req,res) {
    //TODO validation of user input
    req.assert("fname", "First name is empty").notEmpty();
    req.assert("lname", "Last name is empty").notEmpty();
    req.assert('email', "Email is not valid").len(6).isEmail();
    req.assert("passwd", "Password is not valid").len(2);
    req.assert("conpasswd", "Error password confirmation").equals(req.body.passwd);
    var mappedErrors = req.validationErrors(true);
    if (mappedErrors){
        req.session.errors = mappedErrors;
        res.render('registration', {title: "Registration"});
        return;
    } else {
        //TODO save user data to DB
        red.hget("users:"+req.body.email, 'email',
            function (err, reply){
                if (reply) {
                    tools.log("User " + req.body.email + " already exist");
                    req.session.errors = {errorMessage: 'Such user already exist in DB'};
                    res.render('registration', {title: 'Registration'});
                    return;

                } else {
                    /* var user = {
                        email: req.body.email,
                        passwd: req.body.passwd,
                        fname: req.body.fname,
                        lname: req.body.lname
                    }*/
                    red.hmset("users:"+req.body.email, 'email', req.body.email, 'passwd', req.body.passwd, 'fname', req.body.fname,
                        'lname', req.body.lname, red.print);
                    exports.initSession(req, res);
                }
            }
        );
    }
};

//Login form
/*exports.signin = function(req, res){
    //TODO validation
    if(req.body.email && req.body.pass){
       res.redirect('/usergallery');
    }
}*/

//Gallery page. Handle upload of image
exports.upload = function(req, res) {
    var user_image_path = req.session.appRootdir + '\\image-store\\' + req.session.email;
    var imageCount;
    //this part handle POST method
    if (req.method.toLowerCase() === 'post' && req.is('multipart/form-data')) {
        //handle input and save data to DB

        fs.stat(user_image_path, function(err, stats) {
            if (err) {
                //make directory
                fs.mkdirSync(user_image_path);
                /*function(err,data){
                    if(err) {
                        res.send({
                            error: 'Ah crap! Directory could not be created'
                        });
                    } else tools.log(data);
                })*/
            } else {
                tools.log(user_image_path + " Store directory already exists");
            }
        })

        fs.rename(req.files.UploadForm_File.path, user_image_path + '\\' + req.files.UploadForm_File.name,
            function(error) {
                if(error) {
                    res.send({
                        error: 'Error! Something bad happened while renaming image. See routes/index.js exports.upload function '
                    });
                    return;
                }

                fs.readdir(user_image_path, function(err, imageList) {
                    if(err) {
                        imageCount = 0;
                        res.render('gallery', {title: "Gallery page", errorMessage: "Can't read your image directory", imageCount: imageCount});
                    } else {
                        imageCount = imageList.length;
                        res.render('gallery', {title: "Gallery page", errorMessage: "Your image \"" + req.files.UploadForm_File.name + "\" was successfully uploaded to your store"
                            , imageCount: imageCount, imageList : imageList});
                    }
                });
            });
    }
};
//this part is for gallery GET request
exports.gallery = function(req, res) {
    var user_image_path = req.session.appRootdir + '\\image-store\\' + req.session.email;
    var imageCount;
    //read user image directory
    fs.readdir(user_image_path, function(err, imageList) {
        if(err) {
            imageCount = 0;
            res.render('gallery', {title: "Gallery page", errorMessage: "Can't read your image directory", imageCount: imageCount});
        } else {
            imageCount = imageList.length;
            res.render('gallery', {title: "Gallery page", imageCount: imageCount, imageList : imageList});

        }
    });
};


exports.imageOutput = function(req, res) {
    var imagePath = req.session.imageStoreDir + req.session.email + "/" + req.query.imageName;
    var stats = fs.statSync(imagePath);
    res.writeHead(200, {
        'Content-Type': 'imeg/jpeg',
        'Content-Length': stats.size
    });

    var readStream = fs.createReadStream(imagePath);
    readStream.on('data', function(data) {
        res.write(data);
    });

    readStream.on('end', function() {
        res.end();
    });
};

// Login form
exports.login = function(req, res){
    //tools.log(req.body);
    res.render('login', { title: 'Sign in'});
};

// Process auth
exports.initSession = function(req, res){

  // If the session is empty let's init one with an empty array
  if (!req.session) {
    req.session = {};
  }

  // let's log what the user sent us
  tools.log(req.body);

  // check if an email is given
  if(!req.body || !req.body.email) {
    req.session.errors = "No email address given";
    res.redirect('/signin');
    return;
  }

  // clean the email from XSS exploits
  var email = req.sanitize('email', "Email is not valid").trim();
  email = req.sanitize(email).xss();

  // is this a valid email ?
  try{
    req.assert('email').len(6).isEmail();
  }
  catch(e) {
    req.session.errors = "The given email address does not seems to be correct!";
    res.redirect('/signin');
    return;
  }
  red.hget("users:" + req.body.email, 'email',
    function (err, reply){
        if (reply) {
            tools.log("User exist");
            red.hget('users:'+req.body.email, 'passwd',
                function(err, reply) {
                    if (err) throw err;
                    if (reply == req.body.passwd) {
                        tools.log(reply);
                        tools.log("User " + req.body.email + " exist. Welcome!");
                        req.session.email = req.body.email;
                        req.session.gravatar = gravatar(req.body.email , 300);
                        res.redirect('/usergallery');
                        return;
                    } else {
                        req.session.errors = "The given password is not correct. Please enter the correct password";
                        res.redirect('/signin');
                        return;
                    }
                }
            );
        }  else {
            req.session.errors = "The given email address does not exist on this site. Please enter correct data or register";
            res.redirect('/signin');
            return;
        }
    }

    );
};


// admin page
exports.admin = function(req, res){
  red.keys('myfirstapp:' + '*', function(err, sessionKeys) {
      if (err) throw err;
      red.mget(sessionKeys, function (error, data){

        // the redis result is an array of JSON string, let's get the object from the strings
        var d = data.map(JSON.parse);
        res.render('admin', {title: 'Super secret admin page :D', users: d})
      })
  });
};
