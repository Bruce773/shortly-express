const Promise = require('bluebird');
const express = require('express');
const path = require('path');
const utils = require('./lib/hashUtils');
const partials = require('express-partials');
const bodyParser = require('body-parser');
const Auth = require('./middleware/auth');
const models = require('./models');
const mysql = require('mysql');
var db = require('./db/index.js');
var session = require('express-session');

const app = express();

app.set('views', `${__dirname}/views`);
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// console.log('Database!!!!!', db.connection.queryAsync);

var pageToRedirectTo = '/';
// var checkUser = (redirectToHere) => {}

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/create', (req, res) => {
  if (session.user !== undefined) {
    res.render('index');
  } else {
    pageToRedirectTo = '/create';
    res.redirect('/login');
  }
});

app.get('/links', (req, res, next) => {
  if (session.user !== undefined) {
    models.Links.getAll()
      .then((links) => {
        res.status(200).send(links);
      })
      .error((error) => {
        res.status(500).send(error);
      });
  } else {
    res.redirect('/login');
  }
});

app.post('/links', (req, res, next) => {
  var url = req.body.url;
  if (!models.Links.isValidUrl(url)) {
    // send back a 404 if link is not valid
    return res.sendStatus(404);
  }

  return models.Links.get({ url })
    .then((link) => {
      if (link) {
        throw link;
      }
      return models.Links.getUrlTitle(url);
    })
    .then((title) => {
      return models.Links.create({
        url: url,
        title: title,
        baseUrl: req.headers.origin,
      });
    })
    .then((results) => {
      return models.Links.get({ id: results.insertId });
    })
    .then((link) => {
      throw link;
    })
    .error((error) => {
      res.status(500).send(error);
    })
    .catch((link) => {
      res.status(200).send(link);
    });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', (req, res) => {
  //console.log(req.body) //The user and pass as an object { username: 'Alex', password: 'Wallis' }
  models.Users.create(req.body);
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  // console.log(req.body) //The user and pass as an object { username: 'Alex', password: 'Wallis' }
  const usersTable = new models.Models('users');
  usersTable
    .get({ username: req.body.username })
    .then((resp) => {
      if (req.body.password && resp.password && resp.salt) {
        if (models.Users.compare(req.body.password, resp.password, resp.salt)) {
          session.user = req.body.username;
          res.redirect(pageToRedirectTo);
        }
      } else {
        new Error('Error!');
      }
      // console.log('1: ',req.body.password, '2: ', resp.password, '3: ', resp.salt);
      // console.log(models.Users.compare(req.body.password, resp.password, resp.salt));
    })
    .error((error) => {
      res.render('404', { status: 404 });
    })
    .catch(() => {
      res.render('404', { status: 404 });
    });
});

/************************************************************/
// Handle the code parameter route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/:code', (req, res, next) => {
  return models.Links.get({ code: req.params.code })
    .tap((link) => {
      if (!link) {
        throw new Error('Link does not exist');
      }
      return models.Clicks.create({ linkId: link.id });
    })
    .tap((link) => {
      return models.Links.update(link, { visits: link.visits + 1 });
    })
    .then(({ url }) => {
      res.redirect(url);
    })
    .error((error) => {
      res.status(500).send(error);
    })
    .catch(() => {
      res.redirect('/');
    });
});

module.exports = app;
